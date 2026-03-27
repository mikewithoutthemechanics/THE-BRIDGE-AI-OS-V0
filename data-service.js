const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname);
const SHARED_DIR = path.join(ROOT, 'shared');

// ── TOPOLOGY ──────────────────────────────────────────────────────────────
// Returns real network interfaces, running services (probe known ports), edges
exports.getTopology = async function() {
  const ifaces = os.networkInterfaces();
  const nodes = [
    { id: 'gateway', label: 'Gateway', port: 8080, status: 'up', type: 'gateway' },
  ];
  const edges = [];

  // Add real network interfaces as nodes
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (name === 'lo' || name === 'Loopback Pseudo-Interface 1') continue;
    const ipv4 = addrs.find(a => a.family === 'IPv4');
    if (ipv4) {
      nodes.push({ id: `iface_${name}`, label: name, ip: ipv4.address, mac: ipv4.mac, type: 'interface' });
      edges.push({ source: 'gateway', target: `iface_${name}` });
    }
  }

  // Probe known services
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
    let status = 'down';
    try {
      const r = await fetch(`http://localhost:${svc.port}/health`, { signal: AbortSignal.timeout(1000) });
      status = r.ok ? 'up' : 'degraded';
    } catch (_) {
      // Try just a TCP connect concept - just mark down
    }
    nodes.push({ ...svc, status, type: 'service' });
    edges.push({ source: 'gateway', target: svc.id });
  }

  return { nodes, edges, interface_count: Object.keys(ifaces).length, ts: Date.now() };
};

// ── REGISTRY ──────────────────────────────────────────────────────────────

exports.getRegistryKernel = function() {
  const cpus = os.cpus();
  return {
    os_type: os.type(),
    os_release: os.release(),
    os_platform: os.platform(),
    os_arch: os.arch(),
    hostname: os.hostname(),
    uptime_seconds: os.uptime(),
    loadavg: os.loadavg(),
    cpu_model: cpus[0]?.model || 'unknown',
    cpu_cores: cpus.length,
    cpu_speed_mhz: cpus[0]?.speed || 0,
    total_memory_bytes: os.totalmem(),
    free_memory_bytes: os.freemem(),
    memory_usage_pct: +((1 - os.freemem() / os.totalmem()) * 100).toFixed(1),
    status: 'healthy',
    ts: Date.now(),
  };
};

exports.getRegistryNetwork = function() {
  const ifaces = os.networkInterfaces();
  const interfaces = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    for (const addr of addrs) {
      interfaces.push({
        name,
        address: addr.address,
        netmask: addr.netmask,
        family: addr.family,
        mac: addr.mac,
        internal: addr.internal,
      });
    }
  }

  // Try to get DNS
  let dns = [];
  try {
    if (os.platform() === 'win32') {
      const out = execSync('ipconfig /all', { encoding: 'utf8', timeout: 3000 });
      const dnsMatches = out.match(/DNS Servers[\s.:]+([0-9.]+)/gi) || [];
      dns = dnsMatches.map(m => m.replace(/DNS Servers[\s.:]+/i, '').trim()).filter(Boolean);
      if (dns.length === 0) {
        // fallback parse
        const lines = out.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (/DNS Servers/i.test(lines[i])) {
            const match = lines[i].match(/:\s*([0-9.]+)/);
            if (match) dns.push(match[1]);
            // next lines might have more DNS servers
            for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
              const m2 = lines[j].match(/^\s+([0-9.]+)/);
              if (m2) dns.push(m2[1]); else break;
            }
            break;
          }
        }
      }
    } else {
      const resolv = fs.readFileSync('/etc/resolv.conf', 'utf8');
      dns = (resolv.match(/^nameserver\s+(.+)$/gm) || []).map(l => l.split(/\s+/)[1]);
    }
  } catch (_) { dns = ['unavailable']; }

  return { interfaces, dns, interface_count: interfaces.length, status: 'healthy', ts: Date.now() };
};

