// =============================================================================
// BRIDGE AI OS — Unified User Lifecycle Orchestration Engine (ULOE)
//
// Single entry point for all user lifecycle operations.
// Coordinates: identity → subscription → billing → usage → wallet → modules → rules → automation
//
// Every public method returns the canonical envelope:
//   { status, operation, user_id, affected_files, state_changes, event_logged, next_actions }
// =============================================================================
'use strict';

const identity     = require('./identity');
const subscription = require('./subscription');
const billing      = require('./billing');
const usage        = require('./usage');
const wallet       = require('./wallet');
const apiKeys      = require('./api-keys');
const modules      = require('./modules');
const rules        = require('./rules');
const automation   = require('./automation');
const history      = require('./history');
const { ok, fail, uuid } = require('./schemas');
const { supabase } = require('../../lib/supabase');

// ── Bootstrap: full new-user onboarding ──────────────────────────────────────
// Creates identity, then runs the onboarding automation flow.
async function bootstrap(userParams) {
  const correlationId = uuid();

  // 1. Create user identity
  const createResult = await identity.createUser({ ...userParams, correlationId });
  if (createResult.status === 'failure') return createResult;

  const userId = createResult.user_id;

  // 2. Evaluate rules for onboarding
  const user = await _loadUser(userId);
  const ruleResult = rules.evaluate(user, { operation: 'onboarding' });
  if (!ruleResult.allowed) return fail('onboarding', userId, ruleResult.reason);

  // Apply any trial length transform
  const trialDays = ruleResult.transforms?.trial_days || 14;

  // 3. Run onboarding flow
  const flowResult = await automation.run('onboarding', userId, {
    plan:           userParams.plan       || 'free',
    user_type:      userParams.user_type  || 'personal',
    trial:          userParams.trial      || false,
    trial_days:     trialDays,
    correlationId,
  });

  return ok('onboarding', userId, {
    affected_files: ['profile.json', 'subscriptions.json', 'wallet.json', 'modules.json', 'usage.json'],
    state_changes:  { 'profile.json': { id: userId, status: 'active' } },
    event_logged:   createResult.event_logged,
    next_actions:   flowResult.ok ? [] : ['automation.retry_onboarding'],
    meta:           { user_id: userId, flow: flowResult, correlation_id: correlationId },
  });
}

// ── Get full user capsule ─────────────────────────────────────────────────────
// Returns: profile + subscription + wallet + modules + usage summary + api keys
async function getCapsule(userId) {
  const [
    userResult,
    subResult,
    walletResult,
    modResult,
    usageResult,
    keysResult,
  ] = await Promise.all([
    identity.getUser(userId),
    subscription.getSubscription(userId).catch(() => null),
    wallet.getBalances(userId),
    modules.getUserModules(userId),
    usage.getSummary(userId),
    apiKeys.listKeys(userId),
  ]);

  if (userResult.status === 'failure') return userResult;

  return ok('user.capsule', userId, {
    meta: {
      profile:      userResult.meta,
      subscription: subResult,
      wallet:       walletResult.meta?.balances || {},
      modules:      modResult.meta?.modules     || {},
      usage:        usageResult.meta            || {},
      api_keys:     keysResult.meta?.keys       || [],
    },
  });
}

// ── Upgrade plan ──────────────────────────────────────────────────────────────
async function upgradePlan(userId, newPlan, opts = {}) {
  const user = await _loadUser(userId);
  if (!user) return fail('subscription.upgrade', userId, 'User not found');

  const ruleResult = rules.evaluate(user, { operation: 'subscription.upgrade', new_plan: newPlan });
  if (!ruleResult.allowed) return fail('subscription.upgrade', userId, ruleResult.reason);

  const result = await subscription.changePlan(userId, newPlan, opts);
  if (result.status === 'failure') return result;

  // Activate new modules + credit BRDG bonus
  await Promise.all([
    modules.activatePlanModules(userId, newPlan, { correlationId: opts.correlationId }),
    wallet.creditBrdgBonus(userId, newPlan, opts.correlationId),
    billing.generateInvoice(userId, {
      lineItems: [{ description: `${newPlan} plan upgrade`, qty: 1, unit_cents: result.meta?.amount_cents || 0, total_cents: result.meta?.amount_cents || 0 }],
    }).catch(() => {}),
  ]);

  return result;
}

