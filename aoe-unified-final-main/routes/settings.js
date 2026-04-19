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

const http = require('http');

const store    = require('../lib/settings-store');
const resolver = require('../lib/settings-resolver');
const workflows = require('../lib/workflow-engine');
const configSchema = require('../lib/config-schema');
const configDiff   = require('../lib/config-diff');

const ROOT = path.resolve(__dirname, '..');
const HTML_PATH = path.join(ROOT, 'settings-admin.html');
const JS_DIR    = path.join(ROOT, 'public', 'js');

const JS_MIME = {
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.css':  'text/css; charset=utf-8',
};

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

// Serve JS assets from public/js under the /settings/js/* namespace so
// nginx only has to proxy the /settings/ prefix — no separate /public location.
function serveJsAsset(u, res){
  const rel = decodeURIComponent(u.replace(/^\/settings\/js\//, ''));
  const abs = path.normalize(path.join(JS_DIR, rel));
  if (!abs.startsWith(JS_DIR)){
    res.writeHead(403, { ...HARDENING, 'content-type': 'text/plain' });
    return res.end('forbidden');
  }
  fs.readFile(abs, (err, buf) => {
    if (err){
      res.writeHead(404, { ...HARDENING, 'content-type': 'text/plain' });
      return res.end('not found: ' + u);
    }
    const ct = JS_MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { ...HARDENING, 'content-type': ct, 'cache-control': 'public, max-age=300' });
    res.end(buf);
  });
}

// Proxy to the isolated config-advisor service running on loopback.
// We talk to it ONLY via localhost HTTP; the shared secret is set at boot.
function callAdvisor({ endpoint, method, body, secret, port }){
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      host: '127.0.0.1',
      port: port || parseInt(process.env.ADVISOR_PORT || '4721', 10),
      path: endpoint,
      method,
      headers: Object.assign(
        { 'content-type': 'application/json', 'x-advisor-token': secret },
        payload ? { 'content-length': Buffer.byteLength(payload) } : {},
      ),
      timeout: 20000,
    }, r => {
      let buf = '';
      r.on('data', c => buf += c);
      r.on('end', () => {
        try { resolve({ status: r.statusCode, body: JSON.parse(buf || '{}') }); }
        catch(e){ resolve({ status: r.statusCode, body: { error: 'advisor_parse_failed', raw: buf.slice(0,200) } }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('advisor_timeout')));
    if (payload) req.write(payload);
    req.end();
  });
}

function createRouter({ adminToken, advisorSecret, advisorPort } = {}){
  const TOKEN = adminToken || process.env.ORCHESTRA_ADMIN_TOKEN || '';
  const ADV_SECRET = advisorSecret || process.env.ADVISOR_SHARED_SECRET || '';
  const ADV_PORT   = advisorPort   || parseInt(process.env.ADVISOR_PORT || '4721', 10);

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
    if (req.method === 'GET' && u.startsWith('/settings/js/')){
      serveJsAsset(u, res);
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

    // ---- workflows (tier-scoped) ----
    // Actor is identified via X-Actor-Email (same as super-admin routes), but the
    // engine gates each workflow on the actor's resolved tier/capabilities — a
    // pro user can list+plan pro/free workflows; only super admins see super workflows.
    if (req.method === 'GET' && u === '/settings/workflows'){
      const b = requireBearer(req, TOKEN);
      if (!b.ok) return json(res, b.status, { error: b.error }), true;
      const actor = String(req.headers['x-actor-email'] || '').toLowerCase().trim();
      if (!actor) return json(res, 400, { error: 'missing_actor_email' }), true;
      try {
        const resolved = resolver.resolve(store.load(), actor);
        const list = workflows.listAvailable(resolved).map(w => ({
          id: w.id,
          name: w.name,
          description: w.description,
          category: w.category,
          required_tier: w.required_tier,
          required_capability: w.required_capability || null,
          confirmation_required: !!w.confirmation_required,
          danger: w.danger || null,
          estimated_duration_s: w.estimated_duration_s || null,
          params: w.params || [],
        }));
        json(res, 200, { actor, tier: resolved.tier, count: list.length, workflows: list });
      } catch(e){ json(res, 500, { error: 'workflows_list_failed', detail: e.message }); }
      return true;
    }
    if (req.method === 'GET' && u.startsWith('/settings/workflows/')){
      const b = requireBearer(req, TOKEN);
      if (!b.ok) return json(res, b.status, { error: b.error }), true;
      const actor = String(req.headers['x-actor-email'] || '').toLowerCase().trim();
      if (!actor) return json(res, 400, { error: 'missing_actor_email' }), true;
      const id = u.slice('/settings/workflows/'.length);
      if (!id || id.includes('/')) return json(res, 400, { error: 'invalid_workflow_id' }), true;
      try {
        const resolved = resolver.resolve(store.load(), actor);
        const gate = workflows.canExecute(resolved, id);
        if (!gate.ok) return json(res, 403, gate), true;
        json(res, 200, gate.workflow);
      } catch(e){ json(res, 500, { error: 'workflow_get_failed', detail: e.message }); }
      return true;
    }
    if (req.method === 'POST' && /^\/settings\/workflows\/[^/]+\/plan$/.test(u)){
      const g = requireSuperAdmin(req, TOKEN); // planning is a write-adjacent act — super-admin gate
      // Note: we gate plan() behind super-admin to prevent lower tiers from probing
      // params + discovering internal HTTP shapes. Workflow listing + GET are open
      // to all tiers (filtered by canExecute).
      if (!g.ok){
        // Fall back: if not super, still allow plan for the actor's OWN tier workflows
        const b = requireBearer(req, TOKEN);
        if (!b.ok) return json(res, b.status, { error: b.error }), true;
        const actor = String(req.headers['x-actor-email'] || '').toLowerCase().trim();
        if (!actor) return json(res, 400, { error: 'missing_actor_email' }), true;
        let body;
        try { body = await readBody(req); } catch(e){ return json(res, 400, { error: e.message }), true; }
        const id = u.split('/')[3];
        const resolved = resolver.resolve(store.load(), actor);
        const p = workflows.plan(resolved, id, body.params || {});
        return json(res, p.ok ? 200 : 400, p), true;
      }
      let body;
      try { body = await readBody(req); } catch(e){ return json(res, 400, { error: e.message }), true; }
      const id = u.split('/')[3];
      const resolved = resolver.resolve(g.store, g.email);
      const p = workflows.plan(resolved, id, body.params || {});
      if (p.ok && body.audit !== false){
        store.appendAudit(g.store, {
          actor: g.email, action: 'workflow_plan', target: id,
          next: { params: p.params, danger: p.danger, tier: p.tier_required }
        });
        store.save(g.store);
      }
      json(res, p.ok ? 200 : 400, p);
      return true;
    }

    // ---- config advisor (Panel G) ----
    // GET /settings/config/schema — public allowed-key list (informational)
    if (req.method === 'GET' && u === '/settings/config/schema'){
      const b = requireBearer(req, TOKEN);
      if (!b.ok) return json(res, b.status, { error: b.error }), true;
      const s = configSchema.loadSchema();
      json(res, 200, {
        buckets: s.buckets,
        features: s.features.keys,
        limits:   s.limits.keys,
        ui:       s.ui.keys,
        workflow: s.workflow.keys,
        forbidden_top_level: s.forbidden_top_level,
      });
      return true;
    }

    // GET /settings/advisor/healthz — reports advisor status (super-admin only)
    if (req.method === 'GET' && u === '/settings/advisor/healthz'){
      const g = requireSuperAdmin(req, TOKEN);
      if (!g.ok) return json(res, g.status, { error: g.error }), true;
      try {
        const r = await callAdvisor({ endpoint: '/healthz', method: 'GET', secret: ADV_SECRET, port: ADV_PORT });
        json(res, r.status, r.body);
      } catch(e){
        json(res, 502, { error: 'advisor_unreachable', detail: e.message });
      }
      return true;
    }

    // POST /settings/config/propose — super-admin only (Phase 1: admin dashboard)
    //   body: { target_email?, context: {...} }  (defaults to actor's own email)
    if (req.method === 'POST' && u === '/settings/config/propose'){
      const g = requireSuperAdmin(req, TOKEN);
      if (!g.ok) return json(res, g.status, { error: g.error }), true;
      if (!ADV_SECRET) return json(res, 503, { error: 'advisor_not_configured' }), true;
      let body;
      try { body = await readBody(req); } catch(e){ return json(res, 400, { error: e.message }), true; }
      const target = String(body.target_email || g.email).toLowerCase().trim();
      const context = body.context && typeof body.context === 'object' ? body.context : {};
      const resolved = resolver.resolve(g.store, target);
      const baseline = {
        features: resolved.effective.features || {},
        limits:   resolved.effective.limits   || {},
        ui:       resolved.effective.ui       || {},
      };
      try {
        const r = await callAdvisor({
          endpoint: '/propose', method: 'POST', secret: ADV_SECRET, port: ADV_PORT,
          body: { baseline, context, tier: resolved.tier },
        });
        if (r.status !== 200) return json(res, r.status, r.body), true;
        const d = configDiff.diff(baseline, r.body.proposed);
        json(res, 200, {
          target, tier: resolved.tier, baseline,
          proposed: r.body.proposed,
          diff: d,
          reason: r.body.reason,
          mode: r.body.mode,
          proposal_id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8),
        });
      } catch(e){
        json(res, 502, { error: 'advisor_call_failed', detail: e.message });
      }
      return true;
    }

    // POST /settings/config/commit — super-admin only
    //   body: { target_email, proposed: {...}, reason, proposal_id? }
    // Runs the proposed deltas through configSchema.validate once more, then
    // deep-merges into the user's override bucket. Audit-logged with full diff.
    if (req.method === 'POST' && u === '/settings/config/commit'){
      const g = requireSuperAdmin(req, TOKEN);
      if (!g.ok) return json(res, g.status, { error: g.error }), true;
      let body;
      try { body = await readBody(req); } catch(e){ return json(res, 400, { error: e.message }), true; }
      const target = String(body.target_email || '').toLowerCase().trim();
      if (!target) return json(res, 400, { error: 'missing_target_email' }), true;
      const proposed = body.proposed && typeof body.proposed === 'object' ? body.proposed : null;
      if (!proposed) return json(res, 400, { error: 'missing_proposed' }), true;

      const s = g.store;
      const resolvedTier = resolver.resolve(s, target).tier;
      const val = configSchema.validate(proposed, { tier: resolvedTier });
      if (!val.ok) return json(res, 400, { error: 'proposal_failed_validation', errors: val.errors }), true;

      const prev = s.users[target] ? structuredClone(s.users[target]) : null;
      const existingOverrides = (prev && prev.overrides) || {};
      // Deep-merge per bucket: {features, limits, ui, workflow}
      const newOverrides = Object.assign({}, existingOverrides);
      for (const bucket of Object.keys(proposed)){
        newOverrides[bucket] = Object.assign({}, existingOverrides[bucket] || {}, proposed[bucket] || {});
      }
      s.users[target] = {
        tier: (prev && prev.tier) || 'free',
        overrides: newOverrides,
        granted_at: (prev && prev.granted_at) || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        updated_by: g.email,
      };

      // Compute diff for audit
      const baselineBuckets = {
        features: (prev && prev.overrides && prev.overrides.features) || {},
        limits:   (prev && prev.overrides && prev.overrides.limits)   || {},
        ui:       (prev && prev.overrides && prev.overrides.ui)       || {},
      };
      const d = configDiff.diff(baselineBuckets, proposed);

      store.appendAudit(s, {
        actor: g.email, action: 'config_commit', target,
        prev: baselineBuckets, next: proposed,
        diff_counts: { added: d.added.length, modified: d.modified.length, removed: d.removed.length },
        reason: body.reason || null,
        proposal_id: body.proposal_id || null,
      });
      store.save(s);
      json(res, 200, { ok: true, user: s.users[target], diff: d });
      return true;
    }

    // GET /settings/summary — consolidated controls + reporting + AI summary
    // Super-admin only. Returns everything Panel A–G need in a single call,
    // plus an AI-generated narrative summary (if advisor configured).
    if (req.method === 'GET' && u === '/settings/summary'){
      const g = requireSuperAdmin(req, TOKEN);
      if (!g.ok) return json(res, g.status, { error: g.error }), true;
      const s = g.store;
      const defaults = resolver.loadDefaults();
      const users = s.users || {};
      const tierCounts = {};
      Object.keys(defaults.tiers).forEach(t => tierCounts[t] = 0);
      Object.values(users).forEach(u => { tierCounts[u.tier] = (tierCounts[u.tier] || 0) + 1; });
      const totalUsers = Object.values(tierCounts).reduce((a,b) => a+b, 0);
      const recentAudit = s.audit.slice(-20).reverse();
      const actionCounts = {};
      s.audit.forEach(e => { actionCounts[e.action] = (actionCounts[e.action] || 0) + 1; });
      const resolvedSelf = resolver.resolve(s, g.email);

      // AI narrative summary (best-effort; advisor may be offline)
      let aiSummary = null;
      let aiError = null;
      if (ADV_SECRET){
        try {
          const r = await callAdvisor({
            endpoint: '/propose', method: 'POST', secret: ADV_SECRET, port: ADV_PORT,
            body: {
              baseline: { features: resolvedSelf.effective.features, limits: resolvedSelf.effective.limits, ui: resolvedSelf.effective.ui },
              context: {
                mode: 'summary_request',
                total_users: totalUsers,
                tier_counts: tierCounts,
                audit_recent_actions: recentAudit.map(e => e.action),
                audit_total: s.audit.length,
              },
              tier: resolvedSelf.tier,
            },
          });
          if (r.status === 200){
            aiSummary = {
              reason: r.body.reason,
              proposed_deltas: r.body.proposed,
              mode: r.body.mode,
            };
          } else {
            aiError = r.body.error || `advisor_status_${r.status}`;
          }
        } catch(e){ aiError = e.message; }
      }

      json(res, 200, {
        generated_at: new Date().toISOString(),
        actor: g.email,
        actor_tier: resolvedSelf.tier,
        total_users: totalUsers,
        tier_counts: tierCounts,
        audit: {
          total: s.audit.length,
          recent: recentAudit,
          action_counts: actionCounts,
        },
        ai_summary: aiSummary,
        ai_error: aiError,
      });
      return true;
    }

    // Fell through — unknown /settings/* path
    json(res, 404, { error: 'unknown_settings_route', method: req.method, path: u });
    return true;
  }

  return { handle };
}

module.exports = { createRouter };