exports.getRegistrySecurity = function() {
  // Check TLS — look for Let's Encrypt certs on Linux
  let tlsEnabled = false;
  let certExpires = '—';
  try {
    if (os.platform() !== 'win32') {
      const certPath = '/etc/letsencrypt/live';
      const domains = fs.readdirSync(certPath).filter(f => !f.startsWith('.'));
      if (domains.length > 0) { tlsEnabled = true; }
      try {
        const out = execSync(`openssl x509 -enddate -noout -in /etc/letsencrypt/live/${domains[0]}/cert.pem 2>/dev/null`, { encoding: 'utf8', timeout: 3000 });
        certExpires = out.replace('notAfter=', '').trim();
      } catch (_) {}
    }
  } catch (_) {}
  // Fallback: check local certs dir
  if (!tlsEnabled) {
    try {
      const certs = fs.readdirSync(path.join(ROOT, 'certs')).filter(f => /\.(pem|crt)$/i.test(f));
      if (certs.length > 0) tlsEnabled = true;
    } catch (_) {}
  }

  // Firewall
  let firewallStatus = 'unknown';
  try {
    if (os.platform() === 'win32') {
      const out = execSync('netsh advfirewall show allprofiles state', { encoding: 'utf8', timeout: 3000 });
      firewallStatus = /ON/i.test(out) ? 'active' : 'inactive';
    } else {
      const out = execSync('ufw status 2>/dev/null || iptables -L -n 2>/dev/null | head -5', { encoding: 'utf8', timeout: 3000 });
      firewallStatus = /active|Chain/i.test(out) ? 'active' : 'inactive';
    }
  } catch (_) {}

  return {
    tls_enabled: tlsEnabled,
    tls_provider: tlsEnabled ? 'Let\'s Encrypt' : 'none',
    tls_rating: tlsEnabled ? 'A+' : 'none',
    cert_expires: certExpires,
    firewall: firewallStatus,
    keyforge: 'active',
    keyforge_epoch: Math.floor(Date.now() / 1000 / 600),
    auth_methods: ['JWT', 'KeyForge', 'Bearer'],
    mfa: false,
    last_scan: new Date().toISOString(),
    status: tlsEnabled ? 'healthy' : 'warning',
    ts: Date.now(),
  };
};

exports.getRegistryFederation = async function() {
  const targets = [
    { id: 'gateway', port: 8080, host: 'localhost' },
    { id: 'super_brain', port: 8000, host: 'localhost' },
    { id: 'god_mode_system', port: 3000, host: 'localhost' },
    { id: 'terminal_proxy', port: 5002, host: 'localhost' },
    { id: 'auth_service', port: 5001, host: 'localhost' },
  ];
  const results = await Promise.all(targets.map(async t => {
    try {
      const r = await fetch(`http://${t.host}:${t.port}/health`, { signal: AbortSignal.timeout(2000) });
      return { ...t, reachable: r.ok, status_code: r.status };
    } catch (e) {
      return { ...t, reachable: false, error: e.message };
    }
  }));
  return { federation_nodes: results, reachable_count: results.filter(r => r.reachable).length, total: results.length, ts: Date.now() };
};

exports.getRegistryJobs = function() {
  try {
    const files = fs.readdirSync(SHARED_DIR).filter(f => f.endsWith('.json'));
    const jobs = files.map((file, i) => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(SHARED_DIR, file), 'utf8'));
        return {
          id: `job_${i + 1}`,
          file,
          title: data.title || data.name || file.replace('.json', ''),
          status: data.status || 'queued',
          priority: data.priority || 'normal',
          created: data.created || data.generated || null,
          size_bytes: fs.statSync(path.join(SHARED_DIR, file)).size,
        };
      } catch (_) {
        return { id: `job_${i + 1}`, file, status: 'error', error: 'parse_failed' };
      }
    });
    return { jobs, count: jobs.length, ts: Date.now() };
  } catch (e) {
    return { jobs: [], count: 0, error: e.message, ts: Date.now() };
  }
};

exports.getRegistryMarket = async function() {
  // Pull live data from brain
  let brainData = {};
  try {
    const r = await fetch('http://localhost:8000/api/dex/pairs', { signal: AbortSignal.timeout(2000) });
    brainData = await r.json();
  } catch (_) {}

  try {
    const files = fs.readdirSync(SHARED_DIR).filter(f => f.endsWith('.json'));
    return {
      contracts: files.length,
      dex_pairs: (brainData.pairs || []).length,
      pairs: brainData.pairs || [],
      total_agents: 8,
      total_tasks: 0,
      ts: Date.now(),
    };
  } catch (e) {
    return { error: e.message, ts: Date.now() };
  }
};

exports.getRegistryBridgeOS = async function() {
  try {
    const r = await fetch('http://localhost:3000/api/full', { signal: AbortSignal.timeout(2000) });
    const data = await r.json();
    return { source: 'system.js', live: true, data, ts: Date.now() };
  } catch (e) {
    // Fallback: return basic OS info
    return {
      source: 'fallback',
      live: false,
      data: {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        uptime: os.uptime(),
        memory: { total: os.totalmem(), free: os.freemem() },
        cpus: os.cpus().length,
      },
      ts: Date.now(),
    };
  }
};

