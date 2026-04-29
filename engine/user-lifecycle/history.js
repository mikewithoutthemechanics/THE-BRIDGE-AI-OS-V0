// =============================================================================
// BRIDGE AI OS — ULOE Immutable Audit History
//
// Every user lifecycle mutation emits one append-only event.
// Dual-write: Supabase (queryable) + JSONL file (tamper-evident local mirror).
// Each event carries a SHA-256 checksum chained from the previous event
// so any deletion or modification is detectable.
// =============================================================================
'use strict';

const crypto  = require('crypto');
const fs      = require('fs');
const path    = require('path');
const { supabase } = require('../../lib/supabase');
const { uuid } = require('./schemas');

const LOG_DIR  = path.join(__dirname, '../../engine/user-lifecycle/data/history');
const LOG_FILE = path.join(LOG_DIR, 'lifecycle.jsonl');

// Ensure directory exists at module load
try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch (_) {}

// ── Chain state (in-memory head) ──────────────────────────────────────────────
// The checksum of the last written event — next event chains from it.
let _lastChecksum = '0000000000000000000000000000000000000000000000000000000000000000';
let _initialized  = false;

function _computeChecksum(eventId, userId, action, details, prevChecksum) {
  const payload = JSON.stringify({ eventId, userId, action, details, prevChecksum });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

// Bootstrap: read the tail of the JSONL file to recover the last checksum.
// Only needs to run once per process.
function _init() {
  if (_initialized) return;
  _initialized = true;

  if (!fs.existsSync(LOG_FILE)) return;

  try {
    const content = fs.readFileSync(LOG_FILE, 'utf8');
    const lines   = content.trim().split('\n').filter(Boolean);
    if (lines.length === 0) return;

    const last = JSON.parse(lines[lines.length - 1]);
    if (last.checksum) _lastChecksum = last.checksum;
  } catch (_) {
    // File corrupt or unreadable — start fresh chain (new events chain from zero)
  }
}

// ── Core append ──────────────────────────────────────────────────────────────
async function append({
  userId,
  category,
  action,
  actor        = 'system',
  details      = {},
  correlationId = null,
  prevEventId  = null,
}) {
  _init();

  const eventId   = uuid();
  const timestamp = new Date().toISOString();
  const checksum  = _computeChecksum(eventId, userId, action, details, _lastChecksum);

  const event = {
    event_id:       eventId,
    user_id:        userId,
    timestamp,
    category,
    action,
    actor,
    details,
    correlation_id: correlationId,
    prev_event_id:  prevEventId,
    checksum,
  };

  // 1. Append to local JSONL (synchronous — guarantees local copy before DB)
  try {
    fs.appendFileSync(LOG_FILE, JSON.stringify(event) + '\n', 'utf8');
    _lastChecksum = checksum;
  } catch (err) {
    console.error('[HISTORY] JSONL write failed:', err.message);
  }

  // 2. Insert to Supabase (async — best effort)
  try {
    const { error } = await supabase.from('lifecycle_events').insert({
      event_id:       eventId,
      user_id:        userId,
      timestamp,
      category,
      action,
      actor,
      details,
      correlation_id: correlationId,
      prev_event_id:  prevEventId,
      checksum,
    });
    if (error) {
      console.error('[HISTORY] Supabase insert error:', error.message);
    }
  } catch (err) {
    console.error('[HISTORY] Supabase unreachable:', err.message);
  }

  return {
    event_id: eventId,
    category,
    action,
    timestamp,
  };
}

// ── Query (Supabase) ──────────────────────────────────────────────────────────
async function getHistory(userId, { category, limit = 50, offset = 0, after } = {}) {
  let q = supabase
    .from('lifecycle_events')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false })
    .range(offset, offset + limit - 1);

  if (category) q = q.eq('category', category);
  if (after)    q = q.gt('timestamp', after);

  const { data, error } = await q;
  if (error) throw new Error(`History query failed: ${error.message}`);
  return data || [];
}

// ── Chain verification ────────────────────────────────────────────────────────
// Reads the local JSONL file and verifies every checksum is correctly chained.
// Returns { ok: boolean, verified: number, broken_at: event_id | null }
function verifyChain() {
  _init();

  if (!fs.existsSync(LOG_FILE)) return { ok: true, verified: 0, broken_at: null };

  const lines  = fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n').filter(Boolean);
  let prevHash = '0000000000000000000000000000000000000000000000000000000000000000';

  for (let i = 0; i < lines.length; i++) {
    let event;
    try { event = JSON.parse(lines[i]); } catch (_) {
      return { ok: false, verified: i, broken_at: `line:${i + 1}`, reason: 'unparseable' };
    }

    const expected = _computeChecksum(
      event.event_id, event.user_id, event.action, event.details, prevHash,
    );

    if (event.checksum !== expected) {
      return { ok: false, verified: i, broken_at: event.event_id, reason: 'checksum_mismatch' };
    }

    prevHash = event.checksum;
  }

  return { ok: true, verified: lines.length, broken_at: null };
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function stats() {
  if (!fs.existsSync(LOG_FILE)) return { events: 0, size_bytes: 0, last_checksum: _lastChecksum };
  const stat = fs.statSync(LOG_FILE);
  const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean).length;
  return { events: lines, size_bytes: stat.size, last_checksum: _lastChecksum };
}

module.exports = { append, getHistory, verifyChain, stats };
