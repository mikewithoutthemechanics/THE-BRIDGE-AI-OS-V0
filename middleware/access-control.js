/**
 * BRIDGE AI OS — Access Control Middleware
 *
 * 4-tier page access: PUBLIC, CLIENT, ADMIN, SUPERADMIN
 * Integrates with user-identity.js for token verification.
 */

'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const userDb = require('../lib/user-identity');

// Timing-safe comparison to prevent timing attacks on secret tokens
function safeCompare(a, b) {
  if (!a || !b) return false;
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// ── Page Tier Definitions ──────────────────────────────────────────────────
const PAGE_TIERS = {
  PUBLIC: ['/', '/index.html', '/landing.html', '/home.html', '/pricing.html', '/onboarding.html', '/checkout.html',
    '/payment-success.html', '/payment-cancel.html', '/welcome.html', '/onboarding.html', '/sitemap.html',
    '/docs.html', '/50-applications.html', '/applications.html', '/404.html', '/offline.html',
    '/platforms.html', '/bridge-home.html', '/ehsa-home.html', '/aurora-home.html', '/hospital-home.html',
    '/aid-home.html', '/rootedearth-home.html', '/portal.html', '/voice.html', '/welcome-tour.html',
    // Platform funnel — public entry points, no auth required
    '/demo.html', '/wizard.html',
    // Profile/projects serve HTML shell; auth enforced client-side via /auth/me
    '/profile.html', '/projects.html'],

  CLIENT: ['/console.html', '/avatar.html', '/digital-twin-console.html', '/twin-wall.html', '/twin.html',
    '/crm.html', '/invoicing.html', '/quotes.html', '/legal.html', '/marketing.html', '/tickets.html',
    '/vendors.html', '/customers.html', '/workforce.html', '/leadgen.html', '/affiliate.html',
    '/corporate.html', '/brand.html', '/marketplace.html', '/payment.html', '/settings.html',
    '/ehsa-app.html', '/ehsa-brain.html', '/ban-home.html', '/supac-home.html', '/ubi-home.html',
    '/abaas-home.html', '/agents.html', '/governance.html', '/economy.html', '/banks.html',
    '/topology.html', '/topology-layers.html'],

  ADMIN: ['/admin.html', '/admin-command.html', '/admin-revenue.html', '/admin-sitemap.html',
    '/intelligence.html', '/executive-dashboard.html', '/aoe-dashboard.html', '/bridge-audit-dashboard.html',
    '/auth-dashboard.html', '/registry.html', '/control.html', '/command-center.html',
    '/system-status-dashboard.html', '/infra.html', '/terminal.html', '/logs.html', '/view-logs.html'],

  SUPERADMIN: ['/treasury-dashboard.html', '/wallet.html', '/defi.html', '/trading.html'],
};

// Build a reverse lookup: path -> tier
const PATH_TO_TIER = {};
for (const [tier, pages] of Object.entries(PAGE_TIERS)) {
  for (const page of pages) {
    PATH_TO_TIER[page] = tier;
  }
}

// ── Token Extraction ───────────────────────────────────────────────────────

async function extractUser(req) {
  let token = null;

  // 1. Authorization Bearer header
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  }

  // 2. Cookie fallback
  if (!token && req.cookies && req.cookies.bridge_token) {
    token = req.cookies.bridge_token;
  }

  // 3. Query param fallback
  // query string token auth removed — header-only auth enforced

  if (!token) return null;

  // Try Bridge JWT first (backward compat — verifies and looks up DB user)
  const bridgeUser = await userDb.verifyAuthToken(token);
  if (bridgeUser) {
    // Upgrade any stale 'visitor' plan — email+password users were previously created with visitor
    if (bridgeUser.plan === 'visitor') {
      try {
        const { supabase: supa } = require('../lib/supabase');
        await supa.from('users').update({ plan: 'free', funnel_stage: 'identified' }).eq('id', bridgeUser.id);
        bridgeUser.plan = 'free';
        bridgeUser.funnel_stage = 'identified';
      } catch (_) {}
    }
    return bridgeUser;
  }

  // Try Supabase JWT
  try {
    const { supabase } = require('../lib/supabase');
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (user && !error) {
      // Look up or create user in our users table
      let dbUser = await userDb.getUserByEmail(user.email);
      if (!dbUser) {
        dbUser = await userDb.createUser(user.email, user.user_metadata?.name, 'supabase', user.id);
      }
      // Authenticated Supabase users should be at least 'client' plan
      // This prevents redirect loops where a valid Supabase session
      // still has plan='visitor' in the DB from initial creation
      if (dbUser && dbUser.plan === 'visitor') {
        try {
          const { supabase: supa } = require('../lib/supabase');
          await supa.from('users').update({ plan: 'client', funnel_stage: 'lead' }).eq('id', dbUser.id);
          dbUser.plan = 'client';
          dbUser.funnel_stage = 'lead';
        } catch (_upgradeErr) {}
      }
      return dbUser;
    }
  } catch (_) {}

  // Fallback: verify the JWT signature directly with JWT_SECRET.
  // This handles tokens issued by server.js (via jsonwebtoken) when the
  // DB user record is not yet in the user-identity store (e.g. test mode,
  // newly created users, or Supabase offline). The role embedded in the
  // token payload is trusted because it was signed with the server secret.
  try {
    const secret = process.env.JWT_SECRET;
    if (secret) {
      const decoded = jwt.verify(token, secret);
      if (decoded && decoded.sub) {
        return {
          id: decoded.sub,
          email: decoded.email || null,
          role: decoded.role || 'member',
          plan: decoded.plan || 'client',
        };
      }
    }
  } catch (_) {}

  return null;
}

