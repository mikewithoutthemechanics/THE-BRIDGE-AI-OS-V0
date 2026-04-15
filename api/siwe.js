// =============================================================================
// BRIDGE AI OS — SIWE (Sign-In With Ethereum) API
//
// Endpoints:
//   GET  /api/siwe/nonce   — returns a signed nonce token for SIWE message
//   POST /api/siwe/verify  — verifies wallet signature, issues bridge_token JWT
//
// Nonce strategy: stateless HMAC token — no DB required.
//   nonce_token = base64url( nonce:timestamp:hmac(nonce:timestamp, SIWE_SECRET) )
//   Valid for 5 minutes.
// =============================================================================
'use strict';

const crypto = require('crypto');

let ethersLib = null;
try { ethersLib = require('ethers'); } catch (_) {}

let supabaseLib = null;
try { supabaseLib = require('../lib/supabase'); } catch (_) {}

let userLib = null;
try { userLib = require('../lib/user-identity'); } catch (_) {}

const SIWE_SECRET = process.env.SIWE_SECRET || process.env.JWT_SECRET || process.env.BRIDGE_SIWE_JWT_SECRET || 'bridge-siwe-fallback';
const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const LINEA_CHAIN_ID = 59144;

// ── Nonce helpers ────────────────────────────────────────────────────────────
function createNonceToken() {
  const nonce = crypto.randomBytes(16).toString('hex');
  const ts = Date.now().toString();
  const mac = crypto.createHmac('sha256', SIWE_SECRET).update(`${nonce}:${ts}`).digest('hex');
  const raw = `${nonce}:${ts}:${mac}`;
  return { nonce, token: Buffer.from(raw).toString('base64url') };
}

function verifyNonceToken(token) {
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8');
    const [nonce, ts, mac] = raw.split(':');
    if (!nonce || !ts || !mac) return null;
    if (Date.now() - parseInt(ts) > NONCE_TTL_MS) return null; // expired
    const expected = crypto.createHmac('sha256', SIWE_SECRET).update(`${nonce}:${ts}`).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(expected, 'hex'))) return null;
    return nonce;
  } catch (_) {
    return null;
  }
}

