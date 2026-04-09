'use strict';

/**
 * auth.js — Standalone Auth & Referral Service
 *
 * Runs an Express server on AUTH_PORT (default 5001).
 * The gateway proxies /auth/* and /referral/* here.
 *
 * Also exports the Express app for testing and backward compat.
 */

require('dotenv').config({ override: false });

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const userDb = require('./lib/user-identity');
const nurture = require('./lib/nurture-engine');

// ── Secrets ─────────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || process.env.BRIDGE_SIWE_JWT_SECRET || 'aoe-unified-super-secret-change-in-prod';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'aoe-refresh-secret-change-in-prod';

// Token blacklist (in-memory; cleared on restart — acceptable for single-process)
const blacklistedTokens = new Set();

// ── App Setup ───────────────────────────────────────────────────────────────
const app = express();

// CORS — same origins as gateway.js
const ALLOWED_ORIGINS = [
  'https://wall.bridge-ai-os.com',
  'https://go.ai-os.co.za',
  'http://localhost:3000',
  'http://localhost:8080',
];

app.use(cors({
  origin(origin, cb) {
    // Allow requests with no origin (curl, server-to-server, health checks)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 86400,
}));

app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

// Trust proxy so rate-limit uses X-Forwarded-For
app.set('trust proxy', 1);

// ── Rate Limiters ───────────────────────────────────────────────────────────
const registerLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 10000 : 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many registration attempts. Try again in a minute.' },
});

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 10000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many login attempts. Try again in a minute.' },
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function sanitizeUser(user) {
  if (!user) return null;
  const { password_hash, totp_backup_codes, ...safe } = user;
  return safe;
}

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role || 'user', plan: user.plan || 'visitor' },
    JWT_SECRET,
    { expiresIn: '7d' },
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, type: 'refresh' },
    JWT_REFRESH_SECRET,
    { expiresIn: '30d' },
  );
}

