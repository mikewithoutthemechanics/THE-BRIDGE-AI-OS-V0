/**
 * BRIDGE AI OS — AP2-v3 Dual-Layer Memory System
 *
 * Short-term: in-memory Map keyed by sessionId (last 20 interactions, 30 min TTL)
 * Long-term:  SQLite table `agent_memory` for persistent recall and insights
 *
 * Uses better-sqlite3 for the persistent layer, matching the pattern
 * established in lib/ap2/ap2-registry.js.
 */

'use strict';

const path = require('path');
const fs = require('fs');

// Graceful require for better-sqlite3
let Database;
try { Database = require('better-sqlite3'); } catch (_) { Database = null; }

// ── Configuration ──────────────────────────────────────────────────────────
const SHORT_TERM_MAX = 20;               // max interactions per session
const SHORT_TERM_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// ── Short-term layer ───────────────────────────────────────────────────────
// Map<sessionId, { entries: Array, lastAccess: number }>
const shortTerm = new Map();

// ── Long-term layer (SQLite) ───────────────────────────────────────────────
const DB_PATH = process.env.AP2V3_MEMORY_DB_PATH
  || path.join(__dirname, '..', '..', 'data', 'ap2v3-memory.db');

let db = null;
let stmts = {};

function initDb() {
  if (db) return;
  if (!Database) {
    console.warn('[AP2-v3 Memory] better-sqlite3 not available — long-term memory disabled');
    return;
  }

  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_memory (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id  TEXT NOT NULL,
      agent_id    TEXT NOT NULL,
      input       TEXT NOT NULL,
      output      TEXT NOT NULL,
      score       REAL NOT NULL DEFAULT 0,
      tokens      INTEGER NOT NULL DEFAULT 0,
      ts          TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_mem_session ON agent_memory(session_id);
    CREATE INDEX IF NOT EXISTS idx_mem_agent   ON agent_memory(agent_id);
    CREATE INDEX IF NOT EXISTS idx_mem_ts      ON agent_memory(ts);
    CREATE INDEX IF NOT EXISTS idx_mem_score   ON agent_memory(score DESC);
  `);

  stmts = {
    insert: db.prepare(`
      INSERT INTO agent_memory (session_id, agent_id, input, output, score, tokens)
      VALUES (?, ?, ?, ?, ?, ?)
    `),
    recallBySession: db.prepare(`
      SELECT * FROM agent_memory WHERE session_id = ? ORDER BY ts DESC LIMIT ?
    `),
    recallByAgent: db.prepare(`
      SELECT * FROM agent_memory WHERE agent_id = ? ORDER BY ts DESC LIMIT ?
    `),
    insights: db.prepare(`
      SELECT
        agent_id,
        COUNT(*) as interaction_count,
        AVG(score) as avg_score,
        SUM(tokens) as total_tokens,
        MAX(ts) as last_active,
        MIN(ts) as first_seen
      FROM agent_memory
      WHERE agent_id = ?
      GROUP BY agent_id
    `),
    topByScore: db.prepare(`
      SELECT * FROM agent_memory WHERE agent_id = ? ORDER BY score DESC LIMIT ?
    `),
    deleteSession: db.prepare(`
      DELETE FROM agent_memory WHERE session_id = ?
    `),
  };
}

// Initialize DB on load
initDb();

// ── Short-term helpers ─────────────────────────────────────────────────────

function getOrCreateSession(sessionId) {
  if (!shortTerm.has(sessionId)) {
    shortTerm.set(sessionId, { entries: [], lastAccess: Date.now() });
  }
  const session = shortTerm.get(sessionId);
  session.lastAccess = Date.now();
  return session;
}

function trimSession(session) {
  while (session.entries.length > SHORT_TERM_MAX) {
    session.entries.shift(); // drop oldest
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Store an interaction in both short-term and long-term memory.
 *
 * @param {string} sessionId — session identifier
 * @param {string} agentId   — agent that handled the interaction
 * @param {string} input     — user/system input
 * @param {string} output    — agent output
 * @param {number} [score=0] — quality/relevance score (0-1)
 * @param {number} [tokens=0] — tokens consumed
 */
function remember(sessionId, agentId, input, output, score = 0, tokens = 0) {
  if (!sessionId || !agentId) throw new Error('sessionId and agentId are required');

  const inputStr = typeof input === 'string' ? input : JSON.stringify(input);
  const outputStr = typeof output === 'string' ? output : JSON.stringify(output);
  const ts = new Date().toISOString();

  // Short-term
  const session = getOrCreateSession(sessionId);
  session.entries.push({ agentId, input: inputStr, output: outputStr, score, tokens, ts });
  trimSession(session);

  // Long-term
  if (db && stmts.insert) {
    try {
      stmts.insert.run(sessionId, agentId, inputStr, outputStr, score, tokens);
    } catch (e) {
      console.error('[AP2-v3 Memory] Long-term write failed:', e.message);
    }
  }
}

/**
 * Recall recent interactions for a session from short-term memory.
 * Falls back to long-term if short-term is empty.
 *
 * @param {string} sessionId
 * @param {number} [limit=10]
 * @returns {Array}
 */
function recall(sessionId, limit = 10) {
  // Try short-term first
  const session = shortTerm.get(sessionId);
  if (session && session.entries.length > 0) {
    session.lastAccess = Date.now();
    return session.entries.slice(-limit);
  }

  // Fall back to long-term
  if (db && stmts.recallBySession) {
    try {
      return stmts.recallBySession.all(sessionId, limit);
    } catch (e) {
      console.error('[AP2-v3 Memory] Long-term recall failed:', e.message);
    }
  }

  return [];
}

/**
 * Recall recent interactions by a specific agent across all sessions.
 *
 * @param {string} agentId
 * @param {number} [limit=10]
 * @returns {Array}
 */
function recallAgent(agentId, limit = 10) {
  if (db && stmts.recallByAgent) {
    try {
      return stmts.recallByAgent.all(agentId, limit);
    } catch (e) {
      console.error('[AP2-v3 Memory] Agent recall failed:', e.message);
    }
  }

  // Fallback: scan short-term across all sessions
  const results = [];
  for (const [, session] of shortTerm) {
    for (const entry of session.entries) {
      if (entry.agentId === agentId) results.push(entry);
    }
  }
  results.sort(function (a, b) { return b.ts > a.ts ? 1 : -1; });
  return results.slice(0, limit);
}

/**
 * Get session context: short-term entries + session metadata.
 *
 * @param {string} sessionId
 * @returns {{ entries: Array, interaction_count: number, last_access: string|null }}
 */
function getSessionContext(sessionId) {
  const session = shortTerm.get(sessionId);
  if (!session) {
    return { entries: [], interaction_count: 0, last_access: null };
  }
  session.lastAccess = Date.now();
  return {
    entries: session.entries.slice(),
    interaction_count: session.entries.length,
    last_access: new Date(session.lastAccess).toISOString(),
  };
}

/**
 * Clear a session from short-term memory. Optionally clear long-term too.
 *
 * @param {string} sessionId
 * @param {{ longTerm?: boolean }} [opts]
 */
function clearSession(sessionId, opts = {}) {
  shortTerm.delete(sessionId);

  if (opts.longTerm && db && stmts.deleteSession) {
    try {
      stmts.deleteSession.run(sessionId);
    } catch (e) {
      console.error('[AP2-v3 Memory] Long-term clear failed:', e.message);
    }
  }
}

/**
 * Get aggregate insights for an agent from long-term memory.
 *
 * @param {string} agentId
 * @returns {object} { interaction_count, avg_score, total_tokens, last_active, first_seen, top_interactions }
 */
function getLongTermInsights(agentId) {
  if (!db || !stmts.insights) {
    return { interaction_count: 0, avg_score: 0, total_tokens: 0, last_active: null, first_seen: null, top_interactions: [] };
  }

  try {
    const row = stmts.insights.get(agentId);
    const top = stmts.topByScore.all(agentId, 5);

    if (!row) {
      return { interaction_count: 0, avg_score: 0, total_tokens: 0, last_active: null, first_seen: null, top_interactions: [] };
    }

    return {
      interaction_count: row.interaction_count || 0,
      avg_score: row.avg_score || 0,
      total_tokens: row.total_tokens || 0,
      last_active: row.last_active || null,
      first_seen: row.first_seen || null,
      top_interactions: top || [],
    };
  } catch (e) {
    console.error('[AP2-v3 Memory] Insights query failed:', e.message);
    return { interaction_count: 0, avg_score: 0, total_tokens: 0, last_active: null, first_seen: null, top_interactions: [] };
  }
}

// ── Auto-cleanup of expired short-term entries ─────────────────────────────

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [sessionId, session] of shortTerm) {
    if (now - session.lastAccess > SHORT_TERM_TTL_MS) {
      shortTerm.delete(sessionId);
    }
  }
}

const cleanupTimer = setInterval(cleanupExpiredSessions, CLEANUP_INTERVAL_MS);
// Allow process to exit without waiting for cleanup timer
if (cleanupTimer.unref) cleanupTimer.unref();

module.exports = {
  remember,
  recall,
  recallAgent,
  getSessionContext,
  clearSession,
  getLongTermInsights,
  // Exposed for testing
  _shortTerm: shortTerm,
  _cleanupExpiredSessions: cleanupExpiredSessions,
};
