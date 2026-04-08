// =============================================================================
// BRIDGE AI OS — UNIFIED GATEWAY
// Port: 8080
//
// AVAILABLE ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────
// Core / Legacy
//   GET  /health                  — gateway + core service liveness
//   GET  /events/stream           — SSE live event stream
//   GET  /orchestrator/status     — swarm agent status
//   GET  /billing                 — treasury + subscription data
//   POST /ask                     — LLM inference (proxies to :3001)
//   GET  /                        — serve ui.html
//
// Unified API (v2 — added Day 2)
//   GET  /api/topology            — network topology (proxies :3000, else stub)
//   GET  /api/avatar/*            — avatar rendering endpoints (stub)
//   GET  /api/registry/*          — registry data: kernel/network/security (stub)
//   GET  /api/marketplace/*       — marketplace: tasks/DEX/wallet/skills (stub)
//   GET  /api/status              — aggregate health of all services
//   GET  /api/agents              — all agents across L1 / L2 / L3 (stub)
//   GET  /api/contracts           — all JSON contract files from shared/
// =============================================================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

const ROOT = __dirname;
const SHARED_DIR = path.join(ROOT, 'shared');
const data = require('./data-service');

// ── CORS (restricted to known origins) ───────────────────────────────────────
const ALLOWED_ORIGINS = new Set([
  'https://wall.bridge-ai-os.com',
  'https://go.ai-os.co.za',
  'http://localhost:3000',
  'http://localhost:8080',
]);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json());

// ── REQUEST LOGGING MIDDLEWARE ────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - start;
      console.log(`[GATEWAY] ${req.method} ${req.path} — ${res.statusCode} (${ms}ms)`);
    });
    next();
  });
}

app.use(express.static(ROOT));
// Serve pages from the 'public/' subdirectory (crm, invoicing, marketing, legal, tickets, leadgen, etc.)
app.use(express.static(path.join(ROOT, 'public')));

// ── HEALTH ───────────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    const r = await fetch('http://localhost:3000/health');
    const j = await r.json();
    res.json({ status: 'OK', core: j, gateway: 'up', ts: Date.now() });
  } catch (e) {
    res.json({ status: 'OK', gateway: 'up', core: 'unreachable', ts: Date.now() });
  }
});

// ── SSE EVENT STREAM ─────────────────────────────────────────────────────────
const sseClients = new Set();

const EVENT_TYPES = [
  'lead_delivered',
  'ai_inference',
  'swarm_dispatch',
  'task_completed',
  'treasury_update',
];

function pushEvent(type, data) {
  const payload = JSON.stringify({ type, data, ts: Date.now() });
  for (const client of sseClients) {
    try { client.write(`data: ${payload}\n\n`); } catch (_) { sseClients.delete(client); }
  }
}

// Emit synthetic heartbeat events every 5 s so the dashboard shows live data
const agentNames = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta'];
let treasuryBalance = 137284.50;

setInterval(() => {
  const pick = EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)];
  const agent = agentNames[Math.floor(Math.random() * agentNames.length)];

  if (pick === 'lead_delivered') {
    pushEvent(pick, { agent, lead_id: `lead_${Date.now()}`, value: +(Math.random() * 500 + 50).toFixed(2) });
  } else if (pick === 'ai_inference') {
    pushEvent(pick, { agent, model: 'bridge-llm', tokens: Math.floor(Math.random() * 800 + 100), latency_ms: Math.floor(Math.random() * 300 + 50) });
  } else if (pick === 'swarm_dispatch') {
    pushEvent(pick, { agent, task: `task_${Date.now()}`, priority: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)] });
  } else if (pick === 'task_completed') {
    pushEvent(pick, { agent, task: `task_${Date.now() - 5000}`, duration_ms: Math.floor(Math.random() * 2000 + 200) });
  } else if (pick === 'treasury_update') {
    const delta = +(Math.random() * 200 - 50).toFixed(2);
    treasuryBalance += delta;
    pushEvent(pick, { balance: +treasuryBalance.toFixed(2), delta, currency: 'USD' });
  }
}, 5000).unref();

