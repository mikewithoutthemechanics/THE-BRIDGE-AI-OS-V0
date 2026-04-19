// routes/settings.js — stdlib http handler for /settings/* endpoints
//
// Matches the server.js style: no Express, no dependencies, direct (req, res).
// Export shape:  { handle(req, res): boolean }  — returns true if handled.
//
// Endpoints:
//   GET   /settings/admin                 -> serves settings-admin.html
//   GET   /settings/healthz               -> {ok, store_path}
//   GET   /settings/defaults              -> raw defaults (read-only)
//   GET   /settings/resolve?email=...     -> effective settings for user
//   GET   /settings/runtime               -> raw runtime store (super-admin only)
//   GET   /settings/audit?limit=N         -> audit log tail (super-admin only)
//   POST  /settings/override              -> upsert user override  (super-admin only)
//                                             body: {email, tier?, overrides?}
//   POST  /settings/tier                  -> set user tier         (super-admin only)
//                                             body: {email, tier}
//   POST  /settings/super-admin/grant     -> promote user          (super-admin only)
//                                             body: {email}
//   POST  /settings/super-admin/revoke    -> demote user           (super-admin only)
//                                             body: {email, new_tier?}
//
// Auth:
//   - Bearer ADMIN_TOKEN required (matches existing /admin proxy gate)
//   - X-Actor-Email must resolve to a super_admin in the runtime store
//   - Exception: GET /settings/resolve?email=<self> and /settings/defaults
//     require only Bearer token (informational)

const fs   = require('fs');
const path = require('path');

const store    = require('../lib/settings-store');
const resolver = require('../lib/settings-resolver');

const ROOT = path.resolve(__dirname, '..');
const HTML_PATH = path.join(ROOT, 'settings-admin.html');

const HARDENING = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
  'cache-control': 'no-store',
};

function json(res, status, body){
  res.writeHead(status, { ...HARDENING, 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req){
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', c => { buf += c; if (buf.length > 65536){ reject(new Error('body_too_large')); req.destroy(); }});
    req.on('end',  () => {
      if (!buf) return resolve({});
      try { resolve(JSON.parse(buf)); } catch { reject(new Error('invalid_json')); }
    });
    req.on('error', reject);
  });
}

function requireBearer(req, expected){
  if (!expected) return { ok: true };  // token gating disabled (matches server.js pattern)
  const hdr = req.headers.authorization || '';
  if (hdr !== `Bearer ${expected}`) return { ok: false, status: 401, error: 'admin_auth_required' };
  return { ok: true };
}

function requireSuperAdmin(req, bearerExpected){
  const b = requireBearer(req, bearerExpected);
  if (!b.ok) return b;
  const email = String(req.headers['x-actor-email'] || '').toLowerCase().trim();
  if (!email) return { ok: false, status: 400, error: 'missing_actor_email' };
  const s = store.load();
  if (!store.isSuperAdmin(s, email)){
    return { ok: false, status: 403, error: 'not_super_admin', actor: email };
  }
  return { ok: true, email, store: s };
}

function qs(url){
  const i = url.indexOf('?');
  if (i < 0) return {};
  const p = {};
  for (const kv of url.slice(i+1).split('&')){
    const [k, v] = kv.split('=');
    p[decodeURIComponent(k)] = decodeURIComponent(v || '');
  }
  return p;
}

function serveHtml(res){
  fs.readFile(HTML_PATH, (err, buf) => {
    if (err){
      res.writeHead(500, { ...HARDENING, 'content-type': 'text/plain' });
      return res.end('settings-admin.html not found');
    }
    res.writeHead(200, { ...HARDENING, 'content-type': 'text/html; charset=utf-8' });
    res.end(buf);
  });
}

