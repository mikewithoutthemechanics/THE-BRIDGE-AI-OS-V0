// =============================================================================
// BRIDGE AI OS — ULOE Subscription Engine
//
// Manages plan lifecycle: create, upgrade, downgrade, cancel, renew, expire.
// Every mutation is deterministic — same inputs always produce same state change.
// =============================================================================
'use strict';

const { supabase }                 = require('../../lib/supabase');
const history                      = require('./history');
const { ok, fail, EVENTS, PLANS, getPlan, getPlanModules, uuid } = require('./schemas');

const OP = {
  CREATE:     'subscription.create',
  UPGRADE:    'subscription.upgrade',
  DOWNGRADE:  'subscription.downgrade',
  CANCEL:     'subscription.cancel',
  RENEW:      'subscription.renew',
  PAUSE:      'subscription.pause',
  RESUME:     'subscription.resume',
  GET:        'subscription.get',
  TRIAL:      'subscription.start_trial',
};

// ── Get current subscription ──────────────────────────────────────────────────
async function getSubscription(userId) {
  const { data, error } = await supabase
    .from('user_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['active', 'trialing', 'past_due', 'paused'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return data || null;
}

// ── Create subscription ───────────────────────────────────────────────────────
async function createSubscription(userId, {
  plan           = 'free',
  billingCycle   = 'monthly',
  userType       = 'personal',
  trial          = false,
  correlationId  = null,
} = {}) {
  const planDef  = getPlan(plan);
  const now      = new Date();
  const periodEnd = new Date(now);

  if (billingCycle === 'annual') {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }

  const trialEnd = trial ? new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000) : null;

  const record = {
    id:                    uuid(),
    user_id:               userId,
    plan,
    user_type:             userType,
    status:                trial ? 'trialing' : 'active',
    billing_cycle:         billingCycle,
    amount_cents:          billingCycle === 'annual' ? planDef.price_annual : planDef.price_monthly,
    currency:              planDef.currency,
    trial_ends_at:         trialEnd?.toISOString() || null,
    current_period_start:  now.toISOString(),
    current_period_end:    periodEnd.toISOString(),
    metadata:              {},
    created_at:            now.toISOString(),
    updated_at:            now.toISOString(),
  };

  const { error } = await supabase.from('user_subscriptions').insert(record);
  if (error) return fail(OP.CREATE, userId, error.message);

  // Sync plan on users table
  await supabase.from('users').update({ plan, updated_at: now.toISOString() }).eq('id', userId);

  const action = trial ? EVENTS.SUBSCRIPTION.TRIAL_STARTED : EVENTS.SUBSCRIPTION.CREATED;
  const eventLogged = await history.append({
    userId,
    category:      'subscription',
    action,
    details:       { plan, billing_cycle: billingCycle, trial, period_end: periodEnd.toISOString() },
    correlationId,
  });

  return ok(OP.CREATE, userId, {
    affected_files: ['subscriptions.json'],
    state_changes:  { 'subscriptions.json': { plan, status: record.status, period_end: periodEnd.toISOString() } },
    event_logged:   eventLogged,
    next_actions:   ['module.activate_plan_modules', 'wallet.credit_brdg_bonus', 'billing.generate_invoice'],
    meta:           { subscription_id: record.id },
  });
}

// ── Change plan (upgrade or downgrade) ───────────────────────────────────────
async function changePlan(userId, newPlan, { billingCycle, correlationId } = {}) {
  if (!PLANS[newPlan]) return fail(OP.UPGRADE, userId, `Unknown plan: ${newPlan}`);

  const current = await getSubscription(userId);
  if (!current)  return fail(OP.UPGRADE, userId, 'No active subscription found');

  const oldPlan  = current.plan;
  const planDef  = getPlan(newPlan);
  const cycle    = billingCycle || current.billing_cycle;
  const isUpgrade = Object.keys(PLANS).indexOf(newPlan) >= Object.keys(PLANS).indexOf(oldPlan);
  const operation = isUpgrade ? OP.UPGRADE : OP.DOWNGRADE;
  const action    = isUpgrade ? EVENTS.SUBSCRIPTION.UPGRADED : EVENTS.SUBSCRIPTION.DOWNGRADED;

  const now      = new Date();
  const periodEnd = new Date(now);
  if (cycle === 'annual') periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  else                    periodEnd.setMonth(periodEnd.getMonth() + 1);

  const { error } = await supabase
    .from('user_subscriptions')
    .update({
      plan,
      billing_cycle:        cycle,
      amount_cents:         cycle === 'annual' ? planDef.price_annual : planDef.price_monthly,
      current_period_start: now.toISOString(),
      current_period_end:   periodEnd.toISOString(),
      status:               'active',
      updated_at:           now.toISOString(),
    })
    .eq('id', current.id);

  if (error) return fail(operation, userId, error.message);

  // Sync plan on users table
  await supabase.from('users').update({ plan: newPlan, updated_at: now.toISOString() }).eq('id', userId);

  const eventLogged = await history.append({
    userId,
    category:      'subscription',
    action,
    details:       { from_plan: oldPlan, to_plan: newPlan, billing_cycle: cycle },
    correlationId,
  });

  const nextActions = isUpgrade
    ? ['module.activate_plan_modules', 'wallet.credit_brdg_bonus', 'billing.generate_invoice']
    : ['module.deactivate_removed_modules', 'usage.reset_quotas'];

  return ok(operation, userId, {
    affected_files: ['subscriptions.json'],
    state_changes:  { 'subscriptions.json': { plan: newPlan, status: 'active' } },
    event_logged:   eventLogged,
    next_actions:   nextActions,
    meta:           { from_plan: oldPlan, to_plan: newPlan },
  });
}

