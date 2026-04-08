/**
 * BRIDGE AI OS — Public API Key System
 *
 * SQLite-backed API key management for paying users.
 * Handles key generation, validation, rate limiting, and BRDG credit tracking.
 *
 * Plans:
 *   starter:    10 req/min,   initial 100 BRDG
 *   pro:        60 req/min,   initial 1000 BRDG
 *   enterprise: 300 req/min,  initial 10000 BRDG
 *
 * Usage:
 *   const apiKeys = require('./lib/api-keys');
 *   const key = apiKeys.createKey('user@example.com', 'pro');
 *   const data = apiKeys.validateKey(key.api_key);
 *   apiKeys.addCredits(key.api_key, 500);
 */

'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

// ── DB path ─────────────────────────────────────────────────────────────────
const DB_PATH = process.env.API_KEYS_DB_PATH
  || path.join(__dirname, '..', 'data', 'api-keys.db');

const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// ── Schema ──────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS api_keys (
    key_id          INTEGER PRIMARY KEY AUTOINCREMENT,
    api_key         TEXT    UNIQUE NOT NULL,
    email           TEXT    NOT NULL,
    plan            TEXT    NOT NULL DEFAULT 'starter',
    rate_limit_per_min INTEGER NOT NULL DEFAULT 10,
    calls_today     INTEGER NOT NULL DEFAULT 0,
    calls_total     INTEGER NOT NULL DEFAULT 0,
    brdg_balance    REAL    NOT NULL DEFAULT 0,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    last_used       TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_api_keys_email ON api_keys(email);
  CREATE INDEX IF NOT EXISTS idx_api_keys_key   ON api_keys(api_key);
