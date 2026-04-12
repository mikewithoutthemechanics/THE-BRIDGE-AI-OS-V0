// =============================================================================
// BRIDGE AI OS — Canonical Identity Object (CIO) Engine
//
// Every config/var/secret that enters the system is wrapped in a CIO.
// CIOs are immutable: to change one, you call .evolve() which returns a NEW
// CIO with lineage back-pointer. The old CIO is never mutated.
//
// Identity = { id (UUID), hash (SHA-256 of content), lineage, version, timestamps }
// =============================================================================
'use strict';

const crypto = require('crypto');

// ── Internal helpers ──────────────────────────────────────────────────────────
function sha256(obj) {
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

function contentHash(type, namespace, payload) {
  return sha256({ type, namespace, payload });
}

// ── CIO class — immutable value object ───────────────────────────────────────
class CIO {
  constructor({ type, namespace, source, payload, parentHash, reason, existingId }) {
    this.id         = existingId || crypto.randomUUID();
    this.type       = type;        // 'config' | 'var' | 'secret'
    this.namespace  = namespace;
    this.source     = source;      // original file path
    this.payload    = Object.freeze(typeof payload === 'object' ? { ...payload } : payload);
    this.hash       = contentHash(type, namespace, this.payload);
    this.version    = 1;
    this.lineage    = parentHash ? [parentHash] : [];
    this.reason     = reason || 'initial-load';
    this.createdAt  = Date.now();
    this.activeSince = null;
    this.score      = 0;
    this.status     = 'pending'; // pending | valid | invalid | active | quarantined | superseded
    Object.freeze(this);
  }

  // Returns a NEW CIO that descends from this one
  evolve(changes, reason) {
    const mergedPayload = typeof this.payload === 'object'
      ? { ...this.payload, ...changes }
      : changes;

    const next = new CIO({
      type:       this.type,
      namespace:  this.namespace,
      source:     this.source,
      payload:    mergedPayload,
      parentHash: this.hash,
      reason,
      existingId: this.id,  // same logical identity, new hash
    });

    // Version incremented by rebuilding — version is derivative of lineage length
    const versioned = Object.create(CIO.prototype);
    Object.assign(versioned, next, {
      version: this.version + 1,
      lineage: [...this.lineage, this.hash],
    });
    Object.freeze(versioned);
    return versioned;
  }

  // Immutable status transition
  withStatus(status, extra = {}) {
    const updated = Object.create(CIO.prototype);
    Object.assign(updated, this, { status, ...extra });
    Object.freeze(updated);
    return updated;
  }

  // Serialise to plain object (for registry, snapshots)
  toJSON() {
    return {
      id:         this.id,
      type:       this.type,
      namespace:  this.namespace,
      source:     this.source,
      hash:       this.hash,
      version:    this.version,
      lineage:    this.lineage,
      reason:     this.reason,
      status:     this.status,
      score:      this.score,
      createdAt:  this.createdAt,
      activeSince: this.activeSince,
      // payload excluded by default — use withPayload() for full export
    };
  }

  toFullJSON() {
    return { ...this.toJSON(), payload: this.payload };
  }
}

// ── CIO Store — in-memory registry keyed by hash ─────────────────────────────
class CIOStore {
  constructor() {
    this._byHash      = new Map(); // hash → CIO
    this._byId        = new Map(); // id → latest CIO for that logical identity
    this._byNamespace = new Map(); // namespace → [CIO, ...]
  }

  add(cio) {
    this._byHash.set(cio.hash, cio);
    this._byId.set(cio.id, cio);

    if (!this._byNamespace.has(cio.namespace)) this._byNamespace.set(cio.namespace, []);
    const ns = this._byNamespace.get(cio.namespace);
    const idx = ns.findIndex(c => c.id === cio.id);
    if (idx >= 0) ns[idx] = cio; else ns.push(cio);
  }

  getByHash(hash)      { return this._byHash.get(hash)      || null; }
  getById(id)          { return this._byId.get(id)          || null; }
  getByNamespace(ns)   { return this._byNamespace.get(ns)   || []; }
  all()                { return [...this._byHash.values()]; }

  allActive() {
    return this.all().filter(c => c.status === 'active');
  }
}

const globalStore = new CIOStore();

module.exports = { CIO, CIOStore, globalStore, sha256, contentHash };