exports.getRegistryNodemap = async function() {
  const topo = await exports.getTopology();
  // Add orchestrator endpoints
  const orchestrators = [
    { id: 'orch_l1', host: 'localhost', port: 9000, layer: 'L1' },
    { id: 'orch_l2', host: '192.168.110.203', port: 9001, layer: 'L2' },
    { id: 'orch_l3', host: 'localhost', port: 9002, layer: 'L3' },
  ];
  return { nodes: topo.nodes, orchestrators, edges: topo.edges, ts: Date.now() };
};

// ── AVATAR ────────────────────────────────────────────────────────────────
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

exports.getAvatarScene = function(mode) {
  const scene = AVATAR_MODES[mode] || AVATAR_MODES['wireframe'];
  return {
    mode: AVATAR_MODES[mode] ? mode : 'wireframe',
    scene_type: 'babylon-scene',
    ...scene,
    animations: ['idle', 'breathe', 'gesture', 'think'],
    interaction: { clickable: true, rotatable: true, zoomable: true },
    ts: Date.now(),
  };
};

exports.getAvatarModes = function() {
  return { modes: Object.keys(AVATAR_MODES), count: Object.keys(AVATAR_MODES).length, ts: Date.now() };
};

// ── MARKETPLACE ───────────────────────────────────────────────────────────

exports.getMarketplaceTasks = function() {
  try {
    const files = fs.readdirSync(SHARED_DIR).filter(f => f.endsWith('.json'));
    const tasks = [];
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(SHARED_DIR, file), 'utf8'));
        const title = data.title || data.name || file.replace('.json', '').replace(/-/g, ' ');
        tasks.push({
          id: `task_${file.replace('.json', '')}`,
          title,
          source_file: file,
          status: data.status || 'pending',
          reward: data.reward || Math.floor(file.length * 17.3),  // deterministic from filename
          created: data.created || data.generated || fs.statSync(path.join(SHARED_DIR, file)).mtime.toISOString(),
        });
      } catch (_) {}
    }
    return {
      open: tasks.filter(t => t.status === 'pending' || t.status === 'open').length,
      in_progress: tasks.filter(t => t.status === 'in_progress').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      listings: tasks,
      ts: Date.now(),
    };
  } catch (e) {
    return { error: e.message, listings: [], ts: Date.now() };
  }
};

exports.getMarketplaceDex = function() {
  try {
    const portData = JSON.parse(fs.readFileSync(path.join(ROOT, 'port-assignments.json'), 'utf8'));
    const assignments = portData.assignments || [];
    // Derive "trading pairs" from service relationships
    const pairs = [];
    for (let i = 0; i < assignments.length; i++) {
      for (let j = i + 1; j < assignments.length; j++) {
        if (assignments[i].assigned_port && assignments[j].assigned_port) {
          pairs.push({
            pair: `${assignments[i].service.replace('.js', '').toUpperCase()}/${assignments[j].service.replace('.js', '').toUpperCase()}`,
            ports: [assignments[i].assigned_port, assignments[j].assigned_port],
            active: !assignments[i].conflict && !assignments[j].conflict,
          });
        }
      }
    }
    return {
      pairs: pairs.slice(0, 20), // cap at 20
      total_services: assignments.length,
      active_pairs: pairs.filter(p => p.active).length,
      ts: Date.now(),
    };
  } catch (e) {
    return { error: e.message, pairs: [], ts: Date.now() };
  }
};

exports.getMarketplaceWallet = function() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const cpus = os.cpus();

  // Get disk info
  let diskTotal = 0, diskFree = 0;
  try {
    if (os.platform() === 'win32') {
      const out = execSync('wmic logicaldisk get size,freespace,caption /format:csv', { encoding: 'utf8', timeout: 3000 });
      const lines = out.trim().split('\n').slice(1).filter(l => l.trim());
      for (const line of lines) {
        const parts = line.split(',');
        if (parts.length >= 3) {
          diskFree += parseInt(parts[1]) || 0;
          diskTotal += parseInt(parts[2]) || 0;
        }
      }
    }
  } catch (_) {}

  return {
    balances: [
      { token: 'CPU', amount: cpus.length, unit: 'cores', utilization_pct: +(os.loadavg()[0] / cpus.length * 100).toFixed(1) },
      { token: 'RAM', amount: +(totalMem / 1073741824).toFixed(2), unit: 'GB', free: +(freeMem / 1073741824).toFixed(2), usage_pct: +((1 - freeMem / totalMem) * 100).toFixed(1) },
      { token: 'DISK', amount: +(diskTotal / 1073741824).toFixed(2), unit: 'GB', free: +(diskFree / 1073741824).toFixed(2) },
      { token: 'UPTIME', amount: os.uptime(), unit: 'seconds' },
    ],
    system_value_score: Math.floor(cpus.length * 100 + (totalMem / 1073741824) * 50 + (diskTotal / 1073741824) * 0.1),
    ts: Date.now(),
  };
};

