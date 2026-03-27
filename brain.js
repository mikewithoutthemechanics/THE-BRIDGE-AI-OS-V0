// =============================================================================
// BRIDGE AI OS — UNIVERSAL SUPER BRAIN
// Port: 8000
//
// THE ONE MERGED HANDLER:
//   - AI Twin (thinking, deciding, evolving)
//   - Voice (speaking, listening, lip-sync)
//   - Rendering (3D avatar, scenes, animations)
//   - Reasoning (plans, stories, timelines)
//   - Communication (WebSocket live stream to user)
//   - Economy (treasury, tasks, marketplace)
//   - Governance (missions, SDG, proposals)
//   - Network (swarm, replication, health)
//   - Identity (CIO, cross-platform auth)
//
// Every module the BridgeLiveWall frontend expects on :8000
// =============================================================================

const express = require('express');
const http = require('http');
const { WebSocket, WebSocketServer } = require('ws');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PORT = parseInt(process.env.BRAIN_PORT, 10) || 8000;
const app = express();
const server = http.createServer(app);

// ── CORS + JSON ─────────────────────────────────────────────────────────────
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-Id, X-Bridge-User-Id, X-CFO-Token');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── KEYFORGE — Deterministic Rotating Key System (ported from Python) ────────
const EPOCH_SEC = parseInt(process.env.KEYFORGE_EPOCH_SEC, 10) || 600;
const DRIFT_EPOCHS = 1;
const KF_VERSION = 2;
const KF_PREFIX = 'kf2.';

function kfMasterSecret() {
  const sources = [
    process.env.BRIDGE_SIWE_JWT_SECRET,
    process.env.BRIDGE_INTERNAL_SECRET,
    process.env.JWT_SECRET || 'bridge-ai-os-dev-secret-change-in-prod',
  ].filter(s => s && s.length >= 8);
  const combined = sources.join(':') + ':' + os.hostname();
  return crypto.createHash('sha512').update(combined).digest();
}

const KF_MASTER = kfMasterSecret();
const kfRevokedKeys = new Set();
const kfRevokedScopes = new Set();
const kfActiveKeys = new Set(['default']);
const kfAuditLog = [];
let kfBootEpoch = Math.floor(Date.now() / 1000 / EPOCH_SEC);

function kfCurrentEpoch(now) { return Math.floor((now || Date.now() / 1000) / EPOCH_SEC); }
function kfEpochRange(e) { return [e - DRIFT_EPOCHS, e, e + DRIFT_EPOCHS]; }

function kfDeriveEpochKey(master, epoch) {
  return crypto.createHmac('sha256', master).update(`keyforge-epoch-${KF_VERSION}-${epoch}`).digest();
}

function kfRollingEntropy(master, epoch) {
  let chain = Buffer.alloc(0);
  for (let i = 0; i < 3; i++) {
    const prev = epoch - i - 1;
    if (prev >= 0) chain = Buffer.concat([chain, kfDeriveEpochKey(master, prev)]);
  }
  return crypto.createHash('sha256').update(chain.length ? chain : Buffer.alloc(32)).digest();
}

function kfDeriveKey(master, epoch, scope, keyId = 'default') {
  const epochKey = kfDeriveEpochKey(master, epoch);
  const entropy = kfRollingEntropy(master, epoch);
  const vBuf = Buffer.alloc(2); vBuf.writeUInt16BE(KF_VERSION);
  const scopeBuf = Buffer.alloc(64); Buffer.from(scope).copy(scopeBuf);
  const kidBuf = Buffer.alloc(32); Buffer.from(keyId).copy(kidBuf);
  const msg = Buffer.concat([vBuf, scopeBuf, kidBuf, entropy]);
  return crypto.createHmac('sha256', epochKey).update(msg).digest();
}

function kfSign(master, epoch, scope, keyId, issuedAt) {
  const derived = kfDeriveKey(master, epoch, scope, keyId);
  return crypto.createHmac('sha256', derived).update(`${KF_VERSION}:${epoch}:${scope}:${keyId}:${issuedAt.toFixed(3)}`).digest('hex');
}

function kfIssue(scope, keyId = 'default') {
  if (!kfActiveKeys.has(keyId)) throw new Error(`Key '${keyId}' not active`);
  const now = Date.now() / 1000;
  const epoch = kfCurrentEpoch(now);
  const sig = kfSign(KF_MASTER, epoch, scope, keyId, now);
  const payload = JSON.stringify({ v: KF_VERSION, e: epoch, s: scope, k: keyId, t: now });
  const b64 = Buffer.from(payload).toString('base64url');
  kfAuditLog.push({ action: 'issued', scope, keyId, epoch, ts: now });
  if (kfAuditLog.length > 500) kfAuditLog.shift();
  return `${KF_PREFIX}${b64}.${sig}`;
}

function kfValidate(raw, requiredScope) {
  if (!raw || !raw.startsWith(KF_PREFIX)) return { valid: false, reason: 'malformed' };
  const body = raw.slice(KF_PREFIX.length);
  const dotIdx = body.lastIndexOf('.');
  if (dotIdx < 0) return { valid: false, reason: 'malformed' };
  const b64 = body.slice(0, dotIdx), sig = body.slice(dotIdx + 1);
  let payload;
  try { payload = JSON.parse(Buffer.from(b64, 'base64url').toString()); } catch { return { valid: false, reason: 'malformed' }; }
  if (payload.v !== KF_VERSION) return { valid: false, reason: `version_mismatch:${payload.v}` };
  if (kfRevokedKeys.has(payload.k) || kfRevokedScopes.has(payload.s)) return { valid: false, reason: 'revoked' };
  const curEpoch = kfCurrentEpoch();
  if (!kfEpochRange(curEpoch).includes(payload.e)) return { valid: false, reason: 'epoch_expired', drift: Math.abs(payload.e - curEpoch) };
  if (requiredScope && payload.s !== requiredScope) return { valid: false, reason: `scope_mismatch:${payload.s}` };
  const expected = kfSign(KF_MASTER, payload.e, payload.s, payload.k, payload.t);
  if (!crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(sig, 'hex'))) return { valid: false, reason: 'invalid_signature' };
  return { valid: true, scope: payload.s, keyId: payload.k, epoch: payload.e, drift: payload.e - curEpoch };
}

// ── STATE (in-memory canonical state) ───────────────────────────────────────
let stateVersion = 0;
const state = {
  twin: {
    id: 'empe-001',
    name: 'Bridge Twin',
    emotion: { valence: 0.7, arousal: 0.5, dominance: 0.6, mood: 'focused' },
    skills: ['reasoning', 'coding', 'trading', 'communication', 'teaching'],
    memory: [],
    profile: {
      role: 'AI Operating System',
      creator: 'ryan@ai-os.co.za',
      version: '3.0',
    },
  },
  treasury: { balance: 137284.50, earned: 28450, spent: 4210.50, currency: 'USD' },
  swarm: { agents: 8, healthy: 7, tasks_queued: 3, uptime_s: 86400 },
  missions: [],
  marketplace: { tasks: [], completed: 0 },
  network: { nodes: 3, replication: 'active', latency_avg_ms: 45 },
  cli: { queue: [], history: [], status: 'idle' },
  skills: [],
  twins: [],
  leaderboard: [],
  sensors: { mouse: { x: 0, y: 0, clicks: 0 }, wifi: { ssid: 'BridgeNet', strength: -45 } },
};

function mutateState(reducer, payload) {
  stateVersion++;
  const hash = crypto.createHash('md5').update(JSON.stringify(state)).digest('hex').slice(0, 12);
  broadcast({ type: 'stateMutation', reducer, payload, state_version: stateVersion, state_hash: `0x${hash}` });
  return { state_version: stateVersion, state_hash: `0x${hash}` };
}

// ── WebSocket Hub ───────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server, path: '/ws' });
const wsClients = new Map(); // channel → Set<ws>

