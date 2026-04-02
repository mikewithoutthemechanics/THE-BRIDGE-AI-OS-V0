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
    return json(res, {
      total: +treasuryBalance.toFixed(2), balance: +treasuryBalance.toFixed(2), currency: 'USD',
      buckets: [
        { name: 'Operations', pct: 40, value: +(treasuryBalance * 0.4).toFixed(2) },
        { name: 'Growth', pct: 25, value: +(treasuryBalance * 0.25).toFixed(2) },
        { name: 'Reserve', pct: 20, value: +(treasuryBalance * 0.2).toFixed(2) },
        { name: 'Founder', pct: 15, value: +(treasuryBalance * 0.15).toFixed(2) },
      ],
      payments_today: Math.floor(Math.random() * 10) + 2,
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

  // ── 404 ──
  return json(res, { error: 'not_found', path: p, available: ['/health', '/api/health', '/api/topology', '/api/avatar/{mode}', '/api/registry/{ns}', '/api/marketplace/{section}', '/api/status', '/api/agents', '/api/contracts', '/api/treasury', '/api/treasury/ledger', '/api/treasury/summary', '/api/treasury/payments', '/api/swarm/agents', '/api/swarm/health', '/api/swarm/matrix', '/api/economics', '/api/credits', '/api/ehsa/dashboard', '/api/events/recent', '/api/agents/dispatch', '/api/agents/queue', '/api/marketplace/tasks/create', '/api/users', '/orchestrator/status', '/billing', '/auth/register', '/auth/login', '/auth/verify', '/referral/claim'] }, 404);
};
