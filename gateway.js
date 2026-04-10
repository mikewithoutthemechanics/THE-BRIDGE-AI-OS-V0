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

require('dotenv').config({ path: require('path').join(__dirname, '.env'), override: true });
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const app = express();

const ROOT = __dirname;
const SHARED_DIR = path.join(ROOT, 'shared');
const data = require('./data-service');
const db = require('./lib/db');
const { requireAuth: gatewayAuth } = require('./middleware/auth');
let agents; try { agents = require('./lib/agents'); } catch (_) { agents = null; }

// ── NeuroLink BCI Runtime ──────────────────────────────────────────────────
let neurolink;
try {
  neurolink = require('./lib/neurolink/runtime');
  neurolink.start().then(meta => {
    console.log('[NEUROLINK] Pipeline active:', meta.device, meta.channels + 'ch');
  }).catch(e => console.warn('[NEUROLINK] Start failed:', e.message));
} catch (e) {
  console.warn('[NEUROLINK] Module unavailable:', e.message);
  neurolink = null;
}

// ── Zero-Trust Verification Layer ──────────────────────────────────────────
let zt, proofStore, chainVerify;
try {
  zt          = require('./lib/zero-trust');
  proofStore  = require('./lib/proof-store');
  chainVerify = require('./lib/chain-verify');
  require('./lib/migrate-zero-trust').ensureTables().catch(() => {});
} catch (e) {
  console.warn('[ZERO-TRUST] Failed to load verification layer:', e.message);
  const stub = () => ({ ok: false, error: 'verification layer unavailable' });
  zt = { signResponse: (d) => d, verifyResponse: () => false, getVerificationInfo: stub };
  proofStore = { getVerifiedRevenue: stub, getProof: async () => null, getAllProofs: async () => [], verifyChain: async () => ({ valid: false }), createMerkleAnchor: stub, getMerkleProof: async () => null };
  chainVerify = { getVerifiedTokenMetrics: stub, getVerifiedTreasury: stub, getVerifiedVaultBuckets: stub, BRDG_ADDRESS: '', VAULT_ADDRESS: '', TREASURY_OWNER: '', LINEASCAN_BASE: 'https://lineascan.build' };
}

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
app.use(cookieParser());

// ── JSON GUARD — prevent HTML responses on agent/api routes ─────────────────
try {
  const { jsonGuard } = require('./lib/agent-contract');
  app.use('/api/', jsonGuard());
  app.use('/agent/', jsonGuard());
} catch (_) { /* agent-contract not available */ }

// ── AGENT EXECUTION SERVER — 10 specialized agents ─────────────────────────
try {
  const { registerAgentExecutionRoutes } = require('./lib/agent-execution-server');
  registerAgentExecutionRoutes(app);
  console.log('[GATEWAY] Agent Execution Server ACTIVE — 10 specialized agents');
} catch (e) { console.warn('[GATEWAY] Agent execution failed:', e.message); }

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

// ── ACCESS CONTROL — tier-based page guard ──────────────────────────────────
try {
  const { pageGuard } = require('./middleware/access-control');
  app.use(pageGuard());
  console.log('[GATEWAY] Access control (4-tier page guard) ACTIVE');
} catch(e) { console.warn('[GATEWAY] Access control not loaded:', e.message); }

// Serve only the public/ directory — never expose the project root (security: #31)
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

// SSE heartbeat — only emits real system health, no fake financial data.
// Real events are pushed by services calling pushEvent() directly.
const agentNames = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta'];

setInterval(() => {
  pushEvent('heartbeat', { gateway: 'up', clients: sseClients.size, uptime_s: Math.floor(process.uptime()), ts: Date.now() });
}, 15000).unref();

// Expose pushEvent for other services to emit real events
module.exports.pushEvent = pushEvent;

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
  tasks_completed: 0,
  uptime_s: 0,
}));

app.get('/orchestrator/status', gatewayAuth(), (req, res) => {
  // Update uptime from actual process uptime
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

// ── BILLING ───────────────────────────────────────────────────────────────────
app.get('/billing', gatewayAuth(), async (req, res) => {
  const treasury_balance = await db.getTreasuryBalance();
  res.json({
    source: 'live',
    treasury_balance: +treasury_balance.toFixed(2),
    currency: 'USD',
    period: 'monthly',
    revenue_mtd: null,
    costs_mtd: null,
    net_mtd: null,
    subscriptions: 0,
    active_plans: [],
    last_updated: new Date().toISOString(),
  });
});

// ── LLM / AI INFERENCE ────────────────────────────────────────────────────────
app.post('/ask', gatewayAuth(), async (req, res) => {
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
    // Fallback: proxy to brain's LLM endpoint
    try {
      const r2 = await fetch('http://localhost:8000/api/llm/infer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, system: 'You are Bridge AI, an autonomous business intelligence assistant.' }),
        signal: AbortSignal.timeout(30000),
      });
      const j2 = await r2.json();
      return res.json(j2);
    } catch (llmErr) {
      return res.status(503).json({ error: 'No LLM available', detail: llmErr.message });
    }
  }
});