// ── Record API usage ───────────────────────────────────────────────────────────
// Called by the API gateway middleware on every authenticated request.
async function recordApiCall(userId, { apiKeyId, resourceType = 'api_call', quantity = 1, costMicrocents = 0, metadata = {} } = {}) {
  const check = await usage.enforce(userId, resourceType, quantity);
  if (check.status === 'failure') return check;

  return usage.record(userId, { resourceType, quantity, apiKeyId, costMicrocents, metadata });
}

// ── Check module access ────────────────────────────────────────────────────────
async function checkAccess(userId, moduleId) {
  const hasAccess = await modules.canAccess(userId, moduleId);
  if (!hasAccess) {
    return fail('module.access', userId, `Access denied to module: ${moduleId}`, {
      meta: { module_id: moduleId },
    });
  }
  return ok('module.access', userId, { meta: { module_id: moduleId, allowed: true } });
}

// ── Cancel subscription ───────────────────────────────────────────────────────
async function cancelPlan(userId, opts = {}) {
  const result = await subscription.cancelSubscription(userId, opts);
  if (result.status === 'failure') return result;

  if (opts.immediate) {
    await Promise.all([
      modules.deactivateRemovedModules(userId, 'free'),
      subscription.createSubscription(userId, { plan: 'free' }),
    ]);
  }

  return result;
}

// ── Validate incoming API key ─────────────────────────────────────────────────
async function validateApiKey(rawKey) {
  return apiKeys.validateKey(rawKey);
}

// ── Run scheduled automation ──────────────────────────────────────────────────
async function runScheduledTasks() {
  const now = new Date().toISOString();
  const results = { processed: 0, errors: 0 };

  // 1. Expire subscriptions that passed their period end
  const { data: expired } = await supabase
    .from('user_subscriptions')
    .select('user_id, plan, cancel_reason')
    .eq('status', 'active')
    .lt('current_period_end', now)
    .not('cancel_reason', 'is', null);

  for (const sub of (expired || [])) {
    try {
      await automation.run('subscription_expiry', sub.user_id, { user_type: 'personal' });
      results.processed++;
    } catch (_) { results.errors++; }
  }

  // 2. Expire trialing subscriptions
  const { data: expiredTrials } = await supabase
    .from('user_subscriptions')
    .select('user_id, plan')
    .eq('status', 'trialing')
    .lt('trial_ends_at', now);

  for (const sub of (expiredTrials || [])) {
    try {
      await automation.run('trial_expiry', sub.user_id, { convert_to_paid: false });
      results.processed++;
    } catch (_) { results.errors++; }
  }

  // 3. Expire API keys past their expiry date
  await supabase
    .from('uloe_api_keys')
    .update({ status: 'expired', updated_at: now })
    .eq('status', 'active')
    .lt('expires_at', now);

  return results;
}

// ── Internal helpers ──────────────────────────────────────────────────────────
async function _loadUser(userId) {
  const { data } = await supabase.from('users').select('*').eq('id', userId).single();
  return data || null;
}

// ── Health check ──────────────────────────────────────────────────────────────
function health() {
  return {
    engine:  'ULOE',
    version: '1.0.0',
    modules: ['identity', 'subscription', 'billing', 'usage', 'wallet', 'api-keys', 'modules', 'rules', 'automation'],
    history: history.stats(),
  };
}

module.exports = {
  // Orchestration
  bootstrap, getCapsule, upgradePlan, cancelPlan,

  // Operations
  recordApiCall, checkAccess, validateApiKey, runScheduledTasks,

  // Direct module access (for complex callers)
  identity, subscription, billing, usage, wallet, apiKeys, modules, rules, automation, history,

  // Health
  health,
};
