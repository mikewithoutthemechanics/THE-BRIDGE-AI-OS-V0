// =============================================================================
// BRIDGE AI OS — Deterministic Replay Engine
//
// Rebuilds the complete system state from:
//   1. A base snapshot (optional — provides fast-forward start point)
//   2. Events appended after the snapshot
//
// Same inputs ALWAYS produce the same state.
// Used for:
//   - Crash recovery
//   - State audit / investigation
//   - Testing determinism
// =============================================================================
'use strict';

const registry = require('./registry');
const snapshot = require('./snapshot');
const { CIO, globalStore } = require('./cio');

// ── Replay event handlers — maps event type → state mutation ─────────────────
const REPLAY_HANDLERS = {
  CIO_CREATED(event, state) {
    const { hash, id, namespace, type } = event.data;
    if (!state.cioIndex[hash]) {
      state.cioIndex[hash] = { id, hash, namespace, type, status: 'pending', createdAt: event.ts };
    }
  },

  VALIDATION_PASSED(event, state) {
    const cio = state.cioIndex[event.cioHash];
    if (cio) cio.status = 'valid';
  },

  VALIDATION_FAILED(event, state) {
    const cio = state.cioIndex[event.cioHash];
    if (cio) { cio.status = 'invalid'; cio.errors = event.data.errors; }
  },

  SANDBOX_PASSED(event, state) {
    const cio = state.cioIndex[event.cioHash];
    if (cio) cio.sandboxPassed = true;
  },

  SANDBOX_FAILED(event, state) {
    const cio = state.cioIndex[event.cioHash];
    if (cio) { cio.sandboxPassed = false; cio.sandboxErrors = event.data.errors; }
  },

  CIO_SCORED(event, state) {
    const cio = state.cioIndex[event.cioHash];
    if (cio) cio.score = event.data.score;
  },

  CONFLICT_RESOLVED(event, state) {
    for (const id of (event.data.loserIds || [])) {
      const cio = Object.values(state.cioIndex).find(c => c.id === id);
      if (cio) cio.status = 'superseded';
    }
  },

  CIO_ACTIVATED(event, state) {
    const cio = state.cioIndex[event.cioHash];
    if (cio) {
      cio.status = 'active';
      cio.activeSince = event.ts;
      // Only one active per namespace per type
      for (const other of Object.values(state.cioIndex)) {
        if (other.hash !== event.cioHash && other.namespace === cio.namespace && other.status === 'active') {
          other.status = 'superseded';
        }
      }
    }
    state.activeState = { ...state.activeState, ...event.data.mergedState };
    state.lastActivationAt = event.ts;
  },

  FILE_QUARANTINED(event, state) {
    state.quarantined.push({ source: event.data.source, reason: event.data.reason, ts: event.ts });
  },

  DRIFT_DETECTED(event, state) {
    state.driftEvents.push({ ts: event.ts, ...event.data });
  },

  HEALED(event, state) {
    state.healEvents.push({ ts: event.ts, ...event.data });
  },
};

// ── Replay from snapshot + events ─────────────────────────────────────────────
function replay(opts = {}) {
  const { fromSnapshot = true, afterTs = 0, verbose = false } = opts;

  // Base state
  const state = {
    cioIndex:         {},
    activeState:      {},
    quarantined:      [],
    driftEvents:      [],
    healEvents:       [],
    replayedCount:    0,
    skippedCount:     0,
    lastActivationAt: null,
    replayedAt:       Date.now(),
  };

  // 1. Fast-forward from snapshot
  let snapshotTs = 0;
  if (fromSnapshot) {
    const snap = snapshot.load();
    if (snap.ok) {
      // Pre-populate cioIndex from snapshot meta
      for (const meta of snap.snapshot.cioMeta || []) {
        state.cioIndex[meta.hash] = { ...meta };
      }
      state.activeState = snap.snapshot.state || {};
      snapshotTs = snap.snapshot.savedAt || 0;
      if (verbose) console.log(`[REPLAY] Fast-forwarded from snapshot at ${new Date(snapshotTs).toISOString()}`);
    }
  }

  // 2. Replay events after snapshot (or afterTs if specified)
  const cutoffTs = Math.max(snapshotTs, afterTs);
  const events = registry.getEvents({ since: cutoffTs });

  for (const event of events) {
    const handler = REPLAY_HANDLERS[event.type];
    if (handler) {
      handler(event, state);
      state.replayedCount++;
    } else {
      state.skippedCount++;
    }
  }

  registry.emit('REPLAY_COMPLETE', {
    replayedCount: state.replayedCount,
    skippedCount:  state.skippedCount,
    cioCount:      Object.keys(state.cioIndex).length,
    fromSnapshot,
    snapshotTs,
  });

  return state;
}

// ── Verify determinism: replay twice and compare ──────────────────────────────
function verifyDeterminism() {
  const r1 = replay({ fromSnapshot: false });
  const r2 = replay({ fromSnapshot: false });

  const r1JSON = JSON.stringify(r1.cioIndex);
  const r2JSON = JSON.stringify(r2.cioIndex);

  const deterministic = r1JSON === r2JSON;

  registry.emit('DETERMINISM_CHECK', { deterministic, cioCount: Object.keys(r1.cioIndex).length });

  return { deterministic, r1CIOs: Object.keys(r1.cioIndex).length };
}

module.exports = { replay, verifyDeterminism, REPLAY_HANDLERS };