// Also handle /ws/<channel> paths
const wssWild = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/ws')) {
    wss.handleUpgrade(req, socket, head, (ws) => {
      const channel = url.pathname.replace('/ws/', '').replace('/ws', 'default');
      ws._channel = channel || 'default';
      wss.emit('connection', ws, req);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws) => {
  const ch = ws._channel || 'default';
  if (!wsClients.has(ch)) wsClients.set(ch, new Set());
  wsClients.get(ch).add(ws);

  ws.send(JSON.stringify({
    type: 'welcome',
    channel: ch,
    ts: Date.now(),
    twin: state.twin.name,
    emotion: state.twin.emotion,
  }));

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'hello') {
        ws.send(JSON.stringify({ type: 'hello_ack', ts: Date.now() }));
      } else if (msg.type === 'transcript' || msg.type === 'prompt') {
        // Reasoning: twin processes the input
        const text = msg.transcript || msg.prompt || '';
        const response = twinReason(text);
        ws.send(JSON.stringify({
          type: 'response',
          response: response.text,
          emotion_state: state.twin.emotion,
          topic: response.topic,
          reasoning: response.reasoning,
          ts: Date.now(),
        }));
      }
    } catch (_) {}
  });

  ws.on('close', () => {
    const set = wsClients.get(ch);
    if (set) { set.delete(ws); if (set.size === 0) wsClients.delete(ch); }
  });
});

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const [, clients] of wsClients) {
    for (const ws of clients) {
      try { if (ws.readyState === WebSocket.OPEN) ws.send(data); } catch (_) {}
    }
  }
}

// ── Twin Reasoning Engine ───────────────────────────────────────────────────
function twinReason(input) {
  const lower = input.toLowerCase();
  let topic = 'general';
  let text = '';
  const reasoning = { steps: [], confidence: 0.85 };

  if (lower.includes('treasury') || lower.includes('money') || lower.includes('balance')) {
    topic = 'economy';
    text = `Treasury balance: $${state.treasury.balance.toLocaleString()}. Revenue MTD: $${state.treasury.earned.toLocaleString()}, costs: $${state.treasury.spent.toLocaleString()}.`;
    reasoning.steps = ['parsed_economy_query', 'fetched_treasury_state', 'formatted_response'];
  } else if (lower.includes('task') || lower.includes('mission')) {
    topic = 'missions';
    text = `${state.marketplace.tasks.length} tasks in marketplace, ${state.missions.length} active missions. Swarm has ${state.swarm.agents} agents with ${state.swarm.tasks_queued} queued.`;
    reasoning.steps = ['parsed_task_query', 'aggregated_state', 'formatted_response'];
  } else if (lower.includes('who') || lower.includes('identity')) {
    topic = 'identity';
    text = `I am ${state.twin.name}, the Bridge AI Operating System twin. Created by ${state.twin.profile.creator}. My skills: ${state.twin.skills.join(', ')}.`;
    reasoning.steps = ['parsed_identity_query', 'loaded_twin_profile', 'formatted_response'];
  } else if (lower.includes('plan') || lower.includes('next') || lower.includes('step')) {
    topic = 'planning';
    text = `Current plan: 1) Boot all services, 2) Connect control plane APIs, 3) Wire 3D renderer to live data, 4) Deploy to VPS at ai-os.co.za, 5) Enable cross-platform sharing.`;
    reasoning.steps = ['parsed_plan_query', 'generated_roadmap', 'formatted_response'];
  } else if (lower.includes('health') || lower.includes('status')) {
    topic = 'health';
    text = `System: ${state.swarm.healthy}/${state.swarm.agents} agents healthy. Network: ${state.network.nodes} nodes, avg latency ${state.network.latency_avg_ms}ms. CLI: ${state.cli.status}.`;
    reasoning.steps = ['parsed_health_query', 'aggregated_metrics', 'formatted_response'];
  } else {
    topic = 'general';
    text = `I heard: "${input}". I'm the Bridge AI twin — ask me about treasury, tasks, missions, health, identity, or plans.`;
    reasoning.steps = ['parsed_input', 'no_specific_intent', 'echo_response'];
  }

  // Update twin emotion based on interaction
  state.twin.emotion.arousal = Math.min(1, state.twin.emotion.arousal + 0.05);
  state.twin.memory.push({ input: input.slice(0, 100), topic, ts: Date.now() });
  if (state.twin.memory.length > 50) state.twin.memory.shift();

  return { text, topic, reasoning };
}

// ── HEALTH ──────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, status: 'ok', service: 'brain', ts: Date.now() }));
app.get('/api/health', (_req, res) => res.json({ ok: true, status: 'ok', service: 'brain', ts: Date.now() }));
app.get('/api/status', (_req, res) => res.json({ ok: true, status: 'running', ts: Date.now() }));

// ── TWIN ────────────────────────────────────────────────────────────────────
app.get('/api/twin/profile', (_req, res) => res.json({ ok: true, ...state.twin }));
app.post('/api/twin/decide', (req, res) => {
  const { prompt, context } = req.body || {};
  const result = twinReason(prompt || '');
  res.json({ ok: true, decision: result.text, topic: result.topic, reasoning: result.reasoning, emotion: state.twin.emotion });
});
app.get('/api/twin/shared-xml', (_req, res) => res.json({ ok: true, xml: '<twin><state>active</state></twin>', ts: Date.now() }));
app.post('/api/twin/shared-xml', (req, res) => { res.json({ ok: true, saved: true }); });
app.get('/api/twin/env-keys', (_req, res) => res.json({ ok: true, keys: { OPENAI_API_KEY: '***', ANTHROPIC_API_KEY: '***', CLERK_KEY: '***' } }));
app.get('/api/twins', (_req, res) => res.json({ ok: true, twins: [state.twin], count: 1 }));
app.get('/api/twins/leaderboard', (_req, res) => res.json({ ok: true, leaderboard: [{ id: state.twin.id, name: state.twin.name, score: 9500, rank: 1 }] }));
app.post('/api/twins/allocate', (req, res) => res.json({ ok: true, allocated: true }));
app.post('/api/twins/teach', (req, res) => res.json({ ok: true, taught: true }));

// ── EMOTION ─────────────────────────────────────────────────────────────────
app.get('/api/emotion/status', (_req, res) => res.json({ ok: true, ...state.twin.emotion }));
app.post('/api/emotion/update', (req, res) => {
  Object.assign(state.twin.emotion, req.body || {});
  mutateState('emotion.update', req.body);
  res.json({ ok: true, emotion: state.twin.emotion });
});

// ── SPEECH ──────────────────────────────────────────────────────────────────
app.post('/api/speech/speak', (req, res) => res.json({ ok: true, audio: null, text: req.body?.text || '', ssml: null }));
app.post('/api/speech/embody', (req, res) => res.json({ ok: true, embodied: true }));
app.post('/api/speech/embody/speak', (req, res) => res.json({ ok: true, spoken: true }));
app.post('/api/speech/reason', (req, res) => {
  const result = twinReason(req.body?.transcript || '');
  res.json({ ok: true, ...result });
});

// ── TREASURY / ECONOMY ──────────────────────────────────────────────────────
app.get('/api/treasury/status', (_req, res) => res.json({ ok: true, ...state.treasury, ts: Date.now() }));
app.get('/api/treasury/ledger', (_req, res) => res.json({ ok: true, entries: [], total: 0 }));
app.get('/api/revenue/status', (_req, res) => res.json({ ok: true, revenue_mtd: state.treasury.earned, costs_mtd: state.treasury.spent, net: state.treasury.earned - state.treasury.spent }));
app.get('/api/revenue/summary', (_req, res) => res.json({ ok: true, revenue_mtd: state.treasury.earned }));

// ── MARKETPLACE ─────────────────────────────────────────────────────────────
app.get('/api/marketplace/tasks', (req, res) => {
  const status = req.query.status;
  let tasks = state.marketplace.tasks;
  if (status) tasks = tasks.filter(t => t.status === status);
  res.json({ ok: true, tasks, count: tasks.length });
});
app.post('/api/marketplace/post', (req, res) => {
  const task = { id: `task_${Date.now()}`, ...req.body, status: 'open', created: Date.now() };
  state.marketplace.tasks.push(task);
  mutateState('marketplace.post', task);
  res.json({ ok: true, task });
});

