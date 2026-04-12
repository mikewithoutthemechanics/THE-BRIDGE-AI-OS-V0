// =============================================================================
// BRIDGE AI OS — Universal Convention Resolver
//
// Detects deviations from canonical naming/schema and normalises them.
// System accepts imperfect input but always produces perfect output.
//
// Conventions enforced:
//   - namespace: lowercase, dot-separated (bridge.domain.context)
//   - version:   semver string (major.minor.patch)
//   - keys:      snake_case
// =============================================================================
'use strict';

const path = require('path');

// ── Namespace normalisation ───────────────────────────────────────────────────
function normalizeNamespace(ns) {
  if (!ns || typeof ns !== 'string') return null;
  return ns
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, '.')   // replace illegal chars with dots
    .replace(/\.{2,}/g, '.')        // collapse double dots
    .replace(/^\.+|\.+$/g, '');     // strip leading/trailing dots
}

function inferNamespace(filePath) {
  const base = path.basename(filePath, path.extname(filePath));
  return 'bridge.' + normalizeNamespace(base);
}

// ── Version normalisation ─────────────────────────────────────────────────────
function normalizeVersion(v) {
  if (!v) return '1.0.0';
  if (typeof v === 'number') return `${v}.0.0`;
  const match = String(v).match(/(\d+)\.?(\d*)\.?(\d*)/);
  if (!match) return '1.0.0';
  return `${match[1] || 1}.${match[2] || 0}.${match[3] || 0}`;
}

// ── Key normalisation (camelCase/PascalCase → snake_case) ────────────────────
function toSnakeCase(key) {
  return key
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function normalizeKeys(obj) {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return obj;
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    const normalized = toSnakeCase(k);
    result[normalized] = typeof v === 'object' && v !== null ? normalizeKeys(v) : v;
  }
  return result;
}

// ── Field aliasing — accept common alternate names ────────────────────────────
const FIELD_ALIASES = {
  config: {
    'data':    'payload',
    'config':  'payload',
    'values':  'payload',
    'env':     'payload',
    'ns':      'namespace',
    'ver':     'version',
    'prio':    'priority',
    'weight':  'priority',
  },
  var: {
    'vars':   'variables',
    'env':    'variables',
    'values': 'variables',
    'ns':     'namespace',
    'ver':    'version',
  },
  secret: {
    'keys':   'secrets',
    'creds':  'secrets',
    'ns':     'namespace',
    'ver':    'version',
  },
};

function resolveAliases(data, type) {
  const aliases = FIELD_ALIASES[type] || {};
  const result = { ...data };
  for (const [alias, canonical] of Object.entries(aliases)) {
    if (result[alias] !== undefined && result[canonical] === undefined) {
      result[canonical] = result[alias];
      delete result[alias];
    }
  }
  return result;
}

// ── Full normalisation pipeline ───────────────────────────────────────────────
function normalize(data, type) {
  if (typeof data !== 'object' || data === null) return {};

  let out = resolveAliases(data, type);

  // Normalize top-level version and namespace
  if (out.version)   out.version   = normalizeVersion(out.version);
  if (out.namespace) out.namespace = normalizeNamespace(out.namespace);

  // Normalize payload keys (config values)
  if (out.payload && typeof out.payload === 'object') out.payload = normalizeKeys(out.payload);

  // Variable NAMES are environment variable identifiers (NODE_ENV, JWT_SECRET, etc.)
  // — do NOT normalize them. Only normalize the metadata fields WITHIN each variable object.
  if (out.variables && typeof out.variables === 'object') {
    const normalized = {};
    for (const [k, v] of Object.entries(out.variables)) {
      // Preserve original key (e.g. NODE_ENV stays NODE_ENV)
      normalized[k] = typeof v === 'object' && v !== null ? normalizeKeys(v) : v;
    }
    out.variables = normalized;
  }
  // secrets keys intentionally NOT snake_cased — they are env var names like JWT_SECRET

  return out;
}

// ── Deviation report ──────────────────────────────────────────────────────────
function detectDeviations(original, normalized) {
  const deviations = [];

  if (original.namespace !== normalized.namespace) {
    deviations.push({ field: 'namespace', from: original.namespace, to: normalized.namespace });
  }
  if (original.version !== normalized.version) {
    deviations.push({ field: 'version', from: original.version, to: normalized.version });
  }

  return deviations;
}

module.exports = { normalize, normalizeNamespace, inferNamespace, normalizeVersion, toSnakeCase, normalizeKeys, detectDeviations };