// ── Cancel subscription ───────────────────────────────────────────────────────
async function cancelSubscription(userId, { reason = '', immediate = false, correlationId } = {}) {
  const current = await getSubscription(userId);
  if (!current) return fail(OP.CANCEL, userId, 'No active subscription found');

  const now = new Date().toISOString();
  const update = immediate
    ? { status: 'cancelled', cancelled_at: now, cancel_reason: reason, updated_at: now }
    : { status: 'active', cancel_reason: reason, cancelled_at: current.current_period_end, updated_at: now };
    // When not immediate: subscription stays active until period end, then auto-expires

  const { error } = await supabase.from('user_subscriptions').update(update).eq('id', current.id);
  if (error) return fail(OP.CANCEL, userId, error.message);

  if (immediate) {
    await supabase.from('users').update({ plan: 'free', updated_at: now }).eq('id', userId);
  }

  const eventLogged = await history.append({
    userId,
    category: 'subscription',
    action:   EVENTS.SUBSCRIPTION.CANCELLED,
    details:  { plan: current.plan, immediate, reason },
    correlationId,
  });

  return ok(OP.CANCEL, userId, {
    affected_files: ['subscriptions.json'],
    state_changes:  { 'subscriptions.json': { status: immediate ? 'cancelled' : 'cancels_at_period_end' } },
    event_logged:   eventLogged,
    next_actions:   immediate ? ['module.deactivate_paid_modules'] : ['automation.schedule_expiry_notice'],
  });
}

// ── Renew subscription ────────────────────────────────────────────────────────
async function renewSubscription(userId, { correlationId } = {}) {
  const current = await getSubscription(userId);
  if (!current) return fail(OP.RENEW, userId, 'No subscription to renew');

  const now      = new Date();
  const periodEnd = new Date(current.current_period_end);
  if (current.billing_cycle === 'annual') periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  else                                    periodEnd.setMonth(periodEnd.getMonth() + 1);

  const { error } = await supabase
    .from('user_subscriptions')
    .update({
      status:               'active',
      current_period_start: current.current_period_end,
      current_period_end:   periodEnd.toISOString(),
      updated_at:           now.toISOString(),
    })
    .eq('id', current.id);

  if (error) return fail(OP.RENEW, userId, error.message);

  const eventLogged = await history.append({
    userId,
    category: 'subscription',
    action:   EVENTS.SUBSCRIPTION.RENEWED,
    details:  { plan: current.plan, new_period_end: periodEnd.toISOString() },
    correlationId,
  });

  return ok(OP.RENEW, userId, {
    affected_files: ['subscriptions.json'],
    state_changes:  { 'subscriptions.json': { period_end: periodEnd.toISOString() } },
    event_logged:   eventLogged,
    next_actions:   ['billing.charge_renewal', 'usage.reset_quotas'],
    meta:           { new_period_end: periodEnd.toISOString() },
  });
}

// ── Pause / resume ────────────────────────────────────────────────────────────
async function pauseSubscription(userId) {
  const current = await getSubscription(userId);
  if (!current || current.status !== 'active') return fail(OP.PAUSE, userId, 'No active subscription to pause');

  const now = new Date().toISOString();
  const { error } = await supabase.from('user_subscriptions').update({ status: 'paused', updated_at: now }).eq('id', current.id);
  if (error) return fail(OP.PAUSE, userId, error.message);

  const eventLogged = await history.append({ userId, category: 'subscription', action: EVENTS.SUBSCRIPTION.PAUSED, details: { plan: current.plan } });
  return ok(OP.PAUSE, userId, { affected_files: ['subscriptions.json'], state_changes: { 'subscriptions.json': { status: 'paused' } }, event_logged: eventLogged, next_actions: [] });
}

async function resumeSubscription(userId) {
  const { data: current, error: fetchErr } = await supabase
    .from('user_subscriptions').select('*').eq('user_id', userId).eq('status', 'paused').single();
  if (fetchErr || !current) return fail(OP.RESUME, userId, 'No paused subscription found');

  const now = new Date().toISOString();
  const { error } = await supabase.from('user_subscriptions').update({ status: 'active', updated_at: now }).eq('id', current.id);
  if (error) return fail(OP.RESUME, userId, error.message);

  const eventLogged = await history.append({ userId, category: 'subscription', action: EVENTS.SUBSCRIPTION.RESUMED, details: { plan: current.plan } });
  return ok(OP.RESUME, userId, { affected_files: ['subscriptions.json'], state_changes: { 'subscriptions.json': { status: 'active' } }, event_logged: eventLogged, next_actions: [] });
}

module.exports = {
  getSubscription, createSubscription, changePlan,
  cancelSubscription, renewSubscription, pauseSubscription, resumeSubscription,
};
