// workflow-engine.js — tier-scoped workflow registry + validator
//
// Discovers workflow JSON files under workflows/<tier>/*.json and exposes:
//   loadAll()                           -> [workflow]
//   listAvailable(resolved)             -> [workflow] the user can see (tier + capability gates)
//   canExecute(resolved, workflowId)    -> { ok, reason?, workflow? }
//   plan(resolved, workflowId, params)  -> { ok, workflow_id, tier_required, steps, params, errors? }
//
// The engine is intentionally read-only today: it lists, validates, and renders
// an execution PLAN. Actually firing the http_post / http_get steps is left to
// the caller (dashboard or CLI) so the blast radius of a resolver bug is small.

const fs   = require('fs');
const path = require('path');

const WORKFLOWS_DIR = path.resolve(__dirname, '..', 'workflows');

// Tier ordering for threshold checks. A tier satisfies a requirement iff its
// index >= the required tier's index.
const TIER_ORDER = ['free', 'pro', 'enterprise', 'super_admin'];

function tierRank(tier){
  const i = TIER_ORDER.indexOf(tier);
  return i < 0 ? -1 : i;
}

function tierSatisfies(userTier, requiredTier){
  const u = tierRank(userTier);
  const r = tierRank(requiredTier || 'free');
  return u >= 0 && r >= 0 && u >= r;
}

// Walk workflows/<tier>/*.json once per call — small enough to not cache,
// and picking up new files without a restart is useful for operators.
function loadAll(){
  const out = [];
  if (!fs.existsSync(WORKFLOWS_DIR)) return out;
  for (const tier of fs.readdirSync(WORKFLOWS_DIR)){
    const tierDir = path.join(WORKFLOWS_DIR, tier);
    let stat;
    try { stat = fs.statSync(tierDir); } catch { continue; }
    if (!stat.isDirectory()) continue;
    for (const f of fs.readdirSync(tierDir)){
      if (!f.endsWith('.json')) continue;
      const abs = path.join(tierDir, f);
      try {
        const wf = JSON.parse(fs.readFileSync(abs, 'utf8'));
        wf._source = path.relative(WORKFLOWS_DIR, abs).replace(/\\/g, '/');
        wf._dir_tier = tier;
        out.push(wf);
      } catch(e){
        // Surface malformed workflow files — don't swallow.
        out.push({ id: `__invalid__${f}`, _source: abs, error: e.message });
      }
    }
  }
  return out;
}

function listAvailable(resolved){
  if (!resolved) return [];
  const caps = resolved.capabilities || [];
  return loadAll().filter(w => {
    if (w.error) return false;
    if (!tierSatisfies(resolved.tier, w.required_tier)) return false;
    if (w.required_capability && !caps.includes(w.required_capability)) return false;
    return true;
  });
}

function canExecute(resolved, workflowId){
  const w = loadAll().find(x => x.id === workflowId);
  if (!w) return { ok: false, reason: 'unknown_workflow' };
  if (w.error) return { ok: false, reason: 'workflow_malformed', detail: w.error, source: w._source };
  if (!tierSatisfies(resolved.tier, w.required_tier)){
    return { ok: false, reason: 'insufficient_tier', required: w.required_tier, have: resolved.tier };
  }
  if (w.required_capability && !(resolved.capabilities || []).includes(w.required_capability)){
    return { ok: false, reason: 'missing_capability', required: w.required_capability };
  }
  return { ok: true, workflow: w };
}

// Validate params against the workflow's param spec. Returns { ok, errors, coerced }.
function validateParams(workflow, rawParams){
  const errors = [];
  const coerced = {};
  const specs = workflow.params || [];
  rawParams = rawParams || {};
  for (const spec of specs){
    let v = rawParams[spec.name];
    if (v === undefined || v === '' || v === null){
      if (spec.default !== undefined){ v = spec.default; }
      else if (spec.required){ errors.push({ param: spec.name, reason: 'required' }); continue; }
      else { continue; }
    }
    // Type coercion
    if (spec.type === 'integer'){
      const n = parseInt(v, 10);
      if (!Number.isFinite(n)){ errors.push({ param: spec.name, reason: 'not_integer', got: v }); continue; }
      if (spec.min !== undefined && n < spec.min){ errors.push({ param: spec.name, reason: 'below_min', min: spec.min, got: n }); continue; }
      if (spec.max !== undefined && n > spec.max){ errors.push({ param: spec.name, reason: 'above_max', max: spec.max, got: n }); continue; }
      v = n;
    } else if (spec.type === 'number'){
      const n = Number(v);
      if (!Number.isFinite(n)){ errors.push({ param: spec.name, reason: 'not_number', got: v }); continue; }
      if (spec.min !== undefined && n < spec.min){ errors.push({ param: spec.name, reason: 'below_min', min: spec.min, got: n }); continue; }
      v = n;
    } else if (spec.type === 'email'){
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v))){ errors.push({ param: spec.name, reason: 'invalid_email', got: v }); continue; }
      v = String(v).toLowerCase().trim();
    } else {
      v = String(v);
      if (spec.pattern && !(new RegExp(spec.pattern).test(v))){ errors.push({ param: spec.name, reason: 'pattern_mismatch', pattern: spec.pattern, got: v }); continue; }
      if (spec.min_length && v.length < spec.min_length){ errors.push({ param: spec.name, reason: 'too_short', min_length: spec.min_length, got_length: v.length }); continue; }
      if (spec.values && !spec.values.includes(v)){ errors.push({ param: spec.name, reason: 'not_in_values', allowed: spec.values, got: v }); continue; }
    }
    coerced[spec.name] = v;
  }
  return { ok: errors.length === 0, errors, coerced };
}

// Recursively substitute {param} tokens inside strings. Used for step bodies.
function interp(v, params){
  if (v == null) return v;
  if (typeof v === 'string'){
    return v.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (m, k) => (k in params ? String(params[k]) : m));
  }
  if (Array.isArray(v)) return v.map(x => interp(x, params));
  if (typeof v === 'object'){
    const out = {};
    for (const k of Object.keys(v)) out[k] = interp(v[k], params);
    return out;
  }
  return v;
}

function plan(resolved, workflowId, rawParams){
  const gate = canExecute(resolved, workflowId);
  if (!gate.ok) return { ok: false, ...gate };
  const w = gate.workflow;
  const { ok, errors, coerced } = validateParams(w, rawParams);
  if (!ok) return { ok: false, reason: 'invalid_params', errors };
  const steps = (w.steps || []).map(s => interp(s, coerced));
  return {
    ok: true,
    workflow_id: w.id,
    name: w.name,
    description: w.description,
    category: w.category,
    tier_required: w.required_tier,
    capability_required: w.required_capability || null,
    confirmation_required: !!w.confirmation_required,
    danger: w.danger || null,
    estimated_duration_s: w.estimated_duration_s || null,
    audit: !!w.audit,
    audit_action: w.audit_action || null,
    params: coerced,
    steps,
    planned_at: new Date().toISOString()
  };
}

module.exports = {
  WORKFLOWS_DIR,
  TIER_ORDER,
  tierSatisfies,
  loadAll,
  listAvailable,
  canExecute,
  validateParams,
  plan,
};