function extractBearerToken(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

function verifyAccess(token) {
  if (!token) return null;
  if (blacklistedTokens.has(token)) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (_) {
    return null;
  }
}

// Auth middleware
async function authMiddleware(req, res, next) {
  const token = extractBearerToken(req);
  const payload = verifyAccess(token);
  if (!payload) return res.status(401).json({ ok: false, error: 'Missing or invalid auth token' });
  req.user = payload;
  req.token = token;
  next();
}

// ── Health ───────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'OK', service: 'auth', ts: Date.now() });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  AUTHENTICATION ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// POST /auth/register
app.post('/auth/register', registerLimiter, async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // Validation
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ ok: false, error: 'email is required' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ ok: false, error: 'Invalid email format' });
    }
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ ok: false, error: 'password is required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ ok: false, error: 'Password must be at least 6 characters' });
    }

    // Check for existing user
    const existing = await userDb.getUserByEmail(email);
    if (existing) {
      return res.status(409).json({ ok: false, error: 'Email already registered' });
    }

    const user = await userDb.createUser(email, name || null, 'email', null, password);
    const token = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    // Auto-advance nurture funnel
    try {
      const result = nurture.autoAdvance(user);
      if (result && result.advanced) {
        await userDb.updateFunnelStage(user.id, result.newStage);
        if (result.score_delta) await userDb.updateLeadScore(user.id, result.score_delta);
      }
    } catch (_) { /* nurture is best-effort */ }

    const freshUser = await userDb.getUserById(user.id);

    res.status(201).json({
      ok: true,
      token,
      refresh_token: refreshToken,
      user: sanitizeUser(freshUser),
    });
  } catch (e) {
    console.error('[AUTH] register error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /auth/login
app.post('/auth/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email) return res.status(400).json({ ok: false, error: 'email is required' });
    if (!password) return res.status(400).json({ ok: false, error: 'password is required' });

    const user = await userDb.getUserByEmail(email);
    if (!user) return res.status(401).json({ ok: false, error: 'Invalid credentials' });

    const valid = userDb.verifyPassword(password, user.password_hash);
    if (!valid) return res.status(401).json({ ok: false, error: 'Invalid credentials' });

    // Upgrade legacy hashes transparently
    if (userDb.needsRehash && userDb.needsRehash(user.password_hash)) {
      userDb.upgradePasswordHash(user.id, password).catch(() => {});
    }

    const token = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    res.json({
      ok: true,
      token,
      refresh_token: refreshToken,
      user: sanitizeUser(user),
    });
  } catch (e) {
    console.error('[AUTH] login error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /auth/verify
app.get('/auth/verify', async (req, res) => {
  const token = extractBearerToken(req);
  if (!token) return res.status(401).json({ ok: false, valid: false, error: 'Missing auth token' });

  const payload = verifyAccess(token);
  if (!payload) return res.status(401).json({ ok: false, valid: false, error: 'Invalid or expired token' });

  const user = await userDb.getUserById(payload.sub);
  if (!user) return res.status(401).json({ ok: false, valid: false, error: 'User not found' });

  res.json({ ok: true, valid: true, user: sanitizeUser(user) });
});

// POST /auth/logout
app.post('/auth/logout', async (req, res) => {
  const token = extractBearerToken(req);
  if (!token) return res.status(401).json({ ok: false, error: 'Bearer token required' });

  const payload = verifyAccess(token);
  if (!payload) return res.status(401).json({ ok: false, error: 'Token invalid or already revoked' });

  blacklistedTokens.add(token);

  res.json({ ok: true, status: 'logged_out', ts: Date.now() });
});

// POST /auth/refresh
app.post('/auth/refresh', async (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) return res.status(400).json({ ok: false, error: 'refresh_token is required' });

  let payload;
  try {
    payload = jwt.verify(refresh_token, JWT_REFRESH_SECRET);
  } catch (_) {
    return res.status(401).json({ ok: false, error: 'Invalid or expired refresh token' });
  }

  const user = await userDb.getUserById(payload.sub);
  if (!user) return res.status(401).json({ ok: false, error: 'User not found' });

  const newToken = signAccessToken(user);
  const newRefresh = signRefreshToken(user);

  res.json({ ok: true, token: newToken, refresh_token: newRefresh });
});

// POST /auth/google
app.post('/auth/google', async (req, res) => {
  try {
    const { oauth_token } = req.body;
    if (!oauth_token) return res.status(400).json({ ok: false, error: 'OAuth token required' });

    let payload;
    try {
      const parts = oauth_token.split('.');
      payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    } catch (_) {
      return res.status(400).json({ ok: false, error: 'Invalid OAuth token format' });
    }

    const email = payload.email;
    const name = payload.name || payload.given_name || null;
    const sub = payload.sub;
    if (!email) return res.status(400).json({ ok: false, error: 'Token missing email' });

    const user = await userDb.createUser(email, name, 'google', sub);
    const token = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    res.json({ ok: true, token, refresh_token: refreshToken, user: sanitizeUser(user) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /auth/me
app.get('/auth/me', authMiddleware, async (req, res) => {
  const user = await userDb.getUserById(req.user.sub);
  if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

  let prompt = null;
  try { prompt = nurture.getPersonalizedPrompt(user); } catch (_) {}

  res.json({ ok: true, user: sanitizeUser(user), nurture_prompt: prompt });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  AUDIT ROUTES (Merkle-backed)
// ═══════════════════════════════════════════════════════════════════════════════

let auditLog = null;
try {
  const Database = require('better-sqlite3');
  const path = require('path');
  const dbPath = path.join(__dirname, 'data', 'auth-audit.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  const { AuthMerkleLog } = require('./lib/auth-merkle');
  auditLog = new AuthMerkleLog(db);
  console.log('[AUTH] Merkle audit log initialized');
} catch (e) {
  console.warn('[AUTH] Merkle audit log unavailable:', e.message);
}

app.get('/auth/audit/root', (_req, res) => {
  if (!auditLog) return res.status(503).json({ ok: false, error: 'Audit log not available' });
  res.json({ ok: true, root: auditLog.getRoot(), ts: Date.now() });
});

app.get('/auth/audit/state', (_req, res) => {
  if (!auditLog) return res.status(503).json({ ok: false, error: 'Audit log not available' });
  res.json({ ok: true, ...auditLog.getState(), ts: Date.now() });
});

app.get('/auth/audit/verify', (_req, res) => {
  if (!auditLog) return res.status(503).json({ ok: false, error: 'Audit log not available' });
  res.json({ ok: true, ...auditLog.verifyIntegrity(), ts: Date.now() });
});

app.get('/auth/audit/events', (req, res) => {
  if (!auditLog) return res.status(503).json({ ok: false, error: 'Audit log not available' });
  const limit = Math.min(parseInt(req.query.limit) || 30, 100);
  res.json({ ok: true, events: auditLog.getRecentEvents(limit), ts: Date.now() });
});

app.get('/auth/audit/proof/:lh', (req, res) => {
  if (!auditLog) return res.status(503).json({ ok: false, error: 'Audit log not available' });
  const proof = auditLog.getProofByHash(req.params.lh);
  if (!proof) return res.status(404).json({ ok: false, error: 'Leaf not found' });
  res.json({ ok: true, proof, ts: Date.now() });
});

app.get('/auth/audit/user/:uid', (req, res) => {
  if (!auditLog) return res.status(503).json({ ok: false, error: 'Audit log not available' });
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  res.json({ ok: true, events: auditLog.getEventsByUser(req.params.uid, limit), ts: Date.now() });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  REFERRAL ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// In-memory referrals store (backed by Supabase for persistence when available)
const referrals = new Map(); // code -> { code, referrer_id, referred_email, reward_credits, claimed_by, claimed_at }

// POST /referral/create
app.post('/referral/create', authMiddleware, async (req, res) => {
  try {
    const { referred_email, reward_credits } = req.body;
    if (!referred_email) return res.status(400).json({ ok: false, error: 'referred_email is required' });

    const code = crypto.randomBytes(6).toString('hex').toUpperCase();
    const referral = {
      code,
      referrer_id: req.user.sub,
      referred_email: referred_email.toLowerCase().trim(),
      reward_credits: typeof reward_credits === 'number' ? reward_credits : 50,
      claimed_by: null,
      claimed_at: null,
      created_at: new Date().toISOString(),
    };

    referrals.set(code, referral);

    res.status(201).json({ ok: true, code, referral });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /referral/claim
app.post('/referral/claim', async (req, res) => {
  try {
    const { code, email } = req.body;
    if (!code) return res.status(400).json({ ok: false, error: 'code is required' });
    if (!email) return res.status(400).json({ ok: false, error: 'email is required' });

    const referral = referrals.get(code.toUpperCase());
    if (!referral) return res.status(404).json({ ok: false, error: 'Referral code not found' });

    if (referral.claimed_by) return res.status(404).json({ ok: false, error: 'Already claimed' });

    const normalizedEmail = email.toLowerCase().trim();
    if (normalizedEmail !== referral.referred_email) {
      return res.status(403).json({ ok: false, error: 'Email does not match referral target' });
    }

    referral.claimed_by = normalizedEmail;
    referral.claimed_at = new Date().toISOString();

    res.json({
      ok: true,
      status: 'claimed',
      code: referral.code,
      reward_credits: referral.reward_credits,
      ts: Date.now(),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  ALSO MOUNT user-routes for /api/* prefix (used by frontend SDK)
// ═══════════════════════════════════════════════════════════════════════════════

try {
  const { registerUserRoutes } = require('./lib/user-routes');
  registerUserRoutes(app);
} catch (e) {
  console.warn('[AUTH] Could not register /api/* user-routes:', e.message);
}

// ── 404 fallback ────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ ok: false, error: 'Not found' });
});

// ── Error handler ───────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[AUTH] Unhandled error:', err);
  res.status(500).json({ ok: false, error: 'Internal server error' });
});

// ── Start server (skip if loaded as module for testing) ─────────────────────
const AUTH_PORT = parseInt(process.env.AUTH_PORT, 10) || 5001;

if (require.main === module) {
  app.listen(AUTH_PORT, () => {
    console.log(`[AUTH] Auth service listening on port ${AUTH_PORT}`);
    console.log(`[AUTH] Endpoints: /auth/register, /auth/login, /auth/verify, /auth/logout, /auth/refresh`);
    console.log(`[AUTH] Audit: /auth/audit/root, /auth/audit/state, /auth/audit/verify, /auth/audit/events`);
    console.log(`[AUTH] Referral: /referral/create, /referral/claim`);
    console.log(`[AUTH] Health: /health`);
  });
}

// Backward compat: module.exports is the Express app (used by tests and require('./auth'))
module.exports = app;
