// =============================================================================
// BRIDGE AI OS — ULOE Canonical Schema Definitions
//
// Single source of truth for:
//   - Plan definitions (limits, modules, pricing)
//   - Wallet ledger types
//   - Module registry
//   - Lifecycle event categories/actions
//   - Standard response envelope
// =============================================================================
'use strict';

const crypto = require('crypto');

// ── Plans ─────────────────────────────────────────────────────────────────────
const PLANS = {
  free: {
    name:          'Free',
    price_monthly: 0,
    price_annual:  0,
    currency:      'USD',
    limits: {
      api_calls_per_month:    500,
      agent_tasks_per_month:  10,
      llm_tokens_per_month:   50_000,
      storage_bytes:          104_857_600,  // 100 MB
    },
    modules:    ['dashboard'],
    api_rpm:    5,
    api_keys:   1,
    brdg_bonus: 0,
  },
  starter: {
    name:          'Starter',
    price_monthly: 7900,   // cents
    price_annual:  79_000, // cents (saves ~17%)
    currency:      'USD',
    limits: {
      api_calls_per_month:    10_000,
      agent_tasks_per_month:  100,
      llm_tokens_per_month:   500_000,
      storage_bytes:          1_073_741_824,  // 1 GB
    },
    modules:    ['dashboard', 'crm', 'analytics'],
    api_rpm:    10,
    api_keys:   3,
    brdg_bonus: 100,
  },
  pro: {
    name:          'Pro',
    price_monthly: 24900,
    price_annual:  249_000,
    currency:      'USD',
    limits: {
      api_calls_per_month:    100_000,
      agent_tasks_per_month:  1_000,
      llm_tokens_per_month:   5_000_000,
      storage_bytes:          10_737_418_240,  // 10 GB
    },
    modules:    ['dashboard', 'crm', 'analytics', 'neurolink', 'agent_registry', 'twin', 'api_gateway'],
    api_rpm:    60,
    api_keys:   10,
    brdg_bonus: 1000,
  },
  enterprise: {
    name:          'Enterprise',
    price_monthly: 99900,
    price_annual:  999_000,
    currency:      'USD',
    limits: {
      api_calls_per_month:    0,   // unlimited (0 = no cap)
      agent_tasks_per_month:  0,
      llm_tokens_per_month:   0,
      storage_bytes:          0,
    },
    modules: ['dashboard', 'crm', 'analytics', 'neurolink', 'agent_registry', 'twin',
              'api_gateway', 'legal_agent', 'commerce', 'zero_trust'],
    api_rpm:    300,
    api_keys:   0,    // unlimited
    brdg_bonus: 10_000,
  },
};

// ── Module Registry ───────────────────────────────────────────────────────────
const MODULES = {
  dashboard:      { name: 'Dashboard',      path: '/dashboard',    category: 'core'      },
  crm:            { name: 'CRM',            path: '/crm',          category: 'revenue'   },
  analytics:      { name: 'Analytics',      path: '/analytics',    category: 'data'      },
  neurolink:      { name: 'NeuroLink',      path: '/neurolink',    category: 'ai'        },
  agent_registry: { name: 'Agent Registry', path: '/agents',       category: 'ai'        },
  twin:           { name: 'Digital Twin',   path: '/twin',         category: 'identity'  },
  api_gateway:    { name: 'API Gateway',    path: '/api-keys',     category: 'developer' },
  legal_agent:    { name: 'Legal Agent',    path: '/legal',        category: 'enterprise'},
  commerce:       { name: 'Commerce Suite', path: '/commerce',     category: 'enterprise'},
  zero_trust:     { name: 'Zero Trust',     path: '/zero-trust',   category: 'enterprise'},
};

// ── Wallet Ledgers ────────────────────────────────────────────────────────────
const LEDGERS = {
  main:    { currency: 'USD', description: 'Primary USD balance' },
  promo:   { currency: 'USD', description: 'Promotional credit (expires)' },
  credits: { currency: 'USD', description: 'Platform credits (no expiry)' },
  brdg:    { currency: 'BRDG', description: 'BRDG token balance' },
};

