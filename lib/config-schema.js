// config-schema.js — authoritative allowlist derived from settings.default.json
//
// Purpose: every AI-proposed or admin-proposed config MUST be validatable
// against a fixed schema. We do not let callers invent keys. We do not let
// the AI return `auth_token: "..."` or anything not in the defaults.
//
// Allowed top-level buckets (HARD RULE from the final design spec):
//   features.*   — boolean flags
//   limits.*     — numeric quotas (integer; -1 == unlimited; super_admin only)
//   ui.*         — string colors / theme
//   workflow.*   — workflow-level toggles (reserved; empty for now)
//
// Everything else — secrets, tokens, credentials, api_base, endpoints —
// is REJECTED. Those live in .env.* files managed by ops, not here.

const path = require('path');
const fs   = require('fs');

const DEFAULTS_PATH = path.resolve(__dirname, '..', 'config', 'settings.default.json');

// Load once; schema is immutable at boot.
let _schema = null;

function loadSchema(){
  if (_schema) return _schema;
  const raw = JSON.parse(fs.readFileSync(DEFAULTS_PATH, 'utf8'));
  const featureKeys = Object.keys(raw.global.features || {});
  const limitKeys   = Object.keys(raw.global.limits   || {});
  const uiKeys      = Object.keys(raw.global.ui       || {});

  _schema = {
    buckets: ['features', 'limits', 'ui', 'workflow'],
    features: {
      keys: featureKeys,
      type: 'boolean',
    },
    limits: {
      keys: limitKeys,
      type: 'integer',
      // -1 sentinel means "unlimited" and is ONLY valid for super_admin commits.
      unlimited_sentinel: -1,
    },
    ui: {
      keys: uiKeys,
      type: 'hex_color',
    },
    workflow: {
      // Reserved. No keys are currently part of the schema; the advisor
      // cannot propose workflow mutations until the registry is wired in.
      keys: [],
      type: 'string',
    },
    // Keys that are NEVER allowed in a proposal, even if they happen to
    // live in settings.default.json (e.g. api_base). Secrets live in .env.*
    forbidden_top_level: [
      'api_base',
      'settings_endpoint',
      'theme',
      'default_user_id',
      'notifications_enabled',
      'live_refresh_ms',
      'version',
      'schema_description',
      'capabilities',
      'description',
    ],
  };
  return _schema;
}

// Given a candidate proposal shaped { features: {...}, limits: {...}, ui: {...} },
// return { ok, errors } where errors is [{ path, reason, got? }].
function validate(proposal, { tier } = {}){
  const schema = loadSchema();
  const errors = [];
  if (proposal == null || typeof proposal !== 'object' || Array.isArray(proposal)){
    return { ok: false, errors: [{ path: '$', reason: 'proposal_must_be_object' }] };
  }

  for (const top of Object.keys(proposal)){
    if (schema.forbidden_top_level.includes(top)){
      errors.push({ path: top, reason: 'forbidden_top_level_key' });
      continue;
    }
    if (!schema.buckets.includes(top)){
      errors.push({ path: top, reason: 'unknown_bucket', allowed: schema.buckets });
      continue;
    }
    const bucket = proposal[top];
    if (bucket == null || typeof bucket !== 'object' || Array.isArray(bucket)){
      errors.push({ path: top, reason: 'bucket_must_be_object' });
      continue;
    }
    const spec = schema[top];
    for (const k of Object.keys(bucket)){
      if (!spec.keys.includes(k)){
        errors.push({ path: `${top}.${k}`, reason: 'unknown_key', allowed: spec.keys });
        continue;
      }
      const v = bucket[k];
      if (spec.type === 'boolean' && typeof v !== 'boolean'){
        errors.push({ path: `${top}.${k}`, reason: 'not_boolean', got: typeof v });
      } else if (spec.type === 'integer'){
        if (!Number.isInteger(v)){
          errors.push({ path: `${top}.${k}`, reason: 'not_integer', got: v });
        } else if (v < 0 && v !== spec.unlimited_sentinel){
          errors.push({ path: `${top}.${k}`, reason: 'negative_not_allowed', got: v });
        } else if (v === spec.unlimited_sentinel && tier !== 'super_admin'){
          errors.push({ path: `${top}.${k}`, reason: 'unlimited_requires_super_admin', got: v, tier });
        }
      } else if (spec.type === 'hex_color'){
        if (typeof v !== 'string' || !/^#[0-9a-fA-F]{3,8}$/.test(v)){
          errors.push({ path: `${top}.${k}`, reason: 'not_hex_color', got: v });
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

// Flat list of every legal dotted key (for diff annotation + UI hints).
function allKeys(){
  const s = loadSchema();
  const out = [];
  for (const bucket of s.buckets){
    for (const k of s[bucket].keys) out.push(`${bucket}.${k}`);
  }
  return out;
}

module.exports = { loadSchema, validate, allKeys, DEFAULTS_PATH };