app.get('/events/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Send immediate hello event
  res.write(`data: ${JSON.stringify({ type: 'connected', ts: Date.now() })}\n\n`);

  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// ── ORCHESTRATOR STATUS ───────────────────────────────────────────────────────
const orchAgents = agentNames.map(name => ({
  id: `agent_${name}`,
  name,
  status: 'active',
  tasks_completed: Math.floor(Math.random() * 500),
  uptime_s: Math.floor(Math.random() * 86400),
}));

app.get('/orchestrator/status', (req, res) => {
  res.json({
    status: 'running',
    agent_count: orchAgents.length,
    active_agents: orchAgents.filter(a => a.status === 'active').length,
    swarms: 2,
    queue_depth: Math.floor(Math.random() * 20),
    agents: orchAgents,
    ts: Date.now(),
  });
});

// ── BILLING ───────────────────────────────────────────────────────────────────
app.get('/billing', (req, res) => {
  res.json({
    treasury_balance: +treasuryBalance.toFixed(2),
    currency: 'USD',
    period: 'monthly',
    revenue_mtd: 28450.00,
    costs_mtd: 4210.50,
    net_mtd: 24239.50,
    subscriptions: 142,
    active_plans: [
      { id: 'starter',    name: 'Starter',    price: 49,   count: 64 },
      { id: 'pro',        name: 'Pro',         price: 149,  count: 51 },
      { id: 'enterprise', name: 'Enterprise',  price: 499,  count: 27 },
    ],
    last_updated: new Date().toISOString(),
  });
});

// ── LLM / AI INFERENCE ────────────────────────────────────────────────────────
app.post('/ask', async (req, res) => {
  const { prompt } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt required' });
  // Try to forward to ainode on 3001, fall back to stub
  try {
    const r = await fetch('http://localhost:3001/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const j = await r.json();
    return res.json(j);
  } catch (_) {
    return res.json({ id: `stub_${Date.now()}`, response: `[Gateway stub] Received: "${prompt}"` });
  }
});

// ── API: TOPOLOGY ─────────────────────────────────────────────────────────────
app.get('/api/topology', async (req, res) => {
  try {
    const r = await fetch('http://localhost:3000/topology', { signal: AbortSignal.timeout(2000) });
    const j = await r.json();
    return res.json(j);
  } catch (_) {
    // Real topology from data-service (network interfaces + service probes)
    const topo = await data.getTopology();
    return res.json(topo);
  }
});

// Express 5: wildcard params come back as arrays — flatten to string
function paramStr(p) {
  return Array.isArray(p) ? p.join('/') : (p || '');
}

// ── API: AVATAR ───────────────────────────────────────────────────────────────
app.get('/api/avatar/modes', (_req, res) => {
  res.json(data.getAvatarModes());
});
app.get('/api/avatar/*path', (req, res) => {
  const mode = paramStr(req.params.path) || 'wireframe';
  res.json(data.getAvatarScene(mode));
});

// ── API: REGISTRY ─────────────────────────────────────────────────────────────
const REGISTRY_HANDLERS = {
  kernel:     () => data.getRegistryKernel(),
  network:    () => data.getRegistryNetwork(),
  security:   () => data.getRegistrySecurity(),
  federation: () => data.getRegistryFederation(),
  jobs:       () => data.getRegistryJobs(),
  market:     () => data.getRegistryMarket(),
  bridgeos:   () => data.getRegistryBridgeOS(),
  nodemap:    () => data.getRegistryNodemap(),
};
app.get('/api/registry/*path', async (req, res) => {
  const namespace = paramStr(req.params.path) || 'root';
  const handler = REGISTRY_HANDLERS[namespace];
  if (handler) {
    const result = await handler();
    return res.json({ namespace, data: result, ts: Date.now() });
  }
  // List available namespaces
  res.json({ namespace, available: Object.keys(REGISTRY_HANDLERS), ts: Date.now() });
});

// ── API: MARKETPLACE ──────────────────────────────────────────────────────────
const MARKET_HANDLERS = {
  tasks:     () => data.getMarketplaceTasks(),
  dex:       () => data.getMarketplaceDex(),
  wallet:    () => data.getMarketplaceWallet(),
  skills:    () => data.getMarketplaceSkills(),
  portfolio: () => data.getMarketplacePortfolio(),
  stats:     () => data.getMarketplaceStats(),
};
app.get('/api/marketplace/*path', async (req, res) => {
  const section = paramStr(req.params.path) || 'index';
  const handler = MARKET_HANDLERS[section];
  if (handler) {
    const result = await handler();
    return res.json({ section, data: result, ts: Date.now() });
  }
  res.json({ section, available: Object.keys(MARKET_HANDLERS), ts: Date.now() });
});

// ── API: STATUS ───────────────────────────────────────────────────────────────
// Aggregate health of all known services.
app.get('/api/status', async (req, res) => {
  const services = [
    { id: 'gateway',      url: null,                         port: 8080 },
    { id: 'system',       url: 'http://localhost:3000/health', port: 3000 },
    { id: 'brain',        url: 'http://localhost:8000/health', port: 8000 },
    { id: 'terminal',     url: 'http://localhost:5002/health', port: 5002 },
    { id: 'auth',         url: 'http://localhost:5001/health', port: 5001 },
  ];

  const results = await Promise.all(
    services.map(async (svc) => {
      if (!svc.url) return { id: svc.id, port: svc.port, status: 'up', latency_ms: 0 };
      const t0 = Date.now();
      try {
        const r = await fetch(svc.url, { signal: AbortSignal.timeout(2000) });
        const latency_ms = Date.now() - t0;
        // 403/401 means service is running but rejecting unauthenticated health probe — still "up"
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

// ── ORCHESTRATOR PORT MAP ─────────────────────────────────────────────────────
const ORCHESTRATORS = {
  L1: 'http://localhost:9001',
  L2: 'http://192.168.110.203:9001',  // L2 real LAN IP
  L3: 'http://localhost:9003',
};

// ── L1 / L2 / L3 PROXY ROUTES ────────────────────────────────────────────────
// Proxy /api/l1/*, /api/l2/*, /api/l3/* to the correct orchestrator ports
for (const [layer, base] of Object.entries(ORCHESTRATORS)) {
  const prefix = `/api/${layer.toLowerCase()}`;
  app.all(`${prefix}/*path`, async (req, res) => {
    const subpath = req.path.slice(prefix.length) || '/';
    const url = `${base}${subpath}`;
    try {
      const opts = {
        method: req.method,
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': req.headers['x-forwarded-for'] || req.ip,
          'X-Real-IP': req.headers['x-real-ip'] || req.ip,
        },
      };
      if (req.headers['upgrade']) opts.headers['Upgrade'] = req.headers['upgrade'];
      if (req.headers['connection']) opts.headers['Connection'] = req.headers['connection'];
      if (req.method !== 'GET' && req.body) opts.body = JSON.stringify(req.body);
      const r = await fetch(url, opts);
      const text = await r.text();
      res.status(r.status).set('Content-Type', 'application/json').send(text);
    } catch (e) {
      res.status(502).json({ error: `${layer} unreachable`, details: e.message });
    }
  });
}

// ── API: AGENTS ───────────────────────────────────────────────────────────────
// Polls L1 (localhost:9000) and L2 (192.168.110.203:9001), merges results.
// Falls back gracefully if either is unreachable. 2-second timeout per call.
const L1_AGENTS_URL = 'http://localhost:9000/api/agents';
const L2_AGENTS_URL = 'http://192.168.110.203:9001/api/agents';

// Uses http.request (not global fetch/undici) so sockets are destroyed
// immediately on failure — prevents TCPWRAP handles leaking in test runs.
// Both L1/L2 URLs are http:// — no https branch needed.
function fetchAgentsFrom(url, layer) {
  return new Promise((resolve) => {
    const parsed  = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port:     Number(parsed.port) || 80,
      path:     parsed.pathname + parsed.search,
      method:   'GET',
      headers:  { connection: 'close' },
    };

    const done = (result) => resolve(result);
    const fail = (msg, r) => { if (r) r.destroy(); done({ status: 'down', layer, agents: [], count: 0, error: msg }); };

    let req;
    const timer = setTimeout(() => fail('timeout', req), 2000);
    timer.unref();

    try {
      req = require('http').request(options, (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          clearTimeout(timer);
          try {
            const j         = JSON.parse(raw);
            const agentList = Array.isArray(j.agents) ? j.agents
              : Array.isArray(j) ? j
              : Object.entries(j.agents || {}).map(([id, a]) => ({ id, ...a }));
            done({ status: 'up', layer, agents: agentList, count: agentList.length });
          } catch (e) {
            done({ status: 'down', layer, agents: [], count: 0, error: e.message });
          }
        });
        res.on('error', (e) => { clearTimeout(timer); fail(e.message, req); });
      });
      req.on('error', (e) => { clearTimeout(timer); fail(e.message, req); });
      req.end();
    } catch (e) {
      clearTimeout(timer);
      fail(e.message, req);
    }
  });
}

app.get('/api/agents', async (_req, res) => {
  const [l1, l2] = await Promise.all([
    fetchAgentsFrom(L1_AGENTS_URL, 'L1'),
    fetchAgentsFrom(L2_AGENTS_URL, 'L2'),
  ]);

  const allAgents = [
    ...l1.agents.map(a => ({ ...a, layer: 'L1' })),
    ...l2.agents.map(a => ({ ...a, layer: 'L2' })),
  ];

  res.json({
    count: allAgents.length,
    layers: { L1: l1, L2: l2 },
    agents: allAgents,
    ts: Date.now(),
  });
});

// ── API: CONTRACTS ────────────────────────────────────────────────────────────
// Reads and returns all JSON files from the shared/ contracts directory.
app.get('/api/contracts', (req, res) => {
  try {
    const files = fs.readdirSync(SHARED_DIR).filter(f => f.endsWith('.json'));
    const contracts = {};
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(SHARED_DIR, file), 'utf8');
        contracts[file] = JSON.parse(raw);
      } catch (parseErr) {
        contracts[file] = { error: 'parse_failed', message: parseErr.message };
      }
    }
    res.json({ count: files.length, files, contracts, ts: Date.now() });
  } catch (err) {
    res.status(500).json({ error: 'failed_to_read_contracts', message: err.message });
  }
});

// ── AUTH ──────────────────────────────────────────────────────────────────────
// Minimal in-process auth store (JWT via jsonwebtoken + bcryptjs).
// A real deployment would delegate to a dedicated auth service.
let jwt, bcrypt;
try { jwt   = require('jsonwebtoken'); }  catch (_) { jwt   = null; }
try { bcrypt = require('bcryptjs'); }      catch (_) { bcrypt = null; }

const JWT_SECRET   = process.env.JWT_SECRET;
const REFERRAL_CODES = { BRIDGE2025: 500, AILAUNCH: 250, BETA100: 100 };

// In-memory user store (replace with DB in production)
const authUsers = new Map();

function makeToken(payload) {
  if (!jwt) return `stub-token-${Date.now()}`;
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}

function verifyToken(token) {
  if (!jwt) return null;
  try { return jwt.verify(token, JWT_SECRET); } catch (_) { return null; }
}

async function hashPassword(pw) {
  if (!bcrypt) return `hashed:${pw}`;
  return bcrypt.hash(pw, 10);
}

async function checkPassword(pw, hash) {
  if (!bcrypt) return hash === `hashed:${pw}`;
  return bcrypt.compare(pw, hash);
}

// POST /auth/register
app.post('/auth/register', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  if (authUsers.has(email)) return res.status(409).json({ error: 'email already registered' });
  const password_hash = await hashPassword(password);
  const user = { id: `usr_${Date.now()}`, email, password_hash, credits: 0, created_at: new Date().toISOString() };
  authUsers.set(email, user);
  const token = makeToken({ sub: user.id, email });
  res.status(201).json({ token, user: { id: user.id, email: user.email, credits: user.credits } });
});

