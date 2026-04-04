// =============================================================================
// VERCEL SERVERLESS — SINGLE CATCH-ALL FUNCTION
// Handles ALL /api/*, /health, /orchestrator/*, /billing, /ask, /auth/*, /referral/*
// =============================================================================
const os = require('os');
const fs = require('fs');
const path = require('path');

// ── Shared helpers ──────────────────────────────────────────────────────────
const ROOT = path.resolve(__dirname, '..');
const SHARED_DIR = path.join(ROOT, 'shared');
const ts = () => Date.now();

function readContracts() {
  try {
    const files = fs.readdirSync(SHARED_DIR).filter(f => f.endsWith('.json'));
    const contracts = {};
    for (const file of files) {
      try { contracts[file] = JSON.parse(fs.readFileSync(path.join(SHARED_DIR, file), 'utf8')); }
      catch (_) { contracts[file] = { error: 'parse_failed' }; }
    }
    return { files, contracts };
  } catch (_) { return { files: [], contracts: {} }; }
}

function readPortAssignments() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'port-assignments.json'), 'utf8')); }
  catch (_) { return { assignments: [] }; }
}

function listPackages() {
  try {
    const nmDir = path.join(ROOT, 'node_modules');
    const dirs = fs.readdirSync(nmDir).filter(d => !d.startsWith('.') && !d.startsWith('@'));
    const scopedDirs = fs.readdirSync(nmDir).filter(d => d.startsWith('@'));
    const scoped = [];
    for (const scope of scopedDirs) {
      try { scoped.push(...fs.readdirSync(path.join(nmDir, scope)).map(i => `${scope}/${i}`)); } catch (_) {}
    }
    return [...dirs, ...scoped].sort();
  } catch (_) { return []; }
}

// ── Avatar modes ────────────────────────────────────────────────────────────
const AVATAR_MODES = {
  wireframe: {
    geometry: { type: 'wireframe-mesh', vertices: 2048, faces: 4096, topology: 'triangulated' },
    material: { type: 'wireframe', color: '#00ffcc', lineWidth: 1.5, opacity: 0.8 },
    camera: { position: [0, 1.6, 3], target: [0, 0.8, 0], fov: 55 },
    lighting: [{ type: 'ambient', intensity: 0.3 }],
    effects: ['edge-glow'],
  },
  textured: {
    geometry: { type: 'humanoid-mesh', vertices: 8192, faces: 16384, topology: 'subdivided', lod_levels: 3 },
    material: { type: 'pbr', albedo: '#c4956a', roughness: 0.6, metalness: 0.1, normal_map: true },
    camera: { position: [0, 1.5, 2.5], target: [0, 0.9, 0], fov: 50 },
    lighting: [{ type: 'directional', intensity: 1.0, position: [2, 3, 1] }, { type: 'ambient', intensity: 0.4 }],
    effects: ['ssao', 'soft-shadows'],
  },
  anatomical: {
    geometry: { type: 'layered-mesh', layers: ['skeleton', 'muscle', 'skin'], vertices: 32768 },
    material: { type: 'translucent', opacity_layers: [1.0, 0.7, 0.4], color_layers: ['#f0f0e0', '#cc4444', '#c4956a'] },
    camera: { position: [0, 1.4, 3.5], target: [0, 0.9, 0], fov: 45 },
    lighting: [{ type: 'area', intensity: 1.2, size: [2, 2] }],
    effects: ['subsurface-scattering', 'x-ray-toggle'],
  },
  neural: {
    geometry: { type: 'particle-system', particle_count: 50000, connections: 12000 },
    material: { type: 'emissive-particles', color: '#7744ff', pulse_speed: 1.2 },
    camera: { position: [0, 1.6, 4], target: [0, 1.0, 0], fov: 60 },
    lighting: [{ type: 'point', intensity: 0.5, color: '#4400ff', position: [0, 2, 0] }],
    effects: ['bloom', 'particle-trails', 'synapse-fire'],
  },
  holographic: {
    geometry: { type: 'hologram-mesh', vertices: 4096, scan_lines: true, flicker_rate: 0.02 },
    material: { type: 'holographic', base_color: '#00ccff', scan_line_color: '#ffffff', opacity: 0.6, fresnel: 2.0 },
    camera: { position: [0, 1.5, 3], target: [0, 0.9, 0], fov: 50 },
    lighting: [{ type: 'rim', intensity: 1.5, color: '#00ccff' }],
    effects: ['scanlines', 'chromatic-aberration', 'flicker'],
  },
  quantum: {
    geometry: { type: 'probability-cloud', qubit_count: 256, superposition_states: 8 },
    material: { type: 'quantum-field', color_a: '#ff00ff', color_b: '#00ffff', entanglement_vis: true },
    camera: { position: [0, 2, 5], target: [0, 1.0, 0], fov: 65 },
    lighting: [{ type: 'volumetric', intensity: 0.8, color: '#8800ff', scatter: 0.3 }],
    effects: ['wave-collapse', 'entanglement-lines', 'probability-haze'],
  },
};

// ── Route handlers ──────────────────────────────────────────────────────────
const agentNames = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta'];
let treasuryBalance = 137284.50;

// Auth store (ephemeral per cold start — acceptable for serverless demo)
const authUsers = new Map();
const JWT_SECRET = process.env.JWT_SECRET || 'bridge-ai-os-dev-secret-change-in-prod';
const REFERRAL_CODES = { BRIDGE2025: 500, AILAUNCH: 250, BETA100: 100 };

let jwt, bcrypt;
try { jwt = require('jsonwebtoken'); } catch (_) { jwt = null; }
try { bcrypt = require('bcryptjs'); } catch (_) { bcrypt = null; }

function makeToken(payload) {
  if (!jwt) return `stub-token-${Date.now()}`;
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}
function verifyToken(token) {
  if (!jwt) return null;
  try { return jwt.verify(token, JWT_SECRET); } catch (_) { return null; }
}
async function hashPassword(pw) { return bcrypt ? bcrypt.hash(pw, 10) : `hashed:${pw}`; }
async function checkPassword(pw, hash) { return bcrypt ? bcrypt.compare(pw, hash) : hash === `hashed:${pw}`; }

// ── Router ──────────────────────────────────────────────────────────────────
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
}

function json(res, data, status = 200) {
  res.status(status).setHeader('Content-Type', 'application/json').end(JSON.stringify(data));
}

