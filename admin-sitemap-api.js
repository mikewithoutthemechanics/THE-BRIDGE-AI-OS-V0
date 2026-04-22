'use strict';

// admin-sitemap-api.js — Self-contained mount for GET /api/admin/sitemap
// Author: Bridge AI / 2026-04-18
// Purpose: keep /admin-sitemap page synced with public/*.html (was hardcoded
// to 93 pages, now live-reads filesystem → 144 pages as of 2026-04-18).
//
// Integration (single line added to gateway.js, before app.listen):
//   require('./admin-sitemap-api').mount(app, gatewayAuth);
//
// Safety:
//   - No side effects on require. Only runs when mount() is called.
//   - 60s in-memory cache on filesystem read; readdir is cheap anyway.
//   - Uses req.user.role check after gatewayAuth; returns 403 for non-admin.

const fs = require('fs');
const path = require('path');

let PAGE_TIERS = {};
try {
  const ac = require('./middleware/access-control');
  PAGE_TIERS = ac.PAGE_TIERS || ac.default?.PAGE_TIERS || {};
} catch (e) {
  console.warn('[admin-sitemap-api] could not load middleware/access-control:', e.message);
}

const pathToTier = {};
for (const [tier, paths] of Object.entries(PAGE_TIERS)) {
  for (const p of paths || []) pathToTier[p] = tier;
}

const SECTION_PATTERNS = [
  { section: 'Core',                re: /^\/(home|landing|index|portal|voice|console|checkout|welcome|welcome-tour|pricing|join|payment|avatar|twin|digital-twin|ui)(-|\.html|$)/i },
  { section: 'Verticals',           re: /^\/(bridge-home|ehsa|aurora|hospital|aid|ban|rootedearth|supac|ubi|abaas|platforms|iot|esim)/i },
  { section: 'Business Suite',      re: /^\/(crm|invoicing|quotes|legal|marketing|tickets|vendors|customers|workforce|leadgen|leads|affiliate|onboarding|corporate|brand|billing|settings|profile|projects)/i },
  { section: 'Economy & DeFi',      re: /^\/(economy|defi|trading|wallet|banks|treasury|payment|governance|marketplace|bank-ledger|affiliate-flow|tvm|tokenomics|vault)/i },
  { section: 'Admin & Intelligence', re: /^\/(admin|auth-dashboard|intelligence|executive|aoe-dashboard|bridge-audit|admin-sitemap|carrier-admin|admin-esim|admin-hub|admin-withdraw|godmode)/i },
  { section: 'Agents & System',     re: /^\/(agents|neurolink|registry|topology|control|command-center|system-status|infra|terminal|logs|view-logs|supadash|gateway|runtime|svg-engine|hitl|pipeline)/i },
  { section: 'Demo / Experimental', re: /^\/(anatomical|face|activation|activate|interactive-demo|navigation-implementation|navigation-validation|demo|wizard|claude-partner|devin-partner|agent-profiles|apps-dashboard|dashboard|agent-economy|sql-bridge|twin-create|ai-agents|linea)/i },
  { section: 'Settings & Docs',     re: /^\/(docs|sitemap|view|50-applications|applications|404|offline|api-developers|automation-hub|contact-sales|auth-callback|free-start|free-access|outputs)/i }
];

function humanize(p) {
  return p.replace(/^\//, '').replace(/\.html$/, '').replace(/[_-]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function categorize(page) {
  for (const { section, re } of SECTION_PATTERNS) if (re.test(page)) return section;
  return 'Other';
}

const _cache = { ts: 0, data: null };

async function handler(_req, res) {
  try {
    if (_cache.data && Date.now() - _cache.ts < 60_000) {
      return res.json(_cache.data);
    }
    const pubDir = path.join(__dirname, 'public');
    const files = await fs.promises.readdir(pubDir);
    const pages = files.filter(f => f.endsWith('.html'))
      .map(f => '/' + f)
      .filter(p => !/^\/(BACKUP|backup|old-|_)/.test(p));

    const byCategory = {};
    for (const p of pages.sort()) {
      const section = categorize(p);
      const tier = pathToTier[p] || 'CLIENT';
      byCategory[section] = byCategory[section] || [];
      byCategory[section].push({
        name: humanize(p),
        href: p,
        tier: tier.toLowerCase(),
        cat: (tier === 'ADMIN' || tier === 'SUPERADMIN') ? 'admin'
           : section === 'Core' ? 'core'
           : section === 'Verticals' ? 'vertical'
           : (section.startsWith('Business') || section.startsWith('Economy')) ? 'business'
           : section.startsWith('Agents') ? 'system'
           : 'other'
      });
    }

    const data = { total: pages.length, generated_at: new Date().toISOString(), sections: byCategory };
    _cache.data = data;
    _cache.ts = Date.now();
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}

let _isSuperUserEmail = null;
try {
  _isSuperUserEmail = require('./shared/superusers').isSuperUserEmail;
} catch (_) {}

function requireAdmin(req, res, next) {
  const user = req && req.user;
  const role = String((user && (user.role || user.authority)) || '').toLowerCase();
  if (role === 'admin' || role === 'superadmin') return next();
  if (_isSuperUserEmail && user && user.email && _isSuperUserEmail(user.email)) return next();
  return res.status(403).json({ ok: false, error: 'admin role required' });
}

function mount(app, gatewayAuth) {
  if (!app || typeof app.get !== 'function') {
    throw new Error('admin-sitemap-api.mount: first arg must be an Express app');
  }
  if (typeof gatewayAuth !== 'function') {
    throw new Error('admin-sitemap-api.mount: second arg must be the gatewayAuth factory');
  }
  app.get('/api/admin/sitemap', gatewayAuth(), requireAdmin, handler);
  console.log('[admin-sitemap-api] GET /api/admin/sitemap mounted (auth + admin role required)');
}

module.exports = { mount, handler, categorize, humanize, SECTION_PATTERNS };
