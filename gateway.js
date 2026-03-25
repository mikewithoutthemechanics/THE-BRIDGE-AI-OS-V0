const express = require('express');
const path = require('path');
const app = express();

const ROOT = __dirname;

// ── CORS ────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json());
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

// ── UI ────────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(ROOT, 'ui.html'));
});

// ── START ─────────────────────────────────────────────────────────────────────
// Bind to '::' so it covers both IPv6 (::1) and IPv4 (127.0.0.1) on Windows
// This ensures 'localhost' resolves correctly regardless of OS preference
const server = app.listen(8080, '::', () => {
  console.log('[GATEWAY] Bridge AI OS gateway running on http://localhost:8080');
  console.log('[GATEWAY] Endpoints: /health  /events/stream  /orchestrator/status  /billing  /ask');
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