async function parseBody(req) {
  if (req.body) return req.body;
  return new Promise((resolve) => {
    let data = '';
    req.on('data', c => { data += c; });
    req.on('end', () => { try { resolve(JSON.parse(data)); } catch (_) { resolve({}); } });
  });
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  // ── Health ──
  if (p === '/health') {
    return json(res, { status: 'OK', gateway: 'up', core: 'serverless', ts: ts() });
  }

  // ── Orchestrator status ──
  if (p === '/orchestrator/status') {
    const agents = agentNames.map(name => ({
      id: `agent_${name}`, name, status: 'active',
      tasks_completed: Math.floor(Math.random() * 500),
      uptime_s: Math.floor(Math.random() * 86400),
    }));
    return json(res, { status: 'running', agents: agents.length, active_agents: agents.length, swarms: 2, queue_depth: Math.floor(Math.random() * 20), agents_list: agents, ts: ts() });
  }

  // ── Billing ──
  if (p === '/billing') {
    return json(res, {
      treasury_balance: +treasuryBalance.toFixed(2), currency: 'USD', period: 'monthly',
      revenue_mtd: 28450, costs_mtd: 4210.50, net_mtd: 24239.50, subscriptions: 142,
      active_plans: [
        { id: 'starter', name: 'Starter', price: 49, count: 64 },
        { id: 'pro', name: 'Pro', price: 149, count: 51 },
        { id: 'enterprise', name: 'Enterprise', price: 499, count: 27 },
      ],
      last_updated: new Date().toISOString(),
    });
  }

  // ── Ask (LLM) ──
  if (p === '/ask' && req.method === 'POST') {
    const body = await parseBody(req);
    if (!body.prompt) return json(res, { error: 'prompt required' }, 400);
    return json(res, { id: `svl_${Date.now()}`, response: `[Serverless] Received: "${body.prompt}"` });
  }

  // ── API: Topology ──
  if (p === '/api/topology') {
    const ifaces = os.networkInterfaces();
    const nodes = [{ id: 'gateway', label: 'Gateway (Vercel)', port: 443, status: 'up', type: 'gateway' }];
    const edges = [];
    for (const [name, addrs] of Object.entries(ifaces)) {
      if (name === 'lo') continue;
      const ipv4 = addrs.find(a => a.family === 'IPv4');
      if (ipv4) {
        nodes.push({ id: `iface_${name}`, label: name, ip: ipv4.address, mac: ipv4.mac, type: 'interface' });
        edges.push({ source: 'gateway', target: `iface_${name}` });
      }
    }
    const services = [
      { id: 'system', label: 'System / Core', port: 3000 },
      { id: 'ainode', label: 'AI Node', port: 3001 },
      { id: 'orchestrator_l1', label: 'L1 Orchestrator', port: 9000 },
      { id: 'orchestrator_l2', label: 'L2 Orchestrator', port: 9001 },
      { id: 'orchestrator_l3', label: 'L3 Orchestrator', port: 9002 },
      { id: 'server', label: 'Server', port: 5000 },
      { id: 'payments', label: 'Payments', port: 4000 },
    ];
    for (const svc of services) {
      nodes.push({ ...svc, status: 'remote', type: 'service' });
      edges.push({ source: 'gateway', target: svc.id });
    }
    return json(res, { nodes, edges, interface_count: Object.keys(ifaces).length, env: 'serverless', ts: ts() });
  }

  // ── API: Avatar ──
  if (p.startsWith('/api/avatar')) {
    const mode = p.replace('/api/avatar/', '').replace('/api/avatar', '') || 'wireframe';
    if (mode === 'modes') return json(res, { modes: Object.keys(AVATAR_MODES), count: Object.keys(AVATAR_MODES).length, ts: ts() });
    const scene = AVATAR_MODES[mode] || AVATAR_MODES['wireframe'];
    return json(res, {
      mode: AVATAR_MODES[mode] ? mode : 'wireframe', scene_type: 'babylon-scene', ...scene,
      animations: ['idle', 'breathe', 'gesture', 'think'],
      interaction: { clickable: true, rotatable: true, zoomable: true }, ts: ts(),
    });
  }

  // ── API: Registry ──
  if (p.startsWith('/api/registry')) {
    const ns = p.replace('/api/registry/', '').replace('/api/registry', '') || 'root';
    const handlers = {
      kernel: () => {
        const cpus = os.cpus();
        return {
          os_type: os.type(), os_release: os.release(), os_platform: os.platform(), os_arch: os.arch(),
          hostname: os.hostname(), uptime_seconds: os.uptime(), loadavg: os.loadavg(),
          cpu_model: cpus[0]?.model || 'unknown', cpu_cores: cpus.length, cpu_speed_mhz: cpus[0]?.speed || 0,
          total_memory_bytes: os.totalmem(), free_memory_bytes: os.freemem(),
          memory_usage_pct: +((1 - os.freemem() / os.totalmem()) * 100).toFixed(1),
          env: 'serverless', status: 'healthy', ts: ts(),
        };
      },
      network: () => {
        const ifaces = os.networkInterfaces();
        const interfaces = [];
        for (const [name, addrs] of Object.entries(ifaces)) {
          for (const addr of addrs) {
            interfaces.push({ name, address: addr.address, netmask: addr.netmask, family: addr.family, mac: addr.mac, internal: addr.internal });
          }
        }
        return { interfaces, dns: ['serverless-managed'], interface_count: interfaces.length, status: 'healthy', ts: ts() };
      },
      security: () => {
        let tlsCerts = [];
        try { tlsCerts = fs.readdirSync(path.join(ROOT, 'certs')).filter(f => /\.(pem|crt|key|cert)$/i.test(f)); } catch (_) {}
        return {
          tls_certs_found: tlsCerts.length, tls_certs: tlsCerts, tls_enabled: true,
          firewall: 'vercel-managed', env_secrets_exposed: 0, env_secret_keys: [],
          last_scan: new Date().toISOString(), status: 'healthy', ts: ts(),
        };
      },
      federation: () => ({
        federation_nodes: [
          { id: 'l1_orchestrator', port: 9000, host: 'localhost', reachable: false, error: 'serverless-no-local' },
          { id: 'l2_orchestrator', port: 9001, host: '192.168.110.203', reachable: false, error: 'serverless-no-lan' },
          { id: 'l3_orchestrator', port: 9002, host: 'localhost', reachable: false, error: 'serverless-no-local' },
        ],
        reachable_count: 0, total: 3, env: 'serverless', ts: ts(),
      }),
      jobs: () => {
        const { files } = readContracts();
        const jobs = files.map((file, i) => {
          try {
            const d = JSON.parse(fs.readFileSync(path.join(SHARED_DIR, file), 'utf8'));
            return { id: `job_${i + 1}`, file, title: d.title || d.name || file.replace('.json', ''), status: d.status || 'queued', priority: d.priority || 'normal' };
          } catch (_) { return { id: `job_${i + 1}`, file, status: 'error' }; }
        });
        return { jobs, count: jobs.length, ts: ts() };
      },
      market: () => {
        const { files, contracts } = readContracts();
        let totalTasks = 0, totalAgents = 0, completed = 0;
        for (const d of Object.values(contracts)) {
          if (d.tasks) totalTasks += Array.isArray(d.tasks) ? d.tasks.length : 1;
          if (d.agents) totalAgents += Array.isArray(d.agents) ? d.agents.length : 1;
          if (d.status === 'completed') completed++;
        }
        return { contracts: files.length, total_tasks: totalTasks, total_agents: totalAgents, completion_pct: files.length > 0 ? +((completed / files.length) * 100).toFixed(1) : 0, ts: ts() };
      },
      bridgeos: () => ({
        source: 'serverless-fallback', live: false,
        data: { hostname: os.hostname(), platform: os.platform(), arch: os.arch(), uptime: os.uptime(), memory: { total: os.totalmem(), free: os.freemem() }, cpus: os.cpus().length },
        ts: ts(),
      }),
      nodemap: () => {
        const ifaces = os.networkInterfaces();
        const nodes = [{ id: 'gateway', label: 'Gateway (Vercel)', port: 443, status: 'up', type: 'gateway' }];
        for (const [name, addrs] of Object.entries(ifaces)) {
          const ipv4 = addrs.find(a => a.family === 'IPv4');
          if (ipv4 && name !== 'lo') nodes.push({ id: `iface_${name}`, label: name, ip: ipv4.address, type: 'interface' });
        }
        return {
          nodes, orchestrators: [
            { id: 'orch_l1', host: 'localhost', port: 9000, layer: 'L1' },
            { id: 'orch_l2', host: '192.168.110.203', port: 9001, layer: 'L2' },
            { id: 'orch_l3', host: 'localhost', port: 9002, layer: 'L3' },
          ], ts: ts(),
        };
      },
    };
    const handler = handlers[ns];
    if (handler) return json(res, { namespace: ns, data: handler(), ts: ts() });
    return json(res, { namespace: ns, available: Object.keys(handlers), ts: ts() });
  }

  // ── API: Marketplace ──
  if (p.startsWith('/api/marketplace')) {
    const section = p.replace('/api/marketplace/', '').replace('/api/marketplace', '') || 'index';
    const handlers = {
      tasks: () => {
        const { files } = readContracts();
        const tasks = [];
        for (const file of files) {
          try {
            const d = JSON.parse(fs.readFileSync(path.join(SHARED_DIR, file), 'utf8'));
            tasks.push({
              id: `task_${file.replace('.json', '')}`, title: d.title || d.name || file.replace('.json', '').replace(/-/g, ' '),
              source_file: file, status: d.status || 'pending', reward: d.reward || Math.floor(file.length * 17.3),
              created: d.created || d.generated || null,
            });
          } catch (_) {}
        }
        return { open: tasks.filter(t => t.status === 'pending' || t.status === 'open').length, in_progress: tasks.filter(t => t.status === 'in_progress').length, completed: tasks.filter(t => t.status === 'completed').length, listings: tasks, ts: ts() };
      },
      dex: () => {
        const pa = readPortAssignments();
        const assignments = pa.assignments || [];
        const pairs = [];
        for (let i = 0; i < assignments.length; i++) {
          for (let j = i + 1; j < assignments.length; j++) {
            pairs.push({
              pair: `${assignments[i].service.replace('.js', '').toUpperCase()}/${assignments[j].service.replace('.js', '').toUpperCase()}`,
              ports: [assignments[i].assigned_port, assignments[j].assigned_port],
              active: !assignments[i].conflict && !assignments[j].conflict,
            });
          }
        }
        return { pairs: pairs.slice(0, 20), total_services: assignments.length, active_pairs: pairs.filter(p => p.active).length, ts: ts() };
      },
      wallet: () => {
        const totalMem = os.totalmem(), freeMem = os.freemem(), cpus = os.cpus();
        return {
          balances: [
            { token: 'CPU', amount: cpus.length, unit: 'cores', utilization_pct: +(os.loadavg()[0] / cpus.length * 100).toFixed(1) },
            { token: 'RAM', amount: +(totalMem / 1073741824).toFixed(2), unit: 'GB', free: +(freeMem / 1073741824).toFixed(2), usage_pct: +((1 - freeMem / totalMem) * 100).toFixed(1) },
            { token: 'UPTIME', amount: os.uptime(), unit: 'seconds' },
          ],
          system_value_score: Math.floor(cpus.length * 100 + (totalMem / 1073741824) * 50),
          env: 'serverless', ts: ts(),
        };
      },
      skills: () => {
        const pkgs = listPackages();
        return {
          installed: pkgs, count: pkgs.length,
          categories: {
            runtime: pkgs.filter(p => ['express', 'cors', 'dotenv', 'better-sqlite3'].includes(p)),
            security: pkgs.filter(p => ['bcryptjs', 'jsonwebtoken', 'helmet'].includes(p)),
            testing: pkgs.filter(p => ['jest', 'supertest', 'mocha', 'chai'].includes(p)),
          },
          ts: ts(),
        };
      },
      portfolio: () => ({
        total_value: 1000, health_pct: 14.3,
        assets: [
          { id: 'gateway', port: 443, status: 'up', value: 1000 },
          { id: 'system', port: 3000, status: 'remote', value: 0 },
          { id: 'ainode', port: 3001, status: 'remote', value: 0 },
          { id: 'orchestrator_l1', port: 9000, status: 'remote', value: 0 },
          { id: 'orchestrator_l2', port: 9001, status: 'remote', value: 0 },
          { id: 'server', port: 5000, status: 'remote', value: 0 },
          { id: 'payments', port: 4000, status: 'remote', value: 0 },
        ],
        env: 'serverless', ts: ts(),
      }),
      stats: () => {
        const { files } = readContracts();
        let totalTasks = 0, agentCount = 0;
        for (const file of files) {
          try {
            const d = JSON.parse(fs.readFileSync(path.join(SHARED_DIR, file), 'utf8'));
            if (d.tasks) totalTasks += Array.isArray(d.tasks) ? d.tasks.length : 1;
            if (d.agents) agentCount += Array.isArray(d.agents) ? d.agents.length : 1;
          } catch (_) {}
        }
        try {
          const af = fs.readdirSync(path.join(ROOT, 'agents')).filter(f => f.endsWith('.js'));
          agentCount = Math.max(agentCount, af.length);
        } catch (_) {}
        return { total_tasks: totalTasks || files.length, total_agents: agentCount, contracts: files.length, uptime_seconds: os.uptime(), uptime_hours: +(os.uptime() / 3600).toFixed(2), memory_usage_pct: +((1 - os.freemem() / os.totalmem()) * 100).toFixed(1), cpu_cores: os.cpus().length, platform: os.platform(), env: 'serverless', ts: ts() };
      },
    };
    const handler = handlers[section];
    if (handler) return json(res, { section, data: handler(), ts: ts() });
    return json(res, { section, available: Object.keys(handlers), ts: ts() });
  }

  // ── API: Status ──
  if (p === '/api/status') {
    return json(res, {
      overall: 'serverless',
      services: [
        { id: 'gateway', port: 443, status: 'up', latency_ms: 0 },
        { id: 'system', port: 3000, status: 'remote', latency_ms: -1 },
        { id: 'ainode', port: 3001, status: 'remote', latency_ms: -1 },
        { id: 'orchestrator', port: 3002, status: 'remote', latency_ms: -1 },
      ],
      env: 'serverless', ts: ts(),
    });
  }

  // ── API: Agents ──
  if (p === '/api/agents') {
    return json(res, {
      count: agentNames.length,
      layers: {
        L1: { status: 'serverless-no-local', layer: 'L1', agents: agentNames.map(n => ({ id: `agent_${n}`, name: n, status: 'active', layer: 'L1' })), count: agentNames.length },
        L2: { status: 'serverless-no-lan', layer: 'L2', agents: [], count: 0 },
      },
      agents: agentNames.map(n => ({ id: `agent_${n}`, name: n, status: 'active', layer: 'L1' })),
      env: 'serverless', ts: ts(),
    });
  }

  // ── API: Contracts ──
  if (p === '/api/contracts') {
    const { files, contracts } = readContracts();
    return json(res, { count: files.length, files, contracts, ts: ts() });
  }

  // ── Auth: Register ──
  if (p === '/auth/register' && req.method === 'POST') {
    const body = await parseBody(req);
    if (!body.email || !body.password) return json(res, { error: 'email and password required' }, 400);
    if (authUsers.has(body.email)) return json(res, { error: 'email already registered' }, 409);
    const password_hash = await hashPassword(body.password);
    const user = { id: `usr_${Date.now()}`, email: body.email, password_hash, credits: 0, created_at: new Date().toISOString() };
    authUsers.set(body.email, user);
    const token = makeToken({ sub: user.id, email: body.email });
    return json(res, { token, user: { id: user.id, email: body.email, credits: 0 } }, 201);
  }

  // ── Auth: Login ──
  if (p === '/auth/login' && req.method === 'POST') {
    const body = await parseBody(req);
    if (!body.email || !body.password) return json(res, { error: 'email and password required' }, 400);
    const user = authUsers.get(body.email);
    if (!user) return json(res, { error: 'invalid credentials' }, 401);
    const ok = await checkPassword(body.password, user.password_hash);
    if (!ok) return json(res, { error: 'invalid credentials' }, 401);
    const token = makeToken({ sub: user.id, email: body.email });
    return json(res, { token, user: { id: user.id, email: body.email, credits: user.credits } });
  }

  // ── Auth: Verify ──
  if (p === '/auth/verify') {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    if (!token) return json(res, { error: 'no token provided' }, 401);
    const payload = verifyToken(token);
    if (!payload) return json(res, { error: 'invalid or expired token' }, 401);
    return json(res, { valid: true, user: { sub: payload.sub, email: payload.email } });
  }

  // ── Referral: Claim ──
  if (p === '/referral/claim' && req.method === 'POST') {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    if (!token) return json(res, { error: 'authentication required' }, 401);
    const payload = verifyToken(token);
    if (!payload) return json(res, { error: 'invalid or expired token' }, 401);
    const body = await parseBody(req);
    if (!body.code) return json(res, { error: 'referral code required' }, 400);
    const credits = REFERRAL_CODES[String(body.code).toUpperCase()];
    if (!credits) return json(res, { error: 'invalid referral code' }, 404);
    const user = authUsers.get(payload.email);
    if (user) user.credits = (user.credits || 0) + credits;
    return json(res, { success: true, code: body.code, credits, message: `${credits} credits applied` });
  }

  // ── L1 / L2 / L3 orchestrator proxy stubs ──
  const layerMatch = p.match(/^\/api\/(l1|l2|l3)(\/.*)?$/);
  if (layerMatch) {
    const layer = layerMatch[1].toUpperCase();
    const subpath = layerMatch[2] || '/';
    return json(res, { error: `${layer} orchestrator unavailable in serverless mode`, layer, path: subpath, env: 'serverless' }, 502);
  }

  // ── SSE stub ──
  if (p === '/events/stream') {
    return json(res, { error: 'SSE not available in serverless mode. Use local gateway at localhost:8080 for live events.', env: 'serverless' });
  }

  // ── API: Treasury Ledger ──
  if (p === '/api/treasury/ledger') {
    const now = Date.now();
    const txTypes = [
      { type: 'subscription', desc: 'Starter Plan', amount: 49 },
      { type: 'subscription', desc: 'Pro Plan', amount: 149 },
      { type: 'subscription', desc: 'Enterprise Plan', amount: 499 },
      { type: 'cost', desc: 'AWS Infrastructure', amount: -89.50 },
      { type: 'cost', desc: 'Vercel Hosting', amount: -20 },
      { type: 'cost', desc: 'API Usage (OpenAI)', amount: -156.30 },
      { type: 'reward', desc: 'Agent Task Reward', amount: -25 },
      { type: 'referral', desc: 'Referral Bonus', amount: -50 },
      { type: 'subscription', desc: 'Pro Plan', amount: 149 },
      { type: 'subscription', desc: 'Starter Plan', amount: 49 },
    ];
    const ledger = [];
    for (let i = 0; i < 30; i++) {
      const tx = txTypes[i % txTypes.length];
      ledger.push({
        id: `tx_${1000 + i}`,
        type: tx.type,
        description: tx.desc,
        amount: tx.amount,
        balance_after: +(137284.50 + (i * 12.3)).toFixed(2),
        timestamp: new Date(now - (30 - i) * 3600000).toISOString(),
      });
    }
    return json(res, { ledger, count: ledger.length, ts: ts() });
  }

  // ── API: Treasury Summary ──
  if (p === '/api/treasury/summary') {
    return json(res, {
      balance: +treasuryBalance.toFixed(2),
      currency: 'USD',
      revenue_mtd: 28450,
      costs_mtd: 4210.50,
      net_mtd: 24239.50,
      subscriptions: 142,
      plans: [
        { id: 'starter', name: 'Starter', price: 49, count: 64, revenue: 3136 },
        { id: 'pro', name: 'Pro', price: 149, count: 51, revenue: 7599 },
        { id: 'enterprise', name: 'Enterprise', price: 499, count: 27, revenue: 13473 },
      ],
      revenue_trend: Array.from({length: 12}, (_, i) => ({ month: i + 1, revenue: Math.floor(20000 + Math.random() * 10000), costs: Math.floor(3000 + Math.random() * 2000) })),
      ts: ts(),
    });
  }

  // ── API: Events Recent ──
  if (p === '/api/events/recent') {
    const now = Date.now();
    const types = ['lead_delivered', 'ai_inference', 'swarm_dispatch', 'task_completed', 'treasury_update'];
    const events = [];
    for (let i = 0; i < 50; i++) {
      const type = types[i % types.length];
      const agent = agentNames[i % agentNames.length];
      const evtTs = now - (50 - i) * 6000;
      let data;
      if (type === 'lead_delivered') data = { agent, lead_id: `lead_${evtTs}`, value: +(Math.random() * 500 + 50).toFixed(2) };
      else if (type === 'ai_inference') data = { agent, model: 'bridge-llm', tokens: Math.floor(Math.random() * 800 + 100), latency_ms: Math.floor(Math.random() * 300 + 50) };
      else if (type === 'swarm_dispatch') data = { agent, task: `task_${evtTs}`, priority: ['low', 'medium', 'high'][i % 3] };
      else if (type === 'task_completed') data = { agent, task: `task_${evtTs - 5000}`, duration_ms: Math.floor(Math.random() * 2000 + 200) };
      else data = { balance: +(treasuryBalance + i * 3.2).toFixed(2), delta: +(Math.random() * 200 - 50).toFixed(2), currency: 'USD' };
      events.push({ id: `evt_${i}`, type, data, ts: evtTs });
    }
    return json(res, { events, count: events.length, ts: ts() });
  }

  // ── API: Agents Dispatch ──
  if (p === '/api/agents/dispatch' && req.method === 'POST') {
    const body = await parseBody(req);
    if (!body.agent || !body.task) return json(res, { error: 'agent and task required' }, 400);
    return json(res, {
      id: `dispatch_${Date.now()}`,
      agent: body.agent,
      task: body.task,
      priority: body.priority || 'medium',
      status: 'dispatched',
      dispatched_at: new Date().toISOString(),
      estimated_completion_ms: Math.floor(Math.random() * 20000 + 10000),
    });
  }

  // ── API: Agents Queue ──
  if (p === '/api/agents/queue') {
    const queue = agentNames.slice(0, 5).map((agent, i) => ({
      id: `qtask_${Date.now() - i * 10000}`,
      agent,
      description: ['Process lead batch', 'Run inference pipeline', 'Verify contracts', 'Optimize queries', 'Generate report'][i],
      priority: ['high', 'medium', 'medium', 'low', 'high'][i],
      status: i === 0 ? 'running' : 'queued',
      queued_at: new Date(Date.now() - i * 30000).toISOString(),
      elapsed_ms: i === 0 ? Math.floor(Math.random() * 15000) : 0,
    }));
    return json(res, { queue, count: queue.length, ts: ts() });
  }

  // ── API: Marketplace Tasks Create ──
  if (p === '/api/marketplace/tasks/create' && req.method === 'POST') {
    const body = await parseBody(req);
    if (!body.title) return json(res, { error: 'title required' }, 400);
    return json(res, {
      id: `task_${Date.now()}`,
      title: body.title,
      description: body.description || '',
      reward: body.reward || 100,
      status: 'open',
      created_at: new Date().toISOString(),
    });
  }

  // ── API: Users ──
  if (p === '/api/users') {
    const seedUsers = [
      { id: 'usr_1001', email: 'admin@bridgeai.os', credits: 5000, referral_code: 'BRIDGE2025', active: true, joined: '2026-01-15T08:00:00Z' },
      { id: 'usr_1002', email: 'agent.alpha@bridgeai.os', credits: 2450, referral_code: 'ALPHA100', active: true, joined: '2026-01-20T14:30:00Z' },
      { id: 'usr_1003', email: 'dev@bridgeai.os', credits: 1200, referral_code: 'DEV500', active: true, joined: '2026-02-01T09:15:00Z' },
      { id: 'usr_1004', email: 'ops@bridgeai.os', credits: 800, referral_code: 'OPS250', active: true, joined: '2026-02-10T16:45:00Z' },
      { id: 'usr_1005', email: 'beta.tester@bridgeai.os', credits: 350, referral_code: 'BETA100', active: false, joined: '2026-03-01T11:00:00Z' },
    ];
    return json(res, { users: seedUsers, count: seedUsers.length, ts: ts() });
  }

  // ── /api/treasury (alias for treasury/summary) ──
  if (p === '/api/treasury') {
    // Bucket names match treasury-dashboard.html expectations (ops/treasury/ubi/founder)
    const recentTx = [
      { timestamp: new Date(Date.now() - 3600000).toISOString(),  type: 'subscription', source: 'Patel Tech',       amount: 499, bucket: 'ops' },
      { timestamp: new Date(Date.now() - 7200000).toISOString(),  type: 'subscription', source: 'Botha Digital',    amount: 49,  bucket: 'ops' },
      { timestamp: new Date(Date.now() - 14400000).toISOString(), type: 'payout',       source: 'UBI Distribution', amount: -82, bucket: 'ubi' },
      { timestamp: new Date(Date.now() - 28800000).toISOString(), type: 'subscription', source: 'Dlamini Group',    amount: 149, bucket: 'ops' },
      { timestamp: new Date(Date.now() - 43200000).toISOString(), type: 'transfer',     source: 'Reserve Fund',     amount: 200, bucket: 'treasury' },
      { timestamp: new Date(Date.now() - 86400000).toISOString(), type: 'subscription', source: 'Ndlovu Holdings',  amount: 149, bucket: 'ops' },
    ];
    return json(res, {
      total: +treasuryBalance.toFixed(2), balance: +treasuryBalance.toFixed(2), currency: 'USD',
      buckets: [
        { name: 'ops',      label: 'Operations', pct: 40, balance: +(treasuryBalance * 0.4).toFixed(2),  value: +(treasuryBalance * 0.4).toFixed(2) },
        { name: 'treasury', label: 'Growth',     pct: 25, balance: +(treasuryBalance * 0.25).toFixed(2), value: +(treasuryBalance * 0.25).toFixed(2) },
        { name: 'ubi',      label: 'Reserve',    pct: 20, balance: +(treasuryBalance * 0.2).toFixed(2),  value: +(treasuryBalance * 0.2).toFixed(2) },
        { name: 'founder',  label: 'Founder',    pct: 15, balance: +(treasuryBalance * 0.15).toFixed(2), value: +(treasuryBalance * 0.15).toFixed(2) },
      ],
      recent: recentTx,
      payments_today: 6,
      status: 'healthy', ts: ts()
    });
  }

  // ── /api/treasury/payments ──
  if (p === '/api/treasury/payments') {
    const payments = Array.from({ length: 8 }, (_, i) => ({
      id: `pay_${1000 + i}`, amount: +(Math.random() * 500 + 50).toFixed(2), currency: 'ZAR',
      status: ['completed', 'completed', 'pending', 'completed'][i % 4],
      method: ['PayFast', 'EFT', 'Crypto', 'PayFast'][i % 4],
      date: new Date(Date.now() - i * 86400000).toISOString().slice(0, 10),
    }));
    return json(res, { payments, count: payments.length, ts: ts() });
  }

  // ── /api/health ──
  if (p === '/api/health') {
    return json(res, { status: 'ok', uptime: process.uptime(), env: 'serverless', ts: ts() });
  }

  // ── /api/swarm/agents ──
  if (p === '/api/swarm/agents') {
    const agents = agentNames.map((n, i) => ({
      id: `agent_${i}`, name: n, status: 'active',
      layer: i < 3 ? 'L1' : i < 6 ? 'L2' : 'L3',
      tasks_completed: Math.floor(Math.random() * 100) + 10,
      uptime_pct: +(95 + Math.random() * 5).toFixed(1),
    }));
    return json(res, { agents, count: agents.length, swarms: 2, ts: ts() });
  }

  // ── /api/swarm/* (health, matrix, strategies, orchestrate) ──
  if (p.startsWith('/api/swarm/')) {
    const sub = p.split('/api/swarm/')[1];
    if (sub === 'health') return json(res, { status: 'healthy', agents: 8, active: 8, ts: ts() });
    if (sub === 'matrix') return json(res, { L1: { count: 3, role: 'streaming' }, L2: { count: 3, role: 'processing' }, L3: { count: 2, role: 'minimax' }, ts: ts() });
    if (sub === 'strategies') return json(res, { strategies: ['round-robin', 'priority-weighted', 'consensus', 'auction'], active: 'priority-weighted', ts: ts() });
    if (sub === 'orchestrate' && req.method === 'POST') return json(res, { status: 'dispatched', task_id: `task_${ts()}`, ts: ts() });
    return json(res, { error: 'unknown_swarm_endpoint', path: p }, 404);
  }

  // ── /api/ehsa/dashboard ──
  if (p === '/api/ehsa/dashboard') {
    return json(res, { patients: 1247, facilities: 8, compliance_pct: 94, active_cases: 23, ts: ts() });
  }

  // ── /api/economics ──
  if (p === '/api/economics') {
    return json(res, {
      revenue: { monthly: +(treasuryBalance * 0.08).toFixed(2), annual: +(treasuryBalance * 0.96).toFixed(2), currency: 'USD' },
      costs: { monthly: +(treasuryBalance * 0.03).toFixed(2), breakdown: { infra: 40, agents: 35, marketing: 25 } },
      margin_pct: 62.5, mrr_growth_pct: 12.3, ts: ts()
    });
  }

  // ── /api/credits ──
  if (p === '/api/credits') {
    return json(res, { balance: 5000, used_today: 127, limit: 10000, ts: ts() });
  }

  // ── Seed data (deterministic — no Math.random on financial figures) ──────────
  const CONTACTS = [
    { id: 'c001', name: 'Sipho Ndlovu',    email: 'sipho@ndlovuholdings.co.za',  company: 'Ndlovu Holdings',    status: 'customer', plan: 'pro',        value: 149, stage: 'closed', joined: '2026-01-15' },
    { id: 'c002', name: 'Priya Naidoo',    email: 'priya@techbridge.io',          company: 'TechBridge IO',      status: 'customer', plan: 'enterprise', value: 499, stage: 'closed', joined: '2026-01-22' },
    { id: 'c003', name: 'Thabo Mokoena',   email: 'thabo@mokoena.co.za',          company: 'Mokoena Consulting', status: 'lead',     plan: 'pro',        value: 149, stage: 'proposal', joined: '2026-02-03' },
    { id: 'c004', name: 'Zoe van der Berg',email: 'zoe@vdberg.co.za',             company: 'VDB Solutions',      status: 'customer', plan: 'starter',    value: 49,  stage: 'closed', joined: '2026-02-10' },
    { id: 'c005', name: 'Kwame Asante',    email: 'kwame@asante.africa',          company: 'Asante Africa',      status: 'lead',     plan: 'enterprise', value: 499, stage: 'demo',   joined: '2026-02-18' },
    { id: 'c006', name: 'Naledi Dlamini',  email: 'naledi@dlaminigroup.co.za',    company: 'Dlamini Group',      status: 'customer', plan: 'pro',        value: 149, stage: 'closed', joined: '2026-03-01' },
    { id: 'c007', name: 'Reza Patel',      email: 'reza@pateltech.io',            company: 'Patel Tech',         status: 'customer', plan: 'enterprise', value: 499, stage: 'closed', joined: '2026-03-08' },
    { id: 'c008', name: 'Amara Osei',      email: 'amara@oseiventures.com',       company: 'Osei Ventures',      status: 'lead',     plan: 'pro',        value: 149, stage: 'outreach', joined: '2026-03-15' },
    { id: 'c009', name: 'Leilani Botha',   email: 'leilani@bothadigital.co.za',   company: 'Botha Digital',      status: 'customer', plan: 'starter',    value: 49,  stage: 'closed', joined: '2026-03-20' },
    { id: 'c010', name: 'Jabu Khumalo',    email: 'jabu@khumalocorp.co.za',       company: 'Khumalo Corp',       status: 'prospect', plan: 'enterprise', value: 499, stage: 'identified', joined: '2026-04-01' },
  ];

  const INVOICES = [
    { id: 'inv_001', client: 'Ndlovu Holdings',    email: 'sipho@ndlovuholdings.co.za',  amount: 149, currency: 'ZAR', status: 'paid',    due: '2026-03-15', issued: '2026-03-01', description: 'Bridge AI OS Pro — March 2026' },
    { id: 'inv_002', client: 'TechBridge IO',       email: 'priya@techbridge.io',          amount: 499, currency: 'ZAR', status: 'paid',    due: '2026-03-20', issued: '2026-03-05', description: 'Bridge AI OS Enterprise — March 2026' },
    { id: 'inv_003', client: 'VDB Solutions',        email: 'zoe@vdberg.co.za',             amount: 49,  currency: 'ZAR', status: 'paid',    due: '2026-03-25', issued: '2026-03-10', description: 'Bridge AI OS Starter — March 2026' },
    { id: 'inv_004', client: 'Dlamini Group',        email: 'naledi@dlaminigroup.co.za',    amount: 149, currency: 'ZAR', status: 'paid',    due: '2026-04-01', issued: '2026-03-15', description: 'Bridge AI OS Pro — April 2026' },
    { id: 'inv_005', client: 'Patel Tech',           email: 'reza@pateltech.io',            amount: 499, currency: 'ZAR', status: 'sent',    due: '2026-04-08', issued: '2026-03-22', description: 'Bridge AI OS Enterprise — April 2026' },
    { id: 'inv_006', client: 'Botha Digital',        email: 'leilani@bothadigital.co.za',   amount: 49,  currency: 'ZAR', status: 'sent',    due: '2026-04-20', issued: '2026-04-01', description: 'Bridge AI OS Starter — April 2026' },
    { id: 'inv_007', client: 'Mokoena Consulting',   email: 'thabo@mokoena.co.za',          amount: 149, currency: 'ZAR', status: 'draft',   due: '2026-04-30', issued: '2026-04-04', description: 'Bridge AI OS Pro — Onboarding' },
    { id: 'inv_008', client: 'Asante Africa',        email: 'kwame@asante.africa',          amount: 499, currency: 'ZAR', status: 'draft',   due: '2026-05-01', issued: '2026-04-04', description: 'Bridge AI OS Enterprise — Demo Period' },
  ];

  const TICKETS = [
    { id: 'tkt_001', subject: 'Treasury dashboard not refreshing', client: 'TechBridge IO',     email: 'priya@techbridge.io',        priority: 'high',   status: 'open',       created: '2026-04-02T08:12:00Z', agent: 'alpha' },
    { id: 'tkt_002', subject: 'How do I add team members?',         client: 'VDB Solutions',      email: 'zoe@vdberg.co.za',           priority: 'medium', status: 'resolved',   created: '2026-04-01T14:30:00Z', agent: 'beta',  resolved: '2026-04-01T16:45:00Z' },
    { id: 'tkt_003', subject: 'API rate limit hit on swarm',         client: 'Ndlovu Holdings',    email: 'sipho@ndlovuholdings.co.za', priority: 'high',   status: 'in_progress', created: '2026-04-03T09:00:00Z', agent: 'gamma' },
    { id: 'tkt_004', subject: 'Invoice PDF not generating',          client: 'Dlamini Group',      email: 'naledi@dlaminigroup.co.za',  priority: 'medium', status: 'open',       created: '2026-04-03T11:15:00Z', agent: null },
    { id: 'tkt_005', subject: 'Can I upgrade mid-cycle?',            client: 'Botha Digital',      email: 'leilani@bothadigital.co.za', priority: 'low',    status: 'resolved',   created: '2026-03-30T10:00:00Z', agent: 'delta', resolved: '2026-03-30T10:45:00Z' },
    { id: 'tkt_006', subject: 'Leadgen pipeline stalled at nurture', client: 'Patel Tech',         email: 'reza@pateltech.io',          priority: 'high',   status: 'open',       created: '2026-04-04T07:30:00Z', agent: 'epsilon' },
  ];

  // ── /api/treasury/status ──
  if (p === '/api/treasury/status') {
    return json(res, {
      balance: +treasuryBalance.toFixed(2), currency: 'ZAR',
      status: 'healthy', last_updated: new Date().toISOString(),
      buckets: [
        { name: 'ops',      label: 'Operations', pct: 40, balance: +(treasuryBalance * 0.4).toFixed(2),  value: +(treasuryBalance * 0.4).toFixed(2) },
        { name: 'treasury', label: 'Growth',     pct: 25, balance: +(treasuryBalance * 0.25).toFixed(2), value: +(treasuryBalance * 0.25).toFixed(2) },
        { name: 'ubi',      label: 'Reserve',    pct: 20, balance: +(treasuryBalance * 0.2).toFixed(2),  value: +(treasuryBalance * 0.2).toFixed(2) },
        { name: 'founder',  label: 'Founder',    pct: 15, balance: +(treasuryBalance * 0.15).toFixed(2), value: +(treasuryBalance * 0.15).toFixed(2) },
      ],
      ts: ts(),
    });
  }

  // ── /api/analytics/summary ──
  if (p === '/api/analytics/summary') {
    const mrr = INVOICES.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0);
    const open = INVOICES.filter(i => i.status === 'sent').reduce((s, i) => s + i.amount, 0);
    const agents = agentNames.length;
    return json(res, {
      mrr, open_invoices: open,
      customers: CONTACTS.filter(c => c.status === 'customer').length,
      leads:     CONTACTS.filter(c => c.status !== 'customer').length,
      agents_active: agents,
      tasks_processed: agents * 47,
      treasury_balance: +treasuryBalance.toFixed(2),
      uptime_s: os.uptime(),
      memory_pct: +((1 - os.freemem() / os.totalmem()) * 100).toFixed(1),
      last_24h: {
        total: agents * 47 + 312,
        routes: 18,
      },
      top_pages: [
        { route: '/ui',                  hits: 847 },
        { route: '/treasury-dashboard',  hits: 312 },
        { route: '/aoe-dashboard',       hits: 289 },
        { route: '/50-applications',     hits: 201 },
        { route: '/system-status-dashboard', hits: 178 },
      ],
      ts: ts(),
    });
  }

  // ── /api/tools ──
  if (p === '/api/tools') {
    const pkgs = listPackages();
    return json(res, {
      tools: [
        { id: 'swarm',    name: 'Agent Swarm',     status: 'active', agents: agentNames.length },
        { id: 'treasury', name: 'Treasury Engine',  status: 'active', balance: +treasuryBalance.toFixed(2) },
        { id: 'crm',      name: 'CRM',              status: 'active', contacts: CONTACTS.length },
        { id: 'leadgen',  name: 'LeadGen Pipeline', status: 'active', leads: CONTACTS.filter(c => c.status !== 'customer').length },
        { id: 'invoicing',name: 'Invoicing',        status: 'active', open: INVOICES.filter(i => i.status !== 'paid').length },
        { id: 'brain',    name: 'Central Brain',    status: 'active', uptime_s: os.uptime() },
      ],
      packages_installed: pkgs.length,
      ts: ts(),
    });
  }

  // ── /api/brain (central intelligence aggregator) ──
  if (p === '/api/brain') {
    const mrr = INVOICES.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0);
    return json(res, {
      status: 'active',
      treasury: { balance: +treasuryBalance.toFixed(2), currency: 'ZAR', status: 'healthy' },
      agents:   { count: agentNames.length, active: agentNames.length, swarms: 2 },
      crm:      { contacts: CONTACTS.length, customers: CONTACTS.filter(c => c.status === 'customer').length, leads: CONTACTS.filter(c => c.status !== 'customer').length },
      revenue:  { mrr, open_invoices: INVOICES.filter(i => i.status === 'sent').length },
      support:  { open_tickets: TICKETS.filter(t => t.status === 'open').length, in_progress: TICKETS.filter(t => t.status === 'in_progress').length },
      system:   { uptime_s: os.uptime(), memory_pct: +((1 - os.freemem() / os.totalmem()) * 100).toFixed(1), cpu_cores: os.cpus().length, env: 'serverless' },
      ts: ts(),
    });
  }

  // ── /api/crm/* ──
  if (p.startsWith('/api/crm')) {
    const sub = p.replace('/api/crm', '') || '/';
    if (sub === '/contacts' || sub === '/contacts/') {
      if (req.method === 'POST') {
        const body = await parseBody(req);
        if (!body.name || !body.email) return json(res, { error: 'name and email required' }, 400);
        const newContact = { id: `c${Date.now()}`, ...body, status: 'lead', stage: 'identified', joined: new Date().toISOString().slice(0, 10) };
        return json(res, { contact: newContact, message: 'Contact created', ts: ts() }, 201);
      }
      return json(res, { contacts: CONTACTS, count: CONTACTS.length, ts: ts() });
    }
    if (sub === '/stats') {
      const customers = CONTACTS.filter(c => c.status === 'customer');
      const leads = CONTACTS.filter(c => c.status !== 'customer');
      const mrr = customers.reduce((s, c) => s + (c.value || 0), 0);
      return json(res, {
        total_contacts: CONTACTS.length, customers: customers.length, leads: leads.length, prospects: leads.filter(c => c.status === 'prospect').length,
        mrr, avg_deal_value: customers.length ? +(mrr / customers.length).toFixed(2) : 0,
        pipeline_value: leads.reduce((s, c) => s + (c.value || 0), 0),
        ts: ts(),
      });
    }
    if (sub === '/leads') {
      return json(res, { leads: CONTACTS.filter(c => c.status !== 'customer'), count: CONTACTS.filter(c => c.status !== 'customer').length, ts: ts() });
    }
    if (sub === '/campaigns') {
      return json(res, {
        campaigns: [
          { id: 'camp_01', name: 'Q1 AI Automation Outreach', status: 'active',   sent: 320, opened: 148, replied: 42, converted: 7,  revenue: +(7 * 149).toFixed(2) },
          { id: 'camp_02', name: 'Enterprise Decision Makers', status: 'active',   sent: 85,  opened: 61,  replied: 18, converted: 3,  revenue: +(3 * 499).toFixed(2) },
          { id: 'camp_03', name: 'SME Starter Push',           status: 'complete', sent: 500, opened: 210, replied: 89, converted: 21, revenue: +(21 * 49).toFixed(2)  },
          { id: 'camp_04', name: 'Q2 Re-engagement',           status: 'draft',    sent: 0,   opened: 0,   replied: 0,  converted: 0,  revenue: 0 },
        ],
        ts: ts(),
      });
    }
    return json(res, { error: 'unknown_crm_endpoint', sub }, 404);
  }

  // ── /api/outreach/stats ──
  if (p === '/api/outreach/stats') {
    return json(res, {
      emails_sent: 905, emails_opened: 419, open_rate_pct: 46.3,
      replies: 149, reply_rate_pct: 16.5,
      demos_booked: 28, deals_closed: 31,
      pipeline_value: CONTACTS.filter(c => c.status !== 'customer').reduce((s, c) => s + (c.value || 0), 0),
      ts: ts(),
    });
  }

  // ── /api/leadgen/* ──
  if (p.startsWith('/api/leadgen')) {
    const sub = p.replace('/api/leadgen', '') || '/';
    if (sub === '/auto-prospect' && req.method === 'POST') {
      const body = await parseBody(req);
      return json(res, {
        id: `prospect_${ts()}`,
        status: 'queued',
        target: body.target || 'SME technology companies ZA',
        agent: 'epsilon',
        estimated_leads: 25,
        queued_at: new Date().toISOString(),
        ts: ts(),
      });
    }
    if (sub === '/auto-nurture' && req.method === 'POST') {
      const body = await parseBody(req);
      return json(res, {
        id: `nurture_${ts()}`,
        status: 'dispatched',
        lead_id: body.lead_id || 'c003',
        sequence: ['intro_email', 'follow_up_1', 'demo_invite', 'follow_up_2', 'close_offer'],
        next_touch: new Date(Date.now() + 86400000).toISOString(),
        agent: 'zeta',
        ts: ts(),
      });
    }
    if (sub === '/auto-close' && req.method === 'POST') {
      const body = await parseBody(req);
      return json(res, {
        id: `close_${ts()}`,
        status: 'initiated',
        lead_id: body.lead_id || 'c005',
        offer: { plan: 'pro', price: 149, trial_days: 14 },
        agent: 'eta',
        ts: ts(),
      });
    }
    // GET — pipeline summary
    return json(res, {
      pipeline: CONTACTS.filter(c => c.status !== 'customer').map(c => ({ id: c.id, name: c.name, company: c.company, stage: c.stage, value: c.value })),
      stages: { identified: 1, outreach: 1, demo: 1, proposal: 1 },
      total_pipeline_value: CONTACTS.filter(c => c.status !== 'customer').reduce((s, c) => s + (c.value || 0), 0),
      ts: ts(),
    });
  }

  // ── /api/marketing/* ──
  if (p.startsWith('/api/marketing')) {
    const sub = p.replace('/api/marketing', '') || '/';
    const rev = INVOICES.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0);
    if (sub === '/funnel') {
      return json(res, {
        stages: [
          { name: 'Awareness',    visitors: 4200, pct: 100 },
          { name: 'Interest',     visitors: 1890, pct: 45  },
          { name: 'Consideration',visitors: 630,  pct: 15  },
          { name: 'Intent',       visitors: 210,  pct: 5   },
          { name: 'Conversion',   visitors: 63,   pct: 1.5 },
        ],
        conversion_rate_pct: 1.5, cac: +(rev * 0.12 / Math.max(CONTACTS.filter(c => c.status === 'customer').length, 1)).toFixed(2), ltv: +(rev * 3.2 / Math.max(CONTACTS.filter(c => c.status === 'customer').length, 1)).toFixed(2),
        ts: ts(),
      });
    }
    if (sub === '/seo') {
      return json(res, {
        organic_sessions: 1840, keywords_ranking: 47, avg_position: 14.2,
        top_keywords: [
          { keyword: 'AI business automation South Africa', position: 3,  volume: 320 },
          { keyword: 'autonomous operating system',         position: 7,  volume: 210 },
          { keyword: 'AI CRM South Africa',                position: 11, volume: 480 },
          { keyword: 'bridge AI OS',                       position: 1,  volume: 95  },
        ],
        domain_authority: 32, backlinks: 184, ts: ts(),
      });
    }
    if (sub === '/social') {
      return json(res, {
        platforms: [
          { name: 'LinkedIn',  followers: 1240, posts_mtd: 12, engagement_pct: 4.8, leads_generated: 14 },
          { name: 'Twitter/X', followers: 680,  posts_mtd: 28, engagement_pct: 2.1, leads_generated: 5  },
          { name: 'YouTube',   followers: 310,  posts_mtd: 4,  engagement_pct: 6.3, leads_generated: 8  },
        ],
        total_reach: 2230, total_leads: 27, ts: ts(),
      });
    }
    if (sub === '/email') {
      return json(res, {
        subscribers: 2840, active: 2310, unsubscribed: 530,
        sequences: [
          { name: 'Welcome Series',    emails: 5, open_rate_pct: 58.2, click_rate_pct: 18.4 },
          { name: 'Nurture Drip',      emails: 8, open_rate_pct: 42.1, click_rate_pct: 9.8  },
          { name: 'Re-engagement',     emails: 3, open_rate_pct: 22.3, click_rate_pct: 5.1  },
          { name: 'Upsell Enterprise', emails: 4, open_rate_pct: 51.7, click_rate_pct: 21.0 },
        ],
        revenue_attributed: +(rev * 0.35).toFixed(2), ts: ts(),
      });
    }
    if (sub === '/campaign' && req.method === 'POST') {
      const body = await parseBody(req);
      if (!body.name) return json(res, { error: 'campaign name required' }, 400);
      return json(res, {
        id: `camp_${ts()}`, name: body.name, status: 'draft',
        created_at: new Date().toISOString(), agent: 'theta', ts: ts(),
      }, 201);
    }
    return json(res, { error: 'unknown_marketing_endpoint', sub }, 404);
  }

  // ── /api/tickets/* ──
  if (p.startsWith('/api/tickets')) {
    const ticketMatch = p.match(/^\/api\/tickets\/([^\/]+)\/reply$/);
    if (ticketMatch && req.method === 'POST') {
      const body = await parseBody(req);
      if (!body.message) return json(res, { error: 'message required' }, 400);
      return json(res, {
        id: `reply_${ts()}`, ticket_id: ticketMatch[1],
        message: body.message, agent: body.agent || 'alpha',
        sent_at: new Date().toISOString(), ts: ts(),
      }, 201);
    }
    if (p === '/api/tickets' && req.method === 'POST') {
      const body = await parseBody(req);
      if (!body.subject) return json(res, { error: 'subject required' }, 400);
      return json(res, {
        id: `tkt_${ts()}`, subject: body.subject,
        client: body.client || 'Unknown', email: body.email || '',
        priority: body.priority || 'medium', status: 'open',
        created: new Date().toISOString(), agent: null, ts: ts(),
      }, 201);
    }
    // GET /api/tickets
    const stats = { open: TICKETS.filter(t => t.status === 'open').length, in_progress: TICKETS.filter(t => t.status === 'in_progress').length, resolved: TICKETS.filter(t => t.status === 'resolved').length };
    return json(res, { tickets: TICKETS, count: TICKETS.length, stats, ts: ts() });
  }

  // ── /api/invoices/* ──
  if (p.startsWith('/api/invoices')) {
    const invoicePathMatch = p.match(/^\/api\/invoices\/([^\/]+)\/status$/);
    if (invoicePathMatch && (req.method === 'PUT' || req.method === 'POST')) {
      const body = await parseBody(req);
      return json(res, { id: invoicePathMatch[1], status: body.status || 'sent', updated_at: new Date().toISOString(), ts: ts() });
    }
    if (p === '/api/invoices/ai-generate' && req.method === 'POST') {
      const body = await parseBody(req);
      const contact = CONTACTS.find(c => c.id === body.contact_id) || CONTACTS[0];
      return json(res, {
        id: `inv_${ts()}`, client: contact.company, email: contact.email,
        amount: contact.value || 149, currency: 'ZAR',
        description: `Bridge AI OS ${contact.plan || 'Pro'} — ${new Date().toLocaleString('en-ZA', { month: 'long', year: 'numeric' })}`,
        status: 'draft', line_items: [
          { description: `Bridge AI OS ${contact.plan || 'Pro'}`, qty: 1, unit_price: contact.value || 149 },
        ],
        generated_by: 'ai', ts: ts(),
      }, 201);
    }
    if (p === '/api/invoices/smart-create' && req.method === 'POST') {
      const body = await parseBody(req);
      return json(res, {
        id: `inv_${ts()}`, ...body,
        status: 'draft', currency: body.currency || 'ZAR',
        issued: new Date().toISOString().slice(0, 10),
        created_by: 'smart-create', ts: ts(),
      }, 201);
    }
    if (p === '/api/invoices/send' && req.method === 'POST') {
      const body = await parseBody(req);
      if (!body.invoice_id) return json(res, { error: 'invoice_id required' }, 400);
      return json(res, { invoice_id: body.invoice_id, status: 'sent', sent_at: new Date().toISOString(), ts: ts() });
    }
    if (p === '/api/invoices/follow-up' && req.method === 'POST') {
      const body = await parseBody(req);
      return json(res, { invoice_id: body.invoice_id, follow_up_sent: true, method: 'email', ts: ts() });
    }
    // GET /api/invoices
    const paid   = INVOICES.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0);
    const outstanding = INVOICES.filter(i => i.status === 'sent').reduce((s, i) => s + i.amount, 0);
    return json(res, { invoices: INVOICES, count: INVOICES.length, paid_total: paid, outstanding_total: outstanding, ts: ts() });
  }

  // ── /api/subscribe ──
  if (p === '/api/subscribe' && req.method === 'POST') {
    const body = await parseBody(req);
    // Support both email-only newsletter signups (no plan) and plan-based subscriptions
    if (!body.plan) {
      // Newsletter / update subscription (email-only)
      return json(res, { ok: true, type: 'newsletter', email: body.email || 'anonymous', ts: ts() }, 201);
    }
    const plans = { starter: 49, pro: 149, enterprise: 499 };
    const price = plans[body.plan];
    if (!price) return json(res, { error: 'invalid plan — use starter|pro|enterprise' }, 400);
    const subId = `sub_${ts()}`;
    treasuryBalance += price;
    return json(res, {
      ok: true,
      subscription_id: subId, plan: body.plan, price, currency: 'ZAR',
      status: 'active', started_at: new Date().toISOString(),
      treasury_balance: +treasuryBalance.toFixed(2), ts: ts(),
    }, 201);
  }

  // ── 404 ──
  return json(res, { error: 'not_found', path: p, available: [
    '/health', '/api/health', '/api/brain', '/api/topology', '/api/avatar/{mode}',
    '/api/registry/{ns}', '/api/marketplace/{section}', '/api/status', '/api/agents',
    '/api/contracts', '/api/treasury', '/api/treasury/status', '/api/treasury/ledger',
    '/api/treasury/summary', '/api/treasury/payments', '/api/analytics/summary',
    '/api/swarm/agents', '/api/swarm/health', '/api/swarm/matrix', '/api/economics',
    '/api/credits', '/api/ehsa/dashboard', '/api/events/recent', '/api/agents/dispatch',
    '/api/agents/queue', '/api/tools', '/api/crm/contacts', '/api/crm/stats',
    '/api/crm/leads', '/api/crm/campaigns', '/api/outreach/stats', '/api/leadgen',
    '/api/leadgen/auto-prospect', '/api/leadgen/auto-nurture', '/api/leadgen/auto-close',
    '/api/marketing/funnel', '/api/marketing/seo', '/api/marketing/social',
    '/api/marketing/email', '/api/marketing/campaign', '/api/tickets', '/api/invoices',
    '/api/subscribe', '/api/users', '/orchestrator/status', '/billing',
    '/auth/register', '/auth/login', '/auth/verify', '/referral/claim',
  ] }, 404);
};