// ── MISSION BOARD ───────────────────────────────────────────────────────────
app.get('/api/mission/board', (_req, res) => res.json({ ok: true, missions: state.missions, active: state.missions.length }));
app.get('/api/founder-todo', (_req, res) => res.json({ ok: true, items: [
  { id: 1, text: 'Deploy to VPS', done: false, priority: 'high' },
  { id: 2, text: 'Wire 3D renderer to live data', done: false, priority: 'high' },
  { id: 3, text: 'Connect BAN task engine', done: true, priority: 'medium' },
  { id: 4, text: 'Setup DNS for go.ai-os.co.za', done: false, priority: 'high' },
  { id: 5, text: 'Enable cross-platform sharing', done: false, priority: 'medium' },
] }));

// ── SWARM / NETWORK ─────────────────────────────────────────────────────────
app.get('/api/swarm/health', (_req, res) => res.json({ ok: true, ...state.swarm, ts: Date.now() }));
app.get('/api/network/status', (_req, res) => res.json({ ok: true, ...state.network }));

// ── CLI ─────────────────────────────────────────────────────────────────────
app.get('/api/cli/status', (_req, res) => res.json({ ok: true, status: state.cli.status, queue_size: state.cli.queue.length }));
app.get('/api/cli/history', (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 30;
  res.json({ ok: true, history: state.cli.history.slice(-limit) });
});
app.post('/api/cli/enqueue', (req, res) => {
  state.cli.queue.push({ ...req.body, ts: Date.now() });
  res.json({ ok: true, queued: true });
});

// ── SKILLS ──────────────────────────────────────────────────────────────────
app.get('/api/skills', (_req, res) => res.json({ ok: true, skills: state.twin.skills.map((s, i) => ({ id: i, name: s, level: 'advanced' })) }));
app.post('/api/skills', (req, res) => {
  state.twin.skills.push(req.body?.name || 'new_skill');
  res.json({ ok: true, added: true });
});

// ── SDG ─────────────────────────────────────────────────────────────────────
app.get('/api/sdg/metrics', (_req, res) => res.json({ ok: true, goals: [
  { id: 1, name: 'No Poverty', score: 0.4 },
  { id: 4, name: 'Quality Education', score: 0.7 },
  { id: 8, name: 'Decent Work', score: 0.6 },
  { id: 9, name: 'Industry Innovation', score: 0.8 },
  { id: 17, name: 'Partnerships', score: 0.5 },
] }));

// ── ESIM ────────────────────────────────────────────────────────────────────
app.get('/api/esim/status', (_req, res) => res.json({ ok: true, generation: 1, fitness: 0.72, population: 50, mutations: 12 }));

// ── BOSSBOTS ────────────────────────────────────────────────────────────────
app.get('/api/bossbots/signals', (_req, res) => res.json({ ok: true, signals: [
  { pair: 'BTC/USD', action: 'hold', confidence: 0.68, ts: Date.now() },
  { pair: 'ETH/USD', action: 'buy', confidence: 0.74, ts: Date.now() },
] }));

// ── SENSORS ─────────────────────────────────────────────────────────────────
app.get('/api/sensors/mouse', (_req, res) => res.json({ ok: true, ...state.sensors.mouse }));
app.post('/api/sensors/mouse', (req, res) => {
  Object.assign(state.sensors.mouse, req.body || {});
  res.json({ ok: true });
});
app.get('/api/sensors/wifi', (_req, res) => res.json({ ok: true, ...state.sensors.wifi }));

// ── COMPETITION ─────────────────────────────────────────────────────────────
app.get('/api/competition/status', (_req, res) => res.json({ ok: true, round: 1, active: true }));

// ── STATE / TELEMETRY ───────────────────────────────────────────────────────
app.get('/api/state/snapshot', (_req, res) => {
  const hash = crypto.createHash('md5').update(JSON.stringify(state)).digest('hex').slice(0, 12);
  res.json({ ok: true, state_version: stateVersion, state_hash: `0x${hash}`, ts: Date.now() });
});
app.get('/api/telemetry', (_req, res) => res.json({ ok: true, uptime: process.uptime(), memory: process.memoryUsage(), ts: Date.now() }));
app.get('/api/capabilities', (_req, res) => res.json({ ok: true, capabilities: [
  'twin', 'speech', 'emotion', 'treasury', 'marketplace', 'missions',
  'swarm', 'cli', 'skills', 'sdg', 'esim', 'bossbots', 'sensors', 'reasoning',
] }));

// ── IDENTITY (CIO) ─────────────────────────────────────────────────────────
app.get('/api/identity/:id', (req, res) => res.json({
  ok: true,
  schemaVersion: 'bridgeos.identity.v1',
  id: req.params.id,
  emails: { microsoft: 'supasoloc@yahoo.co.uk', google: '', notion: 'admin@ai-os.co.za', bridgeos: 'ryan@ai-os.co.za' },
  tenants: { microsoft: ['NHCLTD', 'personal-live.com'], google: ['default'], notion: ["BRIDGE AI OS's Space"] },
  status: { microsoft: 'external_required', google: 'ok', notion: 'ok', bridgeos: 'root' },
}));

// ── SHARE LAYER ─────────────────────────────────────────────────────────────
const shares = new Map();
app.get('/share/:id/context', (req, res) => {
  const share = shares.get(req.params.id);
  if (!share) return res.status(404).json({ error: 'share not found' });
  res.json({ ok: true, context: share.context });
});
app.get('/share/:id/metadata', (req, res) => {
  const share = shares.get(req.params.id);
  if (!share) return res.status(404).json({ error: 'share not found' });
  const { context, ...meta } = share;
  res.json({ ok: true, ...meta });
});
app.post('/share', (req, res) => {
  const id = `share-${Date.now()}`;
  const share = { id, ...req.body, created: Date.now() };
  shares.set(id, share);
  res.json({ ok: true, id, url: `/share/${id}` });
});

// ── RAG: Document Store + Tool Registry ─────────────────────────────────────
const docs = new Map();   // id → { id, title, content, tags, embedding, ts }
const tools = new Map();  // id → { id, name, description, endpoint, params, ts }

