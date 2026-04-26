// =============================================================================
// BRIDGE AI OS — Canonical Identity Object (CIO) Engine  v2
//
// Every config/var/secret that enters the system is wrapped in a CIO.
// CIOs are immutable: to change one, call .evolve() → returns NEW CIO.
//
// Fixes vs v1:
//   - fileHash (SHA-256 of raw file bytes) stored as property, not part of contentHash
//   - lineage array is Object.freeze'd (was mutable in v1)
//   - CIOStore.prune() removes superseded/invalid CIOs beyond retention threshold
//   - CIOStore.getBySourceHash() enables O(1) dedup in parser
// =============================================================================
'use strict';

const crypto = require('crypto');

function sha256(obj) {
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

function contentHash(type, namespace, payload) {
  return sha256({ type, namespace, payload });
}

// ── CIO class — fully immutable ───────────────────────────────────────────────
class CIO {
  constructor({ type, namespace, source, payload, parentHash, reason, existingId, fileHash }) {
    this.id          = existingId || crypto.randomUUID();
    this.type        = type;
    this.namespace   = namespace;
    this.source      = source;
    this.fileHash    = fileHash || null;  // SHA-256 of raw file bytes — for dedup/drift
    this.payload     = Object.freeze(typeof payload === 'object' && payload !== null ? { ...payload } : payload);
    this.hash        = contentHash(type, namespace, this.payload);
    this.version     = 1;
    this.lineage     = Object.freeze(parentHash ? [parentHash] : []);
    this.reason      = reason || 'initial-load';
    this.createdAt   = Date.now();
    this.activeSince = null;
    this.score       = 0;
    this.status      = 'pending';
    Object.freeze(this);
  }

  // Returns a NEW CIO descending from this one — immutable evolution
  evolve(changes, reason) {
    const mergedPayload = typeof this.payload === 'object' && this.payload !== null
      ? { ...this.payload, ...changes }
      : changes;

    const newLineage = Object.freeze([...this.lineage, this.hash]);

    // Build properties explicitly — no Object.create hack
    const evolved = new CIO({
      type:       this.type,
      namespace:  this.namespace,
      source:     this.source,
      fileHash:   this.fileHash,
      payload:    mergedPayload,
      parentHash: this.hash,
      reason,
      existingId: this.id,
    });

    // Patch version + correct lineage (constructor sets version=1 and lineage=[parentHash])
    // We need version=this.version+1 and lineage=newLineage
    const patched = Object.create(CIO.prototype);
    const props = {};
    for (const k of Object.getOwnPropertyNames(evolved)) {
      props[k] = { value: evolved[k], writable: false, enumerable: true, configurable: false };
    }
    props.version  = { value: this.version + 1,  writable: false, enumerable: true, configurable: false };
    props.lineage  = { value: newLineage,          writable: false, enumerable: true, configurable: false };
    Object.defineProperties(patched, props);
    Object.freeze(patched);
    return patched;
  }

  // Immutable status transition — returns new CIO with updated status
  withStatus(status, extra = {}) {
    const patched = Object.create(CIO.prototype);
    const props = {};
    for (const k of Object.getOwnPropertyNames(this)) {
      props[k] = { value: this[k], writable: false, enumerable: true, configurable: false };
    }
    props.status = { value: status, writable: false, enumerable: true, configurable: false };
    for (const [k, v] of Object.entries(extra)) {
      props[k] = { value: v, writable: false, enumerable: true, configurable: false };
    }
    Object.defineProperties(patched, props);
    Object.freeze(patched);
    return patched;
  }

  toJSON() {
    return {
      id:          this.id,
      type:        this.type,
      namespace:   this.namespace,
      source:      this.source,
      fileHash:    this.fileHash,
      hash:        this.hash,
      version:     this.version,
      lineage:     [...this.lineage],
      reason:      this.reason,
      status:      this.status,
      score:       this.score,
      createdAt:   this.createdAt,
      activeSince: this.activeSince,
    };
  }

  toFullJSON() {
    return { ...this.toJSON(), payload: this.payload };
  }
}

// ── CIO Store ─────────────────────────────────────────────────────────────────
class CIOStore {
  constructor() {
    this._byHash       = new Map(); // contentHash → latest CIO with that hash
    this._byId         = new Map(); // logical id → latest CIO (most recent version)
    this._byNamespace  = new Map(); // namespace → [CIOs]
    this._bySourceHash = new Map(); // "source|fileHash" → CIO (dedup index)
  }

  add(cio) {
    this._byHash.set(cio.hash, cio);
    this._byId.set(cio.id, cio);

    // Source-hash index for O(1) dedup lookups
    if (cio.source && cio.fileHash) {
      this._bySourceHash.set(`${cio.source}|${cio.fileHash}`, cio);
    }

    if (!this._byNamespace.has(cio.namespace)) this._byNamespace.set(cio.namespace, []);
    const ns = this._byNamespace.get(cio.namespace);
    const idx = ns.findIndex(c => c.id === cio.id);
    if (idx >= 0) ns[idx] = cio; else ns.push(cio);
  }

  getByHash(hash)              { return this._byHash.get(hash)          || null; }
  getById(id)                  { return this._byId.get(id)              || null; }
  getByNamespace(ns)           { return this._byNamespace.get(ns)       || []; }
  getBySourceHash(src, fhash)  { return this._bySourceHash.get(`${src}|${fhash}`) || null; }
  all()                        { return [...this._byHash.values()]; }
  allActive()                  { return this.all().filter(c => c.status === 'active'); }

  // Remove superseded/invalid CIOs from older versions to prevent memory growth.
  // Keeps the `keep` most-recent versions of each logical id; removes the rest.
  prune(keep = 3) {
    let removed = 0;
    for (const [id, latest] of this._byId) {
      const allVersions = this.all()
        .filter(c => c.id === id)
        .sort((a, b) => b.version - a.version);

      const toRemove = allVersions.slice(keep).filter(c => c.status !== 'active');
      for (const old of toRemove) {
        this._byHash.delete(old.hash);
        if (old.source && old.fileHash) this._bySourceHash.delete(`${old.source}|${old.fileHash}`);
        const ns = this._byNamespace.get(old.namespace);
        if (ns) {
          const i = ns.findIndex(c => c.hash === old.hash);
          if (i >= 0) ns.splice(i, 1);
        }
        removed++;
      }
    }
    return removed;
  }

  stats() {
    return {
      total:       this._byHash.size,
      byStatus:    this.all().reduce((acc, c) => { acc[c.status] = (acc[c.status]||0)+1; return acc; }, {}),
      namespaces:  this._byNamespace.size,
    };
  }
}

const globalStore = new CIOStore();

module.exports = { CIO, CIOStore, globalStore, sha256, contentHash };
