'use strict';
/**
 * BRIDGE AI OS — Agent Action Logger
 * ====================================
 * Central audit trail for every agent lifecycle event.
 *
 * Financial events (credits / debits / transfers) are already captured in
 * `agent_transactions` by agent-ledger.js. This module captures behavioural
 * events: auth, register, update, remove, wallet provision, etc.
 *
 * Usage:
 *   const logger = require('./agent-action-logger');
 *   await logger.log('prime-001', 'register', { name: 'Prime', role: 'master' });
 *   await logger.log('wallet-abc123', 'auth_new', { address: '0x…', brdg_grant: 0.5 }, { actor: 'system', ip: req.ip });
 *
 * Offline behaviour:
 *   If Supabase is unavailable the event is queued in memory and retried
 *   once (on the next log call). Events are never thrown — logging must
 *   never block or break the caller.
 */

let supabase = null;
try {
  const sb = require('./supabase');
  supabase = sb.supabase;
} catch (_) {}

const TABLE = 'agent_action_log';

// ── In-memory fallback queue (survives short Supabase blips) ─────────────────
const _queue = [];
const MAX_QUEUE = 500;

// ── UUID cache: agent_id → uuid ───────────────────────────────────────────────
// Populated lazily so we don't need a synchronous DB call on every log.
const _uuidCache = new Map();

/**
 * Look up (and cache) the UUID for an agent.
 * Returns null if unavailable or Supabase is offline.
 */
async function _resolveUuid(agentId) {
  if (_uuidCache.has(agentId)) return _uuidCache.get(agentId);
  if (!supabase) return null;
  try {
    const { data } = await supabase
      .from('agents')
      .select('uuid')
      .eq('id', agentId)
      .single();
    const uuid = data?.uuid ?? null;
    if (uuid) _uuidCache.set(agentId, uuid);
    return uuid;
  } catch (_) {
    return null;
  }
}

/**
 * Flush the in-memory queue to Supabase (best-effort, non-throwing).
 */
async function _flushQueue() {
  if (!supabase || _queue.length === 0) return;
  const batch = _queue.splice(0, 50);          // flush up to 50 at a time
  try {
    await supabase.from(TABLE).insert(batch);
  } catch (err) {
    // Put them back — but cap to avoid unbounded growth
    if (_queue.length < MAX_QUEUE) _queue.unshift(...batch);
    console.warn('[agent-action-logger] flush failed, re-queued:', err.message);
  }
}

/**
 * Log an agent action.
 *
 * @param {string} agentId   - agent slug ID (e.g. 'prime-001', 'wallet-abc123ef')
 * @param {string} action    - action type: 'register' | 'update' | 'remove' |
 *                             'auth_new' | 'auth_ok' | 'credit' | 'debit' |
 *                             'transfer' | 'wallet_provision' | 'seed' | string
 * @param {object} [payload] - sanitised action-specific detail (no secrets/tokens)
 * @param {object} [opts]    - { actor?: string, ip?: string }
 */
async function log(agentId, action, payload, opts) {
  if (!agentId || !action) return;

  const actor = opts?.actor ?? 'system';
  const ip    = opts?.ip    ?? null;

  // Best-effort UUID resolution (non-blocking if it fails)
  let agentUuid = null;
  try { agentUuid = await _resolveUuid(agentId); } catch (_) {}

  const record = {
    agent_id:   agentId,
    agent_uuid: agentUuid,
    action,
    actor,
    payload:    payload ?? {},
    ip,
    ts:         new Date().toISOString(),
  };

  if (!supabase) {
    // Offline: queue for later
    if (_queue.length < MAX_QUEUE) _queue.push(record);
    return;
  }

  // Opportunistically flush any queued events before writing the new one
  if (_queue.length > 0) await _flushQueue();

  try {
    const { error } = await supabase.from(TABLE).insert(record);
    if (error) {
      console.warn(`[agent-action-logger] insert failed (${agentId}/${action}):`, error.message);
      if (_queue.length < MAX_QUEUE) _queue.push(record);
    }
  } catch (err) {
    console.warn(`[agent-action-logger] unexpected error (${agentId}/${action}):`, err.message);
    if (_queue.length < MAX_QUEUE) _queue.push(record);
  }
}

/**
 * Retrieve action log entries for an agent (most recent first).
 *
 * @param {string} agentId
 * @param {object} [opts] - { limit?: number, action?: string, since?: Date }
 * @returns {Promise<Array>}
 */
async function getLog(agentId, opts) {
  if (!supabase) return [];
  const limit  = opts?.limit  ?? 50;
  const action = opts?.action ?? null;
  const since  = opts?.since  ?? null;

  let q = supabase
    .from(TABLE)
    .select('*')
    .eq('agent_id', agentId)
    .order('ts', { ascending: false })
    .limit(limit);

  if (action) q = q.eq('action', action);
  if (since)  q = q.gte('ts', since instanceof Date ? since.toISOString() : since);

  const { data, error } = await q;
  if (error) throw new Error('getLog failed: ' + error.message);
  return data || [];
}

/**
 * Retrieve recent actions across all agents (admin view).
 *
 * @param {object} [opts] - { limit?: number, action?: string }
 * @returns {Promise<Array>}
 */
async function getRecentActions(opts) {
  if (!supabase) return [];
  const limit  = opts?.limit  ?? 100;
  const action = opts?.action ?? null;

  let q = supabase
    .from(TABLE)
    .select('*')
    .order('ts', { ascending: false })
    .limit(limit);

  if (action) q = q.eq('action', action);

  const { data, error } = await q;
  if (error) throw new Error('getRecentActions failed: ' + error.message);
  return data || [];
}

/**
 * Expose the pending queue length (useful for health checks).
 */
function queueSize() { return _queue.length; }

module.exports = { log, getLog, getRecentActions, queueSize };