// POST /auth/login
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  const user = authUsers.get(email);
  if (!user) return res.status(401).json({ error: 'invalid credentials' });
  const ok = await checkPassword(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'invalid credentials' });
  const token = makeToken({ sub: user.id, email });
  res.json({ token, user: { id: user.id, email: user.email, credits: user.credits } });
});

// GET /auth/verify
app.get('/auth/verify', (req, res) => {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  if (!token) return res.status(401).json({ error: 'no token provided' });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'invalid or expired token' });
  res.json({ valid: true, user: { sub: payload.sub, email: payload.email } });
});

// ── AUTH AUDIT PROXY → port 5001 ─────────────────────────────────────────────
// The merkle audit endpoints live on the dedicated auth service.
// Proxy them through the gateway so the dashboard can reach them from port 8080.
const AUTH_SVC = 'http://localhost:5001';

async function proxyToAuth(req, res) {
  try {
    const url = AUTH_SVC + req.path + (req._parsedUrl.search || '');
    const opts = {
      method: req.method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (req.headers.authorization) opts.headers['Authorization'] = req.headers.authorization;
    if (req.method !== 'GET' && req.body) opts.body = JSON.stringify(req.body);
    const r = await fetch(url, opts);
    const text = await r.text();
    res.status(r.status).set('Content-Type', 'application/json').send(text);
  } catch (e) {
    res.status(502).json({ error: 'Auth service unreachable', details: e.message });
  }
}

// Audit endpoints
app.get('/auth/audit/root',       (req, res) => proxyToAuth(req, res));
app.get('/auth/audit/state',      (req, res) => proxyToAuth(req, res));
app.get('/auth/audit/verify',     (req, res) => proxyToAuth(req, res));
app.get('/auth/audit/events',     (req, res) => proxyToAuth(req, res));
app.get('/auth/audit/proof/:lh',  (req, res) => proxyToAuth(req, res));
app.get('/auth/audit/user/:uid',  (req, res) => proxyToAuth(req, res));

// ── REFERRAL ──────────────────────────────────────────────────────────────────
// POST /referral/claim
app.post('/referral/claim', (req, res) => {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  if (!token) return res.status(401).json({ error: 'authentication required' });
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'invalid or expired token' });

  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'referral code required' });

  const credits = REFERRAL_CODES[String(code).toUpperCase()];
  if (!credits) return res.status(404).json({ error: 'invalid referral code' });

  const user = authUsers.get(payload.email);
  if (user) user.credits = (user.credits || 0) + credits;

  res.json({ success: true, code, credits, message: `${credits} credits applied to your account` });
});

