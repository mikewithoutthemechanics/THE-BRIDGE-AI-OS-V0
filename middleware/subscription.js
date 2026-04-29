/**
 * BRIDGE AI OS — Subscription Enforcement Middleware
 *
 * Single chokepoint for all subscription + billing validation.
 * Runs BEFORE any tool/project/output handler touches business logic.
 *
 * Tiers (ascending):
 *   free → starter → pro → admin → enterprise
 *
 * Usage in route handlers:
 *   const { requireTier, requireTool } = require('../middleware/subscription');
 *   // Inline (route handler style):
 *   const check = await requireTier(req, 'pro');
 *   if (!check.ok) return res.status(402).json(check);
 *
 * Usage as Express middleware:
 *   app.use('/api/platform/projects', tierGate('starter'), handler);
 */

'use strict';

const userDb = require('../lib/user-identity');
const { checkToolAccess, TIER_RANK } = require('../lib/projects');

// ── Plan → capabilities map ──────────────────────────────────────────────────
// Each tier inherits all capabilities of tiers below it.

const PLAN_CAPS = {
  free: {
    projects:          2,
    runs_per_day:      10,
    outputs_per_month: 5,
    integrations:      false,
    export_formats:    ['json'],
    agents_per_run:    1,
    api_calls_per_min: 5,
  },
  starter: {
    projects:          10,
    runs_per_day:      100,
    outputs_per_month: 50,
    integrations:      true,
    export_formats:    ['json', 'markdown', 'report'],
    agents_per_run:    3,
    api_calls_per_min: 30,
  },
  pro: {
    projects:          100,
    runs_per_day:      1000,
    outputs_per_month: 500,
    integrations:      true,
    export_formats:    ['json', 'markdown', 'report', 'bundle', 'zip'],
    agents_per_run:    10,
    api_calls_per_min: 120,
  },
  admin: {
    projects:          -1,  // unlimited
    runs_per_day:      -1,
    outputs_per_month: -1,
    integrations:      true,
    export_formats:    ['json', 'markdown', 'report', 'bundle', 'zip', 'repo', 'api', 'webhook'],
    agents_per_run:    -1,
    api_calls_per_min: 600,
  },
  enterprise: {
    projects:          -1,
    runs_per_day:      -1,
    outputs_per_month: -1,
    integrations:      true,
    export_formats:    ['json', 'markdown', 'report', 'bundle', 'zip', 'repo', 'api', 'webhook'],
    agents_per_run:    -1,
    api_calls_per_min: -1,
  },
};

// ── Auth extraction ──────────────────────────────────────────────────────────

async function extractUser(req) {
  let token = null;
  const authHeader = req.headers?.authorization || '';
  if (authHeader.startsWith('Bearer ')) token = authHeader.slice(7);
  if (!token && req.cookies?.bridge_token) token = req.cookies.bridge_token;
  // req.query.token removed — tokens must not appear in URLs (log leakage)
  if (!token) return null;
  try {
    return await userDb.verifyAuthToken(token);
  } catch {
    return null;
  }
}

// ── Tier check ───────────────────────────────────────────────────────────────

/**
 * Verify a request's user has >= the required tier.
 * Returns { ok, user, tier } or { ok: false, error, upgrade_url, required, has }
 */
async function requireTier(req, required = 'starter') {
  const user = await extractUser(req);
  if (!user) {
    return { ok: false, status: 401, error: 'Authentication required', redirect: '/join' };
  }

  // Superadmin and admin roles bypass all tier restrictions
  if (user.role === 'superadmin' || user.role === 'admin') {
    return { ok: true, user, tier: user.plan || 'enterprise' };
  }

  const tier = user.plan || 'free';
  const has = TIER_RANK[tier] ?? 0;
  const needs = TIER_RANK[required] ?? 1;

  if (has < needs) {
    return {
      ok: false,
      status: 402,
      error: `This feature requires the "${required}" plan. You are on "${tier}".`,
      required,
      has: tier,
      upgrade_url: `/billing?plan=${required}`,
    };
  }

  return { ok: true, user, tier };
}

/**
 * Verify user can access a specific toolId.
 */
async function requireTool(req, toolId) {
  const user = await extractUser(req);
  if (!user) {
    return { ok: false, status: 401, error: 'Authentication required', redirect: '/join' };
  }
  const tier = user.plan || 'free';
  const access = checkToolAccess(toolId, tier);
  if (!access.ok) {
    return {
      ok: false,
      status: 402,
      error: `Tool "${toolId}" requires the "${access.required}" plan. You are on "${access.has}".`,
      required: access.required,
      has: access.has,
      upgrade_url: `/billing?tool=${toolId}`,
    };
  }
  return { ok: true, user, tier };
}

/**
 * Get capability limits for a plan tier.
 */
function getCaps(tier = 'free') {
  return PLAN_CAPS[tier] || PLAN_CAPS.free;
}

/**
 * Express middleware factory. Blocks with 402 JSON if tier insufficient.
 * Use: app.use('/api/platform/tools', tierGate('starter'))
 */
function tierGate(required = 'starter') {
  return async (req, res, next) => {
    if (req.method === 'OPTIONS') return next();
    const check = await requireTier(req, required);
    if (!check.ok) {
      return res.status(check.status || 402).json({
        ok: false,
        error: check.error,
        required: check.required,
        has: check.has,
        upgrade_url: check.upgrade_url,
      });
    }
    req.bridgeUser = check.user;
    req.bridgeTier = check.tier;
    next();
  };
}

/**
 * Express middleware factory for tool-specific gating.
 * Use: app.use('/tools/neurolink', toolGate('neurolink'))
 */
function toolGate(toolId) {
  return async (req, res, next) => {
    if (req.method === 'OPTIONS') return next();
    const check = await requireTool(req, toolId);
    if (!check.ok) {
      return res.status(check.status || 402).json({
        ok: false,
        error: check.error,
        required: check.required,
        has: check.has,
        upgrade_url: check.upgrade_url,
      });
    }
    req.bridgeUser = check.user;
    req.bridgeTier = check.tier;
    next();
  };
}

/**
 * Page-level gate for HTML responses. Redirects to /billing instead of 402 JSON.
 * Usage: if (await pageGate(req, res, 'pro')) return; // already redirected
 */
async function pageGate(req, res, required = 'starter') {
  const check = await requireTier(req, required);
  if (!check.ok && check.status === 401) {
    res.redirect(302, `/join?next=${encodeURIComponent(req.url)}`);
    return true;
  }
  if (!check.ok) {
    res.redirect(302, `/billing?plan=${required}&next=${encodeURIComponent(req.url)}`);
    return true;
  }
  return false; // access granted
}

module.exports = {
  PLAN_CAPS,
  extractUser,
  requireTier,
  requireTool,
  getCaps,
  tierGate,
  toolGate,
  pageGate,
};