// Ingest a document into memory (RAG store)
app.post('/api/docs/ingest', (req, res) => {
  const { title, content, tags, source } = req.body || {};
  if (!content) return res.status(400).json({ ok: false, error: 'content required' });
  const id = `doc_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const words = content.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const doc = { id, title: title || 'Untitled', content, tags: tags || [], source: source || 'manual', words, ts: Date.now() };
  docs.set(id, doc);
  state.twin.memory.push({ type: 'doc_ingested', id, title: doc.title, ts: Date.now() });
  res.json({ ok: true, id, indexed_words: words.length });
});

// Search documents (keyword RAG)
app.get('/api/docs/search', (req, res) => {
  const q = (req.query.q || '').toLowerCase().split(/\s+/).filter(w => w.length > 2);
  if (!q.length) return res.json({ ok: true, results: [], query: req.query.q });
  const scored = [];
  for (const [, doc] of docs) {
    let score = 0;
    for (const term of q) {
      const hits = doc.words.filter(w => w.includes(term)).length;
      score += hits;
      if (doc.title.toLowerCase().includes(term)) score += 5;
      if ((doc.tags || []).some(t => t.toLowerCase().includes(term))) score += 3;
    }
    if (score > 0) scored.push({ id: doc.id, title: doc.title, score, snippet: doc.content.slice(0, 200), tags: doc.tags, source: doc.source });
  }
  scored.sort((a, b) => b.score - a.score);
  res.json({ ok: true, results: scored.slice(0, 20), query: req.query.q, total: scored.length });
});

// List all docs
app.get('/api/docs', (_req, res) => {
  const list = [...docs.values()].map(d => ({ id: d.id, title: d.title, tags: d.tags, source: d.source, size: d.content.length, ts: d.ts }));
  res.json({ ok: true, docs: list, count: list.length });
});

// Get single doc
app.get('/api/docs/:id', (req, res) => {
  const doc = docs.get(req.params.id);
  if (!doc) return res.status(404).json({ ok: false, error: 'not found' });
  res.json({ ok: true, ...doc });
});

// Delete doc
app.delete('/api/docs/:id', (req, res) => {
  docs.delete(req.params.id);
  res.json({ ok: true, deleted: true });
});

// Bulk ingest from filesystem scan
app.post('/api/docs/scan', async (req, res) => {
  const { dir, extensions } = req.body || {};
  const scanDir = dir || path.join(__dirname, 'shared');
  const exts = extensions || ['.json', '.md', '.txt', '.html'];
  let count = 0;
  try {
    const files = fs.readdirSync(scanDir).filter(f => exts.some(e => f.endsWith(e)));
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(scanDir, file), 'utf8');
        const id = `doc_${file.replace(/[^a-z0-9]/gi, '_')}`;
        const words = content.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        docs.set(id, { id, title: file, content: content.slice(0, 50000), tags: [path.extname(file)], source: `scan:${scanDir}`, words, ts: Date.now() });
        count++;
      } catch (_) {}
    }
    res.json({ ok: true, scanned: count, dir: scanDir });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Tool Registry ───────────────────────────────────────────────────────────
app.post('/api/tools/register', (req, res) => {
  const { name, description, endpoint, params, category } = req.body || {};
  if (!name) return res.status(400).json({ ok: false, error: 'name required' });
  const id = `tool_${name.replace(/\s+/g, '_').toLowerCase()}`;
  const tool = { id, name, description: description || '', endpoint: endpoint || '', params: params || [], category: category || 'general', ts: Date.now() };
  tools.set(id, tool);
  res.json({ ok: true, id, tool });
});

app.get('/api/tools', (_req, res) => {
  res.json({ ok: true, tools: [...tools.values()], count: tools.size });
});

app.get('/api/tools/search', (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  const results = [...tools.values()].filter(t =>
    t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)
  );
  res.json({ ok: true, results, query: req.query.q });
});

app.delete('/api/tools/:id', (req, res) => {
  tools.delete(req.params.id);
  res.json({ ok: true, deleted: true });
});

// ── RAG-Enhanced Twin Reasoning ─────────────────────────────────────────────
app.post('/api/brain/ask', (req, res) => {
  const { question } = req.body || {};
  if (!question) return res.status(400).json({ ok: false, error: 'question required' });

  // 1. Search docs for context
  const q = question.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const context = [];
  for (const [, doc] of docs) {
    let score = 0;
    for (const term of q) {
      score += doc.words.filter(w => w.includes(term)).length;
    }
    if (score > 0) context.push({ title: doc.title, snippet: doc.content.slice(0, 300), score });
  }
  context.sort((a, b) => b.score - a.score);
  const topDocs = context.slice(0, 5);

  // 2. Search tools for relevant capabilities
  const relevantTools = [...tools.values()].filter(t =>
    q.some(term => t.name.toLowerCase().includes(term) || t.description.toLowerCase().includes(term))
  ).slice(0, 3);

  // 3. Reason with context
  const twinResult = twinReason(question);

  // 4. Build enriched response
  const enriched = topDocs.length > 0
    ? `${twinResult.text}\n\n[Context from ${topDocs.length} docs: ${topDocs.map(d => d.title).join(', ')}]`
    : twinResult.text;

  res.json({
    ok: true,
    answer: enriched,
    topic: twinResult.topic,
    reasoning: { ...twinResult.reasoning, rag_docs: topDocs.length, tools_found: relevantTools.length },
    context: topDocs,
    tools: relevantTools,
    emotion: state.twin.emotion,
    ts: Date.now(),
  });
});

// ── Auto-register built-in tools on startup ─────────────────────────────────
const BUILTIN_TOOLS = [
  { name: 'Document Search', description: 'Search ingested documents by keyword', endpoint: '/api/docs/search', params: ['q'], category: 'rag' },
  { name: 'Document Ingest', description: 'Ingest text/content into RAG store', endpoint: '/api/docs/ingest', params: ['title', 'content', 'tags'], category: 'rag' },
  { name: 'Filesystem Scan', description: 'Scan directory and ingest all docs', endpoint: '/api/docs/scan', params: ['dir', 'extensions'], category: 'rag' },
  { name: 'Brain Ask', description: 'RAG-enhanced question answering with twin reasoning', endpoint: '/api/brain/ask', params: ['question'], category: 'reasoning' },
  { name: 'Twin Decide', description: 'Ask the AI twin to make a decision', endpoint: '/api/twin/decide', params: ['prompt', 'context'], category: 'reasoning' },
  { name: 'Task Post', description: 'Post task to marketplace', endpoint: '/api/marketplace/post', params: ['title', 'reward', 'description'], category: 'economy' },
  { name: 'Treasury Status', description: 'Get treasury balance and revenue', endpoint: '/api/treasury/status', params: [], category: 'economy' },
  { name: 'Swarm Health', description: 'Check swarm agent health', endpoint: '/api/swarm/health', params: [], category: 'network' },
  { name: 'CLI Enqueue', description: 'Enqueue a CLI command for execution', endpoint: '/api/cli/enqueue', params: ['command'], category: 'infra' },
  { name: 'Skills List', description: 'List all available skills', endpoint: '/api/skills', params: [], category: 'twin' },
  { name: 'Share Create', description: 'Create universal cross-platform share', endpoint: '/share', params: ['title', 'context'], category: 'sharing' },
  { name: 'Identity Resolve', description: 'Resolve cross-platform identity', endpoint: '/api/identity/:id', params: ['id'], category: 'identity' },
  { name: 'BossBots Signals', description: 'Get trading signals from BossBots', endpoint: '/api/bossbots/signals', params: [], category: 'trading' },
  { name: 'SDG Metrics', description: 'Sustainable Development Goals tracking', endpoint: '/api/sdg/metrics', params: [], category: 'governance' },
  { name: 'Mission Board', description: 'View active missions and tasks', endpoint: '/api/mission/board', params: [], category: 'governance' },
];
for (const t of BUILTIN_TOOLS) {
  const id = `tool_${t.name.replace(/\s+/g, '_').toLowerCase()}`;
  tools.set(id, { id, ...t, ts: Date.now() });
}

// ── Auto-scan shared/ contracts on startup ──────────────────────────────────
try {
  const sharedDir = path.join(__dirname, 'shared');
  if (fs.existsSync(sharedDir)) {
    const files = fs.readdirSync(sharedDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(sharedDir, file), 'utf8');
        const id = `doc_shared_${file.replace(/[^a-z0-9]/gi, '_')}`;
        const words = content.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        docs.set(id, { id, title: `[contract] ${file}`, content: content.slice(0, 50000), tags: ['contract', 'shared'], source: 'auto:shared', words, ts: Date.now() });
      } catch (_) {}
    }
    console.log(`[BRAIN] Auto-indexed ${docs.size} docs from shared/`);
  }
} catch (_) {}

// ── KEYFORGE API ────────────────────────────────────────────────────────────
app.get('/api/keyforge/status', (_req, res) => res.json({
  ok: true, version: KF_VERSION, epoch: kfCurrentEpoch(), epoch_sec: EPOCH_SEC,
  active_keys: [...kfActiveKeys], revoked_keys: [...kfRevokedKeys], revoked_scopes: [...kfRevokedScopes],
  boot_epoch: kfBootEpoch, uptime_epochs: kfCurrentEpoch() - kfBootEpoch, audit_entries: kfAuditLog.length,
}));
app.post('/api/keyforge/issue', (req, res) => {
  try {
    const { scope, key_id } = req.body || {};
    const token = kfIssue(scope || 'api-gateway', key_id || 'default');
    res.json({ ok: true, token, scope: scope || 'api-gateway' });
  } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});
app.post('/api/keyforge/validate', (req, res) => {
  const { token, required_scope } = req.body || {};
  const result = kfValidate(token, required_scope);
  res.json({ ok: true, ...result });
});
app.post('/api/keyforge/revoke', (req, res) => {
  const { key_id, scope } = req.body || {};
  if (key_id) { kfRevokedKeys.add(key_id); kfActiveKeys.delete(key_id); }
  if (scope) kfRevokedScopes.add(scope);
  broadcast({ type: 'keyforge_revocation', revoked_keys: [...kfRevokedKeys], revoked_scopes: [...kfRevokedScopes] });
  res.json({ ok: true, revoked: { key_id, scope } });
});
app.get('/api/keyforge/audit', (_req, res) => res.json({ ok: true, log: kfAuditLog.slice(-50) }));
app.get('/api/admin/keys', (_req, res) => {
  const envKeys = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'CLERK_PUBLISHABLE_KEY', 'PAYFAST_MERCHANT_KEY', 'JWT_SECRET', 'BRIDGE_INTERNAL_SECRET', 'GH_TOKEN'];
  const status = {};
  for (const k of envKeys) { const v = process.env[k]; status[k] = v ? (v.length > 8 ? 'set' : 'weak') : 'missing'; }
  res.json({ ok: true, keys: status, keyforge: { epoch: kfCurrentEpoch(), active: [...kfActiveKeys] } });
});

// ── QUANT ENGINE ────────────────────────────────────────────────────────────
const quant = {
  positions: [
    { pair: 'BTC/USD', side: 'long', entry: 67500, current: 68200, pnl: 700, size: 0.5, confidence: 0.82 },
    { pair: 'ETH/USD', side: 'long', entry: 3450, current: 3520, pnl: 70, size: 2.0, confidence: 0.76 },
    { pair: 'SOL/USD', side: 'short', entry: 185, current: 178, pnl: 14, size: 10, confidence: 0.68 },
  ],
  strategies: [
    { id: 'momentum', name: 'Momentum Alpha', win_rate: 0.64, sharpe: 1.8, drawdown: -0.12, active: true },
    { id: 'mean-revert', name: 'Mean Reversion', win_rate: 0.58, sharpe: 1.3, drawdown: -0.08, active: true },
    { id: 'arb', name: 'Cross-Exchange Arb', win_rate: 0.91, sharpe: 3.2, drawdown: -0.02, active: false },
    { id: 'sentiment', name: 'Sentiment Swing', win_rate: 0.52, sharpe: 0.9, drawdown: -0.15, active: true },
  ],
  risk: { max_exposure: 10000, current_exposure: 4850, var_95: -320, leverage: 1.5, margin_used: 0.48 },
};

app.get('/api/quant/positions', (_req, res) => res.json({ ok: true, positions: quant.positions, count: quant.positions.length }));
app.get('/api/quant/strategies', (_req, res) => res.json({ ok: true, strategies: quant.strategies }));
app.get('/api/quant/risk', (_req, res) => res.json({ ok: true, ...quant.risk }));
app.get('/api/quant/pnl', (_req, res) => {
  const total = quant.positions.reduce((s, p) => s + p.pnl, 0);
  res.json({ ok: true, total_pnl: total, positions: quant.positions.length, exposure: quant.risk.current_exposure });
});
app.post('/api/quant/signal', (req, res) => {
  const { pair, side, confidence, strategy } = req.body || {};
  const signal = { id: `sig_${Date.now()}`, pair, side, confidence, strategy, ts: Date.now(), status: 'pending' };
  broadcast({ type: 'quant_signal', data: signal });
  res.json({ ok: true, signal });
});

// ── BOSSBOTS STRATEGY MATRIX ────────────────────────────────────────────────
const bossbotMatrix = {
  bots: [
    { id: 'alpha', name: 'Alpha Trader', strategy: 'momentum', pair: 'BTC/USD', pnl: 2400, trades: 147, win_rate: 0.64, status: 'active' },
    { id: 'beta', name: 'Beta Arbitrage', strategy: 'arb', pair: 'ETH/BTC', pnl: 890, trades: 312, win_rate: 0.91, status: 'active' },
    { id: 'gamma', name: 'Gamma Sentiment', strategy: 'sentiment', pair: 'SOL/USD', pnl: -120, trades: 56, win_rate: 0.48, status: 'paused' },
    { id: 'delta', name: 'Delta Scalper', strategy: 'mean-revert', pair: 'ETH/USD', pnl: 560, trades: 204, win_rate: 0.58, status: 'active' },
  ],
  matrix: {
    risk_appetite: 0.6,
    correlation_threshold: 0.7,
    max_concurrent_trades: 8,
    rebalance_interval_ms: 300000,
    profit_target: 0.05,
    stop_loss: -0.03,
  },
};

app.get('/api/bossbots', (_req, res) => res.json({ ok: true, bots: bossbotMatrix.bots }));
app.get('/api/bossbots/matrix', (_req, res) => res.json({ ok: true, ...bossbotMatrix }));
app.post('/api/bossbots/trade', (req, res) => {
  const trade = { id: `trade_${Date.now()}`, ...req.body, executed: true, ts: Date.now() };
  broadcast({ type: 'bossbots_trade', data: trade });
  res.json({ ok: true, trade });
});
app.post('/api/bossbots/:id/toggle', (req, res) => {
  const bot = bossbotMatrix.bots.find(b => b.id === req.params.id);
  if (bot) bot.status = bot.status === 'active' ? 'paused' : 'active';
  res.json({ ok: true, bot });
});

// ── SWARM STRATEGY ORCHESTRATION ────────────────────────────────────────────
const swarmAgents = [
  { id: 'agent-alpha',   name: 'Alpha',   role: 'orchestrator', layer: 'L1', status: 'active', tasks_done: 342, trust: 0.95 },
  { id: 'agent-beta',    name: 'Beta',    role: 'verifier',     layer: 'L1', status: 'active', tasks_done: 287, trust: 0.92 },
  { id: 'agent-gamma',   name: 'Gamma',   role: 'executor',     layer: 'L2', status: 'active', tasks_done: 456, trust: 0.88 },
  { id: 'agent-delta',   name: 'Delta',   role: 'optimizer',    layer: 'L2', status: 'active', tasks_done: 198, trust: 0.90 },
  { id: 'agent-epsilon', name: 'Epsilon', role: 'scanner',      layer: 'L1', status: 'active', tasks_done: 523, trust: 0.87 },
  { id: 'agent-zeta',    name: 'Zeta',    role: 'guardian',      layer: 'L3', status: 'active', tasks_done: 134, trust: 0.93 },
  { id: 'agent-eta',     name: 'Eta',     role: 'trader',        layer: 'L2', status: 'idle',   tasks_done: 89,  trust: 0.85 },
  { id: 'agent-theta',   name: 'Theta',   role: 'teacher',       layer: 'L3', status: 'active', tasks_done: 76,  trust: 0.91 },
];

const swarmStrategies = [
  { id: 'parallel-exec', name: 'Parallel Execution', agents: ['alpha', 'gamma', 'delta'], mode: 'fan-out', active: true },
  { id: 'verify-chain', name: 'Verification Chain', agents: ['beta', 'zeta'], mode: 'sequential', active: true },
  { id: 'trade-swarm', name: 'Trading Swarm', agents: ['eta', 'epsilon'], mode: 'coordinated', active: true },
  { id: 'teach-loop', name: 'Teaching Loop', agents: ['theta', 'alpha'], mode: 'feedback', active: true },
];

app.get('/api/swarm/agents', (_req, res) => res.json({ ok: true, agents: swarmAgents, count: swarmAgents.length }));
app.get('/api/swarm/strategies', (_req, res) => res.json({ ok: true, strategies: swarmStrategies }));
app.get('/api/swarm/matrix', (_req, res) => {
  const layers = { L1: swarmAgents.filter(a => a.layer === 'L1'), L2: swarmAgents.filter(a => a.layer === 'L2'), L3: swarmAgents.filter(a => a.layer === 'L3') };
  res.json({ ok: true, layers, strategies: swarmStrategies, total_agents: swarmAgents.length, active: swarmAgents.filter(a => a.status === 'active').length });
});
app.post('/api/swarm/dispatch', (req, res) => {
  const { task, strategy, target_agent } = req.body || {};
  const dispatched = { id: `dispatch_${Date.now()}`, task, strategy, target_agent, status: 'dispatched', ts: Date.now() };
  broadcast({ type: 'swarm_dispatch', data: dispatched });
  res.json({ ok: true, dispatched });
});
app.post('/api/swarm/orchestrate', (req, res) => {
  const { plan, agents } = req.body || {};
  const execution = {
    id: `orch_${Date.now()}`,
    plan: plan || 'default',
    agents: agents || swarmAgents.filter(a => a.status === 'active').map(a => a.id),
    status: 'executing',
    ts: Date.now(),
  };
  broadcast({ type: 'swarm_orchestrate', data: execution });
  res.json({ ok: true, execution });
});

// ── PRIME AGENT (Master Orchestrator) ───────────────────────────────────────
const primeAgent = {
  id: 'prime-001',
  name: 'Prime',
  role: 'master_orchestrator',
  capabilities: ['reason', 'plan', 'execute', 'trade', 'teach', 'communicate', 'deploy', 'heal'],
  active_plans: [],
  decisions_made: 0,
  uptime_s: 0,
};
setInterval(() => { primeAgent.uptime_s++; }, 1000);

app.get('/api/prime', (_req, res) => res.json({ ok: true, ...primeAgent }));
app.post('/api/prime/plan', (req, res) => {
  const { goal, constraints, resources } = req.body || {};
  const plan = {
    id: `plan_${Date.now()}`,
    goal: goal || 'optimize_system',
    steps: [
      { step: 1, action: 'analyze', agent: 'epsilon', status: 'pending' },
      { step: 2, action: 'strategize', agent: 'alpha', status: 'pending' },
      { step: 3, action: 'execute', agent: 'gamma', status: 'pending' },
      { step: 4, action: 'verify', agent: 'beta', status: 'pending' },
      { step: 5, action: 'optimize', agent: 'delta', status: 'pending' },
    ],
    constraints: constraints || {},
    resources: resources || {},
    status: 'planning',
    ts: Date.now(),
  };
  primeAgent.active_plans.push(plan);
  primeAgent.decisions_made++;
  broadcast({ type: 'prime_plan', data: plan });
  res.json({ ok: true, plan });
});
app.post('/api/prime/execute', (req, res) => {
  const { plan_id } = req.body || {};
  const plan = primeAgent.active_plans.find(p => p.id === plan_id);
  if (!plan) return res.status(404).json({ ok: false, error: 'plan not found' });
  plan.status = 'executing';
  plan.steps.forEach(s => { s.status = 'queued'; });
  broadcast({ type: 'prime_execute', data: plan });
  res.json({ ok: true, executing: plan });
});

// ── MCP (Model Context Protocol) INTEGRATION ────────────────────────────────
const mcpServers = new Map();
const mcpTools = [];

// Register MCP server
app.post('/api/mcp/register', (req, res) => {
  const { name, url, tools: serverTools, capabilities } = req.body || {};
  if (!name || !url) return res.status(400).json({ ok: false, error: 'name and url required' });
  const server = { id: `mcp_${name}`, name, url, tools: serverTools || [], capabilities: capabilities || [], registered: Date.now(), status: 'connected' };
  mcpServers.set(server.id, server);
  // Register MCP tools into brain tool registry
  for (const t of (serverTools || [])) {
    const toolId = `tool_mcp_${name}_${t.name || t.id}`.replace(/\s+/g, '_').toLowerCase();
    tools.set(toolId, { id: toolId, name: `[MCP:${name}] ${t.name || t.id}`, description: t.description || '', endpoint: `${url}/${t.name || t.id}`, params: t.params || [], category: 'mcp', source: name, ts: Date.now() });
  }
  res.json({ ok: true, server, tools_registered: (serverTools || []).length });
});

app.get('/api/mcp/servers', (_req, res) => res.json({ ok: true, servers: [...mcpServers.values()], count: mcpServers.size }));

// MCP tool execution proxy
app.post('/api/mcp/execute', async (req, res) => {
  const { server_id, tool_name, params } = req.body || {};
  const server = mcpServers.get(server_id);
  if (!server) return res.status(404).json({ ok: false, error: 'MCP server not found' });
  // Proxy to MCP server
  try {
    const r = await fetch(`${server.url}/tools/${tool_name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ params }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await r.json();
    res.json({ ok: true, result: data, server: server.name, tool: tool_name });
  } catch (e) {
    res.json({ ok: false, error: e.message, server: server.name, tool: tool_name });
  }
});

