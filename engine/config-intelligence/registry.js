// =============================================================================
// BRIDGE AI OS — Event-Sourced Registry
//
// Every operation in the engine emits an immutable event here.
// Events are appended to disk as NDJSON and never modified.
// The registry is the single source of truth for replay and audit.
//
// Files:
//   data/registry/events.log   — all events (append-only NDJSON)
//   data/registry/sessions.log — session boundaries
// =============================================================================
'use strict';

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR   = path.join(__dirname, 'data', 'registry');
const EVENTS_LOG = path.join(DATA_DIR, 'events.log');
const SESSIONS_LOG = path.join(DATA_DIR, 'sessions.log');

// ── In-memory event buffer (also written to disk) ─────────────────────────────
const _events = [];
let _sessionId = crypto.randomUUID();
let _seq = 0;

// ── Ensure data directory exists ──────────────────────────────────────────────
fs.mkdirSync(DATA_DIR, { recursive: true });

// ── Core emitter ─────────────────────────────────────────────────────────────
function emit(type, data = {}, cioHash = null) {
  _seq += 1;
  const event = {
    seq:       _seq,
    id:        crypto.randomUUID(),
    sessionId: _sessionId,
    type,
    cioHash,
    data,
    ts:        Date.now(),
    // Chained hash: sha256 of (prev_hash + this event body)
    prevHash:  _events.length > 0 ? _events[_events.length - 1].chainHash : '0'.repeat(64),
  };

  // Compute chain hash AFTER prevHash is set
  event.chainHash = crypto.createHash('sha256')
    .update(event.prevHash + JSON.stringify({ seq: event.seq, type, data, cioHash }))
    .digest('hex');

  _events.push(event);

  // Append to disk (sync to guarantee durability before returning)
  try {
    fs.appendFileSync(EVENTS_LOG, JSON.stringify(event) + '\n');
  } catch (_) { /* tolerate FS errors — in-memory log stays intact */ }

  return event;
}

// ── Session management ────────────────────────────────────────────────────────
function startSession(meta = {}) {
  _sessionId = crypto.randomUUID();
  const sessionEvent = {
    sessionId: _sessionId,
    startedAt: Date.now(),
    ...meta,
  };
  try {
    fs.appendFileSync(SESSIONS_LOG, JSON.stringify(sessionEvent) + '\n');
  } catch (_) {}
  emit('SESSION_START', { sessionId: _sessionId, ...meta });
  return _sessionId;
}

// ── Query helpers ─────────────────────────────────────────────────────────────
function getEvents(filter = {}) {
  let result = [..._events];
  if (filter.type)      result = result.filter(e => e.type === filter.type);
  if (filter.cioHash)   result = result.filter(e => e.cioHash === filter.cioHash);
  if (filter.sessionId) result = result.filter(e => e.sessionId === filter.sessionId);
  if (filter.since)     result = result.filter(e => e.ts >= filter.since);
  if (filter.limit)     result = result.slice(-filter.limit);
  return result;
}

function getLastEvent(type) {
  for (let i = _events.length - 1; i >= 0; i--) {
    if (_events[i].type === type) return _events[i];
  }
  return null;
}

function getEventCount(type) {
  return type ? _events.filter(e => e.type === type).length : _events.length;
}

// ── Chain integrity verification ──────────────────────────────────────────────
function verifyChain() {
  for (let i = 1; i < _events.length; i++) {
    const prev = _events[i - 1];
    const curr = _events[i];
    if (curr.prevHash !== prev.chainHash) {
      return { valid: false, brokenAt: i, event: curr };
    }
  }
  return { valid: true, length: _events.length };
}

// ── Replay from disk ──────────────────────────────────────────────────────────
function loadFromDisk() {
  if (!fs.existsSync(EVENTS_LOG)) return 0;
  const lines = fs.readFileSync(EVENTS_LOG, 'utf8').split('\n').filter(Boolean);
  let loaded = 0;
  for (const line of lines) {
    try {
      const ev = JSON.parse(line);
      if (!_events.find(e => e.id === ev.id)) {
        _events.push(ev);
        if (ev.seq > _seq) _seq = ev.seq;
        loaded++;
      }
    } catch (_) { /* skip corrupt lines */ }
  }
  return loaded;
}

// ── Statistics ────────────────────────────────────────────────────────────────
function stats() {
  const types = {};
  for (const e of _events) types[e.type] = (types[e.type] || 0) + 1;
  return {
    total:      _events.length,
    sessionId:  _sessionId,
    byType:     types,
    chainValid: verifyChain().valid,
    firstTs:    _events[0]?.ts || null,
    lastTs:     _events[_events.length - 1]?.ts || null,
  };
}

module.exports = { emit, startSession, getEvents, getLastEvent, getEventCount, verifyChain, loadFromDisk, stats };
