/**
 * BRIDGE AI OS — Access Control Middleware
 *
 * 4-tier page access: PUBLIC, CLIENT, ADMIN, SUPERADMIN
 * Integrates with user-identity.js for token verification.
 */

'use strict';

const crypto = require('crypto');
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
    '/payment-success.html', '/payment-cancel.html', '/welcome.html', '/welcome-tour.html', '/onboarding.html', '/sitemap.html',
    '/docs.html', '/50-applications.html', '/applications.html', '/404.html', '/offline.html',
    '/platforms.html', '/bridge-home.html', '/ehsa-home.html', '/aurora-home.html', '/hospital-home.html',
    '/aid-home.html', '/rootedearth-home.html', '/portal.html', '/voice.html'],

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
  if (!token && req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) return null;

  // Try Bridge JWT first (backward compat)
  const bridgeUser = await userDb.verifyAuthToken(token);
  if (bridgeUser) return bridgeUser;

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
      return dbUser;
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

async function requireClient(req, res, next) {
  const user = await extractUser(req);
  if (!user || user.plan === 'visitor') {
    if (wantsHtml(req)) {
      const redirect = encodeURIComponent(req.originalUrl || req.path);
      return res.redirect('/onboarding.html?redirect=' + redirect);
    }
    return res.status(401).json({ ok: false, error: 'Authentication required. Upgrade from visitor plan.' });
  }
  req.user = user;
  next();
}

// ── Middleware: requireAdmin ──────────────────────────────────────────────

async function requireAdmin(req, res, next) {
  const user = await extractUser(req);

  // Check admin token header
  const adminToken = req.headers['x-admin-token'];
  if (adminToken && process.env.ADMIN_TOKEN && safeCompare(adminToken, process.env.ADMIN_TOKEN)) {
    req.user = user || { role: 'admin' };
    return next();
  }

  // Check bridge internal secret header
  const bridgeSecret = req.headers['x-bridge-secret'];
  if (bridgeSecret && process.env.BRIDGE_INTERNAL_SECRET && safeCompare(bridgeSecret, process.env.BRIDGE_INTERNAL_SECRET)) {
    req.user = user || { role: 'admin' };
    return next();
  }

  // Check user role
  if (user && (user.role === 'admin' || user.role === 'superadmin')) {
    req.user = user;
    return next();
  }

  if (wantsHtml(req)) {
    return res.status(403).send('<!DOCTYPE html><html><body style="background:#050a0f;color:#ff3c5a;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh"><h1>403 — Admin Access Required</h1></body></html>');
  }
  return res.status(403).json({ ok: false, error: 'Admin access required' });
}

// ── Middleware: requireSuperAdmin ──────────────────────────────────────────

async function requireSuperAdmin(req, res, next) {
  const user = await extractUser(req);

  // Must pass admin check first (user role or headers)
  const isAdmin = (user && (user.role === 'admin' || user.role === 'superadmin'))
    || (req.headers['x-admin-token'] && process.env.ADMIN_TOKEN && safeCompare(req.headers['x-admin-token'], process.env.ADMIN_TOKEN))
    || (req.headers['x-bridge-secret'] && process.env.BRIDGE_INTERNAL_SECRET && safeCompare(req.headers['x-bridge-secret'], process.env.BRIDGE_INTERNAL_SECRET));

  if (!isAdmin) {
    if (wantsHtml(req)) {
      return res.status(403).send('<!DOCTYPE html><html><body style="background:#050a0f;color:#ff3c5a;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh"><h1>403 — SuperAdmin Access Required</h1></body></html>');
    }
    return res.status(403).json({ ok: false, error: 'SuperAdmin access required' });
  }

  // Additionally require CFO token
  const cfoToken = req.headers['x-cfo-token'];
  if (!cfoToken || !process.env.CFO_TOKEN || !safeCompare(cfoToken, process.env.CFO_TOKEN)) {
    if (wantsHtml(req)) {
      return res.status(403).send('<!DOCTYPE html><html><body style="background:#050a0f;color:#ff3c5a;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh"><h1>403 — CFO Authorization Required</h1></body></html>');
    }
    return res.status(403).json({ ok: false, error: 'CFO authorization required (X-CFO-Token header missing or invalid)' });
  }

  req.user = user || { role: 'superadmin' };
  next();
}

// ── Middleware Factory: pageGuard ──────────────────────────────────────────

function pageGuard() {
  return async function pageGuardMiddleware(req, res, next) {
    // Only guard GET requests for .html pages or exact path matches
    if (req.method !== 'GET') return next();

    const reqPath = req.path;

    // Skip non-page requests (API, assets, scripts)
    if (reqPath.startsWith('/api/') || reqPath.startsWith('/assets/')) return next();
    if (!reqPath.endsWith('.html') && reqPath !== '/') return next();

    const tier = PATH_TO_TIER[reqPath];

    // PUBLIC pages or undefined tier for root
    if (tier === 'PUBLIC') return next();

    // CLIENT tier
    if (tier === 'CLIENT' || !tier) {
      return requireClient(req, res, next);
    }

    // ADMIN tier
    if (tier === 'ADMIN') {
      return requireAdmin(req, res, next);
    }

    // SUPERADMIN tier
    if (tier === 'SUPERADMIN') {
      return requireSuperAdmin(req, res, next);
    }

    // Fallback: treat as CLIENT
    return requireClient(req, res, next);
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