// ── BAN PROXY ────────────────────────────────────────────────────────────────
// Try BAN on 8001 (Python FastAPI), fall back to ban-home.html
app.all('/ban', async (_req, res) => {
  // Try BAN FastAPI first
  try {
    const r = await fetch('http://localhost:8001/', { signal: AbortSignal.timeout(2000) });
    if (r.ok) { const html = await r.text(); return res.type('html').send(html); }
  } catch (_) {}
  // Fallback: serve ban-home.html from Xpublic (preferred) or public/
  const banPaths = [
    path.join(XPUBLIC, 'ban-home.html'),
    path.join(ROOT, 'public', 'ban-home.html'),
  ];
  for (const p of banPaths) {
    try {
      let html = fs.readFileSync(p, 'utf8');
      if (!html.includes('id="bridge-nav"')) html = html.replace(/<body[^>]*>/i, (m) => m + NAV_HTML);
      return res.type('html').send(html);
    } catch (_) {}
  }
  res.status(503).json({ error: 'BAN service offline', hint: 'Start ban-engine via PM2' });
});
// BAN API endpoints — try 8001 first, fallback to brain on 8000
['health', 'tasks/add', 'tasks/list', 'tasks/execute', 'nodes', 'consensus/state', 'ledger', 'logs', 'ws'].forEach(ep => {
  app.all(`/ban/${ep}`, async (req, res) => {
    // Try BAN on 8001, then brain on 8000
    for (const port of [8001, 8000]) {
      const url = `http://localhost:${port}/${ep}${req._parsedUrl.search || ''}`;
      try {
        const opts = { method: req.method, headers: {}, signal: AbortSignal.timeout(2000) };
        if (req.headers['content-type']) opts.headers['Content-Type'] = req.headers['content-type'];
        if (req.method !== 'GET' && req.body) opts.body = JSON.stringify(req.body);
        const r = await fetch(url, opts);
        const text = await r.text();
        return res.status(r.status).set('Content-Type', r.headers.get('content-type') || 'application/json').send(text);
      } catch (_) { continue; }
    }
    res.status(502).json({ error: 'BAN unreachable on 8001 and 8000' });
  });
});

// ── STATIC HTML PAGES ─────────────────────────────────────────────────────────
const XPUBLIC = path.join(ROOT, 'Xpublic');

// ── UNIVERSAL NAV (injected into every page) ────────────────────────────────
const NAV_HTML = `
<style>
#bridge-nav{background:#0a1520;border-bottom:2px solid #1a2d40;padding:5px 12px;display:flex;align-items:center;gap:4px;flex-wrap:wrap;font-family:system-ui,monospace;font-size:10px;letter-spacing:.06em;position:sticky;top:0;z-index:9999}
#bridge-nav a{color:#4d6678;text-decoration:none;padding:2px 5px;border:1px solid #1a2d40;border-radius:3px;white-space:nowrap}
#bridge-nav a:hover{color:#00c8ff;border-color:#00c8ff}
#bridge-nav .logo{color:#00c8ff;font-weight:700;font-size:12px;margin-right:6px;border:none;padding:0}
#bridge-nav .sep{color:#1a2d40;margin:0 2px}
#bridge-nav .cat{color:#4d6678;font-size:7px;letter-spacing:.12em;margin-right:2px}
#bridge-nav .net{color:#fb923c;border-color:#3a2a1a;background:rgba(251,146,60,.08)}
#bridge-nav .join{color:#00e57b;border-color:#0d3a1a;background:rgba(0,229,123,.08)}
#bnav-toggle{display:none;background:none;border:1px solid #1a2d40;color:#00c8ff;font-size:16px;padding:2px 8px;border-radius:4px;cursor:pointer;margin-left:auto}
#bnav-links{display:contents}
@media(max-width:768px){
  #bnav-toggle{display:block}
  #bnav-links{display:none;width:100%;flex-direction:column;gap:4px;padding:8px 0}
  #bnav-links.open{display:flex}
  #bnav-links a{padding:6px 10px;font-size:12px}
  #bridge-nav .sep,#bridge-nav .cat{display:none}
}
</style>
<nav id="bridge-nav">
<a href="/" class="logo">BRIDGE AI</a>
<button id="bnav-toggle" onclick="document.getElementById('bnav-links').classList.toggle('open')">&#9776;</button>
<div id="bnav-links">
<span class="sep">|</span><span class="cat">SYSTEM</span>
<a href="/topology.html">TOPOLOGY</a>
<a href="/registry.html">REGISTRY</a>
<a href="/system-status-dashboard.html">STATUS</a>
<a href="/terminal.html">TERM</a>
<a href="/control.html">CONTROL</a>
<span class="sep">|</span><span class="cat">ECONOMY</span>
<a href="/marketplace.html">MARKET</a>
<a href="/ban">BAN</a>
<span class="sep">|</span><span class="cat">AI</span>
<a href="/avatar.html">AVATAR</a>
<a href="/abaas.html">ABAAS</a>
<a href="/aoe-dashboard.html">AOE</a>
<span class="sep">|</span>
<a href="/corporate.html">BIZ</a>
<a href="/brand.html">BRAND</a>
<a href="/brain-live">BRAIN</a>
<span class="sep">|</span>
<a href="/platforms.html" class="net">NET</a>
<a href="/sitemap.html">MAP</a>
<a href="/onboarding.html" class="join">JOIN</a>
</div>
</nav>`;