exports.getMarketplaceSkills = function() {
  try {
    const nmDir = path.join(ROOT, 'node_modules');
    const dirs = fs.readdirSync(nmDir).filter(d => !d.startsWith('.') && !d.startsWith('@'));
    // Also get scoped packages
    const scopedDirs = fs.readdirSync(nmDir).filter(d => d.startsWith('@'));
    const scoped = [];
    for (const scope of scopedDirs) {
      try {
        const inner = fs.readdirSync(path.join(nmDir, scope));
        scoped.push(...inner.map(i => `${scope}/${i}`));
      } catch (_) {}
    }
    const allPackages = [...dirs, ...scoped].sort();
    return {
      installed: allPackages,
      count: allPackages.length,
      categories: {
        runtime: allPackages.filter(p => ['express', 'cors', 'dotenv', 'better-sqlite3'].includes(p)),
        security: allPackages.filter(p => ['bcryptjs', 'jsonwebtoken', 'helmet'].includes(p)),
        testing: allPackages.filter(p => ['jest', 'supertest', 'mocha', 'chai'].includes(p)),
        utilities: allPackages.filter(p => !['express', 'cors', 'dotenv', 'better-sqlite3', 'bcryptjs', 'jsonwebtoken', 'helmet', 'jest', 'supertest', 'mocha', 'chai'].includes(p)),
      },
      ts: Date.now(),
    };
  } catch (e) {
    return { installed: [], count: 0, error: e.message, ts: Date.now() };
  }
};

exports.getMarketplacePortfolio = async function() {
  const services = [
    { id: 'gateway', port: 8080 },
    { id: 'system', port: 3000 },
    { id: 'ainode', port: 3001 },
    { id: 'server', port: 5000 },
    { id: 'orchestrator_l1', port: 9000 },
    { id: 'orchestrator_l2', port: 9001 },
    { id: 'payments', port: 4000 },
  ];

  const healthChecks = await Promise.all(services.map(async svc => {
    if (svc.id === 'gateway') return { ...svc, status: 'up', value: 1000 };
    try {
      const r = await fetch(`http://localhost:${svc.port}/health`, { signal: AbortSignal.timeout(1500) });
      return { ...svc, status: r.ok ? 'up' : 'degraded', value: r.ok ? 1000 : 500 };
    } catch (_) {
      return { ...svc, status: 'down', value: 0 };
    }
  }));

  const totalValue = healthChecks.reduce((sum, s) => sum + s.value, 0);
  const healthPct = +((healthChecks.filter(s => s.status === 'up').length / services.length) * 100).toFixed(1);

  return {
    total_value: totalValue,
    health_pct: healthPct,
    assets: healthChecks,
    ts: Date.now(),
  };
};

exports.getMarketplaceStats = function() {
  let totalTasks = 0, agentCount = 0, contractCount = 0;
  try {
    const files = fs.readdirSync(SHARED_DIR).filter(f => f.endsWith('.json'));
    contractCount = files.length;
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(SHARED_DIR, file), 'utf8'));
        if (data.tasks) totalTasks += Array.isArray(data.tasks) ? data.tasks.length : 1;
        if (data.agents) agentCount += Array.isArray(data.agents) ? data.agents.length : 1;
      } catch (_) {}
    }
  } catch (_) {}

  // Count orchestrator agent files
  try {
    const agentDir = path.join(ROOT, 'agents');
    const agentFiles = fs.readdirSync(agentDir).filter(f => f.endsWith('.js'));
    agentCount = Math.max(agentCount, agentFiles.length);
  } catch (_) {}

  return {
    total_tasks: totalTasks || contractCount,
    total_agents: agentCount,
    contracts: contractCount,
    uptime_seconds: os.uptime(),
    uptime_hours: +(os.uptime() / 3600).toFixed(2),
    memory_usage_pct: +((1 - os.freemem() / os.totalmem()) * 100).toFixed(1),
    cpu_cores: os.cpus().length,
    platform: os.platform(),
    ts: Date.now(),
  };
};
