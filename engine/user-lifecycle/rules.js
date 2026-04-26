// =============================================================================
// BRIDGE AI OS — ULOE Rules Engine: Personal vs Business Divergence
//
// Every lifecycle operation consults this engine before executing.
// Rules are pure functions: (user, context) → { allowed, transforms, warnings }
// No side effects. Deterministic. Easy to test and audit.
// =============================================================================
'use strict';

const { getPlan } = require('./schemas');

// ── Rule definitions ──────────────────────────────────────────────────────────

const RULES = {

  // ── Subscription rules ─────────────────────────────────────────────────────
  'subscription.max_seats': {
    applies: (user) => user.user_type === 'business',
    check: (user, ctx) => {
      const plan = getPlan(user.plan);
      const seats = ctx.requested_seats || 1;
      if (user.plan === 'free' && seats > 1) {
        return { allowed: false, reason: 'Free plan does not support multiple seats' };
      }
      if (user.plan === 'starter' && seats > 5) {
        return { allowed: false, reason: 'Starter plan supports max 5 seats' };
      }
      return { allowed: true };
    },
  },

  'subscription.annual_discount': {
    applies: (user) => user.user_type === 'business',
    check: (user, ctx) => {
      // Business accounts on annual billing get an extra 10% off
      if (ctx.billing_cycle === 'annual') {
        return { allowed: true, transforms: { additional_discount_pct: 10 } };
      }
      return { allowed: true };
    },
  },

  'subscription.trial_length': {
    applies: () => true,
    check: (user, ctx) => {
      // Business users get 30-day trials; personal users get 14-day
      const trialDays = user.user_type === 'business' ? 30 : 14;
      return { allowed: true, transforms: { trial_days: trialDays } };
    },
  },

  // ── Billing rules ──────────────────────────────────────────────────────────
  'billing.invoice_required': {
    applies: (user) => user.user_type === 'business',
    check: (user, ctx) => {
      // Business users always require a VAT invoice with company details
      if (!user.company) {
        return {
          allowed:  true,
          warnings: ['Business user missing company name — invoice will be incomplete'],
        };
      }
      return { allowed: true };
    },
  },

  'billing.payment_terms': {
    applies: (user) => user.user_type === 'business',
    check: (user, ctx) => {
      // Enterprise business accounts get net-30; others net-7
      const dueDays = user.plan === 'enterprise' ? 30 : 7;
      return { allowed: true, transforms: { invoice_due_days: dueDays } };
    },
  },

  // ── Usage rules ───────────────────────────────────────────────────────────
  'usage.overage_allowed': {
    applies: (user) => user.user_type === 'business' && user.plan !== 'free',
    check: (user, ctx) => {
      // Business plans can go 20% over quota before being blocked (with overage billing)
      return {
        allowed: true,
        transforms: { overage_factor: 1.20 },
      };
    },
  },

  'usage.per_seat_limits': {
    applies: (user) => user.user_type === 'business',
    check: (user, ctx) => {
      const seats = ctx.seats || 1;
      return {
        allowed: true,
        transforms: { quota_multiplier: seats }, // limits scale with seat count
      };
    },
  },

  // ── API rules ─────────────────────────────────────────────────────────────
  'api.shared_keys_allowed': {
    applies: (user) => user.user_type === 'business',
    check: (user, ctx) => {
      // Business can create team-shared keys; personal keys are single-user only
      return { allowed: true, transforms: { allow_team_share: true } };
    },
  },

  // ── Module rules ──────────────────────────────────────────────────────────
  'module.legal_agent_business_only': {
    applies: (user, ctx) => ctx.module_id === 'legal_agent',
    check: (user, ctx) => {
      if (user.user_type !== 'business') {
        return {
          allowed:  false,
          reason:   'Legal Agent module is available to Business accounts only',
        };
      }
      return { allowed: true };
    },
  },

  'module.twin_limits': {
    applies: (user, ctx) => ctx.module_id === 'twin',
    check: (user, ctx) => {
      const limits = {
        free:       0,
        starter:    1,
        pro:        5,
        enterprise: 0,  // unlimited
      };
      const max = limits[user.plan] ?? 1;
      return {
        allowed: true,
        transforms: { max_twins: max === 0 ? Infinity : max },
      };
    },
  },
};

// ── Evaluate all applicable rules for an operation ───────────────────────────
function evaluate(user, operationContext = {}) {
  const results = {
    allowed:    true,
    transforms: {},
    warnings:   [],
    applied:    [],
  };

  for (const [ruleId, rule] of Object.entries(RULES)) {
    if (!rule.applies(user, operationContext)) continue;

    const result = rule.check(user, operationContext);
    results.applied.push(ruleId);

    if (result.allowed === false) {
      results.allowed  = false;
      results.reason   = result.reason;
      break; // First blocking rule wins — stop evaluation
    }

    if (result.transforms) Object.assign(results.transforms, result.transforms);
    if (result.warnings)   results.warnings.push(...result.warnings);
  }

  return results;
}

// ── Check a single named rule ─────────────────────────────────────────────────
function check(ruleId, user, context = {}) {
  const rule = RULES[ruleId];
  if (!rule) return { allowed: true };
  if (!rule.applies(user, context)) return { allowed: true };
  return rule.check(user, context);
}

// ── Get applicable rules for a user type ─────────────────────────────────────
function getApplicableRules(user) {
  return Object.keys(RULES).filter(id => RULES[id].applies(user, {}));
}

module.exports = { evaluate, check, getApplicableRules, RULES };
