<<<<<<< HEAD
// settings-resolver.js — pure resolution engine
//
// resolve(email) -> { tier, features, limits, ui, ... }
// Layered deep-merge:
//   1. defaults.global             (baseline for everyone)
//   2. defaults.tiers[user.tier]   (tier upgrade; missing keys inherit from global)
//   3. runtime.users[email].overrides  (per-user overrides; highest precedence)
//
// Objects are deep-merged (features, limits, ui).
// Primitives and arrays are replaced whole.
//
// This module is PURE — no I/O. Feed it defaults + runtime; it returns effective.

const fs   = require('fs');
const path = require('path');

const DEFAULTS_PATH = path.resolve(__dirname, '..', 'config', 'settings.default.json');

function loadDefaults(){
  const raw = fs.readFileSync(DEFAULTS_PATH, 'utf8');
  return JSON.parse(raw);
}

function isPlainObject(v){
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(base, over){
  if (!isPlainObject(base)) return isPlainObject(over) ? deepMerge({}, over) : over;
  if (!isPlainObject(over)) return structuredClone(base);
  const out = structuredClone(base);
  for (const k of Object.keys(over)){
    if (isPlainObject(over[k]) && isPlainObject(out[k])){
      out[k] = deepMerge(out[k], over[k]);
    } else {
      out[k] = structuredClone(over[k]);
    }
  }
  return out;
}

// Pure resolver — callers pass defaults + runtime + email.
function resolveWith(defaults, runtime, emailRaw){
  const email = String(emailRaw || '').toLowerCase().trim();
  const user  = (runtime.users && runtime.users[email]) || null;
  const tier  = (user && user.tier) || 'free';

  const tierConfig = (defaults.tiers && defaults.tiers[tier]) || {};
  const overrides  = (user && user.overrides) || {};

  // Step 1: global baseline
  let effective = deepMerge({}, defaults.global);
  // Step 2: tier upgrade (only features/limits/ui in tiers; description is metadata)
  if (tierConfig.features) effective.features = deepMerge(effective.features, tierConfig.features);
  if (tierConfig.limits)   effective.limits   = deepMerge(effective.limits,   tierConfig.limits);
  if (tierConfig.ui)       effective.ui       = deepMerge(effective.ui,       tierConfig.ui);
  // Step 3: user overrides
  effective = deepMerge(effective, overrides);

  // Invariants enforcement: negative limits only permitted for super_admin
  if (tier !== 'super_admin' && effective.limits){
    for (const k of Object.keys(effective.limits)){
      if (typeof effective.limits[k] === 'number' && effective.limits[k] < 0){
        effective.limits[k] = defaults.global.limits[k] ?? 0;
      }
    }
  }

  // Invariant: audit retention floor
  if (effective.limits && effective.limits.max_audit_entries_retained < 1000){
    effective.limits.max_audit_entries_retained = 1000;
  }

  return {
    email,
    tier,
    tier_description: tierConfig.description || null,
    capabilities: tier === 'super_admin' ? (tierConfig.capabilities || []) : [],
    effective,
    resolved_at: new Date().toISOString(),
    resolution_trace: {
      applied_global: true,
      applied_tier: !!tierConfig.features || !!tierConfig.limits || !!tierConfig.ui,
      applied_overrides: !!user && Object.keys(overrides).length > 0
    }
  };
}

// Convenience: resolve using the on-disk defaults + a provided runtime.
function resolve(runtime, email){
  return resolveWith(loadDefaults(), runtime || { users: {}, audit: [] }, email);
}

// Pure capability resolution — returns the effective capability set for an
// email against a given defaults+runtime pair. Union of:
//   1. defaults.tiers[user.tier].capabilities     (tier-declared)
//   2. runtime.users[email].overrides.capabilities (per-user grants)
// Authority is resolved fresh on every call — revocation is instant, no
// session refresh required.
function capabilitiesFor(defaults, runtime, emailRaw){
  const email = String(emailRaw || '').toLowerCase().trim();
  if (!email) return new Set();
  const user = (runtime.users && runtime.users[email]) || null;
  const tier = (user && user.tier) || 'free';
  const tierCaps = (defaults.tiers && defaults.tiers[tier] && defaults.tiers[tier].capabilities) || [];
  const overrideCaps = (user && user.overrides && user.overrides.capabilities) || [];
  return new Set([...tierCaps, ...overrideCaps]);
}

function canPerform(defaults, runtime, email, capability){
  if (!capability) return false;
  return capabilitiesFor(defaults, runtime, email).has(capability);
}

module.exports = {
  DEFAULTS_PATH,
  loadDefaults,
  deepMerge,
  resolveWith,
  resolve,
  capabilitiesFor,
  canPerform,
};
=======
// settings-resolver.js — pure resolution engine
//
// resolve(email) -> { tier, features, limits, ui, ... }
// Layered deep-merge:
//   1. defaults.global             (baseline for everyone)
//   2. defaults.tiers[user.tier]   (tier upgrade; missing keys inherit from global)
//   3. runtime.users[email].overrides  (per-user overrides; highest precedence)
//
// Objects are deep-merged (features, limits, ui).
// Primitives and arrays are replaced whole.
//
// This module is PURE — no I/O. Feed it defaults + runtime; it returns effective.

const fs   = require('fs');
const path = require('path');

const DEFAULTS_PATH = path.resolve(__dirname, '..', 'config', 'settings.default.json');

function loadDefaults(){
  const raw = fs.readFileSync(DEFAULTS_PATH, 'utf8');
  return JSON.parse(raw);
}

function isPlainObject(v){
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(base, over){
  if (!isPlainObject(base)) return isPlainObject(over) ? deepMerge({}, over) : over;
  if (!isPlainObject(over)) return structuredClone(base);
  const out = structuredClone(base);
  for (const k of Object.keys(over)){
    if (isPlainObject(over[k]) && isPlainObject(out[k])){
      out[k] = deepMerge(out[k], over[k]);
    } else {
      out[k] = structuredClone(over[k]);
    }
  }
  return out;
}

// Pure resolver — callers pass defaults + runtime + email.
function resolveWith(defaults, runtime, emailRaw){
  const email = String(emailRaw || '').toLowerCase().trim();
  const user  = (runtime.users && runtime.users[email]) || null;
  const tier  = (user && user.tier) || 'free';

  const tierConfig = (defaults.tiers && defaults.tiers[tier]) || {};
  const overrides  = (user && user.overrides) || {};

  // Step 1: global baseline
  let effective = deepMerge({}, defaults.global);
  // Step 2: tier upgrade (only features/limits/ui in tiers; description is metadata)
  if (tierConfig.features) effective.features = deepMerge(effective.features, tierConfig.features);
  if (tierConfig.limits)   effective.limits   = deepMerge(effective.limits,   tierConfig.limits);
  if (tierConfig.ui)       effective.ui       = deepMerge(effective.ui,       tierConfig.ui);
  // Step 3: user overrides
  effective = deepMerge(effective, overrides);

  // Invariants enforcement: negative limits only permitted for super_admin
  if (tier !== 'super_admin' && effective.limits){
    for (const k of Object.keys(effective.limits)){
      if (typeof effective.limits[k] === 'number' && effective.limits[k] < 0){
        effective.limits[k] = defaults.global.limits[k] ?? 0;
      }
    }
  }

  // Invariant: audit retention floor
  if (effective.limits && effective.limits.max_audit_entries_retained < 1000){
    effective.limits.max_audit_entries_retained = 1000;
  }

  return {
    email,
    tier,
    tier_description: tierConfig.description || null,
    capabilities: tier === 'super_admin' ? (tierConfig.capabilities || []) : [],
    effective,
    resolved_at: new Date().toISOString(),
    resolution_trace: {
      applied_global: true,
      applied_tier: !!tierConfig.features || !!tierConfig.limits || !!tierConfig.ui,
      applied_overrides: !!user && Object.keys(overrides).length > 0
    }
  };
}

// Convenience: resolve using the on-disk defaults + a provided runtime.
function resolve(runtime, email){
  return resolveWith(loadDefaults(), runtime || { users: {}, audit: [] }, email);
}

module.exports = {
  DEFAULTS_PATH,
  loadDefaults,
  deepMerge,
  resolveWith,
  resolve,
};
>>>>>>> a65a24150727639fde77daadeba4361af473827a