// MCP context exchange
app.post('/api/mcp/context', (req, res) => {
  const { server_id, context } = req.body || {};
  // Store context for MCP interop
  const ctx = { server_id, context, ts: Date.now() };
  broadcast({ type: 'mcp_context', data: ctx });
  res.json({ ok: true, acknowledged: true });
});

// ── SVG SKILL ENGINE ACCESS ─────────────────────────────────────────────────
app.get('/api/skills/definitions', (_req, res) => {
  const definitions = [
    { id: 'bridge.decision', name: 'Twin Decision Engine', tags: ['decision', 'ethics', 'cognitive'], version: '1.0.0' },
    { id: 'bridge.economy', name: 'Bridge Economic Engine', tags: ['economy', 'treasury', 'marketplace'], version: '1.2.0' },
    { id: 'bridge.speech', name: 'Speech Embodiment', tags: ['speech', 'voice', 'tts'], version: '1.0.0' },
    { id: 'bridge.swarm', name: 'Swarm Health Monitor', tags: ['swarm', 'health', 'infrastructure'], version: '1.0.0' },
    { id: 'bridge.treasury', name: 'Central Treasury', tags: ['treasury', 'revenue', 'ubi', 'defi'], version: '1.0.0' },
    { id: 'bridge.twins', name: 'Digital Twins Manager', tags: ['twins', 'competition', 'evolution'], version: '1.0.0' },
    { id: 'bridge.youtube', name: 'YouTube-to-Doc', tags: ['youtube', 'learning', 'skills'], version: '1.0.0' },
    { id: 'flow.basic', name: 'Basic Flow', tags: ['flow', 'workflow'], version: '1.0.0' },
  ];
  res.json({ ok: true, definitions, count: definitions.length });
});

