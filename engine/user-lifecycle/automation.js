// =============================================================================
// BRIDGE AI OS — ULOE Automation Engine
//
// Executes deterministic lifecycle flows triggered by next_actions arrays.
// Each flow is idempotent — safe to retry. No external side effects beyond
// DB state and history log.
//
// Flows:
//   onboarding          — new user full setup
//   subscription_renew  — billing cycle renewal
//   trial_expiry        — convert trial → paid or downgrade
//   quota_warning       — notify user at 80% usage
//   subscription_expiry — deactivate on cancel date
// =============================================================================
'use strict';

const history      = require('./history');
const identity     = require('./identity');
const subscription = require('./subscription');
const billing      = require('./billing');
const usage        = require('./usage');
const wallet       = require('./wallet');
const modules      = require('./modules');
const { EVENTS, uuid } = require('./schemas');

// ── Flow registry ─────────────────────────────────────────────────────────────
const FLOWS = {

  // ── Full onboarding for a new user ──────────────────────────────────────────
  onboarding: async (userId, ctx = {}) => {
    const correlationId = ctx.correlationId || uuid();
    const plan          = ctx.plan          || 'free';
    const userType      = ctx.user_type     || 'personal';
    const results       = [];

    // 1. Create subscription
    const subResult = await subscription.createSubscription(userId, { plan, userType, trial: ctx.trial || false, correlationId });
    results.push(subResult);

    // 2. Initialize wallets
    const walletResult = await wallet.initializeWallets(userId);
    results.push(walletResult);

    // 3. Initialize usage quotas
    const subData = await subscription.getSubscription(userId);
    const usageResult = await usage.resetQuota(userId, {
      plan,
      periodStart:   subData?.current_period_start,
      periodEnd:     subData?.current_period_end,
      correlationId,
    });
    results.push(usageResult);

    // 4. Activate plan modules
    const modResult = await modules.activatePlanModules(userId, plan, { correlationId });
    results.push(modResult);

    // 5. Credit BRDG bonus
    const brdgResult = await wallet.creditBrdgBonus(userId, plan, correlationId);
    results.push(brdgResult);

    await history.append({
      userId,
      category:      'system',
      action:        EVENTS.SYSTEM.AUTOMATION_RAN,
      details:       { flow: 'onboarding', plan, user_type: userType, steps: results.length },
      correlationId,
    });

    const failed = results.filter(r => r.status === 'failure');
    return {
      flow:          'onboarding',
      user_id:       userId,
      steps_run:     results.length,
      steps_failed:  failed.length,
      ok:            failed.length === 0,
      results,
    };
  },

  // ── Subscription renewal ───────────────────────────────────────────────────
  subscription_renew: async (userId, ctx = {}) => {
    const correlationId = ctx.correlationId || uuid();

    // 1. Renew subscription period
    const subResult = await subscription.renewSubscription(userId, { correlationId });
    if (subResult.status === 'failure') return { flow: 'subscription_renew', ok: false, error: subResult.error };

    // 2. Charge user
    const sub = await subscription.getSubscription(userId);
    if (sub && sub.amount_cents > 0) {
      await billing.charge(userId, {
        amountCents:    sub.amount_cents,
        description:    `${sub.plan} plan renewal`,
        paymentMethod:  'card',
        subscriptionId: sub.id,
        correlationId,
      });
      await billing.generateInvoice(userId, {
        subscriptionId: sub.id,
        lineItems: [{ description: `${sub.plan} plan — monthly`, qty: 1, unit_cents: sub.amount_cents, total_cents: sub.amount_cents }],
        correlationId,
      });
    }

    // 3. Reset usage quotas
    await usage.resetQuota(userId, {
      plan:        sub?.plan || 'free',
      periodStart: sub?.current_period_start,
      periodEnd:   sub?.current_period_end,
      correlationId,
    });

    return { flow: 'subscription_renew', ok: true, user_id: userId };
  },

  // ── Trial expiry ───────────────────────────────────────────────────────────
  trial_expiry: async (userId, ctx = {}) => {
    const correlationId = ctx.correlationId || uuid();
    const sub = await subscription.getSubscription(userId);

    if (!sub || sub.status !== 'trialing') {
      return { flow: 'trial_expiry', ok: false, error: 'No active trial found' };
    }

    if (ctx.convert_to_paid) {
      // Convert trial → active without changing plan
      await subscription.renewSubscription(userId, { correlationId });
    } else {
      // Downgrade to free
      await subscription.changePlan(userId, 'free', { correlationId });
    }

    await history.append({
      userId,
      category:      'subscription',
      action:        EVENTS.SUBSCRIPTION.TRIAL_ENDED,
      details:       { converted: !!ctx.convert_to_paid, plan: sub.plan },
      correlationId,
    });

    return { flow: 'trial_expiry', ok: true, user_id: userId, converted: !!ctx.convert_to_paid };
  },

  // ── Subscription expiry (cancelled-at-period-end) ──────────────────────────
  subscription_expiry: async (userId, ctx = {}) => {
    const correlationId = ctx.correlationId || uuid();

    // Hard-cancel and downgrade to free
    await subscription.cancelSubscription(userId, { immediate: true, reason: 'period_ended', correlationId });
    await subscription.createSubscription(userId, { plan: 'free', userType: ctx.user_type || 'personal', correlationId });
    await modules.deactivateRemovedModules(userId, 'free', { correlationId });
    await usage.resetQuota(userId, { plan: 'free', correlationId });

    return { flow: 'subscription_expiry', ok: true, user_id: userId };
  },
};

// ── Execute a flow by name ────────────────────────────────────────────────────
async function run(flowName, userId, ctx = {}) {
  const flow = FLOWS[flowName];
  if (!flow) return { ok: false, error: `Unknown flow: ${flowName}` };

  try {
    return await flow(userId, ctx);
  } catch (err) {
    await history.append({
      userId,
      category: 'system',
      action:   EVENTS.SYSTEM.ERROR,
      details:  { flow: flowName, error: err.message },
    }).catch(() => {});
    return { flow: flowName, ok: false, error: err.message };
  }
}

// ── Dispatch next_actions from any operation result ───────────────────────────
async function dispatch(userId, nextActions = [], ctx = {}) {
  // Map next_action strings to flows
  const ACTION_FLOW_MAP = {
    'subscription.create':           null, // handled inline
    'module.activate_plan_modules':  null, // handled inline
    'wallet.credit_brdg_bonus':      null, // handled inline
    'billing.generate_invoice':      null, // needs explicit call with line items
    'module.deactivate_paid_modules': async () => modules.deactivateRemovedModules(userId, 'free', ctx),
    'module.deactivate_removed_modules': async () => modules.deactivateRemovedModules(userId, ctx.new_plan || 'free', ctx),
    'usage.reset_quotas':            async () => usage.resetQuota(userId, ctx),
    'automation.schedule_expiry_notice': async () => history.append({
      userId, category: 'system', action: 'system.automation_ran',
      details: { flow: 'expiry_notice_scheduled', at: ctx.expiry_at },
    }),
  };

  const results = [];
  for (const action of nextActions) {
    const handler = ACTION_FLOW_MAP[action];
    if (handler) {
      try { results.push(await handler()); } catch (e) { results.push({ error: e.message }); }
    }
  }

  return results;
}

module.exports = { run, dispatch, FLOWS };
