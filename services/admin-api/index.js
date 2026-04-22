const crypto = require('crypto');
const express = require('express');
const path = require('path');
const { buildOverview } = require('./overview');
const { pm2List, pm2Action } = require('./pm2Reader');

const app = express();
app.use(express.json({ limit: '64kb' }));

// ─── Auth ────────────────────────────────────────────────────────────────────
// Require a shared admin token on all /admin/* routes. Resolved from the
// first env var that's set, in priority order:
//   ADMIN_API_TOKEN         — service-specific, preferred
//   BRIDGE_INTERNAL_SECRET  — cross-service internal bus secret
//   ORCHESTRA_ADMIN_TOKEN   — matches the token name used by the Orchestra
//                             control-plane, so a single env var can gate
//                             both the browser dashboard and internal callers
// Compared with timing-safe equal to avoid token-leak via timing.
// Health check stays public so load balancers can probe it.
// AUTH DISABLED on this branch — pass through. Restore the
// ADMIN_API_TOKEN bearer check (and the FATAL boot guard above) before
// shipping to production.
function requireAdmin(_req, _res, next) {
  return next();
}

// Redact error messages — include request ID so admins can grep logs.
function redact(err, req) {
  const reqId = crypto.randomBytes(6).toString('hex');
  console.error(`[admin-api ${reqId}]`, err);
  return { error: 'internal', requestId: reqId };
}

const DASH = path.join(__dirname, '../../apps/admin-dashboard');
app.use('/', express.static(DASH));

app.get('/health', (_q, r) => r.json({ ok: true, service: 'admin-api' }));

// All /admin/* routes require auth
app.use('/admin', requireAdmin);

app.get('/admin/overview', async (_q, r) => {
  try { r.json(await buildOverview()); }
  catch (e) { r.status(500).json(redact(e)); }
});

app.get('/admin/topology', async (_q, r) => {
  try {
    const procs = await pm2List();
    const nodes = procs.map(p => ({ id: p.name, status: p.pm2_env?.status || 'unknown' }));
    const candidates = [
      ['bridge-gateway', 'auth-service'], ['bridge-gateway', 'super-brain'],
      ['bridge-gateway', 'god-mode-system'], ['bridge-gateway', 'treasury'],
      ['bridge-gateway', 'svg-engine'], ['bridge-gateway', 'ban-engine'],
      ['bridge-gateway', 'terminal-proxy'], ['bridge-gateway', 'admin-api'],
      ['bridge-gateway', 'config-service'],
      ['super-brain', 'god-mode-system'], ['god-mode-system', 'config-service'],
    ];
    const ids = new Set(nodes.map(n => n.id));
    const edges = candidates.filter(([a, b]) => ids.has(a) && ids.has(b)).map(([from, to]) => ({ from, to }));
    r.json({ nodes, edges });
  } catch (e) { r.status(500).json(redact(e)); }
});

app.post('/admin/services/:name/restart', async (q, r) => {
  try { r.json({ ok: true, ...(await pm2Action(q.params.name, 'restart')) }); }
  catch (e) { r.status(400).json(redact(e)); }
});

app.post('/admin/services/:name/reload', async (q, r) => {
  try { r.json({ ok: true, ...(await pm2Action(q.params.name, 'reload')) }); }
  catch (e) { r.status(400).json(redact(e)); }
});

// SSE stream — token passed as ?token=... since EventSource can't set headers.
// AUTH DISABLED on this branch — token check removed (TOKEN_BUF no longer
// defined). Restore the timing-safe comparison before shipping.
app.get('/events/stream', (q, r) => {
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
    } catch {}
  };
  send();
  const id = setInterval(send, 2000);
  q.on('close', () => { clearInterval(id); r.end(); });
});

const PORT = process.env.ADMIN_PORT || 4011;
app.listen(PORT, '127.0.0.1', () => console.log('[admin-api] 127.0.0.1:' + PORT));