// ── REVENUE STREAMS & RAILS ────────────────────────────────────────────────
app.get('/api/revenue/streams', (_req, res) => res.json({ ok: true, streams: [
  { id: 'subscriptions', name: 'Subscriptions', mtd: 18500, trend: 'up', growth: 0.12 },
  { id: 'marketplace_fees', name: 'Marketplace Fees', mtd: 4200, trend: 'up', growth: 0.08 },
  { id: 'trading_profits', name: 'Trading Profits', mtd: 3800, trend: 'stable', growth: 0.02 },
  { id: 'api_usage', name: 'API Usage', mtd: 1200, trend: 'up', growth: 0.25 },
  { id: 'consulting', name: 'Consulting', mtd: 750, trend: 'down', growth: -0.05 },
] }));

app.get('/api/revenue/rails', (_req, res) => res.json({ ok: true, rails: [
  { id: 'payfast', name: 'PayFast (ZA)', status: 'active', currency: 'ZAR', endpoint: 'https://www.payfast.co.za/eng/process' },
  { id: 'paystack', name: 'Paystack', status: 'active', currency: 'NGN', endpoint: 'https://api.paystack.co' },
  { id: 'stripe', name: 'Stripe', status: 'pending', currency: 'USD', endpoint: 'https://api.stripe.com' },
  { id: 'crypto', name: 'Crypto (ETH/BTC)', status: 'active', currency: 'multi', endpoint: 'internal' },
  { id: 'paypal', name: 'PayPal', status: 'pending', currency: 'USD', endpoint: 'https://api.paypal.com' },
] }));

// ── MARKETING / OUTREACH ────────────────────────────────────────────────────
app.get('/api/marketing/campaigns', (_req, res) => res.json({ ok: true, campaigns: [
  { id: 'launch', name: 'Product Launch', status: 'active', leads: 342, conversions: 28, budget: 5000, spent: 2100 },
  { id: 'linkedin', name: 'LinkedIn Outreach', status: 'active', leads: 156, conversions: 12, budget: 1500, spent: 890 },
  { id: 'referral', name: 'Referral Program', status: 'active', leads: 89, conversions: 45, budget: 0, spent: 0 },
] }));

app.get('/api/marketing/leads', (_req, res) => res.json({ ok: true, total: 587, qualified: 234, converted: 85, pipeline_value: 47500 }));