// ── THEMED BOOT SCREEN ──────────────────────────────────────────────────────
const BOOT_THEMES = {
  // L0 PUBLIC
  '/': { layer: 'L0', name: 'COMMAND CENTER', theme: 'cosmic', color: '#00c8ff', msg: 'Initializing Bridge AI OS...' },
  '/onboarding.html': { layer: 'L0', name: 'ONBOARDING', theme: 'cosmic', color: '#00e57b', msg: 'Preparing registration...' },
  '/welcome.html': { layer: 'L0', name: 'WELCOME', theme: 'cosmic', color: '#00e57b', msg: 'Loading your dashboard...' },
  '/platforms.html': { layer: 'L0', name: 'NETWORK', theme: 'cosmic', color: '#fb923c', msg: 'Mapping platform network...' },
  '/sitemap.html': { layer: 'L0', name: 'SYSTEM MAP', theme: 'cosmic', color: '#00c8ff', msg: 'Scanning full ecosystem...' },
  '/landing.html': { layer: 'L0', name: 'BRIDGE AI', theme: 'cosmic', color: '#00c8ff', msg: 'Welcome to Bridge AI OS...' },
  // L1 PRODUCT
  '/marketplace.html': { layer: 'L1', name: 'MARKETPLACE', theme: 'blueprint', color: '#00c8ff', msg: 'Loading task marketplace...' },
  '/ban': { layer: 'L1', name: 'BAN ENGINE', theme: 'blueprint', color: '#ffd166', msg: 'Activating task engine...' },
  '/avatar.html': { layer: 'L1', name: 'AVATAR', theme: 'blueprint', color: '#a78bfa', msg: 'Rendering 3D avatar...' },
  '/abaas.html': { layer: 'L1', name: 'ABAAS', theme: 'blueprint', color: '#00c8ff', msg: 'Deploying agent services...' },
  // L2 OPERATIONS
  '/topology.html': { layer: 'L2', name: 'TOPOLOGY', theme: 'telemetry', color: '#00e57b', msg: 'Scanning network topology...' },
  '/registry.html': { layer: 'L2', name: 'REGISTRY', theme: 'telemetry', color: '#00c8ff', msg: 'Loading system registry...' },
  '/system-status-dashboard.html': { layer: 'L2', name: 'STATUS', theme: 'telemetry', color: '#00e57b', msg: 'Polling 30+ services...' },
  '/aoe-dashboard.html': { layer: 'L2', name: 'AOE ENGINE', theme: 'telemetry', color: '#00c8ff', msg: 'Loading skill engine...' },
  // L3 CONTROL
  '/terminal.html': { layer: 'L3', name: 'TERMINAL', theme: 'command', color: '#00e57b', msg: 'Connecting PTY shell...' },
  '/control.html': { layer: 'L3', name: 'CONTROL', theme: 'command', color: '#ffd166', msg: 'Activating control plane...' },
  '/logs.html': { layer: 'L3', name: 'LOGS', theme: 'command', color: '#4d6678', msg: 'Loading audit trail...' },
};

const THEME_COLORS = {
  cosmic: { bg: 'radial-gradient(circle at center,#0a1a2a 0%,#050a0f 70%)', accent: '#00c8ff', svg: '<circle cx="50%" cy="50%" r="80" stroke="{COLOR}" fill="none" stroke-width="1"><animate attributeName="r" values="60;100;60" dur="3s" repeatCount="indefinite"/></circle><circle cx="50%" cy="50%" r="40" stroke="{COLOR}" fill="none" opacity="0.5"><animateTransform attributeName="transform" type="rotate" from="0 150 100" to="360 150 100" dur="8s" repeatCount="indefinite"/></circle>' },
  blueprint: { bg: 'linear-gradient(135deg,#050a12 0%,#0a1525 100%)', accent: '#00c8ff', svg: '<rect x="40" y="40" width="220" height="120" fill="none" stroke="{COLOR}" stroke-width="0.5" stroke-dasharray="4 2"><animate attributeName="stroke-dashoffset" from="0" to="24" dur="2s" repeatCount="indefinite"/></rect><line x1="60" y1="100" x2="240" y2="100" stroke="{COLOR}" stroke-width="0.3"><animate attributeName="x2" values="60;240;60" dur="4s" repeatCount="indefinite"/></line>' },
  telemetry: { bg: 'linear-gradient(180deg,#050a0f 0%,#0a1520 100%)', accent: '#00e57b', svg: '<polyline points="20,120 60,80 100,110 140,50 180,90 220,40 260,70" fill="none" stroke="{COLOR}" stroke-width="1.5"><animate attributeName="stroke-dashoffset" from="500" to="0" dur="2s" fill="freeze"/></polyline>' },
  command: { bg: 'linear-gradient(180deg,#000 0%,#0a0f14 100%)', accent: '#00e57b', svg: '<text x="30" y="60" fill="{COLOR}" font-family="monospace" font-size="10" opacity="0.5">$ system boot<animate attributeName="opacity" values="0.3;1;0.3" dur="1.5s" repeatCount="indefinite"/></text><text x="30" y="80" fill="{COLOR}" font-family="monospace" font-size="10" opacity="0.3">$ agents online<animate attributeName="opacity" values="0;0.8;0" dur="2s" repeatCount="indefinite"/></text>' },
};

