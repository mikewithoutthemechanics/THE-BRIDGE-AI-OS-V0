/**
 * BRIDGE AI OS — User Identity & Funnel Management
 *
 * Persistent user store for authentication, funnel tracking, and nurture pipeline.
 * Uses better-sqlite3 (same pattern as agent-ledger.js).
 *
 * Tables:
 *   users — full user profile, funnel stage, lead score, journey data
 *
 * Usage:
 *   const userDb = require('./lib/user-identity');
 *   userDb.createUser('user@example.com', 'Jane', 'email', null);
 *   userDb.updateFunnelStage(userId, 'qualified');
 *   userDb.getFunnelStats();
 */

'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

// ── DB path ─────────────────────────────────────────────────────────────────
const DB_PATH = process.env.USER_DB_PATH
  || path.join(__dirname, '..', 'data', 'users.db');

const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// ── Schema ──────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    name TEXT,
    company TEXT,
    oauth_provider TEXT,
    oauth_id TEXT,
    password_hash TEXT,
    plan TEXT DEFAULT 'visitor',
    brdg_balance REAL DEFAULT 0,
    funnel_stage TEXT DEFAULT 'visitor',
    lead_score INTEGER DEFAULT 0,
    pain_points TEXT DEFAULT '[]',
    pages_visited TEXT DEFAULT '[]',
    conversations INTEGER DEFAULT 0,
    last_page TEXT,
    utm_source TEXT,
    first_seen TEXT,
    last_seen TEXT,
    api_key TEXT
  );
`);

// ── Helpers ─────────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || process.env.BRIDGE_SIWE_JWT_SECRET || 'bridge-default-jwt-secret';

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha256').update(salt + password).digest('hex');
  return salt + ':' + hash;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  const check = crypto.createHash('sha256').update(salt + password).digest('hex');
  return check === hash;
}

function now() {
  return new Date().toISOString();
}

// ── User CRUD ───────────────────────────────────────────────────────────────

function createUser(email, name, provider, oauthId, passwordRaw) {
  if (!email) throw new Error('Email is required');
  email = email.toLowerCase().trim();

  // Return existing user if found
  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (existing) return existing;

  const id = uuid();
  const ts = now();
  const apiKey = 'brdg_' + crypto.randomBytes(24).toString('hex');
  const passwordHash = passwordRaw ? hashPassword(passwordRaw) : null;

  db.prepare(`
    INSERT INTO users (id, email, name, oauth_provider, oauth_id, password_hash, api_key, first_seen, last_seen)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, email, name || null, provider || 'email', oauthId || null, passwordHash, apiKey, ts, ts);

  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function getUserByEmail(email) {
  if (!email) return null;
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim()) || null;
}

function getUserById(id) {
  if (!id) return null;
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) || null;
}

function getUserByApiKey(apiKey) {
  if (!apiKey) return null;
  return db.prepare('SELECT * FROM users WHERE api_key = ?').get(apiKey) || null;
}

// ── Funnel & Lead Scoring ───────────────────────────────────────────────────

const FUNNEL_ORDER = ['visitor', 'lead', 'qualified', 'opportunity', 'customer', 'advocate'];

function updateFunnelStage(userId, stage) {
  if (!FUNNEL_ORDER.includes(stage)) throw new Error('Invalid funnel stage: ' + stage);
  db.prepare('UPDATE users SET funnel_stage = ?, last_seen = ? WHERE id = ?').run(stage, now(), userId);
  return getUserById(userId);
}

function updateLeadScore(userId, delta) {
  const d = parseInt(delta, 10) || 0;
  db.prepare('UPDATE users SET lead_score = MAX(0, lead_score + ?), last_seen = ? WHERE id = ?').run(d, now(), userId);
  return getUserById(userId);
}

function recordPageVisit(userId, page) {
  const user = getUserById(userId);
  if (!user) return null;

  let pages = [];
  try { pages = JSON.parse(user.pages_visited || '[]'); } catch (_) {}
  if (!pages.includes(page)) pages.push(page);

  db.prepare('UPDATE users SET pages_visited = ?, last_page = ?, last_seen = ? WHERE id = ?')
    .run(JSON.stringify(pages), page, now(), userId);

  // Auto-increment score for page visits
  updateLeadScore(userId, 3);
  return getUserById(userId);
}

function recordConversation(userId) {
  db.prepare('UPDATE users SET conversations = conversations + 1, last_seen = ? WHERE id = ?')
    .run(now(), userId);
  // Conversations are high-intent signals
  updateLeadScore(userId, 5);
  return getUserById(userId);
}

function setUserPlan(userId, plan) {
  db.prepare('UPDATE users SET plan = ?, last_seen = ? WHERE id = ?').run(plan, now(), userId);
  return getUserById(userId);
}

// ── Auth Tokens (HMAC-SHA256 JWT-like) ──────────────────────────────────────

function generateAuthToken(userId) {
  const payload = {
    sub: userId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400 * 7, // 7 days
  };
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(header + '.' + body).digest('base64url');
  return header + '.' + body + '.' + sig;
}

function verifyAuthToken(token) {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [header, body, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(header + '.' + body).digest('base64url');
    if (sig !== expectedSig) return null;

    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    return getUserById(payload.sub);
  } catch (_) {
    return null;
  }
}

// ── Admin / Analytics ───────────────────────────────────────────────────────

function getAllUsers(filters) {
  let sql = 'SELECT * FROM users';
  const params = [];
  if (filters && filters.funnel_stage) {
    sql += ' WHERE funnel_stage = ?';
    params.push(filters.funnel_stage);
  }
  sql += ' ORDER BY last_seen DESC';
  return db.prepare(sql).all(...params);
}

function getFunnelStats() {
  const stages = db.prepare('SELECT funnel_stage, COUNT(*) as count FROM users GROUP BY funnel_stage').all();
  const total = stages.reduce((s, r) => s + r.count, 0);

  const stageMap = {};
  for (const s of FUNNEL_ORDER) stageMap[s] = 0;
  for (const r of stages) stageMap[r.funnel_stage] = r.count;

  // Conversion rates between adjacent stages
  const conversions = {};
  for (let i = 0; i < FUNNEL_ORDER.length - 1; i++) {
    const from = FUNNEL_ORDER[i];
    const to = FUNNEL_ORDER[i + 1];
    const fromCount = stageMap[from] || 0;
    const toCount = stageMap[to] || 0;
    conversions[from + '_to_' + to] = fromCount > 0 ? ((toCount / fromCount) * 100).toFixed(1) + '%' : '0%';
  }

  return { total, stages: stageMap, conversions };
}

function getNurtureQueue() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  return db.prepare(`
    SELECT * FROM users
    WHERE funnel_stage IN ('lead', 'qualified')
      AND (last_seen < ? OR last_seen IS NULL)
    ORDER BY lead_score DESC
  `).all(cutoff);
}

// ── Exports ─────────────────────────────────────────────────────────────────
module.exports = {
  createUser,
  getUserByEmail,
  getUserById,
  getUserByApiKey,
  updateFunnelStage,
  updateLeadScore,
  recordPageVisit,
  recordConversation,
  setUserPlan,
  generateAuthToken,
  verifyAuthToken,
  getAllUsers,
  getFunnelStats,
  getNurtureQueue,
  hashPassword,
  verifyPassword,
  FUNNEL_ORDER,
};