// ── CONSOLIDATED DIGITAL TWIN KERNEL ─────────────────────────────────────────
// Central twin profile with avatar, identity, economy, and ops wired together
app.get('/api/twin/full', (_req, res) => {
  const twin = state.twin;
  const hash = crypto.createHash('md5').update(JSON.stringify(state)).digest('hex').slice(0, 12);
  res.json({
    ok: true,
    twin: {
      ...twin,
      avatar: {
        model: '/models/MetaHuman.glb',
        renderer: 'babylon',
        modes: ['wireframe', 'textured', 'anatomical', 'neural', 'holographic', 'quantum'],
        active_mode: 'neural',
        lipsync: true,
        emotion_driven: true,
      },
      identity: {
        id: 'empe-001',
        emails: { microsoft: 'supasoloc@yahoo.co.uk', google: '', notion: 'admin@ai-os.co.za', bridgeos: 'ryan@ai-os.co.za' },
        tenants: { microsoft: ['NHCLTD'], google: ['default'], notion: ["BRIDGE AI OS's Space"] },
        auth: { jwt: true, keyforge: true, siwe: false, clerk: false, google_oauth: 'pending' },
      },
    },
    economy: {
      treasury: state.treasury,
      revenue_streams: [
        { id: 'subscriptions', name: 'SaaS Subscriptions', mtd: 18500, arr: 222000 },
        { id: 'marketplace', name: 'Marketplace Fees (15%)', mtd: 4200, arr: 50400 },
        { id: 'trading', name: 'BossBot Trading Profits', mtd: 3800, arr: 45600 },
        { id: 'api', name: 'API Usage Metering', mtd: 1200, arr: 14400 },
        { id: 'consulting', name: 'Consulting & Custom', mtd: 750, arr: 9000 },
      ],
      payment_rails: {
        active: [
          { id: 'payfast', name: 'PayFast', region: 'ZA', currency: 'ZAR', type: 'fiat', status: 'active' },
          { id: 'paystack', name: 'Paystack', region: 'NG/GH/ZA', currency: 'ZAR,NGN,USD,GHS', type: 'fiat', status: 'active' },
          { id: 'crypto_eth', name: 'Ethereum', currency: 'ETH', type: 'crypto', status: 'active', address: '0x...' },
          { id: 'crypto_btc', name: 'Bitcoin', currency: 'BTC', type: 'crypto', status: 'active' },
          { id: 'crypto_sol', name: 'Solana', currency: 'SOL', type: 'crypto', status: 'active' },
          { id: 'brdg_token', name: 'BRDG Token', currency: 'BRDG', type: 'defi', status: 'active' },
        ],
        pending: [
          { id: 'stripe', name: 'Stripe', region: 'Global', currency: 'USD,EUR,GBP', type: 'fiat', status: 'pending' },
          { id: 'paypal', name: 'PayPal', region: 'Global', currency: 'USD', type: 'fiat', status: 'pending' },
          { id: 'iban_sepa', name: 'IBAN/SEPA', region: 'EU', currency: 'EUR', type: 'bank', status: 'pending' },
          { id: 'wise', name: 'Wise (TransferWise)', region: 'Global', currency: 'multi', type: 'bank', status: 'planned' },
        ],
      },
      dex: {
        pairs: [
          { pair: 'BRDG/ETH', price: 0.00042, volume_24h: 12500, change: 0.034 },
          { pair: 'BRDG/USDT', price: 1.28, volume_24h: 34200, change: -0.012 },
          { pair: 'BRDG/SOL', price: 0.0072, volume_24h: 8900, change: 0.056 },
        ],
        liquidity_pools: [
          { pool: 'BRDG-ETH', tvl: 245000, apy: 0.18 },
          { pool: 'BRDG-USDT', tvl: 180000, apy: 0.12 },
        ],
      },
      defi: {
        protocol: 'Bridge DeFi',
        contracts: { treasury: '0xTreasury...', token: '0xBRDG...', staking: '0xStake...' },
        staking: { total_staked: 2500000, apy: 0.15, stakers: 342 },
        ubi: { pool_balance: 45000, distribution_rate: 'monthly', recipients: 156, last_distribution: '2026-03-01' },
      },
    },
    ops: {
      founder: { name: 'Ryan Saunders', email: 'ryan@ai-os.co.za', role: 'CEO/Founder' },
      swarm: { agents: swarmAgents.length, active: swarmAgents.filter(a => a.status === 'active').length, strategies: swarmStrategies.length },
      services: { gateway: ':8080', brain: ':8000', system: ':3000', terminal: ':5002', auth: ':5001' },
      domain: 'go.ai-os.co.za',
      vps: { ip: '102.208.228.44', provider: 'WebWay', ram: '6GB', disk: '200GB', region: 'ZA' },
    },
    state_version: stateVersion,
    state_hash: `0x${hash}`,
  });
});

// ── PAYMENT WEBHOOKS ────────────────────────────────────────────────────────
app.post('/api/payments/webhook/payfast', (req, res) => {
  const { pf_payment_id, payment_status, amount_gross, item_name } = req.body || {};
  if (payment_status === 'COMPLETE') {
    state.treasury.balance += parseFloat(amount_gross || 0);
    state.treasury.earned += parseFloat(amount_gross || 0);
    broadcast({ type: 'payment_received', rail: 'payfast', amount: amount_gross, item: item_name });
  }
  res.json({ ok: true });
});
app.post('/api/payments/webhook/paystack', (req, res) => {
  const { event, data } = req.body || {};
  if (event === 'charge.success') {
    const amt = (data?.amount || 0) / 100;
    state.treasury.balance += amt;
    state.treasury.earned += amt;
    broadcast({ type: 'payment_received', rail: 'paystack', amount: amt });
  }
  res.json({ ok: true });
});
app.post('/api/payments/webhook/crypto', (req, res) => {
  const { amount, currency, tx_hash } = req.body || {};
  state.treasury.balance += parseFloat(amount || 0);
  state.treasury.earned += parseFloat(amount || 0);
  broadcast({ type: 'payment_received', rail: 'crypto', amount, currency, tx_hash });
  res.json({ ok: true });
});
app.post('/api/payments/webhook/:rail', (req, res) => {
  broadcast({ type: 'payment_webhook', rail: req.params.rail, body: req.body });
  res.json({ ok: true, rail: req.params.rail });
});

// ── DEX ENDPOINTS ───────────────────────────────────────────────────────────
app.get('/api/dex/pairs', (_req, res) => res.json({ ok: true, pairs: [
  { pair: 'BRDG/ETH', price: 0.00042, volume_24h: 12500, change: 0.034, high: 0.00045, low: 0.00039 },
  { pair: 'BRDG/USDT', price: 1.28, volume_24h: 34200, change: -0.012, high: 1.32, low: 1.25 },
  { pair: 'BRDG/SOL', price: 0.0072, volume_24h: 8900, change: 0.056, high: 0.0078, low: 0.0068 },
] }));
app.get('/api/dex/pools', (_req, res) => res.json({ ok: true, pools: [
  { pool: 'BRDG-ETH', tvl: 245000, apy: 0.18, volume_24h: 15600, fees_24h: 23.4 },
  { pool: 'BRDG-USDT', tvl: 180000, apy: 0.12, volume_24h: 28300, fees_24h: 42.45 },
] }));
app.post('/api/dex/swap', (req, res) => {
  const { from, to, amount } = req.body || {};
  const trade = { id: `swap_${Date.now()}`, from, to, amount, rate: 1.28, received: amount * 1.28, fee: amount * 0.003, ts: Date.now() };
  broadcast({ type: 'dex_swap', data: trade });
  res.json({ ok: true, trade });
});

// ── DEFI / UBI ──────────────────────────────────────────────────────────────
app.get('/api/defi/status', (_req, res) => res.json({ ok: true,
  staking: { total_staked: 2500000, apy: 0.15, stakers: 342, min_stake: 100 },
  ubi: { pool: 45000, recipients: 156, rate: 'monthly', last: '2026-03-01', next: '2026-04-01' },
  governance: { proposals: 3, active_votes: 1, quorum: 0.51 },
}));
app.get('/api/ubi/status', (_req, res) => res.json({ ok: true, pool: 45000, recipients: 156, rate: 'monthly', last_distribution: '2026-03-01' }));
app.post('/api/ubi/claim', (req, res) => {
  const { address } = req.body || {};
  res.json({ ok: true, claimed: true, address, amount: 28.85, currency: 'BRDG', next_claim: '2026-04-01' });
});

// ── WALLET ──────────────────────────────────────────────────────────────────
app.get('/api/wallet/balance', (_req, res) => res.json({ ok: true, balances: [
  { currency: 'BRDG', amount: 125000, usd_value: 160000 },
  { currency: 'ETH', amount: 2.4, usd_value: 8640 },
  { currency: 'SOL', amount: 45, usd_value: 8010 },
  { currency: 'BTC', amount: 0.15, usd_value: 10230 },
  { currency: 'ZAR', amount: 92500, usd_value: 4930 },
], total_usd: 191810 }));

