// =============================================================================
// BRIDGE AI OS — UNIFIED GATEWAY (Standalone Version)
// Port: 8080
// =============================================================================

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const BRAIN_HOST = process.env.BRAIN_HOST || 'localhost';
const SYSTEM_HOST = process.env.SYSTEM_HOST || 'localhost';

const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false, crossOriginOpenerPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors());
app.use(cookieParser());
app.set('trust proxy', true);
app.use(express.json({ strict: true, limit: '1mb' }));

// CORS configuration
const ALLOWED_ORIGINS = new Set([
  'https://wall.bridge-ai-os.com',
  'https://bridge-ai-os.com',
  'https://go.ai-os.co.za',
  'https://ai-os.co.za',
  'https://aid.ai-os.co.za',
  'https://ehsa.ai-os.co.za',
  'http://localhost:8080',
  'http://localhost:3000',
]);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const originAllowed = origin && (
    ALLOWED_ORIGINS.has(origin) ||
    origin.endsWith('.ai-os.co.za') ||
    origin.endsWith('.bridge-ai-os.com')
  );
  if (originAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`[GATEWAY] ${req.method} ${req.path} — ${res.statusCode} (${ms}ms)`);
  });
  next();
});

// ── HEALTH ENDPOINT ─────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  const services = [
    { host: SYSTEM_HOST, port: 3000 },
    { host: BRAIN_HOST, port: 8000 }
  ];
  for (const service of services) {
    try {
      const r = await fetch(`http://${service.host}:${service.port}/health`, { signal: AbortSignal.timeout(2000) });
      const j = await r.json();
      res.json({ status: 'OK', core: j, gateway: 'up', source: service.port, ts: Date.now() });
      return;
    } catch (_) {}
  }
  res.json({ status: 'OK', gateway: 'up', core: 'unreachable', ts: Date.now() });
});

// ── API: STATUS (Aggregate health of all services) ─────────────────────────
app.get('/api/status', async (req, res) => {
  const services = [
    { id: 'gateway',      url: null,                         port: 8080 },
    { id: 'system',       url: `http://${SYSTEM_HOST}:3000/health`, port: 3000 },
    { id: 'brain',        url: `http://${BRAIN_HOST}:8000/health`, port: 8000 },
    { id: 'terminal',     url: 'http://terminal:5002/health', port: 5002 },
    { id: 'auth',         url: 'http://auth:5001/health', port: 5001 },
  ];

  const results = await Promise.all(
    services.map(async (svc) => {
      if (!svc.url) return { id: svc.id, port: svc.port, status: 'up', latency_ms: 0 };
      const t0 = Date.now();
      try {
        const r = await fetch(svc.url, { signal: AbortSignal.timeout(2000) });
        const latency_ms = Date.now() - t0;
        const alive = r.ok || r.status === 403 || r.status === 401;
        return { id: svc.id, port: svc.port, status: alive ? 'up' : 'degraded', latency_ms };
      } catch (_) {
        return { id: svc.id, port: svc.port, status: 'unreachable', latency_ms: Date.now() - t0 };
      }
    })
  );

  const overall = results.every(s => s.status === 'up') ? 'healthy'
    : results.some(s => s.status === 'up') ? 'degraded'
    : 'down';

  res.json({ overall, services: results, ts: Date.now() });
});

// ── API: BRAIN STATUS (for system-status-dashboard) ────────────────────────
app.get('/api/brain/status', async (req, res) => {
  try {
    const r = await fetch(`http://${BRAIN_HOST}:8000/health`, { signal: AbortSignal.timeout(2000) });
    const j = await r.json();
    res.json({ ok: true, status: 'up', brain: j, ts: Date.now() });
  } catch (e) {
    res.json({ ok: false, status: 'unreachable', error: e.message, ts: Date.now() });
  }
});

// ── API: TREASURY STATUS (for corporate dashboard) ───────────────────────────
app.get('/api/treasury/status', async (req, res) => {
  // Stub - returns zero balance since no DB connection in standalone mode
  res.json({ ok: true, status: 'up', balance: 0, currency: 'USD', ts: Date.now() });
});

// ── API: SWARM HEALTH (for system-status-dashboard) ────────────────────────
const agentNames = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta'];
const orchAgents = agentNames.map(name => ({
  id: `agent_${name}`,
  name,
  status: 'active',
  tasks_completed: 0,
  uptime_s: 0,
}));

app.get('/api/swarm/health', (req, res) => {
  res.json({
    ok: true,
    status: 'running',
    agent_count: orchAgents.length,
    active_agents: orchAgents.filter(a => a.status === 'active').length,
    ts: Date.now(),
  });
});

app.get('/orchestrator/status', (req, res) => {
  orchAgents.forEach(a => { a.uptime_s = Math.floor(process.uptime()); });
  res.json({
    status: 'running',
    agent_count: orchAgents.length,
    active_agents: orchAgents.filter(a => a.status === 'active').length,
    swarms: 2,
    queue_depth: 0,
    agents: orchAgents,
    ts: Date.now(),
  });
});

// ── STUB ENDPOINTS FOR CORPORATE DASHBOARD ───────────────────────────────────
app.get('/api/invoices', (req, res) => {
  res.json({ ok: true, invoices: [], total: 0, ts: Date.now() });
});
app.get('/api/debts', (req, res) => {
  res.json({ ok: true, debts: [], total: 0, ts: Date.now() });
});
app.get('/api/quotes', (req, res) => {
  res.json({ ok: true, quotes: [], total: 0, ts: Date.now() });
});
app.get('/api/vendors', (req, res) => {
  res.json({ ok: true, vendors: [], total: 0, ts: Date.now() });
});
app.get('/api/analytics/overview', (req, res) => {
  res.json({ ok: true, revenue: 0, expenses: 0, profit: 0, ts: Date.now() });
});
app.get('/api/revenue/status', (req, res) => {
  res.json({ ok: true, status: 'active', monthly_revenue: 0, ts: Date.now() });
});

// ── OAUTH CONFIG (public — no auth) ─────────────────────────────────────────
app.get('/api/config/oauth', (_req, res) => {
  res.json({
    googleClientId:    process.env.GOOGLE_CLIENT_ID || '',
    githubClientId:    process.env.GITHUB_CLIENT_ID || '',
    microsoftClientId: process.env.AZURE_CLIENT_ID || '',
    supabaseUrl:       process.env.SUPABASE_URL || '',
    supabaseAnonKey:   process.env.SUPABASE_ANON_KEY || '',
    redirectBase:      process.env.BASE_URL || `${_req.get('x-forwarded-proto') || _req.protocol}://${_req.get('x-forwarded-host') || _req.get('host')}`,
  });
});

// ── SSE EVENT STREAM ─────────────────────────────────────────────────────────
const sseClients = new Set();

function pushEvent(type, data) {
  const payload = JSON.stringify({ type, data, ts: Date.now() });
  for (const client of sseClients) {
    try { client.write(`data: ${payload}\n\n`); } catch (_) { sseClients.delete(client); }
  }
}
module.exports.pushEvent = pushEvent;

app.get('/events/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write(':\n\n');
  res.write(`data: ${JSON.stringify({ type: 'connected', ts: Date.now() })}\n\n`);
  sseClients.add(res);
  const keepAlive = setInterval(() => {
    try { res.write(':\n\n'); } catch (_) { clearInterval(keepAlive); }
  }, 25000);
  req.on('close', () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
  });
});

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`[GATEWAY] Unified Gateway listening on port ${PORT}`);
});
