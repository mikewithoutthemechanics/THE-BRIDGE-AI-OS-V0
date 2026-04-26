// =============================================================================
// BRIDGE AI OS — Canonical Parser  v2
//
// Fixes vs v1:
//   - Computes fileHash (SHA-256 of raw bytes) before parsing
//   - Passes fileHash to CIO constructor so drift.js can use it directly
//   - Emits fileHash in CIO_CREATED event (fixes drift detection bug)
//   - Dedup check: if a CIO with the same source + fileHash is already in
//     globalStore, returns that CIO instead of re-parsing unchanged content
// =============================================================================
'use strict';

const crypto     = require('crypto');
const { CIO, globalStore } = require('./cio');
const registry   = require('./registry');
const convention = require('./convention');

function fileContentHash(rawContent) {
  return crypto.createHash('sha256').update(rawContent, 'utf8').digest('hex');
}

// ── Normalize functions (unchanged) ──────────────────────────────────────────
function normalizeConfig(data, filePath) {
  const normalized = convention.normalize(data, 'config');
  return {
    version:    normalized.version   || '1.0.0',
    namespace:  normalized.namespace || convention.inferNamespace(filePath),
    priority:   typeof normalized.priority === 'number' ? normalized.priority : 50,
    payload:    normalized.payload   || {},
    validation: normalized.validation || { required: [], rules: [] },
    tags:       normalized.tags      || [],
    meta:       normalized.meta      || {},
  };
}

function normalizeVar(data, filePath) {
  const normalized = convention.normalize(data, 'var');
  const variables  = normalized.variables || {};
  const enriched   = {};
  for (const [k, v] of Object.entries(variables)) {
    if (typeof v !== 'object' || v === null) {
      enriched[k] = { type: 'string', default: String(v), required: false, description: '' };
    } else {
      enriched[k] = {
        type:        v.type        || 'string',
        default:     v.default     !== undefined ? v.default : null,
        required:    v.required    !== undefined ? Boolean(v.required) : false,
        description: v.description || '',
        validation:  v.validation  || null,
      };
    }
  }
  return {
    version:   normalized.version   || '1.0.0',
    namespace: normalized.namespace || convention.inferNamespace(filePath),
    variables: enriched,
    meta:      normalized.meta      || {},
  };
}

function normalizeSecret(data, filePath) {
  const normalized = convention.normalize(data, 'secret');
  const secrets    = normalized.secrets || {};
  const enriched   = {};
  for (const [k, v] of Object.entries(secrets)) {
    if (typeof v === 'string') {
      enriched[k] = { encrypted: null, plaintext: v, iv: null, tag: null, rotation_policy: '90d', source: 'plaintext' };
    } else {
      enriched[k] = {
        encrypted:       v.encrypted       || null,
        plaintext:       v.plaintext       || null,
        iv:              v.iv              || null,
        tag:             v.tag             || null,
        rotation_policy: v.rotation_policy || '90d',
        source:          v.source          || 'provided',
      };
    }
  }
  return {
    version:   normalized.version   || '1.0.0',
    namespace: normalized.namespace || convention.inferNamespace(filePath),
    secrets:   enriched,
    meta:      normalized.meta      || {},
  };
}

// ── Parse a single file record into a CIO ────────────────────────────────────
function parseFile(fileRecord) {
  const { path: filePath, type, rawContent } = fileRecord;

  // ── DEDUP: if exact file content is already in the store, return it ──────
  const fhash = fileRecord.fileHash || fileContentHash(rawContent);
  const existing = globalStore.getBySourceHash(filePath, fhash);
  if (existing) {
    // Content unchanged — return cached CIO, skip full parse
    registry.emit('PARSE_CACHE_HIT', { source: filePath, hash: existing.hash, namespace: existing.namespace });
    return { ok: true, cio: existing, cached: true };
  }

  let data;
  try {
    data = JSON.parse(rawContent);
  } catch (err) {
    registry.emit('PARSE_FAILED', { source: filePath, reason: `JSON parse error: ${err.message}` });
    return { ok: false, error: `JSON parse error: ${err.message}`, source: filePath };
  }

  let payload;
  switch (type) {
    case 'config': payload = normalizeConfig(data, filePath); break;
    case 'var':    payload = normalizeVar(data, filePath);    break;
    case 'secret': payload = normalizeSecret(data, filePath); break;
    default:
      return { ok: false, error: `Unknown type: ${type}`, source: filePath };
  }

  const cio = new CIO({
    type,
    namespace: payload.namespace,
    source:    filePath,
    fileHash:  fhash,           // ← stored on CIO for drift detection
    payload,
    reason:    'parsed',
  });

  registry.emit('CIO_CREATED', {
    hash:      cio.hash,
    id:        cio.id,
    namespace: cio.namespace,
    type,
    fileHash:  fhash,           // ← now emitted (fixes drift.js bug)
    source:    filePath,
  }, cio.hash);

  return { ok: true, cio, cached: false };
}

// ── Parse all discovered files ────────────────────────────────────────────────
function parseAll(discovered) {
  const results = { configs: [], vars: [], secrets: [], errors: [], cacheHits: 0 };

  for (const f of discovered.configs) {
    const r = parseFile(f);
    if (r.ok) { results.configs.push(r.cio); if (r.cached) results.cacheHits++; }
    else results.errors.push(r);
  }
  for (const f of discovered.vars) {
    const r = parseFile(f);
    if (r.ok) { results.vars.push(r.cio); if (r.cached) results.cacheHits++; }
    else results.errors.push(r);
  }
  for (const f of discovered.secrets) {
    const r = parseFile(f);
    if (r.ok) { results.secrets.push(r.cio); if (r.cached) results.cacheHits++; }
    else results.errors.push(r);
  }

  registry.emit('PARSE_COMPLETE', {
    configs:   results.configs.length,
    vars:      results.vars.length,
    secrets:   results.secrets.length,
    errors:    results.errors.length,
    cacheHits: results.cacheHits,
  });

  return results;
}

module.exports = { parseFile, parseAll, fileContentHash, normalizeConfig, normalizeVar, normalizeSecret };