// ── Helper: check if request wants HTML ────────────────────────────────────

function wantsHtml(req) {
  const accept = req.headers.accept || '';
  return accept.includes('text/html') || (!accept.includes('application/json') && req.path.endsWith('.html'));
}

// ── Middleware: requireClient ──────────────────────────────────────────────
//
// AUTH DISABLED on this branch — pass through. Restore the body below
// (extractUser → 401 / redirect to /onboarding.html for visitors) before
// shipping to production.
async function requireClient(req, res, next) {
  try { req.user = (await extractUser(req)) || req.user; } catch (_) {}
  return next();
}

// ── Middleware: requireAdmin ──────────────────────────────────────────────
//
// AUTH DISABLED on this branch — pass through. Restore the body below
// (extractUser → role check, 401/403 with HTML 403 page) before shipping.
async function requireAdmin(req, res, next) {
  try { req.user = (await extractUser(req)) || req.user; } catch (_) {}
  return next();
}

// ── Middleware: requireSuperAdmin ──────────────────────────────────────────
//
// AUTH DISABLED on this branch — pass through. Restore the body below
// (admin role + X-CFO-Token) before shipping. CFO-token gating on treasury
// endpoints is currently a no-op as a result.
async function requireSuperAdmin(req, res, next) {
  try { req.user = (await extractUser(req)) || req.user || { role: 'superadmin' }; } catch (_) { req.user = req.user || { role: 'superadmin' }; }
  return next();
}

// ── Middleware Factory: pageGuard ──────────────────────────────────────────
//
// AUTH DISABLED on this branch — every HTML page passes through regardless
// of tier (PUBLIC / CLIENT / ADMIN / SUPERADMIN). Restore the original tier
// dispatch (requireClient / requireAdmin / requireSuperAdmin) before
// shipping to production.
function pageGuard() {
  return function pageGuardMiddleware(_req, _res, next) {
    return next();
  };
}

// ── Exports ────────────────────────────────────────────────────────────────
module.exports = {
  pageGuard,
  requireClient,
  requireAdmin,
  requireSuperAdmin,
  extractUser,
  PAGE_TIERS,
};
