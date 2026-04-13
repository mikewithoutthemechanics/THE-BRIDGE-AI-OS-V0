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

  return null;
}

module.exports = { handleSiwe };