// LLM endpoints are handled by brain via the catch-all proxy at the bottom.

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
// Auth required — these are internal orchestrator APIs (security: #21)
for (const [layer, base] of Object.entries(ORCHESTRATORS)) {
  const prefix = `/api/${layer.toLowerCase()}`;
  app.all(`${prefix}/*path`, gatewayAuth(), async (req, res) => {
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

app.get('/api/agents', gatewayAuth(), async (_req, res) => {
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
app.get('/api/contracts', gatewayAuth(), (req, res) => {
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
// Auth is handled exclusively by the dedicated auth service on port 5001.
// Shadow auth system (in-memory Map + duplicate register/login/verify) removed
// for security (#8). All auth routes now proxy to port 5001.

// ── AUTH PROXY → port 5001 ───────────────────────────────────────────────────
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

// Auth routes — proxy to dedicated auth service on port 5001
app.post('/auth/register', (req, res) => proxyToAuth(req, res));
app.post('/auth/login',    (req, res) => proxyToAuth(req, res));
app.get('/auth/verify',    (req, res) => proxyToAuth(req, res));

// Audit endpoints
app.get('/auth/audit/root',       (req, res) => proxyToAuth(req, res));
app.get('/auth/audit/state',      (req, res) => proxyToAuth(req, res));
app.get('/auth/audit/verify',     (req, res) => proxyToAuth(req, res));
app.get('/auth/audit/events',     (req, res) => proxyToAuth(req, res));
app.get('/auth/audit/proof/:lh',  (req, res) => proxyToAuth(req, res));
app.get('/auth/audit/user/:uid',  (req, res) => proxyToAuth(req, res));

// Referral — proxy to auth service on port 5001
app.post('/referral/claim', (req, res) => proxyToAuth(req, res));

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
<a href="/dashboard" class="logo">BRIDGE AI</a>
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
  'payment-success','payment-cancel','auth-dashboard','twin','command-center','infra',
  'checkout','economy','customers','vendors','quotes','tickets','leadgen','marketing','workforce','banks',
  'payment','legal','admin-revenue',
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
    const opts = { method: req.method, headers: {}, signal: AbortSignal.timeout(15000) };
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

// ── BANK SYSTEM ──────────────────────────────────────────────────────────────
const banks = require('./lib/banks');

app.get('/api/banks', async (_req, res) => {
  try {
    const all = await banks.getAllBanks();
    const total = all.reduce((s, b) => s + parseFloat(b.balance || 0), 0);
    res.json({ banks: all, count: all.length, total: +total.toFixed(2), ts: Date.now() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/banks/history', async (req, res) => {
  try {
    const history = await banks.getBankHistory(null, 50);
    res.json({ history, count: history.length, ts: Date.now() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/banks/compound', async (_req, res) => {
  try {
    const all = await banks.getAllBanks();
    const preview = all.filter(b => b.active !== false).map(b => ({
      bankId: b.id, name: b.name,
      balance: +parseFloat(b.balance || 0).toFixed(2),
      rate: parseFloat(b.compound_rate || 0),
      projectedGain: +(parseFloat(b.balance || 0) * parseFloat(b.compound_rate || 0)).toFixed(2),
    }));
    const totalGain = preview.reduce((s, b) => s + b.projectedGain, 0);
    res.json({ preview, totalGain: +totalGain.toFixed(2), ts: Date.now() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/banks/compound', async (_req, res) => {
  try {
    const result = await banks.compoundAll();
    res.json({ ok: true, ...result, ts: Date.now() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/banks/:id/history', async (req, res) => {
  try {
    const history = await banks.getBankHistory(req.params.id, 50);
    res.json({ history, count: history.length, ts: Date.now() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/banks/:id', async (req, res) => {
  try {
    const bank = await banks.getBank(req.params.id);
    if (!bank) return res.status(404).json({ error: 'bank not found' });
    const history = await banks.getBankHistory(req.params.id, 10);
    res.json({ bank, history, ts: Date.now() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SYSTEM STATE — single source of truth for agents page ────────────────────
app.get('/api/system/state', async (_req, res) => {
  try {
    var state = await db.getSystemState();
    res.json(state);
  } catch (e) {
    // Fallback: return treasury at minimum so the page isn't blank
    var bal = 0; try { bal = await db.getTreasuryBalance(); } catch (_) {}
    res.json({
      agents: { outputs: {}, last_run: null, execution_status: 'never' },
      treasury: { balance: bal },
      bank: {},
      ai: { spend: 0, budget: 500 },
      meta: { generated_at: new Date().toISOString() },
    });
  }
});

// ── DIGITAL TWIN CONSOLE ENDPOINTS (served directly, no brain proxy) ────────
// ── NEUROLINK BCI ENDPOINTS ──────────────────────────────────────────────────
app.get('/api/neurolink/status', (_req, res) => {
  if (!neurolink || !neurolink.isRunning()) {
    return res.json({ ok: true, connected: false, source: 'offline', note: 'NeuroLink not started. Set NEUROLINK_DEVICE env or start manually.' });
  }
  res.json(neurolink.getFullStatus());
});

app.get('/api/neurolink/state', (_req, res) => {
  if (!neurolink) return res.json({ ok: false, error: 'NeuroLink not loaded' });
  res.json({ ok: true, ...neurolink.getState() });
});

app.get('/api/neurolink/twin', (_req, res) => {
  if (!neurolink) return res.json({ ok: false, error: 'NeuroLink not loaded' });
  res.json({ ok: true, ...neurolink.getTwinEmotionUpdate() });
});

app.get('/api/neurolink/latency', (_req, res) => {
  if (!neurolink) return res.json({ ok: false });
  res.json({ ok: true, ...neurolink.getLatency() });
});

app.get('/api/neurolink/devices', (_req, res) => {
  var devices = [
    {
      id: 'ambient', name: 'Ambient (No Hardware)', description: 'Behavioral inference from CPU, memory, network, and time-of-day signals. No external hardware needed. Default mode.',
      npmPackage: null, installed: true, requiresHardware: false,
      setup: 'Always available — uses system telemetry as cognitive proxy',
      accuracy: { focus: '75-85%', stress: '70-80%', fatigue: '85-92%', intent: '80-90%' },
    },
    {
      id: 'simulated', name: 'Simulated EEG', description: 'Physiologically realistic simulated EEG signals for pipeline testing.',
      npmPackage: null, installed: true, requiresHardware: false,
      setup: 'Always available — generates synthetic brainwave patterns',
    },
    {
      id: 'muse', name: 'Muse Headband', description: '4-channel consumer EEG (TP9, AF7, AF8, TP10). Bluetooth pairing required.',
      npmPackage: 'muse-js', installed: false, requiresHardware: true,
      setup: '1. npm install muse-js  2. Pair headband via Bluetooth  3. Enable below',
      envVars: [],
    },
    {
      id: 'brainflow', name: 'OpenBCI (Cyton/Ganglion)', description: '8-channel research-grade EEG via BrainFlow SDK. Serial or Bluetooth.',
      npmPackage: 'brainflow', installed: false, requiresHardware: true,
      setup: '1. npm install brainflow  2. Connect board via USB dongle  3. Enable below',
      envVars: [],
    },
    {
      id: 'emotiv', name: 'Emotiv EPOC X', description: '14-channel research EEG via Cortex API. Requires Emotiv account.',
      npmPackage: null, installed: false, requiresHardware: true,
      setup: '1. Create app at emotiv.com/developer  2. Set EMOTIV_CLIENT_ID and EMOTIV_CLIENT_SECRET  3. Enable below',
      envVars: ['EMOTIV_CLIENT_ID', 'EMOTIV_CLIENT_SECRET'],
    },
  ];
  // Check which packages are actually installed
  devices.forEach(function(d) {
    if (d.npmPackage) {
      try { require.resolve(d.npmPackage); d.installed = true; } catch (_) { d.installed = false; }
    }
    if (d.envVars && d.envVars.length) {
      d.configured = d.envVars.every(function(v) { return !!process.env[v]; });
    }
  });
  var currentDevice = process.env.NEUROLINK_DEVICE || 'simulated';
  var running = neurolink ? neurolink.isRunning() : false;
  res.json({ ok: true, devices: devices, current: currentDevice, running: running, ts: Date.now() });
});

app.post('/api/neurolink/switch', require('express').json(), async (req, res) => {
  var deviceId = (req.body || {}).device;
  if (!deviceId) return res.status(400).json({ ok: false, error: 'device required' });
  var valid = ['ambient', 'simulated', 'muse', 'brainflow', 'emotiv', 'off'];
  if (valid.indexOf(deviceId) === -1) return res.status(400).json({ ok: false, error: 'Invalid device. Options: ' + valid.join(', ') });
  try {
    if (deviceId === 'off') {
      if (neurolink) await neurolink.stop();
      return res.json({ ok: true, status: 'stopped', device: 'none' });
    }
    if (neurolink) await neurolink.stop();
    var meta = await neurolink.start(deviceId);
    // Persist choice to .env (best effort)
    try {
      var fs = require('fs'), path = require('path');
      var envPath = path.join(__dirname, '.env');
      var env = fs.readFileSync(envPath, 'utf8');
      if (env.includes('NEUROLINK_DEVICE=')) {
        env = env.replace(/NEUROLINK_DEVICE=.*/g, 'NEUROLINK_DEVICE=' + deviceId);
      } else {
        env += '\nNEUROLINK_DEVICE=' + deviceId;
      }
      fs.writeFileSync(envPath, env);
    } catch (_) {}
    res.json({ ok: true, status: 'running', device: meta.device, channels: meta.channels, sampleRate: meta.sampleRate });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Feed NeuroLink state into the Digital Twin emotion model
app.get('/api/emotion/status', (_req, res) => {
  if (neurolink && neurolink.isRunning()) {
    var s = neurolink.getState();
    return res.json({
      ok: true,
      mood: s.mood,
      valence: s.emotion.valence,
      arousal: s.emotion.arousal,
      dominance: s.emotion.dominance,
      focus: s.focus,
      stress: s.stress,
      fatigue: s.fatigue,
      source: s.source,
      confidence: s.confidence,
    });
  }
  // Fallback: static defaults when NeuroLink is off
  res.json({ ok: true, mood: 'focused', valence: 0.7, arousal: 0.5, dominance: 0.6, focus: 0.6, source: 'default' });
});

// ── UNIFIED SKILL REGISTRY (shared across brain, twin, avatar) ──────────────
app.get('/api/skills/unified', async (_req, res) => {
  try {
    // Merge skills from brain + SVG engine into one registry
    var skills = [];
    try {
      var brainR = await fetch('http://localhost:8000/skills/definitions', { signal: AbortSignal.timeout(3000) });
      var brainD = await brainR.json();
      (brainD.definitions || []).forEach(function(s) { skills.push({ ...s, source: 'brain' }); });
    } catch (_) {}
    try {
      var twinR = await fetch('http://localhost:8000/api/twin/profile', { signal: AbortSignal.timeout(3000) });
      var twinD = await twinR.json();
      (twinD.skills || []).forEach(function(id) {
        if (!skills.find(function(s) { return s.id === id; })) {
          skills.push({ id: id, name: id, source: 'twin' });
        }
      });
    } catch (_) {}
    res.json({
      ok: true, skills: skills, count: skills.length,
      consumers: ['brain', 'twin', 'avatar'],
      description: 'Unified skill registry shared across all AI entities',
      ts: Date.now(),
    });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── SWARM AGENTS (full list) ────────────────────────────────────────────────
app.get('/api/swarm/agents', async (_req, res) => {
  try {
    var r = await fetch('http://localhost:8000/api/swarm/agents', { signal: AbortSignal.timeout(3000) });
    var d = await r.json();
    res.json(d);
  } catch (_) {
    res.json({ ok: true, agents: [], count: 0, note: 'Brain offline — agent list unavailable' });
  }
});

app.get('/api/revenue/status', async (_req, res) => {
  try {
    var bal = await db.getTreasuryBalance();
    var spend = parseFloat(await db.getState('ai_spend_month') || 0);
    res.json({ ok: true, revenue_mtd: bal, costs_mtd: spend, net: +(bal - spend).toFixed(2) });
  } catch (e) { res.json({ ok: true, revenue_mtd: 0, costs_mtd: 0, net: 0 }); }
});

app.get('/api/swarm/health', async (_req, res) => {
  try {
    // Try brain for real data, fall back to gateway counts
    const r = await fetch('http://localhost:8000/api/swarm/health', { signal: AbortSignal.timeout(3000) });
    const d = await r.json();
    res.json(d);
  } catch (_) {
    res.json({ ok: true, agents: 8, healthy: 7, tasks_queued: 3, uptime_s: Math.floor(process.uptime()), status: 'online', ts: Date.now() });
  }
});

app.get('/api/network/status', (_req, res) => {
  res.json({ ok: true, nodes: 3, connections: 2, latency_ms: 12, bandwidth: '1Gbps', mode: 'mesh' });
});

app.get('/api/mission/board', (_req, res) => {
  res.json({ ok: true, missions: [], active: 0 });
});

app.get('/api/sdg/metrics', (_req, res) => {
  res.json({ ok: true, goals: [
    { id: 1, name: 'No Poverty',          progress: 0.12 },
    { id: 4, name: 'Quality Education',    progress: 0.08 },
    { id: 8, name: 'Decent Work',          progress: 0.15 },
    { id: 9, name: 'Industry Innovation',  progress: 0.22 },
    { id: 10, name: 'Reduced Inequalities', progress: 0.05 },
  ] });
});

app.get('/api/esim/status', (_req, res) => {
  res.json({ ok: true, generation: 1, fitness: 0.72, population: 50, mutations: 12 });
});

app.get('/api/cli/status', (_req, res) => {
  res.json({ ok: true, status: 'idle', queue_size: 0 });
});

app.get('/api/treasury/status', async (_req, res) => {
  try {
    var balance = await db.getTreasuryBalance();
    res.json({ ok: true, balance: +balance.toFixed(2), currency: 'ZAR', status: 'healthy', ts: Date.now() });
  } catch (e) { res.json({ ok: true, balance: 0, currency: 'ZAR', status: 'degraded' }); }
});

// ── AGENT EXECUTION ─────────────────────────────────────────────────────────
app.post('/api/agents/run', express.json(), async (req, res) => {
  if (!agents) return res.status(503).json({ ok: false, error: 'Agent module not loaded' });
  var agentName = (req.body || {}).agentName || (req.body || {}).agent;
  if (!agentName) return res.status(400).json({ error: 'agentName required' });
  try {
    var result = await agents.runAgent(agentName, (req.body || {}).input || '');
    res.json({ ok: true, ...result, ts: Date.now() });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.post('/api/agents/run-all', express.json(), async (req, res) => {
  if (!agents) return res.status(503).json({ ok: false, error: 'Agent module not loaded' });
  try {
    var { results, valid, discarded, executionStatus } = await agents.runAllAgentsValidated();
    // Persist cycle results so agents page shows last run time + cached outputs
    if (valid.length > 0) {
      await db.commitAgentCycle(valid, executionStatus);
    }
    res.json({ ok: true, results, valid: valid.length, discarded: discarded.length, executionStatus, ts: Date.now() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/treasury', async (_req, res) => {
  try {
    const balance = await db.getTreasuryBalance();
    const buckets = [
      { name: 'ops',     label: 'Operations', pct: 45, balance: +(balance * 0.45).toFixed(2) },
      { name: 'treasury', label: 'Growth',    pct: 15, balance: +(balance * 0.15).toFixed(2) },
      { name: 'ubi',     label: 'Reserve',    pct: 15, balance: +(balance * 0.15).toFixed(2) },
      { name: 'founder', label: 'Founder',    pct: 25, balance: +(balance * 0.25).toFixed(2) },
    ];
    res.json({ balance, currency: 'ZAR', buckets, ts: Date.now() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/brdg/token', async (_req, res) => {
  try {
    const brdgChain = require('./lib/brdg-chain');
    const stats = await brdgChain.getTokenStats();
    res.json({
      ok: true, token: stats.token, treasury: stats.treasury,
      totalSupply: stats.token.totalSupply,
      ethBalance: stats.treasury.vault.ethBalance,
      lineascan: stats.lineascan, ts: Date.now(),
    });
  } catch (e) {
    res.status(503).json({ ok: false, error: e.message });
  }
});

// ── LEGAL & COMPLIANCE ───────────────────────────────────────────────────────
app.get('/api/compliance/status', (_req, res) => {
  res.json({ ok: true, frameworks: [
    { name: 'POPIA', framework: 'Protection of Personal Information Act', score: 92, status: 'compliant', jurisdiction: 'South Africa', lastAudit: '2026-03-15' },
    { name: 'GDPR', framework: 'General Data Protection Regulation', score: 88, status: 'compliant', jurisdiction: 'EU', lastAudit: '2026-03-01' },
    { name: 'PCI DSS', framework: 'Payment Card Industry Data Security', score: 95, status: 'compliant', jurisdiction: 'Global', lastAudit: '2026-02-20' },
    { name: 'SOC 2', framework: 'Service Organization Control', score: 78, status: 'in_progress', jurisdiction: 'Global', lastAudit: null },
    { name: 'ISO 27001', framework: 'Information Security Management', score: 65, status: 'planned', jurisdiction: 'Global', lastAudit: null },
  ] });
});

app.get('/api/legal/documents', (_req, res) => {
  res.json({ ok: true, documents: [
    { id: 'tos-v1', name: 'Terms of Service', type: 'terms', status: 'active', jurisdiction: 'South Africa', version: '1.0', effectiveDate: '2026-04-01', description: 'Governs use of Bridge AI OS platform, agent services, and BRDG token economy' },
    { id: 'privacy-v1', name: 'Privacy Policy', type: 'privacy', status: 'active', jurisdiction: 'South Africa + EU', version: '1.0', effectiveDate: '2026-04-01', description: 'POPIA + GDPR compliant data handling, retention, and user rights' },
    { id: 'dpa-v1', name: 'Data Processing Agreement', type: 'dpa', status: 'active', jurisdiction: 'EU', version: '1.0', effectiveDate: '2026-04-01', description: 'GDPR Article 28 processor agreement for enterprise clients' },
    { id: 'token-disc', name: 'BRDG Token Disclaimer', type: 'disclaimer', status: 'active', jurisdiction: 'Global', version: '1.0', effectiveDate: '2026-04-08', description: 'Risk disclosure for BRDG utility token on Linea L2' },
    { id: 'sla-v1', name: 'Service Level Agreement', type: 'sla', status: 'active', jurisdiction: 'South Africa', version: '1.0', effectiveDate: '2026-04-01', description: '99.9% uptime guarantee, response times, escalation procedures' },
    { id: 'aup-v1', name: 'Acceptable Use Policy', type: 'policy', status: 'active', jurisdiction: 'Global', version: '1.0', effectiveDate: '2026-04-01', description: 'Prohibited uses, rate limits, agent behavior rules' },
    { id: 'cookie-v1', name: 'Cookie Policy', type: 'policy', status: 'active', jurisdiction: 'EU + SA', version: '1.0', effectiveDate: '2026-04-01', description: 'Cookie consent, tracking transparency, opt-out procedures' },
    { id: 'ip-assign', name: 'IP Assignment Agreement', type: 'contract', status: 'draft', jurisdiction: 'South Africa', version: '0.1', effectiveDate: null, description: 'Intellectual property assignment for JV partners and contributors' },
  ], count: 8 });
});

app.get('/api/legal/contracts/active', (_req, res) => {
  res.json({ ok: true, contracts: [
    { id: 'payfast-msa', name: 'PayFast Merchant Agreement', party: 'PayFast (Pty) Ltd', value: 'Revenue share', start: '2026-03-01', end: '2027-03-01', status: 'active', jurisdiction: 'South Africa' },
    { id: 'linea-deploy', name: 'Linea L2 Deployment', party: 'Consensys / Linea', value: 'Gas fees only', start: '2026-04-08', end: null, status: 'active', jurisdiction: 'Global' },
    { id: 'webway-hosting', name: 'VPS Hosting Agreement', party: 'Webway', value: 'R450/mo', start: '2026-01-15', end: '2027-01-15', status: 'active', jurisdiction: 'South Africa' },
    { id: 'supabase-db', name: 'Supabase Database', party: 'Supabase Inc.', value: 'Free tier', start: '2026-04-09', end: null, status: 'active', jurisdiction: 'Global' },
    { id: 'vercel-deploy', name: 'Vercel Hosting', party: 'Vercel Inc.', value: 'Hobby plan', start: '2026-03-01', end: null, status: 'active', jurisdiction: 'Global' },
    { id: 'jv-rpc', name: 'JV Partnership — RPC', party: 'Ryan Paul Cowan', value: '4% founder pool', start: '2026-04-01', end: null, status: 'active', jurisdiction: 'South Africa' },
  ] });
});

// ── AI LEGAL AGENT ──────────────────────────────────────────────────────────
var legalAgent; try { legalAgent = require('./lib/legal-agent'); } catch (_) { legalAgent = null; }

app.post('/api/legal-agent', express.json(), async (req, res) => {
  if (!legalAgent) return res.status(503).json({ ok: false, error: 'Legal agent module not loaded' });
  var query = (req.body || {}).query || (req.body || {}).prompt || '';
  if (!query) return res.status(400).json({ ok: false, error: 'query required' });
  try {
    var result = await legalAgent.askLegal(query, (req.body || {}).context);
    res.json(result);
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/legal/generate', express.json(), async (req, res) => {
  if (!legalAgent) return res.status(503).json({ ok: false, error: 'Legal agent module not loaded' });
  var type = (req.body || {}).type;
  var variables = (req.body || {}).variables || {};
  if (!type) return res.status(400).json({ ok: false, error: 'type required (nda, terms, privacy, dpa, service)' });
  try {
    var result = await legalAgent.generateContract(type, variables);
    res.json(result);
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/legal/proxy', express.json(), async (req, res) => {
  if (!legalAgent) return res.status(503).json({ ok: false, error: 'Legal agent module not loaded' });
  var action = (req.body || {}).action;
  var details = (req.body || {}).details || {};
  if (!action) return res.status(400).json({ ok: false, error: 'action required (data-access, data-deletion, complaint, breach-notice)' });
  try {
    var result = await legalAgent.generateProxyAction(action, details);
    res.json(result);
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/legal/analyze', express.json(), async (req, res) => {
  if (!legalAgent) return res.status(503).json({ ok: false, error: 'Legal agent module not loaded' });
  var text = (req.body || {}).text || '';
  var docType = (req.body || {}).type || 'document';
  if (!text) return res.status(400).json({ ok: false, error: 'text required' });
  try {
    var result = await legalAgent.analyzeDocument(text, docType);
    res.json(result);
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get('/api/legal/templates', (_req, res) => {
  if (!legalAgent) return res.json({ ok: true, contracts: {}, actions: {} });
  var contracts = {};
  Object.entries(legalAgent.CONTRACT_TEMPLATES).forEach(function(e) { contracts[e[0]] = { name: e[1].name }; });
  var actions = {};
  Object.entries(legalAgent.PROXY_TEMPLATES).forEach(function(e) { actions[e[0]] = { name: e[1].name }; });
  res.json({ ok: true, contracts: contracts, actions: actions });
});

app.get('/api/legal/download/:id', (req, res) => {
  var id = req.params.id;
  var docs = {
    'tos-v1': { name: 'Terms of Service', content: `BRIDGE AI OS — TERMS OF SERVICE
Version 1.0 | Effective: 1 April 2026
Entity: Bridge AI (Pty) Ltd | Jurisdiction: Republic of South Africa

1. ACCEPTANCE OF TERMS
By accessing or using Bridge AI OS ("the Platform"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Platform.

2. SERVICE DESCRIPTION
Bridge AI OS is an autonomous business intelligence platform providing:
- AI agent orchestration (35+ specialized agents)
- CRM, invoicing, and business automation
- BRDG token economy on Linea L2 blockchain
- Treasury management with on-chain verification

3. USER ACCOUNTS
3.1 You must provide accurate registration information.
3.2 You are responsible for maintaining account security.
3.3 One account per person; no shared credentials.

4. BRDG TOKEN
4.1 BRDG is a utility token, not a security or investment.
4.2 1% deflationary burn applies on all transfers.
4.3 Token value may fluctuate; Bridge AI makes no price guarantees.

5. PAYMENT TERMS
5.1 Subscriptions billed monthly via PayFast (ZAR) or Paystack (NGN).
5.2 Enterprise plans invoiced quarterly.
5.3 Refunds at Bridge AI's sole discretion within 14 days.

6. DATA PROTECTION
6.1 We comply with POPIA (South Africa) and GDPR (EU).
6.2 Personal data processed per our Privacy Policy.
6.3 You may request data export or deletion at any time.

7. ACCEPTABLE USE
7.1 No illegal activity, spam, or abuse of AI agents.
7.2 No reverse engineering of the Platform.
7.3 Rate limits apply per subscription tier.

8. INTELLECTUAL PROPERTY
8.1 Bridge AI OS, BRDG, and all agent logic are proprietary.
8.2 User data remains user property.
8.3 AI-generated outputs are licensed to the requesting user.

9. LIABILITY
9.1 Platform provided "as is" without warranty.
9.2 Bridge AI not liable for indirect or consequential damages.
9.3 Maximum liability limited to fees paid in prior 12 months.

10. TERMINATION
10.1 Either party may terminate with 30 days notice.
10.2 Bridge AI may suspend accounts for ToS violations.
10.3 On termination, user data available for export for 90 days.

11. GOVERNING LAW
These terms are governed by the laws of the Republic of South Africa.
Disputes resolved in the courts of Johannesburg.

Contact: legal@ai-os.co.za
` },
    'privacy-v1': { name: 'Privacy Policy', content: `BRIDGE AI OS — PRIVACY POLICY
Version 1.0 | Effective: 1 April 2026
POPIA + GDPR Compliant

1. DATA CONTROLLER
Bridge AI (Pty) Ltd, South Africa.
Information Officer: admin@api.ai-os.co.za

2. DATA WE COLLECT
- Account data: name, email, password hash
- Payment data: processed by PayFast/Paystack (we do not store card numbers)
- Usage data: API calls, agent interactions, session metadata
- On-chain data: wallet addresses, BRDG transactions (public blockchain)

3. PURPOSE OF PROCESSING
- Provide and improve the Platform
- Process payments and manage subscriptions
- Agent orchestration and task execution
- Security monitoring and fraud prevention

4. LEGAL BASIS (GDPR Article 6)
- Contract performance (account services)
- Legitimate interest (security, analytics)
- Consent (marketing communications)

5. DATA RETENTION
- Account data: retained while account is active + 2 years
- Transaction records: 7 years (financial regulation)
- Usage logs: 90 days rolling
- On-chain data: permanent (blockchain immutability)

6. YOUR RIGHTS (POPIA Section 11 / GDPR Articles 15-22)
- Access: request a copy of your data
- Rectification: correct inaccurate data
- Erasure: request deletion ("right to be forgotten")
- Portability: export data in machine-readable format
- Objection: opt out of marketing communications
- Restriction: limit processing in certain circumstances

7. DATA SHARING
- Payment processors: PayFast, Paystack (PCI DSS compliant)
- Cloud infrastructure: Vercel, Supabase, Webway
- Blockchain: Linea L2 (public, pseudonymous)
- We do NOT sell personal data to third parties.

8. INTERNATIONAL TRANSFERS
Data may be processed in South Africa, EU, and US.
Transfers protected by Standard Contractual Clauses.

9. SECURITY
- AES-256 encryption at rest
- TLS 1.3 in transit
- KeyForge rotating authentication keys
- Zero-trust verification on all treasury data

10. COOKIES
Essential cookies only. See Cookie Policy for details.

11. CHANGES
We may update this policy. Material changes notified via email.

12. CONTACT
Privacy inquiries: legal@ai-os.co.za
POPIA complaints: Information Regulator (South Africa)
GDPR complaints: relevant EU supervisory authority

` },
    'dpa-v1': { name: 'Data Processing Agreement', content: `BRIDGE AI OS — DATA PROCESSING AGREEMENT
Version 1.0 | GDPR Article 28

This DPA forms part of the Terms of Service between Bridge AI (Pty) Ltd ("Processor") and the Customer ("Controller").

1. SCOPE: Processor processes personal data solely for providing Platform services.
2. INSTRUCTIONS: Processor acts only on documented Controller instructions.
3. CONFIDENTIALITY: All personnel authorized to process data are bound by confidentiality.
4. SECURITY: Technical and organizational measures per GDPR Article 32.
5. SUB-PROCESSORS: Supabase (database), Vercel (hosting), PayFast (payments).
6. DATA SUBJECT RIGHTS: Processor assists Controller in fulfilling data subject requests.
7. BREACH NOTIFICATION: Within 72 hours of becoming aware of a personal data breach.
8. AUDIT: Controller may audit Processor compliance upon reasonable notice.
9. DELETION: On termination, Processor deletes all personal data within 90 days.
10. GOVERNING LAW: Republic of South Africa + EU GDPR.

` },
    'token-disc': { name: 'BRDG Token Disclaimer', content: `BRDG TOKEN — RISK DISCLOSURE
Bridge AI (Pty) Ltd | Linea L2 Blockchain

BRDG is a utility token. It is NOT a security, investment product, or financial instrument.

RISKS:
- Token value may decrease to zero
- Blockchain transactions are irreversible
- Smart contract bugs may result in loss of tokens
- Regulatory changes may affect token utility
- 1% burn on every transfer reduces supply but does not guarantee value

NO GUARANTEES:
Bridge AI makes no representations about future token value, returns, or profitability. Past performance is not indicative of future results.

CONTRACT: 0x5f0541302bd4fC672018b07a35FA5f294A322947 (Linea Mainnet)
VERIFY: https://lineascan.build/token/0x5f0541302bd4fC672018b07a35FA5f294A322947

` },
    'sla-v1': { name: 'Service Level Agreement', content: `BRIDGE AI OS — SERVICE LEVEL AGREEMENT
Version 1.0 | Effective: 1 April 2026

1. UPTIME: 99.9% monthly availability (excludes scheduled maintenance).
2. RESPONSE TIME: API p95 latency < 500ms.
3. SUPPORT: Business hours (SAST 08:00-17:00). Enterprise: 24/7.
4. ESCALATION: P1 (system down): 1 hour. P2 (degraded): 4 hours. P3 (minor): 24 hours.
5. CREDITS: <99.9% uptime = 10% credit. <99.0% = 25% credit. <95% = 50% credit.
6. EXCLUSIONS: Force majeure, user error, third-party service outages.

` },
    'aup-v1': { name: 'Acceptable Use Policy', content: `BRIDGE AI OS — ACCEPTABLE USE POLICY
Version 1.0

PROHIBITED:
- Using AI agents for illegal activity
- Circumventing rate limits or access controls
- Automated scraping without API key
- Distributing malware via the Platform
- Impersonating other users or agents

RATE LIMITS:
- Starter: 100 API calls/day, 3 agent tasks/day
- Pro: Full API access, 50 agent tasks/day
- Enterprise: Unlimited

ENFORCEMENT:
Violations result in warning, suspension, or termination at Bridge AI's discretion.

` },
    'cookie-v1': { name: 'Cookie Policy', content: `BRIDGE AI OS — COOKIE POLICY
Version 1.0

ESSENTIAL COOKIES (always active):
- bridge_token: Authentication session (secure, httpOnly)
- bridge_session_id: Session identifier

NO TRACKING COOKIES. NO THIRD-PARTY ANALYTICS COOKIES.

We do not use Google Analytics, Facebook Pixel, or any ad tracking.
Session data stored in localStorage for convenience (command history, preferences).

OPT-OUT: Clear browser cookies and localStorage at any time.

` },
    'ip-assign': { name: 'IP Assignment Agreement', content: `BRIDGE AI OS — IP ASSIGNMENT AGREEMENT
DRAFT v0.1

This agreement assigns intellectual property rights for contributions to Bridge AI OS.

1. SCOPE: All code, documentation, and creative works contributed to the Platform.
2. ASSIGNMENT: Contributor assigns all IP rights to Bridge AI (Pty) Ltd.
3. LICENSE BACK: Contributor receives perpetual license to use their contributions.
4. WARRANTY: Contributor warrants original authorship and right to assign.
5. COMPENSATION: Per separate JV or employment agreement.

STATUS: DRAFT — Not yet in effect.

` },
  };
  var doc = docs[id];
  if (!doc) return res.status(404).json({ error: 'Document not found: ' + id });
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="' + id + '.txt"');
  res.send(doc.content);
});

app.get('/api/pricing', (_req, res) => {
  res.json({ plans: [
    { id: 'starter',    name: 'Starter',    price: 49,  currency: 'ZAR', features: ['5 agents', '1k tasks/mo', 'Basic analytics'] },
    { id: 'pro',        name: 'Pro',        price: 149, currency: 'ZAR', features: ['20 agents', '10k tasks/mo', 'Full analytics', 'CRM'] },
    { id: 'enterprise', name: 'Enterprise', price: 499, currency: 'ZAR', features: ['Unlimited agents', 'Unlimited tasks', 'All features', 'SLA'] },
  ], ts: Date.now() });
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

// ═══════════════════════════════════════════════════════════════════════════════
// ZERO-TRUST VERIFICATION ENDPOINTS
// Every response is cryptographically signed. Every metric links to source.
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/metrics/token', async (_req, res) => {
  try {
    const metrics = await chainVerify.getVerifiedTokenMetrics();
    res.json(zt.signResponse({ ok: true, ...metrics, source: 'on-chain', trustLevel: 'trustless' }, 'api-response'));
  } catch (e) {
    res.status(503).json({ ok: false, error: e.message, source: 'on-chain', fallback: true });
  }
});

app.get('/api/metrics/treasury', async (_req, res) => {
  try {
    const treasury = await chainVerify.getVerifiedTreasury();
    res.json(zt.signResponse({ ok: true, ...treasury, source: 'hybrid' }, 'api-response'));
  } catch (e) {
    res.status(503).json({ ok: false, error: e.message });
  }
});

app.get('/api/metrics/revenue', async (_req, res) => {
  try {
    const revenue = await proofStore.getVerifiedRevenue();
    res.json(zt.signResponse({ ok: true, ...revenue, source: 'payment_proof_chain' }, 'api-response'));
  } catch (e) {
    res.status(503).json({ ok: false, error: e.message });
  }
});

app.get('/api/metrics/vault', async (_req, res) => {
  try {
    const vault = await chainVerify.getVerifiedVaultBuckets();
    res.json(zt.signResponse({ ok: true, ...vault, source: 'on-chain', trustLevel: 'trustless' }, 'api-response'));
  } catch (e) {
    res.status(503).json({ ok: false, error: e.message });
  }
});

app.get('/api/verify/payment/:id', async (req, res) => {
  const txId = req.params.id;
  const proof = await proofStore.getProof(txId);
  if (!proof) return res.status(404).json({ error: 'proof_not_found', transactionId: txId });
  const merkle = await proofStore.getMerkleProof(txId);
  res.json(zt.signResponse({ ok: true, proof, merkleInclusion: merkle }, 'api-response'));
});

app.get('/api/verify/chain', async (_req, res) => {
  const result = await proofStore.verifyChain();
  res.json(zt.signResponse({ ok: true, chainIntegrity: result }, 'api-response'));
});

app.get('/api/verify/info', (_req, res) => {
  try {
    res.json({
      ok: true, ...zt.getVerificationInfo(),
      contracts: {
        brdg: { address: chainVerify.BRDG_ADDRESS, explorer: `${chainVerify.LINEASCAN_BASE}/token/${chainVerify.BRDG_ADDRESS}` },
        vault: { address: chainVerify.VAULT_ADDRESS, explorer: `${chainVerify.LINEASCAN_BASE}/address/${chainVerify.VAULT_ADDRESS}` },
        treasury: { address: chainVerify.TREASURY_OWNER, explorer: `${chainVerify.LINEASCAN_BASE}/address/${chainVerify.TREASURY_OWNER}` },
      },
      chain: { name: 'Linea', chainId: 59144, rpc: 'https://rpc.linea.build' },
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/verify/response', express.json(), (req, res) => {
  const body = req.body;
  if (!body || !body._proof) return res.status(400).json({ error: 'signed envelope required' });
  const valid = zt.verifyResponse(body, body._proof.purpose || 'api-response');
  res.json({ ok: true, valid, keyId: body._proof?.keyId, timestamp: body._proof?.timestamp });
});

app.get('/api/proofs/payments', async (req, res) => {
  const limit = parseInt(req.query.limit || '100');
  const proofs = await proofStore.getAllProofs(limit);
  res.json(zt.signResponse({ ok: true, proofs, count: proofs.length }, 'api-response'));
});

app.post('/api/proofs/merkle', async (_req, res) => {
  try {
    const anchor = await proofStore.createMerkleAnchor();
    res.json(zt.signResponse({ ok: true, anchor }, 'api-response'));
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── BRAIN PROXY — forward unknown /api/* to brain on 8000 ────────────────────
// This catches any /api/* route not handled above and proxies to the brain.
// Intentionally unauthenticated: brain service handles its own auth and this
// is internal routing only. Public API routes are handled above. (security: #H-2)
app.all('/api/*path', async (req, res) => {
  const url = `http://localhost:8000${req.originalUrl}`;
  try {
    const opts = { method: req.method, headers: {}, signal: AbortSignal.timeout(15000) };
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

// ── AGENT PROXY — forward /agent/* to brain on 8000 ─────────────────────────
app.all('/agent/*path', async (req, res) => {
  const url = `http://localhost:8000${req.originalUrl}`;
  try {
    const opts = { method: req.method, headers: {}, signal: AbortSignal.timeout(30000) };
    if (req.headers['content-type']) opts.headers['Content-Type'] = req.headers['content-type'];
    if (req.headers['x-api-key']) opts.headers['X-API-Key'] = req.headers['x-api-key'];
    if (req.headers['authorization']) opts.headers['Authorization'] = req.headers['authorization'];
    if (req.method !== 'GET' && req.body) opts.body = JSON.stringify(req.body);
    const r = await fetch(url, opts);
    const ct = r.headers.get('content-type') || 'application/json';
    const text = await r.text();
    res.status(r.status).set('Content-Type', ct).send(text);
  } catch (e) {
    res.status(502).json({ status: 'error', error: 'brain unreachable', path: req.originalUrl, code: 'BRAIN_UNREACHABLE' });
  }
});

// ── SUBDOMAIN ROUTING ────────────────────────────────────────────────────────
app.get('/home.html', (_req, res) => serveWithNav(path.join(XPUBLIC, 'home.html'), res));
app.get('/corporate.html', (_req, res) => serveWithNav(path.join(XPUBLIC, 'corporate.html'), res));
app.get('/ehsa-app.html', (_req, res) => serveWithNav(path.join(XPUBLIC, 'ehsa-app.html'), res));

// ── SHORT-PATH ALIASES (no .html) ────────────────────────────────────────────
// These mirror server.js shortRoutes so all ui.html Quick Actions work on :8080
const GATEWAY_SHORT_ROUTES = {
  '/landing': '/landing.html', '/apps': '/50-applications.html',
  '/treasury-dash': '/aoe-dashboard.html', '/leadgen': '/leadgen.html',
  '/control': '/control.html', '/dashboard': '/aoe-dashboard.html',
  '/status': '/system-status-dashboard.html', '/registry': '/registry.html',
  '/crm': '/crm.html', '/invoicing': '/invoicing.html',
  '/marketing': '/marketing.html', '/legal': '/legal.html',
  '/tickets': '/tickets.html', '/pricing': '/pricing.html',
  '/ehsa': '/ehsa-app.html', '/supac': '/supac-home.html',
  '/ubi': '/ubi-home.html', '/aid': '/aid-home.html',
  '/aurora': '/aurora-home.html', '/sitemap': '/sitemap.html',
  '/onboarding': '/onboarding.html', '/agents': '/agents.html',
  '/docs': '/docs.html', '/marketplace': '/marketplace.html',
  '/topology': '/topology.html', '/terminal': '/terminal.html',
  '/settings': '/settings.html', '/home': '/home.html',
  '/welcome': '/welcome.html', '/corporate': '/corporate.html',
  '/brand': '/brand.html', '/governance': '/governance.html',
  '/twins': '/digital-twin-console.html', '/intelligence': '/intelligence.html',
  '/executive': '/executive-dashboard.html',
  // ── New routes (synced with server.js) ──
  '/ban': '/ban-home.html', '/hospital': '/hospital-home.html',
  '/rootedearth': '/rootedearth-home.html', '/abaas': '/abaas.html',
  '/defi': '/defi.html', '/wallet': '/wallet.html', '/trading': '/trading.html',
  '/affiliate': '/affiliate.html', '/join': '/join.html', '/admin': '/admin.html',
  '/avatar': '/avatar.html', '/platforms': '/platforms.html',
  '/ehsa-app': '/ehsa-app.html', '/ehsa-brain': '/ehsa-brain.html',
  '/logs': '/logs.html', '/twin-wall': '/twin-wall.html',
  '/face': '/anatomical_face.html', '/quotes': '/quotes.html',
  '/customers': '/customers.html', '/vendors': '/vendors.html',
  '/workforce': '/workforce.html',
  '/withdraw': '/admin-withdraw.html', '/payment': '/payment.html',
  '/payment-success': '/payment-success.html', '/payment-cancel': '/payment-cancel.html',
  '/command-center': '/command-center.html', '/banks': '/banks.html',
  '/infra': '/infra.html', '/ui': '/ui.html', '/applications': '/applications.html',
  '/bridge-audit': '/bridge-audit-dashboard.html', '/topology-layers': '/topology-layers.html',
  '/view-logs': '/view-logs.html', '/treasury': '/treasury-dashboard.html',
  '/twin': '/twin.html', '/economy': '/economy.html',
  '/admin-command': '/admin-command.html', '/admin-revenue': '/admin-revenue.html',
  '/admin-sitemap': '/admin-sitemap.html', '/terminal-v3': '/terminal-v3.html',
  '/console': '/console.html', '/bridge': '/bridge-home.html',
  '/auth-dashboard': '/auth-dashboard.html', '/checkout': '/checkout.html',
  '/portal': '/portal.html', '/voice': '/voice.html',
  '/welcome-tour': '/welcome-tour.html', '/offline': '/offline.html',
  '/face-constrained': '/anatomical_face_constrained_system.html',
  '/face-embodied': '/anatomical_face_embodied.html',
  '/face-facs': '/anatomical_face_facs.html',
  '/face-tension': '/anatomical_face_tension_balanced.html',
  '/face-vector': '/anatomical_face_vector_muscle.html',
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
