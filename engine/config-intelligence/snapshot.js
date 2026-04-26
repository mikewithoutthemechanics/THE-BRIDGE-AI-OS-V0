// =============================================================================
// BRIDGE AI OS — State Snapshot Manager
//
// Captures and restores the complete resolved system state.
// Each snapshot is SHA-256 hashed so integrity can be verified on load.
//
// Files:
//   data/snapshots/state.snapshot       — latest snapshot (JSON)
//   data/snapshots/archive/TIMESTAMP.snapshot — historical archive
// =============================================================================
'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const registry = require('./registry');

const SNAP_DIR     = path.join(__dirname, 'data', 'snapshots');
const LATEST_FILE  = path.join(SNAP_DIR, 'state.snapshot');
const ARCHIVE_DIR  = path.join(SNAP_DIR, 'archive');

fs.mkdirSync(ARCHIVE_DIR, { recursive: true });

// ── Compute snapshot hash ─────────────────────────────────────────────────────
function hashSnapshot(body) {
  return crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

// ── Save a snapshot ───────────────────────────────────────────────────────────
function save(state, cioMeta = []) {
  const ts = Date.now();
  const body = {
    version:    '1',
    savedAt:    ts,
    sessionId:  registry.stats().sessionId,
    state,
    cioMeta,    // serialised CIO identity objects (without payloads)
    eventCount: registry.getEventCount(),
  };
  body.hash = hashSnapshot(body);

  const json = JSON.stringify(body, null, 2);

  // Write latest
  try {
    fs.writeFileSync(LATEST_FILE, json);
  } catch (err) {
    registry.emit('SNAPSHOT_WRITE_FAILED', { target: 'latest', error: err.message });
    return { ok: false, error: err.message };
  }

  // Archive copy
  const archivePath = path.join(ARCHIVE_DIR, `${ts}.snapshot`);
  try {
    fs.writeFileSync(archivePath, json);
  } catch (_) { /* archive failure is non-fatal */ }

  // Prune archive to last 10 snapshots
  pruneArchive(10);

  registry.emit('SNAPSHOT_SAVED', { hash: body.hash, savedAt: ts, cioCount: cioMeta.length });

  return { ok: true, hash: body.hash, savedAt: ts };
}

// ── Load the latest snapshot ──────────────────────────────────────────────────
function load() {
  if (!fs.existsSync(LATEST_FILE)) return { ok: false, error: 'no snapshot found' };

  let raw;
  try { raw = fs.readFileSync(LATEST_FILE, 'utf8'); } catch (err) {
    return { ok: false, error: `read error: ${err.message}` };
  }

  let snapshot;
  try { snapshot = JSON.parse(raw); } catch (err) {
    return { ok: false, error: `parse error: ${err.message}` };
  }

  // Integrity check
  const { hash: storedHash, ...body } = snapshot;
  const computedHash = hashSnapshot(body);

  if (computedHash !== storedHash) {
    registry.emit('SNAPSHOT_CORRUPTED', { storedHash, computedHash });
    return { ok: false, error: 'snapshot integrity check failed — hash mismatch', storedHash, computedHash };
  }

  registry.emit('SNAPSHOT_LOADED', { hash: storedHash, savedAt: snapshot.savedAt });

  return { ok: true, snapshot };
}

// ── Verify current snapshot integrity ────────────────────────────────────────
function verify() {
  const result = load();
  if (!result.ok) return { verified: false, reason: result.error };
  return { verified: true, hash: result.snapshot.hash, savedAt: result.snapshot.savedAt };
}

// ── List archive snapshots ────────────────────────────────────────────────────
function listArchive() {
  try {
    return fs.readdirSync(ARCHIVE_DIR)
      .filter(f => f.endsWith('.snapshot'))
      .sort()
      .reverse()
      .map(f => ({ filename: f, ts: parseInt(f), path: path.join(ARCHIVE_DIR, f) }));
  } catch (_) { return []; }
}

// ── Load a specific archived snapshot ────────────────────────────────────────
function loadArchived(ts) {
  const archivePath = path.join(ARCHIVE_DIR, `${ts}.snapshot`);
  if (!fs.existsSync(archivePath)) return { ok: false, error: `archive snapshot ${ts} not found` };

  try {
    const raw = fs.readFileSync(archivePath, 'utf8');
    return { ok: true, snapshot: JSON.parse(raw) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── Prune archive to keep last N snapshots ────────────────────────────────────
function pruneArchive(keep = 10) {
  const all = listArchive();
  const toDelete = all.slice(keep);
  for (const f of toDelete) {
    try { fs.unlinkSync(f.path); } catch (_) {}
  }
}

module.exports = { save, load, verify, listArchive, loadArchived };
