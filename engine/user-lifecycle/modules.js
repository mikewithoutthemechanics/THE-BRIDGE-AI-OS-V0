// =============================================================================
// BRIDGE AI OS — ULOE Module Activation Engine
//
// Controls which platform modules a user can access.
// Entitlement is determined by plan + manual grants + trial activations.
// The canAccess() check is hot-path: no DB call, resolved from local cache.
// =============================================================================
'use strict';

const { supabase }                     = require('../../lib/supabase');
const history                          = require('./history');
const { ok, fail, EVENTS, MODULES, planHasModule, getPlanModules, uuid } = require('./schemas');

const OP = {
  ACTIVATE:   'module.activate',
  DEACTIVATE: 'module.deactivate',
  TRIAL:      'module.trial',
  GET:        'module.get',
};

// ── Activate module ───────────────────────────────────────────────────────────
async function activate(userId, moduleId, {
  source        = 'plan',
  trial         = false,
  trialDays     = 14,
  correlationId = null,
} = {}) {
  if (!MODULES[moduleId]) return fail(OP.ACTIVATE, userId, `Unknown module: ${moduleId}`);

  const now      = new Date();
  const trialEnd = trial ? new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000).toISOString() : null;

  const record = {
    user_id:          userId,
    module_id:        moduleId,
    status:           trial ? 'trial' : 'active',
    activation_source: source,
    trial_ends_at:    trialEnd,
    activated_at:     now.toISOString(),
    deactivated_at:   null,
    updated_at:       now.toISOString(),
  };

  const { error } = await supabase
    .from('user_modules')
    .upsert({ ...record, id: uuid(), created_at: now.toISOString() }, { onConflict: 'user_id,module_id' });

  if (error) return fail(OP.ACTIVATE, userId, error.message);

  const action = trial ? EVENTS.MODULE.TRIAL_STARTED : EVENTS.MODULE.ACTIVATED;
  const eventLogged = await history.append({
    userId,
    category:      'module',
    action,
    details:       { module_id: moduleId, source, trial, trial_ends_at: trialEnd },
    correlationId,
  });

  return ok(OP.ACTIVATE, userId, {
    affected_files: ['modules.json'],
    state_changes:  { 'modules.json': { [moduleId]: { status: record.status } } },
    event_logged:   eventLogged,
    next_actions:   [],
  });
}

// ── Activate all modules for a plan ──────────────────────────────────────────
async function activatePlanModules(userId, planId, { correlationId } = {}) {
  const modules = getPlanModules(planId);
  const results = await Promise.all(
    modules.map(m => activate(userId, m, { source: 'plan', correlationId })),
  );

  const failed = results.filter(r => r.status === 'failure');
  if (failed.length > 0) {
    return fail('module.activate_plan', userId, `Failed to activate ${failed.length} modules`);
  }

  return ok('module.activate_plan', userId, {
    affected_files: ['modules.json'],
    state_changes:  { 'modules.json': modules.reduce((a, m) => ({ ...a, [m]: { status: 'active' } }), {}) },
    next_actions:   [],
    meta:           { activated: modules },
  });
}

// ── Deactivate module ─────────────────────────────────────────────────────────
async function deactivate(userId, moduleId, { correlationId } = {}) {
  const now = new Date().toISOString();

  const { error } = await supabase
    .from('user_modules')
    .update({ status: 'inactive', deactivated_at: now, updated_at: now })
    .eq('user_id', userId)
    .eq('module_id', moduleId);

  if (error) return fail(OP.DEACTIVATE, userId, error.message);

  const eventLogged = await history.append({
    userId,
    category:      'module',
    action:        EVENTS.MODULE.DEACTIVATED,
    details:       { module_id: moduleId },
    correlationId,
  });

  return ok(OP.DEACTIVATE, userId, {
    affected_files: ['modules.json'],
    state_changes:  { 'modules.json': { [moduleId]: { status: 'inactive' } } },
    event_logged:   eventLogged,
    next_actions:   [],
  });
}

// ── Deactivate modules not in new plan ────────────────────────────────────────
async function deactivateRemovedModules(userId, newPlanId, { correlationId } = {}) {
  const newModules   = new Set(getPlanModules(newPlanId));
  const { data: active } = await supabase
    .from('user_modules')
    .select('module_id')
    .eq('user_id', userId)
    .in('status', ['active', 'trial'])
    .eq('activation_source', 'plan');

  const toRemove = (active || []).filter(m => !newModules.has(m.module_id));
  await Promise.all(toRemove.map(m => deactivate(userId, m.module_id, { correlationId })));

  return ok('module.deactivate_removed', userId, {
    meta: { deactivated: toRemove.map(m => m.module_id) },
    next_actions: [],
  });
}

// ── Check access ──────────────────────────────────────────────────────────────
// Fast path: checks DB for module status. Consider caching for hot paths.
async function canAccess(userId, moduleId) {
  const { data, error } = await supabase
    .from('user_modules')
    .select('status, trial_ends_at')
    .eq('user_id', userId)
    .eq('module_id', moduleId)
    .single();

  if (error || !data) return false;
  if (data.status === 'active') return true;
  if (data.status === 'trial') {
    return !data.trial_ends_at || new Date(data.trial_ends_at) > new Date();
  }
  return false;
}

// ── Get all modules for user ──────────────────────────────────────────────────
async function getUserModules(userId) {
  const { data, error } = await supabase
    .from('user_modules')
    .select('module_id, status, activation_source, trial_ends_at, activated_at')
    .eq('user_id', userId);

  if (error) return fail(OP.GET, userId, error.message);

  const moduleMap = {};
  for (const m of (data || [])) {
    moduleMap[m.module_id] = {
      ...MODULES[m.module_id],
      status:            m.status,
      activation_source: m.activation_source,
      trial_ends_at:     m.trial_ends_at,
      activated_at:      m.activated_at,
    };
  }

  return ok(OP.GET, userId, { meta: { modules: moduleMap } });
}

module.exports = { activate, activatePlanModules, deactivate, deactivateRemovedModules, canAccess, getUserModules };