function getBootScreen(pagePath) {
  const config = BOOT_THEMES[pagePath] || BOOT_THEMES['/'];
  const theme = THEME_COLORS[config.theme] || THEME_COLORS.cosmic;
  const svgContent = theme.svg.replace(/\{COLOR\}/g, config.color);
  return `<div id="boot-screen" style="position:fixed;inset:0;z-index:99999;background:${theme.bg};display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:system-ui,monospace;transition:opacity .6s">
<svg viewBox="0 0 300 200" width="200" height="130" xmlns="http://www.w3.org/2000/svg">${svgContent}</svg>
<div style="color:${config.color};font-size:1.2rem;font-weight:700;letter-spacing:.25em;margin-top:1rem">${config.name}</div>
<div style="color:#4d6678;font-size:.65rem;letter-spacing:.1em;margin-top:.3rem">${config.layer} — ${config.msg}</div>
<div style="width:120px;height:3px;background:#1a2d40;border-radius:2px;margin-top:1rem;overflow:hidden"><div style="height:100%;background:${config.color};border-radius:2px;animation:bootbar 1.8s ease-in-out forwards"></div></div>
<div style="color:#1a2d40;font-size:.5rem;margin-top:1.5rem">BRIDGE AI OS v3</div>
</div>
<style>@keyframes bootbar{0%{width:0}50%{width:70%}100%{width:100%}}</style>
<script>setTimeout(()=>{const b=document.getElementById('boot-screen');if(b){b.style.opacity='0';setTimeout(()=>b.remove(),600)}},2000)</script>`;
}

// PHERE design system snippet — injected into every served page
const PHERE_INJECT = `
<link rel="stylesheet" href="/bridge-phere.css" id="bridge-phere-css">
<script src="/bridge-phere.js" defer><\/script>
`;

function serveWithNav(filePath, res) {
  try {
    let html = fs.readFileSync(filePath, 'utf8');
    if (!html.includes('id="bridge-nav"')) {
      const hasOwnBoot = html.includes('id="boot-screen"');
      const pageName = '/' + path.basename(filePath);
      const boot = hasOwnBoot ? '' : getBootScreen(pageName);
      html = html.replace(/<body[^>]*>/i, (m) => m + boot + NAV_HTML);
    }
    // Inject PHERE before </head> if not already present
    if (!html.includes('bridge-phere-css') && html.includes('</head>')) {
      html = html.replace('</head>', PHERE_INJECT + '</head>');
    }
    res.type('html').send(html);
  } catch (e) { res.status(404).send('Page not found'); }
}

app.get('/topology.html', (_req, res) => serveWithNav(path.join(XPUBLIC, 'topology.html'), res));
app.get('/registry.html', (_req, res) => serveWithNav(path.join(XPUBLIC, 'registry.html'), res));
app.get('/marketplace.html', (_req, res) => serveWithNav(path.join(XPUBLIC, 'marketplace.html'), res));
app.get('/avatar.html', (_req, res) => serveWithNav(path.join(XPUBLIC, 'avatar.html'), res));
app.get('/system-status-dashboard.html', (_req, res) => serveWithNav(path.join(XPUBLIC, 'system-status-dashboard.html'), res));
app.get('/terminal.html', (_req, res) => serveWithNav(path.join(XPUBLIC, 'terminal.html'), res));
app.get('/control.html', (_req, res) => serveWithNav(path.join(XPUBLIC, 'control.html'), res));
app.get('/onboarding.html', (_req, res) => serveWithNav(path.join(XPUBLIC, 'onboarding.html'), res));
app.get('/sitemap.html', (_req, res) => serveWithNav(path.join(XPUBLIC, 'sitemap.html'), res));
app.get('/topology-layers.html', (_req, res) => serveWithNav(path.join(XPUBLIC, 'topology-layers.html'), res));
app.get('/abaas.html', (_req, res) => serveWithNav(path.join(XPUBLIC, 'abaas.html'), res));
app.get('/aoe-dashboard.html', (_req, res) => serveWithNav(path.join(XPUBLIC, 'aoe-dashboard.html'), res));
app.get('/logs.html', (_req, res) => serveWithNav(path.join(XPUBLIC, 'logs.html'), res));
app.get('/view-logs.html', (_req, res) => serveWithNav(path.join(XPUBLIC, 'logs.html'), res));
// All dynamic pages (subdomain homes + imported BridgeLiveWall + everything)
const ALL_PAGES = [
  'bridge-home','ban-home','supac-home','ehsa-home','aurora-home','ubi-home','aid-home','abaas-home','hospital-home','rootedearth-home',
  'applications','admin','agents','digital-twin-console','docs','executive-dashboard','landing','join','settings','twin-wall','ehsa-brain','ehsa-app',
  '50-applications','anatomical_face','anatomical_face_constrained_system','anatomical_face_embodied','anatomical_face_facs','anatomical_face_tension_balanced','anatomical_face_vector_muscle',
  'trading','defi','wallet','governance','intelligence','pricing','view-logs','corporate','affiliate',
];
ALL_PAGES.forEach(p => {
  app.get(`/${p}.html`, (_req, res) => serveWithNav(path.join(XPUBLIC, `${p}.html`), res));
});
// Gateway sub-page
app.get('/gateway/index.html', (_req, res) => serveWithNav(path.join(XPUBLIC, 'gateway', 'index.html'), res));
app.get('/platforms.html', (_req, res) => serveWithNav(path.join(XPUBLIC, 'platforms.html'), res));
app.get('/brand.html', (_req, res) => serveWithNav(path.join(XPUBLIC, 'brand.html'), res));
app.get('/welcome.html', (_req, res) => serveWithNav(path.join(XPUBLIC, 'welcome.html'), res));
// Serve static assets (logos, SVGs, documents)
app.use('/assets', express.static(path.join(XPUBLIC, 'assets')));