`);

// ── Rate-limit tracking (in-memory sliding window) ──────────────────────────
// Map<api_key, timestamp[]>
const rateBuckets = new Map();

// ── Plan config ─────────────────────────────────────────────────────────────
const PLANS = {
  starter:    { rate_limit_per_min: 10,  initial_brdg: 100   },
  pro:        { rate_limit_per_min: 60,  initial_brdg: 1000  },
  enterprise: { rate_limit_per_min: 300, initial_brdg: 10000 },
};

// ── Helpers ─────────────────────────────────────────────────────────────────
function generateApiKey() {
  const rand = crypto.randomBytes(18).toString('base64url');
  return `brdg_live_${rand}`;
}

function checkRateLimit(apiKey, limit) {
  const now = Date.now();
  const windowMs = 60000;
  let bucket = rateBuckets.get(apiKey);
  if (!bucket) {
    bucket = [];
    rateBuckets.set(apiKey, bucket);
  }
  // Prune entries older than 1 minute
  while (bucket.length > 0 && bucket[0] <= now - windowMs) {
    bucket.shift();
  }
  if (bucket.length >= limit) {
    return false; // rate limited
  }
  bucket.push(now);
  return true;
}

// ── Prepared statements ─────────────────────────────────────────────────────
const stmts = {
  insert: db.prepare(`
    INSERT INTO api_keys (api_key, email, plan, rate_limit_per_min, brdg_balance)
    VALUES (@api_key, @email, @plan, @rate_limit_per_min, @brdg_balance)
  `),
  getByKey: db.prepare(`SELECT * FROM api_keys WHERE api_key = ?`),
  incrementCalls: db.prepare(`
    UPDATE api_keys
    SET calls_today = calls_today + 1,
        calls_total = calls_total + 1,
        last_used   = datetime('now')
    WHERE api_key = ?
  `),
  deductBalance: db.prepare(`
    UPDATE api_keys
    SET brdg_balance = brdg_balance - ?
    WHERE api_key = ? AND brdg_balance >= ?
  `),
  addBalance: db.prepare(`
    UPDATE api_keys
    SET brdg_balance = brdg_balance + ?
    WHERE api_key = ?
  `),
  resetDaily: db.prepare(`UPDATE api_keys SET calls_today = 0`),
};

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Create a new API key for a user.
 * @param {string} email
 * @param {string} plan - 'starter' | 'pro' | 'enterprise'
 * @returns {{ key_id: number, api_key: string, email: string, plan: string }}
 */
function createKey(email, plan) {
  if (!plan) plan = 'starter';
  if (!email || typeof email !== 'string') {
    throw new Error('Valid email is required');
  }
  const planConfig = PLANS[plan];
  if (!planConfig) {
    throw new Error('Invalid plan: ' + plan + '. Must be one of: ' + Object.keys(PLANS).join(', '));
  }

  const api_key = generateApiKey();
  const result = stmts.insert.run({
    api_key,
    email: email.trim().toLowerCase(),
    plan,
    rate_limit_per_min: planConfig.rate_limit_per_min,
    brdg_balance: planConfig.initial_brdg,
  });

  return {
    key_id: result.lastInsertRowid,
    api_key,
    email: email.trim().toLowerCase(),
    plan,
    rate_limit_per_min: planConfig.rate_limit_per_min,
    brdg_balance: planConfig.initial_brdg,
  };
}

/**
 * Validate an API key and increment usage counters.
 * Returns key data if valid, null if not found.
 * Throws if rate-limited.
 * @param {string} apiKey
 * @returns {object|null}
 */
function validateKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') return null;

  const row = stmts.getByKey.get(apiKey);
  if (!row) return null;

  // Check rate limit
  if (!checkRateLimit(apiKey, row.rate_limit_per_min)) {
    const err = new Error('Rate limit exceeded');
    err.code = 'RATE_LIMITED';
    err.retryAfterSecs = 60;
    throw err;
  }

  // Increment call counters
  stmts.incrementCalls.run(apiKey);

  return {
    key_id: row.key_id,
    api_key: row.api_key,
    email: row.email,
    plan: row.plan,
    rate_limit_per_min: row.rate_limit_per_min,
    calls_today: row.calls_today + 1,
    calls_total: row.calls_total + 1,
    brdg_balance: row.brdg_balance,
    created_at: row.created_at,
    last_used: row.last_used,
  };
}

/**
 * Get usage stats for a key.
 * @param {string} apiKey
 * @returns {object|null}
 */
function getUsage(apiKey) {
  const row = stmts.getByKey.get(apiKey);
  if (!row) return null;

  return {
    key_id: row.key_id,
    email: row.email,
    plan: row.plan,
    rate_limit_per_min: row.rate_limit_per_min,
    calls_today: row.calls_today,
    calls_total: row.calls_total,
    brdg_balance: row.brdg_balance,
    created_at: row.created_at,
    last_used: row.last_used,
  };
}

/**
 * Add BRDG credits to a key.
 * @param {string} apiKey
 * @param {number} brdgAmount
 * @returns {{ success: boolean, new_balance: number }}
 */
function addCredits(apiKey, brdgAmount) {
  if (typeof brdgAmount !== 'number' || brdgAmount <= 0) {
    throw new Error('brdgAmount must be a positive number');
  }

  const row = stmts.getByKey.get(apiKey);
  if (!row) throw new Error('API key not found');

  stmts.addBalance.run(brdgAmount, apiKey);

  return {
    success: true,
    new_balance: row.brdg_balance + brdgAmount,
  };
}

/**
 * Deduct BRDG credits from a key (per-call cost).
 * @param {string} apiKey
 * @param {number} amount - defaults to 1
 * @returns {{ success: boolean, new_balance: number }}
 */
function deductCredit(apiKey, amount) {
  if (!amount) amount = 1;
  if (typeof amount !== 'number' || amount <= 0) {
    throw new Error('amount must be a positive number');
  }

  const row = stmts.getByKey.get(apiKey);
  if (!row) throw new Error('API key not found');

  if (row.brdg_balance < amount) {
    const err = new Error('Insufficient BRDG balance');
    err.code = 'INSUFFICIENT_BALANCE';
    err.balance = row.brdg_balance;
    throw err;
  }

  stmts.deductBalance.run(amount, apiKey, amount);

  return {
    success: true,
    new_balance: row.brdg_balance - amount,
  };
}

/**
 * Reset daily call counters (run via cron at midnight).
 */
function resetDailyCounts() {
  stmts.resetDaily.run();
}

module.exports = {
  createKey,
  validateKey,
  getUsage,
  addCredits,
  deductCredit,
  resetDailyCounts,
  PLANS,
  db,
};
