'use strict';

/**
 * auth.js — Unified Authentication Service
 * Port: 5001
 * Handles: register, login, logout, refresh, verify, referral/claim
 */

const express    = require('express');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const Database   = require('better-sqlite3');
const path       = require('path');
const fs         = require('fs');

// ─── Config ───────────────────────────────────────────────────────────────────

const PORT          = process.env.AUTH_PORT   || 5001;
const JWT_SECRET    = process.env.JWT_SECRET  || 'aoe-unified-super-secret-change-in-prod';
const JWT_REFRESH   = process.env.JWT_REFRESH_SECRET || 'aoe-refresh-secret-change-in-prod';
const JWT_EXPIRY    = '24h';
const REFRESH_EXPIRY = '7d';
const BCRYPT_ROUNDS  = 10;
const DB_PATH        = path.join(__dirname, 'users.db');
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

// ─── Database Setup ───────────────────────────────────────────────────────────

function openDb() {
  const db = new Database(DB_PATH, { verbose: process.env.DEBUG_SQL ? console.log : null });
  // WAL mode for concurrent reads
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

function runMigrations(db) {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT UNIQUE NOT NULL,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const applied = db.prepare('SELECT filename FROM _migrations').all().map(r => r.filename);
  const run     = db.prepare('INSERT INTO _migrations (filename) VALUES (?)');

  for (const file of files) {
    if (applied.includes(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    db.exec(sql);
    run.run(file);
    console.log(`[migration] applied: ${file}`);
  }
}

const db = openDb();
runMigrations(db);

// ─── Prepared Statements ──────────────────────────────────────────────────────

const stmts = {
  findByEmail:    db.prepare('SELECT * FROM users WHERE email = ?'),
  findById:       db.prepare('SELECT * FROM users WHERE id = ?'),
  insertUser:     db.prepare(`
    INSERT INTO users (email, password_hash, referral_code)
    VALUES (@email, @password_hash, @referral_code)
  `),
  updateLastLogin: db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?'),
  findReferral:    db.prepare('SELECT * FROM referrals WHERE code = ? AND claimed = 0'),
  insertReferral:  db.prepare(`
    INSERT INTO referrals (referrer_id, referred_email, code, reward_credits)
    VALUES (@referrer_id, @referred_email, @code, @reward_credits)
  `),
  claimReferral:   db.prepare(`
    UPDATE referrals SET claimed = 1, claimed_at = CURRENT_TIMESTAMP WHERE code = ?
  `),
  addCredits:      db.prepare('UPDATE users SET credits = credits + ? WHERE id = ?'),
};

// ─── Token Blacklist (in-memory, production should use Redis) ─────────────────

const blacklist = new Set();

// Prune blacklist every 10 min to avoid memory growth
setInterval(() => {
  // We can't decode without try/catch easily here, so just clear periodically
  // In production replace with Redis TTL keys
  if (blacklist.size > 50000) blacklist.clear();
}, 10 * 60 * 1000);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateReferralCode() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

function signAccess(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

function signRefresh(payload) {
  return jwt.sign(payload, JWT_REFRESH, { expiresIn: REFRESH_EXPIRY });
}

function verifyAccess(token) {
  return jwt.verify(token, JWT_SECRET);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, JWT_REFRESH);
}

function extractToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return req.body?.token || req.query?.token || null;
}

function safeUser(user) {
  // Never return password_hash to client
  const { password_hash, ...safe } = user;
  return safe;
}

// ─── Middleware ───────────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'No token provided' });
  if (blacklist.has(token)) return res.status(401).json({ error: 'Token revoked' });

  try {
    req.user = verifyAccess(token);
    req.token = token;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ─── App ──────────────────────────────────────────────────────────────────────

const app = express();

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Basic request logger
app.use((req, _res, next) => {
  if (process.env.NODE_ENV !== 'test') {
    console.log(`[auth] ${req.method} ${req.path}`);
  }
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /auth/register
 * Body: { email, password, referral_code? }
 * Returns: { token, refresh_token, user }
 */
app.post('/auth/register', async (req, res) => {
  try {
    const { email, password, referral_code } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }
    if (typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = stmts.findByEmail.get(email.toLowerCase().trim());
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const password_hash   = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const myReferralCode  = generateReferralCode();

    const info = stmts.insertUser.run({
      email:         email.toLowerCase().trim(),
      password_hash,
      referral_code: myReferralCode,
    });

    const userId = info.lastInsertRowid;

    // Handle incoming referral code (someone referred this user)
    if (referral_code) {
      const ref = stmts.findReferral.get(referral_code.toUpperCase());
      if (ref && ref.referred_email.toLowerCase() === email.toLowerCase()) {
        stmts.claimReferral.run(referral_code.toUpperCase());
        stmts.addCredits.run(ref.reward_credits, ref.referrer_id); // reward referrer
        stmts.addCredits.run(ref.reward_credits, userId);           // reward new user
      }
    }

    const user = stmts.findById.get(userId);
    stmts.updateLastLogin.run(userId);

    const payload = { sub: userId, email: user.email };
    const token         = signAccess(payload);
    const refresh_token = signRefresh(payload);

    return res.status(201).json({
      token,
      refresh_token,
      user: safeUser(user),
    });
  } catch (err) {
    console.error('[auth/register]', err);
    return res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * POST /auth/login
 * Body: { email, password }
 * Returns: { token, refresh_token, user }
 */
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const user = stmts.findByEmail.get(email.toLowerCase().trim());
    if (!user) {
      // Timing-safe: still run bcrypt to prevent user enumeration
      await bcrypt.compare(password, '$2a$10$invalidhashpadding000000000000000000000000000000000000');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.active) {
      return res.status(403).json({ error: 'Account is disabled' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    stmts.updateLastLogin.run(user.id);

    const payload = { sub: user.id, email: user.email };
    const token         = signAccess(payload);
    const refresh_token = signRefresh(payload);

    return res.json({
      token,
      refresh_token,
      user: safeUser(user),
    });
  } catch (err) {
    console.error('[auth/login]', err);
    return res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * POST /auth/logout
 * Header: Authorization: Bearer <token>
 * Blacklists the current access token
 */
app.post('/auth/logout', requireAuth, (req, res) => {
  blacklist.add(req.token);
  return res.json({ status: 'logged_out' });
});

/**
 * POST /auth/refresh
 * Body: { refresh_token }
 * Returns: { token, refresh_token }
 */
app.post('/auth/refresh', (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) {
    return res.status(400).json({ error: 'refresh_token is required' });
  }

  try {
    const decoded = verifyRefreshToken(refresh_token);
    const user = stmts.findById.get(decoded.sub);
    if (!user || !user.active) {
      return res.status(401).json({ error: 'User not found or disabled' });
    }

    const payload       = { sub: user.id, email: user.email };
    const token         = signAccess(payload);
    const new_refresh   = signRefresh(payload);

    return res.json({ token, refresh_token: new_refresh });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Refresh token expired, please log in again' });
    }
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
});

/**
 * GET /auth/verify
 * Header: Authorization: Bearer <token>
 * Returns: { valid: true, user: { sub, email, iat, exp } }
 */
app.get('/auth/verify', requireAuth, (req, res) => {
  return res.json({ valid: true, user: req.user });
});

/**
 * POST /referral/claim
 * Body: { code, email }
 * Allows a user to claim a referral code
 */
app.post('/referral/claim', async (req, res) => {
  try {
    const { code, email } = req.body;
    if (!code || !email) {
      return res.status(400).json({ error: 'code and email are required' });
    }

    const ref = stmts.findReferral.get(code.toUpperCase());
    if (!ref) {
      return res.status(404).json({ error: 'Referral code not found or already claimed' });
    }

    if (ref.referred_email.toLowerCase() !== email.toLowerCase()) {
      return res.status(403).json({ error: 'This code is not for this email' });
    }

    stmts.claimReferral.run(code.toUpperCase());

    const referrer = stmts.findById.get(ref.referrer_id);
    if (referrer) {
      stmts.addCredits.run(ref.reward_credits, referrer.id);
    }

    const referred = stmts.findByEmail.get(email.toLowerCase());
    if (referred) {
      stmts.addCredits.run(ref.reward_credits, referred.id);
    }

    return res.json({
      status: 'claimed',
      reward_credits: ref.reward_credits,
    });
  } catch (err) {
    console.error('[referral/claim]', err);
    return res.status(500).json({ error: 'Failed to claim referral' });
  }
});

/**
 * POST /referral/create
 * Body: { referrer_id, referred_email, reward_credits? }
 * Creates a new referral entry (internal use)
 */
app.post('/referral/create', requireAuth, (req, res) => {
  try {
    const { referred_email, reward_credits } = req.body;
    if (!referred_email) {
      return res.status(400).json({ error: 'referred_email is required' });
    }

    const code = generateReferralCode();
    stmts.insertReferral.run({
      referrer_id:    req.user.sub,
      referred_email: referred_email.toLowerCase().trim(),
      code,
      reward_credits: reward_credits || 50,
    });

    return res.status(201).json({ code, referred_email });
  } catch (err) {
    console.error('[referral/create]', err);
    return res.status(500).json({ error: 'Failed to create referral' });
  }
});

// Health check
app.get('/health', (_req, res) => res.json({ status: 'OK', service: 'auth', port: PORT }));

// 404 fallback
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('[auth] unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[auth] Service running on http://localhost:${PORT}`);
});

module.exports = app; // for testing