// ── Lifecycle Event Taxonomy ──────────────────────────────────────────────────
const EVENTS = {
  IDENTITY: {
    CREATED:       'identity.created',
    UPDATED:       'identity.updated',
    VERIFIED:      'identity.verified',
    WALLET_LINKED: 'identity.wallet_linked',
    DELETED:       'identity.deleted',
  },
  SUBSCRIPTION: {
    CREATED:      'subscription.created',
    UPGRADED:     'subscription.upgraded',
    DOWNGRADED:   'subscription.downgraded',
    RENEWED:      'subscription.renewed',
    CANCELLED:    'subscription.cancelled',
    PAUSED:       'subscription.paused',
    RESUMED:      'subscription.resumed',
    EXPIRED:      'subscription.expired',
    TRIAL_STARTED:'subscription.trial_started',
    TRIAL_ENDED:  'subscription.trial_ended',
  },
  BILLING: {
    CHARGED:    'billing.charged',
    REFUNDED:   'billing.refunded',
    CREDITED:   'billing.credited',
    FAILED:     'billing.failed',
    INVOICED:   'billing.invoiced',
    PAID:       'billing.paid',
  },
  USAGE: {
    RECORDED:      'usage.recorded',
    QUOTA_WARNING: 'usage.quota_warning',   // 80% used
    QUOTA_HIT:     'usage.quota_hit',       // 100% — requests blocked
    QUOTA_RESET:   'usage.quota_reset',
  },
  WALLET: {
    CREDITED:    'wallet.credited',
    DEBITED:     'wallet.debited',
    LOCKED:      'wallet.locked',
    UNLOCKED:    'wallet.unlocked',
    WITHDRAWN:   'wallet.withdrawn',
  },
  API: {
    KEY_CREATED:  'api.key_created',
    KEY_REVOKED:  'api.key_revoked',
    KEY_ROTATED:  'api.key_rotated',
    RATE_LIMITED: 'api.rate_limited',
    CREDITS_LOW:  'api.credits_low',
  },
  MODULE: {
    ACTIVATED:    'module.activated',
    DEACTIVATED:  'module.deactivated',
    TRIAL_STARTED:'module.trial_started',
    SUSPENDED:    'module.suspended',
  },
  SYSTEM: {
    AUTOMATION_RAN: 'system.automation_ran',
    ERROR:          'system.error',
    HEALTH_CHECK:   'system.health_check',
  },
};

// ── Standard Response Envelope ────────────────────────────────────────────────
function envelope(status, operation, userId, opts = {}) {
  return {
    status,                           // 'success' | 'failure'
    operation,                        // e.g. 'subscription.create'
    user_id:        userId,
    affected_files: opts.affected_files || [],
    state_changes:  opts.state_changes  || {},
    event_logged:   opts.event_logged   || null,
    next_actions:   opts.next_actions   || [],
    error:          opts.error          || undefined,
    meta:           opts.meta           || undefined,
  };
}

function ok(operation, userId, opts) {
  return envelope('success', operation, userId, opts);
}

function fail(operation, userId, reason, opts = {}) {
  return envelope('failure', operation, userId, { ...opts, error: reason });
}

// ── Plan helpers ─────────────────────────────────────────────────────────────
function getPlan(planId) {
  return PLANS[planId] || PLANS.free;
}

function getPlanModules(planId) {
  return getPlan(planId).modules;
}

function planHasModule(planId, moduleId) {
  return getPlanModules(planId).includes(moduleId);
}

function planLimitFor(planId, resource) {
  const limit = getPlan(planId).limits[resource];
  return limit === undefined ? 0 : limit;
}

// ── UUID helper ───────────────────────────────────────────────────────────────
function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

module.exports = {
  PLANS, MODULES, LEDGERS, EVENTS,
  envelope, ok, fail,
  getPlan, getPlanModules, planHasModule, planLimitFor,
  uuid,
};
