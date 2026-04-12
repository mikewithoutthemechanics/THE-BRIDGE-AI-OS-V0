// =============================================================================
// BRIDGE AI OS — Canonical Parser
//
// Transforms raw file records into Canonical Identity Objects (CIOs).
// Enforces the bridge schema structure for each extension type.
// Normalises deviations without rejecting valid-but-imperfect input.
// =============================================================================
'use strict';

const { CIO } = require('./cio');
const registry = require('./registry');
const convention = require('./convention');

// ── Required top-level fields per type ───────────────────────────────────────
const REQUIRED_FIELDS = {
  config: ['version', 'namespace', 'payload'],
  var:    ['version', 'namespace', 'variables'],
  secret: ['version', 'namespace', 'secrets'],
};

// ── Parse raw JSON content ────────────────────────────────────────────────────
function parseJSON(rawContent, filePath) {
  try {
    return { ok: true, data: JSON.parse(rawContent) };
  } catch (err) {
    return { ok: false, error: `JSON parse error: ${err.message}`, filePath };
  }
}

// ── Normalize a .bridgecfg file ───────────────────────────────────────────────
function normalizeConfig(data, filePath) {
  const normalized = convention.normalize(data, 'config');
  return {
    version:   normalized.version   || '1.0.0',
    namespace: normalized.namespace || convention.inferNamespace(filePath),
    priority:  typeof normalized.priority === 'number' ? normalized.priority : 50,
    payload:   normalized.payload   || {},
    validation: normalized.validation || { required: [], rules: [] },
    tags:      normalized.tags      || [],
    meta:      normalized.meta      || {},
  };
}

// ── Normalize a .bridgevar file ───────────────────────────────────────────────
function normalizeVar(data, filePath) {
  const normalized = convention.normalize(data, 'var');
  const variables  = normalized.variables || {};

  // Coerce flat key:value pairs into full variable objects
  const enriched = {};
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

// ── Normalize a .bridgesec file ───────────────────────────────────────────────
function normalizeSecret(data, filePath) {
  const normalized = convention.normalize(data, 'secret');
  const secrets = normalized.secrets || {};

  const enriched = {};
  for (const [k, v] of Object.entries(secrets)) {
    if (typeof v === 'string') {
      // Plain text secret — mark as unencrypted (secrets manager will encrypt)
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

  const parsed = parseJSON(rawContent, filePath);
  if (!parsed.ok) {
    registry.emit('PARSE_FAILED', { source: filePath, reason: parsed.error });
    return { ok: false, error: parsed.error, source: filePath };
  }

  let payload;
  switch (type) {
    case 'config': payload = normalizeConfig(parsed.data, filePath); break;
    case 'var':    payload = normalizeVar(parsed.data, filePath);    break;
    case 'secret': payload = normalizeSecret(parsed.data, filePath); break;
    default:
      return { ok: false, error: `Unknown type: ${type}`, source: filePath };
  }

  const cio = new CIO({
    type,
    namespace: payload.namespace,
    source:    filePath,
    payload,
    reason:    'initial-parse',
  });

  registry.emit('CIO_CREATED', { hash: cio.hash, id: cio.id, namespace: cio.namespace, type }, cio.hash);

  return { ok: true, cio };
}

// ── Parse all discovered files ────────────────────────────────────────────────
function parseAll(discovered) {
  const results = { configs: [], vars: [], secrets: [], errors: [] };

  for (const f of discovered.configs) {
    const r = parseFile(f);
    if (r.ok) results.configs.push(r.cio); else results.errors.push(r);
  }
  for (const f of discovered.vars) {
    const r = parseFile(f);
    if (r.ok) results.vars.push(r.cio); else results.errors.push(r);
  }
  for (const f of discovered.secrets) {
    const r = parseFile(f);
    if (r.ok) results.secrets.push(r.cio); else results.errors.push(r);
  }

  registry.emit('PARSE_COMPLETE', {
    configs: results.configs.length,
    vars:    results.vars.length,
    secrets: results.secrets.length,
    errors:  results.errors.length,
  });

  return results;
}

module.exports = { parseFile, parseAll, normalizeConfig, normalizeVar, normalizeSecret };
