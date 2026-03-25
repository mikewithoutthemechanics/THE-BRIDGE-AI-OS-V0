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

// ── CORS ────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json());

// ── REQUEST LOGGING MIDDLEWARE ────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`[GATEWAY] ${req.method} ${req.path} — ${res.statusCode} (${ms}ms)`);
  });
  next();
});

app.use(express.static(ROOT));

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
}, 5000);

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
    agents: orchAgents.length,
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
// Proxies to system.js on :3000 when available, else returns a stub topology.
app.get('/api/topology', async (req, res) => {
  try {
    const r = await fetch('http://localhost:3000/topology');
    const j = await r.json();
    return res.json(j);
  } catch (_) {
    // Stub topology
    return res.json({
      stub: true,
      nodes: [
        { id: 'gateway',      label: 'Gateway',        port: 8080, status: 'up' },
        { id: 'system',       label: 'System / Core',  port: 3000, status: 'unknown' },
        { id: 'ainode',       label: 'AI Node',        port: 3001, status: 'unknown' },
        { id: 'orchestrator', label: 'Orchestrator',   port: 3002, status: 'unknown' },
      ],
      edges: [
        { source: 'gateway', target: 'system' },
        { source: 'gateway', target: 'ainode' },
        { source: 'gateway', target: 'orchestrator' },
      ],
      ts: Date.now(),
    });
  }
});

// ── API: AVATAR ───────────────────────────────────────────────────────────────
// Wildcard handler for avatar rendering endpoints.
app.get('/api/avatar/*path', (req, res) => {
  const subpath = req.params.path || 'default';
  res.json({
    stub: true,
    endpoint: `/api/avatar/${subpath}`,
    scene: {
      type: 'babylon-scene',
      avatar_id: subpath,
      mesh: 'humanoid_base_v1',
      texture: 'default_skin',
      animation: 'idle',
      position: { x: 0, y: 0, z: 0 },
      scale: 1.0,
    },
    ts: Date.now(),
  });
});

// ── API: REGISTRY ─────────────────────────────────────────────────────────────
// Wildcard handler for registry data (kernel, network, security, etc.).
app.get('/api/registry/*path', (req, res) => {
  const namespace = req.params.path || 'root';
  const REGISTRY_STUBS = {
    kernel:   { version: '4.2.1', modules: ['scheduler', 'ipc', 'memory'], status: 'healthy' },
    network:  { interfaces: ['eth0', 'lo'], dns: ['8.8.8.8', '1.1.1.1'], status: 'healthy' },
    security: { tls: true, firewall: 'active', last_scan: new Date().toISOString(), status: 'healthy' },
  };
  const data = REGISTRY_STUBS[namespace] || { namespace, status: 'unknown', entries: [] };
  res.json({ stub: true, namespace, data, ts: Date.now() });
});

// ── API: MARKETPLACE ──────────────────────────────────────────────────────────
// Wildcard handler for marketplace (tasks, DEX, wallet, skills, portfolio, stats).
app.get('/api/marketplace/*path', (req, res) => {
  const section = req.params.path || 'index';
  const MARKET_STUBS = {
    tasks: {
      open: 14, in_progress: 7, completed_today: 23,
      listings: [
        { id: 't001', title: 'Lead enrichment run', reward: 120, status: 'open' },
        { id: 't002', title: 'Sentiment analysis batch', reward: 85, status: 'open' },
      ],
    },
    dex: {
      pairs: ['USD/BRIDGE', 'ETH/BRIDGE'],
      liquidity_usd: 480000,
      volume_24h: 12350,
    },
    wallet: {
      address: '0xSTUB000000000000000000000000000000000000',
      balances: [{ token: 'BRIDGE', amount: 5000 }, { token: 'ETH', amount: 1.2 }],
    },
    skills: {
      available: ['nlp', 'vision', 'forecasting', 'scraping', 'summarisation'],
      installed: ['nlp', 'scraping'],
    },
    portfolio: {
      total_value_usd: 62400,
      assets: [{ name: 'BRIDGE', usd: 5000 }, { name: 'ETH', usd: 3200 }],
    },
    stats: {
      total_tasks: 1482, total_agents: agentNames.length,
      revenue_total: 138000, uptime_pct: 99.7,
    },
  };
  const data = MARKET_STUBS[section] || { section, status: 'unknown', items: [] };
  res.json({ stub: true, section, data, ts: Date.now() });
});

// ── API: STATUS ───────────────────────────────────────────────────────────────
// Aggregate health of all known services.
app.get('/api/status', async (req, res) => {
  const services = [
    { id: 'gateway',      url: null,                         port: 8080 },
    { id: 'system',       url: 'http://localhost:3000/health', port: 3000 },
    { id: 'ainode',       url: 'http://localhost:3001/health', port: 3001 },
    { id: 'orchestrator', url: 'http://localhost:3002/health', port: 3002 },
  ];

  const results = await Promise.all(
    services.map(async (svc) => {
      if (!svc.url) return { id: svc.id, port: svc.port, status: 'up', latency_ms: 0 };
      const t0 = Date.now();
      try {
        const r = await fetch(svc.url, { signal: AbortSignal.timeout(2000) });
        const latency_ms = Date.now() - t0;
        return { id: svc.id, port: svc.port, status: r.ok ? 'up' : 'degraded', latency_ms };
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
  L2: 'http://localhost:9002',
  L3: 'http://localhost:9003',
};

// ── L1 / L2 / L3 PROXY ROUTES ────────────────────────────────────────────────
// Proxy /api/l1/*, /api/l2/*, /api/l3/* to the correct orchestrator ports
for (const [layer, base] of Object.entries(ORCHESTRATORS)) {
  const prefix = `/api/${layer.toLowerCase()}`;
  app.all(`${prefix}/*`, async (req, res) => {
    const subpath = req.path.slice(prefix.length) || '/';
    const url = `${base}${subpath}`;
    try {
      const opts = { method: req.method, headers: { 'Content-Type': 'application/json' } };
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
// Aggregates live agent status from all three orchestrators
app.get('/api/agents', async (req, res) => {
  const results = {};
  await Promise.all(
    Object.entries(ORCHESTRATORS).map(async ([layer, base]) => {
      try {
        const r = await fetch(`${base}/api/status`);
        const j = await r.json();
        results[layer] = { status: 'up', port: parseInt(base.split(':')[2]), agents: j.agents };
      } catch (e) {
        results[layer] = { status: 'down', error: e.message, agents: {} };
      }
    })
  );
  const allAgents = Object.entries(results).flatMap(([layer, d]) =>
    Object.entries(d.agents || {}).map(([id, a]) => ({ ...a, id, layer, port: d.port }))
  );
  res.json({ count: allAgents.length, layers: results, agents: allAgents, ts: Date.now() });
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

// ── UI ────────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(ROOT, 'ui.html'));
});

// ── START ─────────────────────────────────────────────────────────────────────
// Bind to '::' so it covers both IPv6 (::1) and IPv4 (127.0.0.1) on Windows
// This ensures 'localhost' resolves correctly regardless of OS preference
const server = app.listen(8080, '::', () => {
  console.log('[GATEWAY] Bridge AI OS unified gateway running on http://localhost:8080');
  console.log('[GATEWAY] Core endpoints : /health  /events/stream  /orchestrator/status  /billing  /ask');
  console.log('[GATEWAY] Unified API    : /api/topology  /api/avatar/*  /api/registry/*  /api/marketplace/*');
  console.log('[GATEWAY]                  /api/status  /api/agents  /api/contracts');
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