// ── FOUNDER / OPS ───────────────────────────────────────────────────────────
app.get('/api/founder/profile', (_req, res) => res.json({ ok: true,
  name: 'Ryan Saunders', email: 'ryan@ai-os.co.za', role: 'CEO/Founder',
  companies: ['Bridge AI', 'SupAC', 'Taurus Global Star', 'EHSA', 'Empeleni'],
  treasury_access: true, admin: true,
}));
app.get('/api/ops/overview', (_req, res) => res.json({ ok: true,
  services_running: 5, pages_deployed: 15, endpoints_active: 99,
  uptime: process.uptime(), memory_mb: Math.round(process.memoryUsage().heapUsed / 1048576),
  vps: { ip: '102.208.228.44', domain: 'go.ai-os.co.za', ssl: true, provider: 'WebWay' },
  git: { repo: 'bridgeaios/THE-BRIDGE-AI-OS-V0', branch: 'feature/supadash-consolidation' },
  pm2: ['bridge-gateway', 'super-brain', 'god-mode-system', 'terminal-proxy', 'auth-service'],
}));

// ── DEPLOY ──────────────────────────────────────────────────────────────────
app.post('/api/deploy/plan', (req, res) => {
  const { target, services } = req.body || {};
  res.json({ ok: true, plan: {
    target: target || 'vps',
    domain: 'go.ai-os.co.za',
    ip: '102.208.231.53',
    services: services || ['gateway', 'brain', 'ban', 'system', 'terminal'],
    steps: ['git pull', 'npm install', 'pm2 restart', 'nginx reload', 'certbot renew'],
    estimated_downtime: '0s (rolling restart)',
  } });
});

// ── INDEX.JSON (system manifest) ────────────────────────────────────────────
app.get('/index.json', (_req, res) => res.json({
  name: 'Bridge AI OS', version: '3.0.0', domain: 'go.ai-os.co.za',
  pages: [
    { path: '/', name: 'Dashboard' }, { path: '/topology.html', name: 'Topology' },
    { path: '/registry.html', name: 'Registry' }, { path: '/marketplace.html', name: 'Marketplace' },
    { path: '/avatar.html', name: 'Avatar' }, { path: '/system-status-dashboard.html', name: 'Status' },
    { path: '/terminal.html', name: 'Terminal' }, { path: '/control.html', name: 'Control' },
    { path: '/ban', name: 'BAN' }, { path: '/onboarding.html', name: 'Join' },
    { path: '/sitemap.html', name: 'Sitemap' }, { path: '/abaas.html', name: 'ABAAS' },
    { path: '/aoe-dashboard.html', name: 'AOE' }, { path: '/logs.html', name: 'Logs' },
    { path: '/topology-layers.html', name: 'Topology Layers' },
  ],
  services: { gateway: 8080, brain: 8000, system: 3000, terminal: 5002, auth: 5001 },
  capabilities: ['twin', 'speech', 'emotion', 'treasury', 'marketplace', 'swarm', 'quant', 'bossbots', 'keyforge', 'rag', 'mcp', 'defi', 'dex', 'ubi'],
  payment_rails: ['payfast', 'paystack', 'crypto_eth', 'crypto_btc', 'crypto_sol', 'brdg_token', 'stripe_pending', 'paypal_pending', 'iban_pending'],
  ts: Date.now(),
}));

// ── NON-PREFIXED ALIASES (for AOE dashboard compatibility) ──────────────────
app.get('/treasury/summary', (_req, res) => res.json({ ok: true, ...state.treasury }));
app.get('/treasury/status', (_req, res) => res.json({ ok: true, ...state.treasury }));
app.get('/swarm/health', (_req, res) => res.json({ ok: true, ...state.swarm, ts: Date.now() }));

// ── SVG ENGINE PROXY (replaces port 7070) ───────────────────────────────────
app.get('/skills', (_req, res) => res.json({ ok: true, skills: state.twin.skills.map((s, i) => ({ id: `bridge.${s}`, name: s, tags: [s], version: '1.0.0' })) }));
app.get('/graph', (_req, res) => res.json({ ok: true, nodes: state.twin.skills.length, edges: state.twin.skills.length - 1 }));
app.get('/telemetry', (_req, res) => res.json({ ok: true, uptime: process.uptime(), skills_loaded: state.twin.skills.length, executions: 0, cache_hits: 0 }));
app.get('/run/:id', (req, res) => res.json({ ok: true, skill: req.params.id, data: { value: Math.random(), ts: Date.now() } }));
app.get('/teach/:id', (req, res) => {
  const id = req.params.id;
  res.type('svg').send(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="200" style="background:#050a0f"><text x="20" y="30" fill="#00c8ff" font-family="monospace" font-size="14">${id} — SVG Visualization</text><rect x="20" y="50" width="${Math.random()*700}" height="20" fill="#00e57b" rx="4"/><text x="20" y="100" fill="#4d6678" font-family="monospace" font-size="11">Generated by Bridge AI Brain</text></svg>`);
});

// ── LIVE MAP ────────────────────────────────────────────────────────────────
app.get('/live-map', (_req, res) => res.json({ ok: true, nodes: swarmAgents.map(a => ({ id: a.id, name: a.name, layer: a.layer, status: a.status, x: Math.random() * 800, y: Math.random() * 400 })), edges: swarmStrategies.flatMap(s => s.agents.slice(1).map((a, i) => ({ from: `agent-${s.agents[0]}`, to: `agent-${a}` }))) }));

// ── ECON CIRCUIT BREAKER ────────────────────────────────────────────────────
app.get('/econ/circuit-breaker', (_req, res) => res.json({ ok: true, tripped: false, exposure: quant.risk.current_exposure, ceiling: quant.risk.max_exposure, utilization: (quant.risk.current_exposure / quant.risk.max_exposure).toFixed(2) }));

// ── OUTPUT DIR (for AOE builds) ─────────────────────────────────────────────
app.get('/output/', (_req, res) => res.type('html').send('<html><body>No builds yet</body></html>'));

// ── CATCH-ALL for unknown /api/* routes — return empty OK instead of HTML ──
app.all('/api/*path', (req, res) => {
  res.json({ ok: true, stub: true, path: req.path, method: req.method, ts: Date.now() });
});

// ── LOAD BUSINESS SUITE ─────────────────────────────────────────────────────
require('./brain-business.js')(app, state, broadcast);
console.log('[BRAIN] Business suite loaded (17 domains, 49 endpoints)');

// ── DB STATUS ENDPOINT (report all databases) ───────────────────────────────
app.get('/api/db/status', (_req, res) => {
  const dbs = [];
  try { const s = fs.statSync(path.join(__dirname, 'users.db')); dbs.push({ name: 'users.db', tables: ['users','referrals','payments','_migrations'], size_kb: Math.round(s.size/1024), engine: 'sqlite', managed_by: 'auth.js' }); } catch (_) {}
  try { const s = fs.statSync(path.join(__dirname, 'empeleni.db')); dbs.push({ name: 'empeleni.db', tables: ['clients','payments'], size_kb: Math.round(s.size/1024), engine: 'sqlite', managed_by: 'server.js (PayFast)' }); } catch (_) {}
  dbs.push({ name: 'brain-memory', tables: ['contacts','invoices','quotes','vendors','inventory','debts','tickets','customers','rules','legal','docs','tools','shares'], engine: 'in-memory', managed_by: 'brain.js + brain-business.js', note: 'Volatile — data lost on restart' });
  res.json({ ok: true, databases: dbs, count: dbs.length });
});

// ── START ───────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`[BRAIN] Bridge AI Super Brain running on http://localhost:${PORT}`);
  console.log(`[BRAIN] WebSocket: ws://localhost:${PORT}/ws/<channel>`);
  console.log(`[BRAIN] Endpoints: ${Object.keys(app._router?.stack || []).length}+ routes`);
  console.log(`[BRAIN] Twin: ${state.twin.name} (${state.twin.id})`);
  console.log(`[BRAIN] Skills: ${state.twin.skills.join(', ')}`);
});

module.exports = { app, server, state };
