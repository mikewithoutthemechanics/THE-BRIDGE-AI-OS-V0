// =============================================================================
// BRIDGE AI OS — Lineage Tracker
//
// Tracks the full evolution history of every CIO.
// A "lineage chain" is the sequence of CIO versions from original to current.
// Used for:
//   - Auditing: what changed, when, and why
//   - Rollback to any prior version of a specific CIO
//   - Detecting unexpected mutations
// =============================================================================
'use strict';

const registry = require('./registry');
const { globalStore } = require('./cio');

// ── Build full lineage chain for a CIO (by id) ────────────────────────────────
function getChain(cioId) {
  const allVersions = globalStore.all().filter(c => c.id === cioId);
  if (allVersions.length === 0) return [];

  // Sort by version ascending
  return allVersions.sort((a, b) => a.version - b.version).map(cio => ({
    version:   cio.version,
    hash:      cio.hash,
    lineage:   cio.lineage,
    reason:    cio.reason,
    status:    cio.status,
    createdAt: cio.createdAt,
  }));
}

// ── Get lineage from registry events (works even after in-memory state cleared)
function getChainFromEvents(cioId) {
  const events = registry.getEvents({ type: 'CIO_CREATED' })
    .filter(e => e.data.id === cioId);

  return events.map(e => ({
    hash:      e.cioHash,
    id:        e.data.id,
    namespace: e.data.namespace,
    type:      e.data.type,
    createdAt: e.ts,
    sessionId: e.sessionId,
  }));
}

// ── Compute diff between two CIO versions ────────────────────────────────────
function diff(cioA, cioB) {
  const changes = [];

  if (cioA.hash === cioB.hash) return { identical: true, changes: [] };

  const payloadA = cioA.payload || {};
  const payloadB = cioB.payload || {};

  // Compare top-level payload fields
  const allKeys = new Set([...Object.keys(payloadA), ...Object.keys(payloadB)]);
  for (const k of allKeys) {
    const vA = JSON.stringify(payloadA[k]);
    const vB = JSON.stringify(payloadB[k]);
    if (vA !== vB) {
      changes.push({
        field: k,
        from:  payloadA[k],
        to:    payloadB[k],
        op:    payloadA[k] === undefined ? 'added' : payloadB[k] === undefined ? 'removed' : 'changed',
      });
    }
  }

  return {
    identical:  false,
    fromHash:   cioA.hash,
    toHash:     cioB.hash,
    fromVersion: cioA.version,
    toVersion:   cioB.version,
    reason:     cioB.reason,
    changes,
  };
}

// ── Record a mutation in the lineage ─────────────────────────────────────────
function recordMutation(fromCIO, toCIO, reason) {
  registry.emit('CIO_MUTATED', {
    id:          toCIO.id,
    namespace:   toCIO.namespace,
    fromHash:    fromCIO.hash,
    toHash:      toCIO.hash,
    fromVersion: fromCIO.version,
    toVersion:   toCIO.version,
    reason,
  }, toCIO.hash);
}

// ── Full lineage report for all CIOs ─────────────────────────────────────────
function reportAll() {
  const allIds = new Set(globalStore.all().map(c => c.id));
  return [...allIds].map(id => ({
    id,
    chain: getChain(id),
  }));
}

module.exports = { getChain, getChainFromEvents, diff, recordMutation, reportAll };