function createRouter({ adminToken } = {}){
  const TOKEN = adminToken || process.env.ORCHESTRA_ADMIN_TOKEN || '';

  async function handle(req, res){
    const u = req.url.split('?')[0];
    if (!u.startsWith('/settings')) return false;

    // ---- public-ish (bearer only) ----
    if (req.method === 'GET' && u === '/settings/healthz'){
      json(res, 200, { ok: true, store_path: store.STORE_PATH, defaults_path: resolver.DEFAULTS_PATH });
      return true;
    }
    if (req.method === 'GET' && u === '/settings/admin'){
      serveHtml(res);
      return true;
    }
    if (req.method === 'GET' && u === '/settings/defaults'){
      const b = requireBearer(req, TOKEN);
      if (!b.ok) return json(res, b.status, { error: b.error }), true;
      try { json(res, 200, resolver.loadDefaults()); }
      catch(e){ json(res, 500, { error: 'defaults_load_failed', detail: e.message }); }
      return true;
    }
    if (req.method === 'GET' && u === '/settings/resolve'){
      const b = requireBearer(req, TOKEN);
      if (!b.ok) return json(res, b.status, { error: b.error }), true;
      const { email } = qs(req.url);
      if (!email) return json(res, 400, { error: 'missing_email' }), true;
      try {
        const runtime = store.load();
        json(res, 200, resolver.resolve(runtime, email));
      } catch(e){ json(res, 500, { error: 'resolve_failed', detail: e.message }); }
      return true;
    }

    // ---- super-admin only ----
    if (req.method === 'GET' && u === '/settings/runtime'){
      const g = requireSuperAdmin(req, TOKEN);
      if (!g.ok) return json(res, g.status, { error: g.error, actor: g.actor }), true;
      json(res, 200, g.store);
      return true;
    }
    if (req.method === 'GET' && u === '/settings/audit'){
      const g = requireSuperAdmin(req, TOKEN);
      if (!g.ok) return json(res, g.status, { error: g.error }), true;
      const { limit } = qs(req.url);
      const n = Math.min(Math.max(parseInt(limit || '100', 10), 1), 1000);
      json(res, 200, { entries: g.store.audit.slice(-n), total: g.store.audit.length });
      return true;
    }
    if (req.method === 'POST' && u === '/settings/override'){
      const g = requireSuperAdmin(req, TOKEN);
      if (!g.ok) return json(res, g.status, { error: g.error }), true;
      let body;
      try { body = await readBody(req); } catch(e){ return json(res, 400, { error: e.message }), true; }
      const target = String(body.email || '').toLowerCase().trim();
      if (!target) return json(res, 400, { error: 'missing_email' }), true;
      const s = g.store;
      const prev = s.users[target] ? structuredClone(s.users[target]) : null;
      s.users[target] = {
        tier:      body.tier || (prev && prev.tier) || 'free',
        overrides: body.overrides !== undefined ? body.overrides : (prev && prev.overrides) || {},
        granted_at: (prev && prev.granted_at) || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        updated_by: g.email,
      };
      store.appendAudit(s, { actor: g.email, action: 'override', target, prev, next: s.users[target] });
      store.save(s);
      json(res, 200, { ok: true, user: s.users[target] });
      return true;
    }
    if (req.method === 'POST' && u === '/settings/tier'){
      const g = requireSuperAdmin(req, TOKEN);
      if (!g.ok) return json(res, g.status, { error: g.error }), true;
      let body;
      try { body = await readBody(req); } catch(e){ return json(res, 400, { error: e.message }), true; }
      const target = String(body.email || '').toLowerCase().trim();
      const tier = String(body.tier || '').toLowerCase().trim();
      if (!target || !tier) return json(res, 400, { error: 'missing_email_or_tier' }), true;
      const defaults = resolver.loadDefaults();
      if (!defaults.tiers[tier]) return json(res, 400, { error: 'unknown_tier', known: Object.keys(defaults.tiers) }), true;
      const s = g.store;
      const prev = s.users[target] ? structuredClone(s.users[target]) : null;
      s.users[target] = {
        tier,
        overrides: (prev && prev.overrides) || {},
        granted_at: (prev && prev.granted_at) || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        updated_by: g.email,
      };
      store.appendAudit(s, { actor: g.email, action: 'tier_change', target, prev, next: s.users[target] });
      store.save(s);
      json(res, 200, { ok: true, user: s.users[target] });
      return true;
    }
    if (req.method === 'POST' && u === '/settings/super-admin/grant'){
      const g = requireSuperAdmin(req, TOKEN);
      if (!g.ok) return json(res, g.status, { error: g.error }), true;
      let body;
      try { body = await readBody(req); } catch(e){ return json(res, 400, { error: e.message }), true; }
      const target = String(body.email || '').toLowerCase().trim();
      if (!target) return json(res, 400, { error: 'missing_email' }), true;
      const s = g.store;
      const prev = s.users[target] ? structuredClone(s.users[target]) : null;
      s.users[target] = {
        tier: 'super_admin',
        overrides: (prev && prev.overrides) || {},
        granted_at: new Date().toISOString(),
        granted_by: g.email,
      };
      store.appendAudit(s, { actor: g.email, action: 'super_admin_grant', target, prev, next: s.users[target] });
      store.save(s);
      json(res, 200, { ok: true, user: s.users[target] });
      return true;
    }
    if (req.method === 'POST' && u === '/settings/super-admin/revoke'){
      const g = requireSuperAdmin(req, TOKEN);
      if (!g.ok) return json(res, g.status, { error: g.error }), true;
      let body;
      try { body = await readBody(req); } catch(e){ return json(res, 400, { error: e.message }), true; }
      const target = String(body.email || '').toLowerCase().trim();
      const newTier = String(body.new_tier || 'pro').toLowerCase().trim();
      if (!target) return json(res, 400, { error: 'missing_email' }), true;
      const s = g.store;
      // Prevent removing the last super admin
      const admins = store.listSuperAdmins(s);
      if (admins.length === 1 && admins[0] === target){
        return json(res, 400, { error: 'cannot_revoke_last_super_admin' }), true;
      }
      const prev = s.users[target] ? structuredClone(s.users[target]) : null;
      if (!prev || prev.tier !== 'super_admin'){
        return json(res, 400, { error: 'not_a_super_admin', target }), true;
      }
      s.users[target] = {
        ...prev,
        tier: newTier,
        revoked_at: new Date().toISOString(),
        revoked_by: g.email,
      };
      store.appendAudit(s, { actor: g.email, action: 'super_admin_revoke', target, prev, next: s.users[target] });
      store.save(s);
      json(res, 200, { ok: true, user: s.users[target] });
      return true;
    }

    // Fell through — unknown /settings/* path
    json(res, 404, { error: 'unknown_settings_route', method: req.method, path: u });
    return true;
  }

  return { handle };
}

module.exports = { createRouter };