// ── BRAIN NON-API ROUTES — proxy brain endpoints that don't start with /api ──
// brain-live serves the 3D brain directly
app.get('/brain-live', (_req, res) => res.sendFile(path.join(ROOT, 'Xpublic', 'ehsa-brain.html')));
// Note: '/docs' intentionally excluded — handled by GATEWAY_SHORT_ROUTES → /docs.html
const BRAIN_ROUTES = ['/live-map', '/skills', '/graph', '/telemetry', '/run', '/teach', '/econ', '/output', '/treasury', '/swarm', '/share', '/index.json', '/manifest.json', '/auth/google', '/auth/microsoft', '/auth/github', '/view-logs'];
BRAIN_ROUTES.forEach(prefix => {
  app.all(prefix, async (req, res, next) => {
    try {
      const r = await fetch(`http://localhost:8000${req.originalUrl}`, { signal: AbortSignal.timeout(3000) });
      const ct = r.headers.get('content-type') || 'application/json';
      const text = await r.text();
      res.status(r.status).set('Content-Type', ct).send(text);
    } catch (_) { next(); }
  });
  app.all(`${prefix}/*path`, async (req, res, next) => {
    try {
      const r = await fetch(`http://localhost:8000${req.originalUrl}`, { signal: AbortSignal.timeout(3000) });
      const ct = r.headers.get('content-type') || 'application/json';
      const text = await r.text();
      res.status(r.status).set('Content-Type', ct).send(text);
    } catch (_) { next(); }
  });
});

// ── WORDPRESS INTEGRATION LAYER ──────────────────────────────────────────────
// Proxies /wp-json/* to a configured WordPress instance.
// Set WP_URL in .env to activate (e.g. WP_URL=https://blog.ai-os.co.za)
// When WP is absent, returns graceful stubs so the frontend never breaks.
const WP_URL = process.env.WP_URL || '';

