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

let ledger = null;
try { ledger = require('../lib/agent-ledger'); } catch (_) {}

let agentRegistry = null;
try { agentRegistry = require('../lib/agent-registry'); } catch (_) {}

let cryptoRegistry = null;
try { cryptoRegistry = require('../lib/agent-crypto-registry'); } catch (_) {}

let actionLogger = null;
try { actionLogger = require('../lib/agent-action-logger'); } catch (_) {}

const SIWE_SECRET = process.env.SIWE_SECRET || process.env.JWT_SECRET || process.env.BRIDGE_SIWE_JWT_SECRET || 'bridge-siwe-fallback';
const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const LINEA_CHAIN_ID = 59144;
const BRDG_WELCOME_GRANT = 0.5; // BRDG issued to every new agent on first auth

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
  let isNewAgent = false;

  // Agent ID derived from wallet — stable, short, readable
  const walletAgentId = `wallet-${address.slice(2, 10).toLowerCase()}`;
  const walletEmail   = `${walletAgentId}@wallet.bridge.ai`;
  const walletName    = `${address.slice(0, 6)}…${address.slice(-4)}`;

  if (supabase) {
    try {
      const { data: existing } = await supabase
        .from('users')
        .select('id, email, plan')
        .eq('wallet_address', address.toLowerCase())
        .single();

      if (existing) {
        userId    = existing.id;
        userEmail = existing.email;
        plan      = existing.plan || 'free';
      } else {
        isNewAgent = true;
        const { data: newUser, error } = await supabase
          .from('users')
          .insert({
            email:          walletEmail,
            wallet_address: address.toLowerCase(),
            name:           walletName,
            plan:           'free',
            funnel_stage:   'wallet_connected',
            source:         'siwe',
            lead_score:     50,
          })
          .select('id, email, plan')
          .single();

        if (newUser) {
          userId    = newUser.id;
          userEmail = newUser.email;
          plan      = newUser.plan || 'free';
        } else {
          userId    = address.toLowerCase();
          userEmail = walletEmail;
          if (error) console.warn('[siwe] user insert error:', error.message);
        }
      }
    } catch (err) {
      userId    = address.toLowerCase();
      userEmail = walletEmail;
      isNewAgent = true;
    }
  } else {
    userId     = address.toLowerCase();
    userEmail  = walletEmail;
    isNewAgent = true;
  }

  // 5. On first auth — register agent + issue 0.5 BRDG welcome grant
  let brdgBalance = 0;
  if (isNewAgent) {
    // Register as an agent in the agent registry (non-blocking on failure)
    if (agentRegistry) {
      try {
        const existing = await agentRegistry.getById(walletAgentId).catch(() => null);
        if (!existing) {
          await agentRegistry.register({
            id:     walletAgentId,
            name:   walletName,
            role:   'wallet_agent',
            layer:  'external',
            type:   'wallet',
            source: 'siwe',
            skills: ['trade', 'earn', 'transact'],
            status: 'active',
            config: { wallet_address: address.toLowerCase(), email: userEmail },
          });
        }
      } catch (e) {
        console.warn('[siwe] agent registry error:', e.message);
      }
    }

    // Provision on-chain address record
    if (cryptoRegistry) {
      cryptoRegistry.ensureWallet(walletAgentId, walletName).catch(e =>
        console.warn('[siwe] crypto registry error:', e.message)
      );
    }

    // Issue 0.5 BRDG welcome grant
    if (ledger) {
      try {
        const result = await ledger.credit(
          walletAgentId,
          BRDG_WELCOME_GRANT,
          'wallet_auth',
          `Welcome grant — new agent ${walletName}`
        );
        brdgBalance = result?.new_balance ?? BRDG_WELCOME_GRANT;
      } catch (e) {
        console.warn('[siwe] ledger credit error:', e.message);
        brdgBalance = BRDG_WELCOME_GRANT;
      }
    }
  } else if (ledger) {
    // Existing agent — return their current balance
    try {
      const row = await ledger.getBalance(walletAgentId);
      brdgBalance = row?.balance ?? 0;
    } catch (_) {}
  }

  // 6. Log the auth event (non-blocking)
  if (actionLogger) {
    const logAction  = isNewAgent ? 'auth_new' : 'auth_ok';
    const logPayload = {
      address:      address.toLowerCase(),
      email:        userEmail,
      plan,
      is_new_agent: isNewAgent,
      ...(isNewAgent ? { brdg_grant: BRDG_WELCOME_GRANT, brdg_balance: brdgBalance } : { brdg_balance: brdgBalance }),
    };
    actionLogger.log(walletAgentId, logAction, logPayload, {
      actor: address.toLowerCase(),
      ip:    req?.ip ?? req?.headers?.['x-forwarded-for'] ?? null,
    }).catch(() => {});
  }

  // 7. Issue JWT via user-identity library
  let token = null;
  if (userLib && userLib.createToken) {
    token = userLib.createToken({ id: userId, email: userEmail, wallet: address, plan, role: 'member', agent_id: walletAgentId });
  } else {
    // Manual JWT (HS256)
    const { createHmac } = require('crypto');
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      sub: userId, id: userId, email: userEmail, wallet: address, plan, role: 'member',
      agent_id: walletAgentId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 604800,
    })).toString('base64url');
    const sig = createHmac('sha256', SIWE_SECRET).update(`${header}.${payload}`).digest('base64url');
    token = `${header}.${payload}.${sig}`;
  }

  // 8. Set cookie
  res.setHeader('Set-Cookie', `bridge_token=${token}; Path=/; SameSite=Lax; Max-Age=604800`);

  res.json({
    ok: true,
    token,
    address,
    userId,
    plan,
    agent_id:     walletAgentId,
    email:        userEmail,
    brdg_balance: brdgBalance,
    brdg_grant:   isNewAgent ? BRDG_WELCOME_GRANT : 0,
    is_new_agent: isNewAgent,
    chain_id:     LINEA_CHAIN_ID,
    message: isNewAgent
      ? `Agent registered — ${BRDG_WELCOME_GRANT} BRDG issued. Welcome to Bridge AI OS.`
      : 'SIWE authentication successful',
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
