const express = require('express');
const path = require('path');
const { buildOverview } = require('./overview');
const { pm2List, pm2Action } = require('./pm2Reader');

const app = express();
app.use(express.json({ limit: '64kb' }));

const DASH = path.join(__dirname, '../../apps/admin-dashboard');
app.use('/', express.static(DASH));

app.get('/health', (_q, r) => r.json({ ok: true, service: 'admin-api' }));

app.get('/admin/overview', async (_q, r) => {
  try { r.json(await buildOverview()); }
  catch (e) { r.status(500).json({ error: e.message }); }
});

app.get('/admin/topology', async (_q, r) => {
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
});

app.post('/admin/services/:name/restart', async (q, r) => {
  try { r.json({ ok: true, ...(await pm2Action(q.params.name, 'restart')) }); }
  catch (e) { r.status(400).json({ error: e.message }); }
});

app.post('/admin/services/:name/reload', async (q, r) => {
  try { r.json({ ok: true, ...(await pm2Action(q.params.name, 'reload')) }); }
  catch (e) { r.status(400).json({ error: e.message }); }
});

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
