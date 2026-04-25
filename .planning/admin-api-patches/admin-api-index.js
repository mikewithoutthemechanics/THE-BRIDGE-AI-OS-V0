// CANDIDATE replacement for C:\aoe-unified-final\services\admin-api\index.js
// DO NOT run from this location — this is a patch artifact awaiting explicit approval
// to copy to the live dir. See README.md in this folder.
//
// Changes vs. the current live file:
//   - Single source of truth: ROUTES array carries path + method + required + handler
//   - No duplication between REQUIRED set and ROUTES list (contract fragmentation fix)
//   - Boot-time validation: handler typeof check, method:path uniqueness, required-route presence
//   - Object.freeze(ROUTES) prevents mutation after boot
//   - Versioned observability surface at GET /__routes
//   - Handlers extracted as named functions (no more inline arrow route bodies)

const express = require('express');
const path = require('path');
const { buildOverview } = require('./overview');
const { pm2List, pm2Action } = require('./pm2Reader');

const app = express();
app.use(express.json({ limit: '64kb' }));

const DASH = path.join(__dirname, '../../apps/admin-dashboard');
app.use('/', express.static(DASH));

// ── Handlers (named, testable, swappable) ──────────────────────────────
function healthHandler(_q, r) {
  r.json({ ok: true, service: 'admin-api' });
}

async function overviewHandler(_q, r) {
  try { r.json(await buildOverview()); }
  catch (e) { r.status(500).json({ error: e.message }); }
}

async function topologyHandler(_q, r) {
  let procs = [];
  try { procs = await pm2List(); } catch { /* pm2Reader already logs */ }
  const nodes = procs.map(p => ({ id: p.name, status: p.pm2_env?.status || 'unknown' }));
  const candidates = [
    ['bridge-gateway', 'auth-service'],  ['bridge-gateway', 'super-brain'],
    ['bridge-gateway', 'god-mode-system'], ['bridge-gateway', 'treasury'],
    ['bridge-gateway', 'svg-engine'],    ['bridge-gateway', 'ban-engine'],
    ['bridge-gateway', 'terminal-proxy'], ['bridge-gateway', 'admin-api'],
    ['bridge-gateway', 'config-service'],
    ['super-brain', 'god-mode-system'],  ['god-mode-system', 'config-service'],
  ];
  const ids = new Set(nodes.map(n => n.id));
  const edges = candidates.filter(([a, b]) => ids.has(a) && ids.has(b)).map(([from, to]) => ({ from, to }));
  r.json({ nodes, edges });
}

async function restartHandler(q, r) {
  try { r.json({ ok: true, ...(await pm2Action(q.params.name, 'restart')) }); }
  catch (e) { r.status(400).json({ error: e.message }); }
}

async function reloadHandler(q, r) {
  try { r.json({ ok: true, ...(await pm2Action(q.params.name, 'reload')) }); }
  catch (e) { r.status(400).json({ error: e.message }); }
}

function streamHandler(q, r) {
  r.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  r.flushHeaders();
  const send = async () => {
    try {
      const data = await buildOverview();
      r.write('data: ' + JSON.stringify({ type: 'overview', from: 'admin-api', payload: data }) + '\n\n');
    } catch { /* send loop stays alive; transient serialize errors swallowed by design */ }
  };
  send();
  const id = setInterval(send, 2000);
  q.on('close', () => { clearInterval(id); r.end(); });
}

// ── Unified route registry — single source of truth ─────────────────────
const ROUTE_VERSION = 'v1';

const ROUTES = Object.freeze([
  { method: 'get',  path: '/health',                        required: true,  handler: healthHandler   },
  { method: 'get',  path: '/admin/overview',                required: true,  handler: overviewHandler },
  { method: 'get',  path: '/admin/topology',                required: true,  handler: topologyHandler },
  { method: 'get',  path: '/events/stream',                 required: true,  handler: streamHandler   },
  { method: 'post', path: '/admin/services/:name/restart',  required: false, handler: restartHandler  },
  { method: 'post', path: '/admin/services/:name/reload',   required: false, handler: reloadHandler   },
]);

// ── Contract validation (runs before app.listen; exit on any failure) ────
const seenKeys = new Set();
const missingRequired = [];

for (const r of ROUTES) {
  const key = r.method + ':' + r.path;
  if (seenKeys.has(key)) {
    console.error('[admin-api] BOOT FAILURE — duplicate route:', key);
    process.exit(1);
  }
  seenKeys.add(key);

  if (typeof r.handler !== 'function') {
    console.error('[admin-api] BOOT FAILURE — invalid handler for', r.method.toUpperCase(), r.path);
    process.exit(1);
  }
}
// In this design a missing required route can only occur if someone removes
// the entry from ROUTES entirely. Check by path membership, not handler presence.
const paths = new Set(ROUTES.map(r => r.path));
for (const r of ROUTES) {
  if (r.required && !paths.has(r.path)) missingRequired.push(r.path);
}
// Defensive secondary check — explicit required-path list derived from ROUTES,
// so refactors that accidentally drop a required entry fail fast at boot.
const DECLARED_REQUIRED = ROUTES.filter(r => r.required).map(r => r.path);
const EXPECTED_REQUIRED = ['/health', '/admin/overview', '/admin/topology', '/events/stream'];
const contractGap = EXPECTED_REQUIRED.filter(p => !DECLARED_REQUIRED.includes(p));
if (contractGap.length) {
  console.error('[admin-api] BOOT FAILURE — route registry drift, missing:', contractGap);
  process.exit(1);
}

// ── Bind to Express ─────────────────────────────────────────────────────
for (const r of ROUTES) app[r.method](r.path, r.handler);

// Observability surface — lets ops confirm contract matches what's wired
app.get('/__routes', (_q, r) => {
  r.json({
    version: ROUTE_VERSION,
    service: 'admin-api',
    routes: ROUTES.map(({ method, path, required }) => ({ method, path, required: !!required })),
  });
});

console.log('[admin-api] route registry ' + ROUTE_VERSION + ' OK — ' + ROUTES.length + ' routes wired');

const PORT = process.env.ADMIN_PORT || 4011;
app.listen(PORT, '127.0.0.1', () => console.log('[admin-api] 127.0.0.1:' + PORT));