// PHERE activation signal from frontend
app.post('/wp-json/bridge-ai/v1/phere/activate', (req, res) => {
  // If WP is configured, forward to WP REST API
  if (WP_URL) {
    fetch(`${WP_URL}/wp-json/bridge-ai/v1/phere/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(3000),
    })
      .then(r => r.json())
      .then(j => res.json(j))
      .catch(() => res.json({ ok: true, source: 'gateway-stub' }));
  } else {
    res.json({ ok: true, source: 'gateway-stub', message: 'Set WP_URL to activate WordPress integration' });
  }
});

// WordPress REST API proxy — passes through all /wp-json/* requests
app.all('/wp-json/*path', async (req, res) => {
  if (!WP_URL) {
    // Graceful stub: return empty-but-valid WP REST responses
    const path = req.params.path || [];
    const pathStr = Array.isArray(path) ? path.join('/') : path;
    if (pathStr.startsWith('wp/v2/posts')) {
      return res.json([]);
    }
    if (pathStr.startsWith('wp/v2/pages')) {
      return res.json([]);
    }
    return res.status(503).json({
      code: 'wp_not_configured',
      message: 'Set WP_URL environment variable to enable WordPress integration',
      data: { status: 503 },
    });
  }

  const subpath = req.originalUrl.replace('/wp-json', '');
  const url = `${WP_URL}/wp-json${subpath}`;
  try {
    const opts = { method: req.method, headers: {}, signal: AbortSignal.timeout(5000) };
    if (req.headers['authorization']) opts.headers['Authorization'] = req.headers['authorization'];
    if (req.headers['content-type']) opts.headers['Content-Type'] = req.headers['content-type'];
    if (req.method !== 'GET' && req.body) opts.body = JSON.stringify(req.body);
    const r = await fetch(url, opts);
    const text = await r.text();
    res.status(r.status).set('Content-Type', r.headers.get('content-type') || 'application/json').send(text);
  } catch (e) {
    res.status(502).json({ code: 'wp_unreachable', message: e.message });
  }
});

// WordPress posts feed for embedding in pages (e.g. blog section on landing)
app.get('/api/wp/posts', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '5', 10), 20);
  if (!WP_URL) {
    return res.json({ posts: [], source: 'stub', configured: false });
  }
  try {
    const r = await fetch(
      `${WP_URL}/wp-json/wp/v2/posts?per_page=${limit}&_fields=id,title,excerpt,link,date,categories`,
      { signal: AbortSignal.timeout(4000) }
    );
    const posts = await r.json();
    res.json({ posts: Array.isArray(posts) ? posts : [], source: 'wordpress', configured: true });
  } catch (e) {
    res.json({ posts: [], source: 'error', error: e.message });
  }
});

// ── REAL TREASURY (PostgreSQL via server on :3000) ────────────────────────────
const os = require('os');
const http = require('http');

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, { timeout: 5000 }, r => {
      let body = '';
      r.on('data', c => body += c);
      r.on('end', () => { try { resolve(JSON.parse(body)); } catch { reject(new Error('parse')); } });
    }).on('error', reject);
  });
}

app.get('/api/treasury/summary', async (req, res) => {
  try {
    const data = await fetchJSON('http://localhost:3000/api/treasury');
    const total = (data.buckets || []).reduce((s, b) => s + parseFloat(b.balance || 0), 0);
    res.json({
      balance: total, earned: total, spent: 0, currency: 'ZAR',
      subscriptions: 0, plans: [],
      source: 'postgresql', buckets: data.buckets || []
    });
  } catch { res.json({ balance: 0, earned: 0, spent: 0, currency: 'ZAR', subscriptions: 0, plans: [] }); }
});

app.get('/api/system/metrics', (req, res) => {
  const upSec = os.uptime();
  res.json({
    cpu: Math.round(os.loadavg()[0] * 100 / Math.max(os.cpus().length, 1)),
    memory: Math.round((os.totalmem() - os.freemem()) / 1048576) + 'MB',
    uptime: Math.floor(upSec) + 's',
    load: os.loadavg().map(l => l.toFixed(2)).join(' ')
  });
});

// ── BRAIN PROXY — forward unknown /api/* to brain on 8000 ────────────────────
// This catches any /api/* route not handled above and proxies to the brain
app.all('/api/*path', async (req, res) => {
  const url = `http://localhost:8000${req.originalUrl}`;
  try {
    const opts = { method: req.method, headers: {}, signal: AbortSignal.timeout(5000) };
    if (req.headers['content-type']) opts.headers['Content-Type'] = req.headers['content-type'];
    if (req.method !== 'GET' && req.body) opts.body = JSON.stringify(req.body);
    const r = await fetch(url, opts);
    const ct = r.headers.get('content-type') || 'application/json';
    const text = await r.text();
    res.status(r.status).set('Content-Type', ct).send(text);
  } catch (e) {
    res.status(502).json({ error: 'brain unreachable', path: req.originalUrl, details: e.message });
  }
});

// ── SUBDOMAIN ROUTING ────────────────────────────────────────────────────────
app.get('/home.html', (_req, res) => serveWithNav(path.join(XPUBLIC, 'home.html'), res));
app.get('/corporate.html', (_req, res) => serveWithNav(path.join(XPUBLIC, 'corporate.html'), res));
app.get('/ehsa-app.html', (_req, res) => serveWithNav(path.join(XPUBLIC, 'ehsa-app.html'), res));

// ── SHORT-PATH ALIASES (no .html) ────────────────────────────────────────────
// These mirror server.js shortRoutes so all ui.html Quick Actions work on :8080
const GATEWAY_SHORT_ROUTES = {
  '/landing': '/landing.html',
  '/apps': '/50-applications.html',
  '/treasury-dash': '/aoe-dashboard.html',
  '/leadgen': '/leadgen.html',
  '/control': '/control.html',
  '/dashboard': '/aoe-dashboard.html',
  '/status': '/system-status-dashboard.html',
  '/registry': '/registry.html',
  '/crm': '/crm.html',
  '/invoicing': '/invoicing.html',
  '/marketing': '/marketing.html',
  '/legal': '/legal.html',
  '/tickets': '/tickets.html',
  '/pricing': '/pricing.html',
  '/ehsa': '/ehsa-app.html',
  '/supac': '/supac-home.html',
  '/ubi': '/ubi-home.html',
  '/aid': '/aid-home.html',
  '/aurora': '/aurora-home.html',
  '/sitemap': '/sitemap.html',
  '/onboarding': '/onboarding.html',
  '/agents': '/agents.html',
  '/docs': '/docs.html',
  '/marketplace': '/marketplace.html',
  '/topology': '/topology.html',
  '/terminal': '/terminal.html',
  '/settings': '/settings.html',
  '/home': '/home.html',
  '/welcome': '/welcome.html',
  '/corporate': '/corporate.html',
  '/brand': '/brand.html',
  '/governance': '/governance.html',
  '/twins': '/digital-twin-console.html',
  '/intelligence': '/intelligence.html',
  '/executive': '/executive-dashboard.html',
};
Object.entries(GATEWAY_SHORT_ROUTES).forEach(([short, target]) => {
  app.get(short, (_req, res) => res.redirect(target));
});

const SUBDOMAIN_MAP = {
  'ai-os.co.za': 'home.html',
  'go.ai-os.co.za': 'landing.html',
  'gateway.ai-os.co.za': 'landing.html',
  'bridge.ai-os.co.za': 'bridge-home.html',
  'ban.ai-os.co.za': 'ban-home.html',
  'supac.ai-os.co.za': 'supac-home.html',
  'ehsa.ai-os.co.za': 'ehsa-app.html',
  'aurora.ai-os.co.za': 'aurora-home.html',
  'ubi.ai-os.co.za': 'ubi-home.html',
  'aid.ai-os.co.za': 'aid-home.html',
  'abaas.ai-os.co.za': 'abaas-home.html',
  'hospitalinabox.ai-os.co.za': 'hospital-home.html',
  'rootedearth.ai-os.co.za': 'rootedearth-home.html',
};

app.get('/', (req, res) => {
  const host = req.hostname || req.headers.host?.split(':')[0] || '';
  const subPage = SUBDOMAIN_MAP[host];
  if (subPage) {
    return serveWithNav(path.join(XPUBLIC, subPage), res);
  }
  serveWithNav(path.join(ROOT, 'ui.html'), res);
});

// ── START (skipped when required by tests) ───────────────────────────────────
// Bind to '::' so it covers both IPv6 (::1) and IPv4 (127.0.0.1) on Windows
// This ensures 'localhost' resolves correctly regardless of OS preference
if (require.main === module) {
  const server = app.listen(8080, '::', () => {
    console.log('[GATEWAY] Bridge AI OS unified gateway running on http://localhost:8080');
    console.log('[GATEWAY] Core endpoints : /health  /events/stream  /orchestrator/status  /billing  /ask');
    console.log('[GATEWAY] Unified API    : /api/topology  /api/avatar/*  /api/registry/*  /api/marketplace/*');
    console.log('[GATEWAY]                  /api/status  /api/agents  /api/contracts');
    console.log('[GATEWAY] Auth           : /auth/register  /auth/login  /auth/verify  /referral/claim');
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error('[GATEWAY] Port 8080 in use — retrying on IPv4 only');
      app.listen(8080, '0.0.0.0', () => {
        console.log('[GATEWAY] Fallback: listening on 0.0.0.0:8080');
      });
    } else {
      throw err;
    }
  });
}

// ── EXPORT (for supertest) ────────────────────────────────────────────────────
module.exports = app;
