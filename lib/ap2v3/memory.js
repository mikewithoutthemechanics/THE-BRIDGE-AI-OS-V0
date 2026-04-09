/**
 * BRIDGE AI OS -- AP2-v3 Dual-Layer Memory System
 *
 * Short-term: in-memory Map keyed by sessionId (last 20 interactions, 30 min TTL)
 * Long-term:  Supabase table `agent_memory` for persistent recall and insights
 *
 * Uses @supabase/supabase-js for the persistent layer.
 */

'use strict';

const { supabase } = require('../supabase');

// -- Configuration ----------------------------------------------------------
const SHORT_TERM_MAX = 20;               // max interactions per session
const SHORT_TERM_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// -- Short-term layer -------------------------------------------------------
// Map<sessionId, { entries: Array, lastAccess: number }>
const shortTerm = new Map();

// -- Short-term helpers -----------------------------------------------------

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

// -- Public API -------------------------------------------------------------

/**
 * Store an interaction in both short-term and long-term memory.
 *
 * @param {string} sessionId - session identifier
 * @param {string} agentId   - agent that handled the interaction
 * @param {string} input     - user/system input
 * @param {string} output    - agent output
 * @param {number} [score=0] - quality/relevance score (0-1)
 * @param {number} [tokens=0] - tokens consumed
 */
async function remember(sessionId, agentId, input, output, score = 0, tokens = 0) {
  if (!sessionId || !agentId) throw new Error('sessionId and agentId are required');

  const inputStr = typeof input === 'string' ? input : JSON.stringify(input);
  const outputStr = typeof output === 'string' ? output : JSON.stringify(output);
  const ts = new Date().toISOString();

  // Short-term
  const session = getOrCreateSession(sessionId);
  session.entries.push({ agentId, input: inputStr, output: outputStr, score, tokens, ts });
  trimSession(session);

  // Long-term (Supabase)
  if (supabase) {
    try {
      const { error } = await supabase
        .from('agent_memory')
        .insert({
          session_id: sessionId,
          agent_id: agentId,
          input: inputStr,
          output: outputStr,
          score,
          tokens,
          ts,
        });
      if (error) console.error('[AP2-v3 Memory] Long-term write failed:', error.message);
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
 * @returns {Promise<Array>}
 */
async function recall(sessionId, limit = 10) {
  // Try short-term first
  const session = shortTerm.get(sessionId);
  if (session && session.entries.length > 0) {
    session.lastAccess = Date.now();
    return session.entries.slice(-limit);
  }

  // Fall back to long-term
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('agent_memory')
        .select('*')
        .eq('session_id', sessionId)
        .order('ts', { ascending: false })
        .limit(limit);

      if (!error && data) return data;
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
 * @returns {Promise<Array>}
 */
async function recallAgent(agentId, limit = 10) {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('agent_memory')
        .select('*')
        .eq('agent_id', agentId)
        .order('ts', { ascending: false })
        .limit(limit);

      if (!error && data) return data;
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
async function clearSession(sessionId, opts = { longTerm: true }) {
  shortTerm.delete(sessionId);

  if (opts.longTerm && supabase) {
    try {
      const { error } = await supabase
        .from('agent_memory')
        .delete()
        .eq('session_id', sessionId);

      if (error) console.error('[AP2-v3 Memory] Long-term clear failed:', error.message);
    } catch (e) {
      console.error('[AP2-v3 Memory] Long-term clear failed:', e.message);
    }
  }
}

/**
 * Get aggregate insights for an agent from long-term memory.
 *
 * @param {string} agentId
 * @returns {Promise<object>} { interaction_count, avg_score, total_tokens, last_active, first_seen, top_interactions }
 */
async function getLongTermInsights(agentId) {
  const empty = { interaction_count: 0, avg_score: 0, total_tokens: 0, last_active: null, first_seen: null, top_interactions: [] };

  if (!supabase) return empty;

  try {
    // Get all rows for this agent to compute aggregates
    const { data: rows, error } = await supabase
      .from('agent_memory')
      .select('score, tokens, ts')
      .eq('agent_id', agentId);

    if (error || !rows || rows.length === 0) return empty;

    const interactionCount = rows.length;
    const totalTokens = rows.reduce((sum, r) => sum + (r.tokens || 0), 0);
    const avgScore = rows.reduce((sum, r) => sum + (r.score || 0), 0) / interactionCount;
    const timestamps = rows.map(r => r.ts).sort();
    const firstSeen = timestamps[0] || null;
    const lastActive = timestamps[timestamps.length - 1] || null;

    // Top interactions by score
    const { data: top } = await supabase
      .from('agent_memory')
      .select('*')
      .eq('agent_id', agentId)
      .order('score', { ascending: false })
      .limit(5);

    return {
      interaction_count: interactionCount,
      avg_score: avgScore,
      total_tokens: totalTokens,
      last_active: lastActive,
      first_seen: firstSeen,
      top_interactions: top || [],
    };
  } catch (e) {
    console.error('[AP2-v3 Memory] Insights query failed:', e.message);
    return empty;
  }
}

// -- Auto-cleanup of expired short-term entries -----------------------------

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

/**
 * Return basic stats for the health endpoint.
 * @returns {{ sessions: number }}
 */
function getStats() {
  return { sessions: shortTerm.size };
}

module.exports = {
  remember,
  recall,
  recallAgent,
  getSessionContext,
  clearSession,
  getLongTermInsights,
  getStats,
  // Exposed for testing
  _shortTerm: shortTerm,
  _cleanupExpiredSessions: cleanupExpiredSessions,
};
