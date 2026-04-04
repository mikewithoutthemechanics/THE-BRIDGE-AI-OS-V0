'use strict';

/**
 * secrets.js — Local SQLite secrets manager
 * Reads/writes secrets from secrets_vault table in users.db
 * Falls back to env vars if secret not found in DB or DB unavailable
 * 5-minute in-memory cache for performance
 */

let Database;
try {
  Database = require('better-sqlite3');
} catch (_) {
  Database = null;
  console.warn('[secrets] better-sqlite3 not installed — using env-only mode');
}

const path = require('path');
const DB_PATH = path.join(__dirname, '..', 'users.db');

let db;
function getDB() {
  if (!Database) return null;
  if (!db) {
    try {
      db = new Database(DB_PATH);
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
      // Ensure secrets_vault table exists
      db.exec(`CREATE TABLE IF NOT EXISTS secrets_vault (
        key_name TEXT PRIMARY KEY,
        key_value TEXT NOT NULL,
        service TEXT DEFAULT 'API',
        status TEXT DEFAULT 'active',
        updated_by TEXT DEFAULT 'system',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
    } catch (err) {
      console.error('[secrets] Failed to open DB: ' + err.message);
      db = null;
      return null;
    }
  }
  return db;
}

// ===== CACHE =====
const cache = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get a secret by key name
 * Priority: cache -> DB -> env var -> fallback
 */
function getSecret(keyName, fallback = null) {
  const cacheKey = keyName.toUpperCase();
  const now = Date.now();

  // Check cache
  if (cache[cacheKey] && (now - cache[cacheKey].ts) < CACHE_TTL) {
    return cache[cacheKey].value;
  }

  const d = getDB();
  if (d) {
    try {
      const row = d.prepare("SELECT key_value FROM secrets_vault WHERE key_name = ? AND status = 'active'").get(keyName);
      if (row) {
        cache[cacheKey] = { value: row.key_value, ts: now };
        return row.key_value;
      }
    } catch (err) {
      console.error('[secrets] DB read failed for "' + keyName + '": ' + err.message);
    }
  }

  // Fallback to env var
  const envVal = process.env[cacheKey] || process.env[keyName];
  if (envVal) return envVal;

  return fallback;
}

/**
 * Set/update a secret
 */
function setSecret(keyName, keyValue, service = 'API', updatedBy = 'system') {
  const d = getDB();
  if (!d) {
    console.warn('[secrets] DB not available — cannot persist "' + keyName + '"');
    // Still cache it in memory for this session
    cache[keyName.toUpperCase()] = { value: keyValue, ts: Date.now() };
    return;
  }
  d.prepare(`
    INSERT INTO secrets_vault (key_name, key_value, service, status, updated_by, updated_at)
    VALUES (?, ?, ?, 'active', ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key_name) DO UPDATE SET
      key_value = excluded.key_value,
      service = excluded.service,
      updated_by = excluded.updated_by,
      updated_at = CURRENT_TIMESTAMP
  `).run(keyName, keyValue, service, updatedBy);

  // Invalidate cache
  delete cache[keyName.toUpperCase()];
}

/**
 * List all secrets (names only, not values — for admin/reporting)
 */
function listSecrets() {
  const d = getDB();
  if (!d) return [];
  try {
    return d.prepare("SELECT key_name, service, status, updated_by, updated_at FROM secrets_vault ORDER BY key_name").all();
  } catch (err) {
    console.error('[secrets] listSecrets failed: ' + err.message);
    return [];
  }
}

/**
 * Delete a secret
 */
function deleteSecret(keyName) {
  const d = getDB();
  if (d) {
    try { d.prepare("DELETE FROM secrets_vault WHERE key_name = ?").run(keyName); } catch (_) {}
  }
  delete cache[keyName.toUpperCase()];
}

/**
 * Sync secrets from Notion webhook payload
 */
function syncFromNotion(notionData) {
  const { key_name, key_value, service, status } = notionData;
  if (!key_name || !key_value) return { ok: false, error: 'missing key_name or key_value' };

  if (status === 'revoked') {
    deleteSecret(key_name);
    return { ok: true, action: 'revoked' };
  }

  setSecret(key_name, key_value, service || 'API', 'notion-sync');
  return { ok: true, action: 'upserted' };
}

/**
 * Seed initial secrets from .env into DB
 */
function seedFromEnv(keys) {
  const d = getDB();
  if (!d) return 0;
  let count = 0;
  for (const key of keys) {
    const val = process.env[key];
    if (val) {
      try {
        const exists = d.prepare("SELECT 1 FROM secrets_vault WHERE key_name = ?").get(key);
        if (!exists) {
          setSecret(key, val, 'ENV', 'seed');
          count++;
        }
      } catch (_) {}
    }
  }
  return count;
}

module.exports = { getSecret, setSecret, listSecrets, deleteSecret, syncFromNotion, seedFromEnv, getDB };