// ── SIWE message builder ──────────────────────────────────────────────────────
function buildSiweMessage({ address, nonce, domain, issuedAt }) {
  return [
    `${domain} wants you to sign in with your Ethereum account:`,
    address,
    '',
    'Sign in to Bridge AI OS — Autonomous Agent Network',
    '',
    `URI: https://${domain}`,
    `Version: 1`,
    `Chain ID: ${LINEA_CHAIN_ID}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join('\n');
}

// ── GET /api/siwe/nonce ───────────────────────────────────────────────────────
function getNonce(req, res) {
  const { nonce, token } = createNonceToken();
  res.json({ ok: true, nonce, token });
}

async function provisionManagedWallet(req, res) {
  const { email, name } = req.body || {};
  if (ethersLib && typeof ethersLib.Wallet?.createRandom !== 'function' && typeof ethersLib.ethers?.Wallet?.createRandom !== 'function') {
    return res.status(503).json({ ok: false, error: 'Wallet provider unavailable on server' });
  }
  const walletFactory = ethersLib?.Wallet || ethersLib?.ethers?.Wallet;
  const wallet = walletFactory.createRandom();
  const address = wallet.address.toLowerCase();
  const supabase = supabaseLib?.supabase;

  const safeEmail = (typeof email === 'string' && email.includes('@'))
    ? email.trim().toLowerCase()
    : `managed-${address.slice(2, 10)}@wallet.bridge.ai`;
  const safeName = (typeof name === 'string' && name.trim())
    ? name.trim().slice(0, 80)
    : `Managed ${address.slice(0, 6)}…${address.slice(-4)}`;

  let userId = address;
  let userEmail = safeEmail;
  let plan = 'free';

  if (supabase) {
    try {
      const { data: existingByEmail } = await supabase
        .from('users')
        .select('id,email,plan')
        .eq('email', safeEmail)
        .maybeSingle();

      if (existingByEmail) {
        userId = existingByEmail.id;
        userEmail = existingByEmail.email || safeEmail;
        plan = existingByEmail.plan || 'free';
        await supabase
          .from('users')
          .update({
            wallet_address: address,
            funnel_stage: 'wallet_connected',
            source: 'managed_wallet',
            lead_score: 35,
          })
          .eq('id', userId);
      } else {
        const { data: created } = await supabase
          .from('users')
          .insert({
            email: safeEmail,
            wallet_address: address,
            name: safeName,
            plan: 'free',
            funnel_stage: 'wallet_connected',
            source: 'managed_wallet',
            lead_score: 35,
          })
          .select('id,email,plan')
          .single();
        if (created) {
          userId = created.id;
          userEmail = created.email || safeEmail;
          plan = created.plan || 'free';
        }
      }
    } catch (_) {
      // Keep fallback identity if DB is unavailable.
    }
  }

  // Ensure token subject resolves to a real user record that extractUser can load.
  try {
    const existingById = userLib?.getUserById ? await userLib.getUserById(userId) : null;
    if (!existingById) {
      let ensured = userLib?.getUserByEmail ? await userLib.getUserByEmail(safeEmail) : null;
      if (!ensured && userLib?.createUser) {
        ensured = await userLib.createUser(safeEmail, safeName, 'managed_wallet', null, null);
      }
      if (ensured?.id) {
        userId = ensured.id;
        userEmail = ensured.email || safeEmail;
        plan = ensured.plan || plan;
      }
    }
    if (supabase && userId) {
      await supabase
        .from('users')
        .update({
          wallet_address: address,
          funnel_stage: 'wallet_connected',
          source: 'managed_wallet',
          lead_score: 35,
        })
        .eq('id', userId);
    }
  } catch (_) {
    // Keep best-effort identity.
  }

  try {
    if (userLib?.linkWallet && userId) {
      await userLib.linkWallet(userId, address, 'ethereum', 'bridge-managed');
    }
  } catch (_) {
    // Non-fatal; users table still carries wallet_address.
  }

  let token = null;
  if (userLib?.generateAuthToken) {
    token = await userLib.generateAuthToken(userId);
  } else {
    const { createHmac } = require('crypto');
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      sub: userId, id: userId, email: userEmail, wallet: address, plan, role: 'member',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 604800,
    })).toString('base64url');
    const sig = createHmac('sha256', SIWE_SECRET).update(`${header}.${payload}`).digest('base64url');
    token = `${header}.${payload}.${sig}`;
  }

  res.setHeader('Set-Cookie', `bridge_token=${token}; Path=/; SameSite=Lax; Max-Age=604800`);

  return res.json({
    ok: true,
    managed: true,
    address,
    userId,
    plan,
    token,
    message: 'Managed wallet provisioned and securely linked to user profile',
  });
}

// ── POST /api/siwe/verify ─────────────────────────────────────────────────────
async function verifySignature(req, res) {
  const { address, signature, nonce_token, message } = req.body || {};

  if (!address || !signature || !nonce_token) {
    return res.status(400).json({ ok: false, error: 'address, signature, and nonce_token required' });
  }

  // 1. Verify nonce token
  const nonce = verifyNonceToken(nonce_token);
  if (!nonce) {
    return res.status(401).json({ ok: false, error: 'Nonce expired or invalid — request a new one' });
  }

  // 2. Reconstruct expected message (or use provided message for flexibility)
  const domain = req.headers.host || 'go.ai-os.co.za';
  const expectedMsg = message || buildSiweMessage({
    address,
    nonce,
    domain,
    issuedAt: new Date().toISOString(),
  });

  // 3. Verify signature
  if (!ethersLib) {
    return res.status(503).json({ ok: false, error: 'ethers.js not available on server' });
  }

  let recoveredAddress;
  try {
    recoveredAddress = ethersLib.ethers
      ? ethersLib.ethers.verifyMessage(expectedMsg, signature)  // ethers v5
      : ethersLib.verifyMessage(expectedMsg, signature);         // ethers v6
  } catch (err) {
    return res.status(401).json({ ok: false, error: 'Signature verification failed: ' + err.message });
  }

  if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
    // Try with just the nonce portion — client may have used a slightly different message
    return res.status(401).json({
      ok: false,
      error: 'Signature does not match address',
      recovered: recoveredAddress,
    });
  }

  // 4. Create or look up wallet user in Supabase
  const supabase = supabaseLib?.supabase;
  let userId = null;
  let userEmail = null;
  let plan = 'free';

  if (supabase) {
    try {
      const { data: existing } = await supabase
        .from('users')
        .select('id, email, plan')
        .eq('wallet_address', address.toLowerCase())
        .single();

      if (existing) {
        userId = existing.id;
        userEmail = existing.email;
        plan = existing.plan || 'free';
      } else {
        // Create new wallet user
        const walletEmail = `wallet-${address.slice(2, 10).toLowerCase()}@wallet.bridge.ai`;
        const { data: newUser, error } = await supabase
          .from('users')
          .insert({
            email: walletEmail,
            wallet_address: address.toLowerCase(),
            name: `${address.slice(0, 6)}…${address.slice(-4)}`,
            plan: 'free',
            funnel_stage: 'wallet_connected',
            source: 'siwe',
            lead_score: 50,
          })
          .select('id, email, plan')
          .single();

        if (newUser) {
          userId = newUser.id;
          userEmail = newUser.email;
          plan = newUser.plan || 'free';
        } else if (error) {
          // Fallback: use wallet address as ID
          userId = address.toLowerCase();
          userEmail = `wallet@${address.slice(2, 8).toLowerCase()}.bridge.ai`;
        }
      }
    } catch (err) {
      // Fallback if DB unavailable
      userId = address.toLowerCase();
      userEmail = `wallet@bridge.ai`;
    }
  } else {
    userId = address.toLowerCase();
    userEmail = `wallet@bridge.ai`;
  }

  // 5. Issue JWT via user-identity library
  let token = null;
  if (userLib && userLib.createToken) {
    token = userLib.createToken({ id: userId, email: userEmail, wallet: address, plan, role: 'member' });
  } else {
    // Manual JWT (HS256)
    const { createHmac } = require('crypto');
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      sub: userId, id: userId, email: userEmail, wallet: address, plan, role: 'member',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 604800,
    })).toString('base64url');
    const sig = createHmac('sha256', SIWE_SECRET).update(`${header}.${payload}`).digest('base64url');
    token = `${header}.${payload}.${sig}`;
  }

  // 6. Set cookie
  res.setHeader('Set-Cookie', `bridge_token=${token}; Path=/; SameSite=Lax; Max-Age=604800`);

  res.json({
    ok: true,
    token,
    address,
    userId,
    plan,
    message: 'SIWE authentication successful',
  });
}

// ── Router ────────────────────────────────────────────────────────────────────
async function handleSiwe(req, res) {
  const p = (req.path || req.url || '').split('?')[0];

  if (p === '/api/siwe/nonce'  && req.method === 'GET')  return getNonce(req, res);
  if (p === '/api/siwe/verify' && req.method === 'POST') return verifySignature(req, res);
  if (p === '/api/siwe/provision-wallet' && req.method === 'POST') return provisionManagedWallet(req, res);

  return null;
}

module.exports = { handleSiwe };
