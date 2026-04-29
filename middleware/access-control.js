/**
 * BRIDGE AI OS — Access Control Middleware
 *
 * 4-tier page access: PUBLIC, CLIENT, ADMIN, SUPERADMIN
 * Integrates with user-identity.js for token verification.
 */

'use strict';

const crypto = require('crypto');
const path = require('path');
const jwt = require('jsonwebtoken');
const userDb = require('../lib/user-identity');
const {
  applySuperAdminProfile,
  isSuperAdminRole,
  isPrivilegedAdminRole,
  isSuperUserEmail,
} = require('../shared/superusers');
const { isAuthBypassed, bypassJwtUser, logBypassOnce } = require('../shared/auth-bypass');

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

  if (isAuthBypassed()) {
    logBypassOnce();
    const j = bypassJwtUser();
    return applySuperAdminProfile({
      id: j.sub,
      email: j.email,
      name: j.name,
      role: j.role,
      plan: j.plan,
      permissions: j.permissions,
      tenant: j.tenant,
    });
  }

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
    return applySuperAdminProfile(bridgeUser);
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
      return applySuperAdminProfile(dbUser);
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
        return applySuperAdminProfile({
          id: decoded.sub,
          email: decoded.email || null,
          role: decoded.role || 'member',
          plan: decoded.plan || 'client',
          permissions: decoded.permissions,
          tenant: decoded.tenant,
          name: decoded.name,
        });
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
// Requires authenticated user with at least 'client' plan level access.
// Redirects unauthenticated users to onboarding.
async function requireClient(req, res, next) {
  const user = await extractUser(req);
  if (!user) {
    if (wantsHtml(req)) {
      return res.redirect('/onboarding.html');
    }
    return res.status(401).json({ ok: false, error: 'Authentication required' });
  }
  req.user = user;
  next();
}

// ── Middleware: requireAdmin ──────────────────────────────────────────────
//
// Requires authenticated user with admin role.
async function requireAdmin(req, res, next) {
  const user = await extractUser(req);
  if (!user) {
    if (wantsHtml(req)) {
      return res.status(403).sendFile(path.join(__dirname, '../public/403.html'));
    }
    return res.status(401).json({ ok: false, error: 'Authentication required' });
  }
  const isAdmin = isPrivilegedAdminRole(user.role) || user.isSuperUser || isSuperUserEmail(user.email);
  if (!isAdmin) {
    if (wantsHtml(req)) {
      return res.status(403).sendFile(path.join(__dirname, '../public/403.html'));
    }
    return res.status(403).json({ ok: false, error: 'Admin access required' });
  }
  req.user = user;
  next();
}

// ── Middleware: requireSuperAdmin ──────────────────────────────────────────
//
// Requires authenticated user with superadmin role and X-CFO-Token header.
async function requireSuperAdmin(req, res, next) {
  const user = await extractUser(req);
  if (!user) {
    if (wantsHtml(req)) {
      return res.status(403).sendFile(path.join(__dirname, '../public/403.html'));
    }
    return res.status(401).json({ ok: false, error: 'Authentication required' });
  }
  const isSuperAdmin = isSuperAdminRole(user.role) || user.isSuperUser || isSuperUserEmail(user.email);
  if (!isSuperAdmin) {
    if (wantsHtml(req)) {
      return res.status(403).sendFile(path.join(__dirname, '../public/403.html'));
    }
    return res.status(403).json({ ok: false, error: 'Superadmin access required' });
  }
  if (isSuperUserEmail(user.email) || user.permissions?.includes?.('*')) {
    req.user = user;
    return next();
  }
  const cfoToken = req.headers['x-cfo-token'];
  if (!cfoToken || !safeCompare(cfoToken, process.env.CFO_TOKEN || '')) {
    if (wantsHtml(req)) {
      return res.status(403).sendFile(path.join(__dirname, '../public/403.html'));
    }
    return res.status(403).json({ ok: false, error: 'CFO token required' });
  }
  req.user = user;
  next();
}

// ── Middleware Factory: pageGuard ──────────────────────────────────────────
//
// Enforces 4-tier page access control based on PATH_TO_TIER mapping.
function pageGuard() {
  return async function pageGuardMiddleware(req, res, next) {
    const reqPath = req.path;
    const tier = PATH_TO_TIER[reqPath];

    // If path not in tier mapping, allow through (dynamic routes, API endpoints, etc.)
    if (!tier) {
      return next();
    }

    // PUBLIC tier - no authentication required
    if (tier === 'PUBLIC') {
      return next();
    }

    // CLIENT tier - requires authentication
    if (tier === 'CLIENT') {
      const user = await extractUser(req);
      if (!user) {
        if (wantsHtml(req)) {
          return res.redirect('/onboarding.html');
        }
        return res.status(401).json({ ok: false, error: 'Authentication required' });
      }
      req.user = user;
      return next();
    }

    // ADMIN tier - requires admin role
    if (tier === 'ADMIN') {
      const user = await extractUser(req);
      if (!user) {
        if (wantsHtml(req)) {
          return res.status(403).sendFile(path.join(__dirname, '../public/403.html'));
        }
        return res.status(401).json({ ok: false, error: 'Authentication required' });
      }
      const isAdmin = isPrivilegedAdminRole(user.role) || user.isSuperUser || isSuperUserEmail(user.email);
      if (!isAdmin) {
        if (wantsHtml(req)) {
          return res.status(403).sendFile(path.join(__dirname, '../public/403.html'));
        }
        return res.status(403).json({ ok: false, error: 'Admin access required' });
      }
      req.user = user;
      return next();
    }

    // SUPERADMIN tier - requires superadmin role + CFO token
    if (tier === 'SUPERADMIN') {
      const user = await extractUser(req);
      if (!user) {
        if (wantsHtml(req)) {
          return res.status(403).sendFile(path.join(__dirname, '../public/403.html'));
        }
        return res.status(401).json({ ok: false, error: 'Authentication required' });
      }
      const isSuperAdmin = isSuperAdminRole(user.role) || user.isSuperUser || isSuperUserEmail(user.email);
      if (!isSuperAdmin) {
        if (wantsHtml(req)) {
          return res.status(403).sendFile(path.join(__dirname, '../public/403.html'));
        }
        return res.status(403).json({ ok: false, error: 'Superadmin access required' });
      }
      // Platform super-admins (allowlist / role) bypass CFO hardware token for day-to-day ops
      if (isSuperUserEmail(user.email) || user.permissions?.includes?.('*')) {
        req.user = user;
        return next();
      }
      const cfoToken = req.headers['x-cfo-token'];
      if (!cfoToken || !safeCompare(cfoToken, process.env.CFO_TOKEN || '')) {
        if (wantsHtml(req)) {
          return res.status(403).sendFile(path.join(__dirname, '../public/403.html'));
        }
        return res.status(403).json({ ok: false, error: 'CFO token required' });
      }
      req.user = user;
      return next();
    }

    // Unknown tier - allow through (safe default)
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
