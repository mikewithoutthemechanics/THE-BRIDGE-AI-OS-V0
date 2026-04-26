'use strict';
/**
 * PORT MAPPER SERVICE — AUTO-POLLING
 * Continuously monitors all service ports, detects conflicts and newly occupied
 * ports, remaps them to free alternatives, and keeps port-assignments.json live.
 *
 * Usage (standalone):
 *   node port-mapper.js                  → poll every 10 s (default)
 *   node port-mapper.js --interval 30    → poll every 30 s
 *   node port-mapper.js --dry-run        → single scan, no writes, no server, exit
 *
 * Usage (as module):
 *   const { getPort, resolveAll } = require('./port-mapper');
 *   await resolveAll();
 *   const port = getPort('Xcontainerx/server.js');  // → 3001
 */

const net  = require('net');
const fs   = require('fs');
const path = require('path');
const http = require('http');

// ─── Service Registry ────────────────────────────────────────────────────────
// Priority = order in this array (first entry wins on conflicts).
const SERVICE_REGISTRY = [
  { name: 'server.js',                        preferred: 5000, file: 'server.js' },
  { name: 'gateway.js',                        preferred: 8080, file: 'gateway.js' },
  { name: 'system.js',                         preferred: 3000, file: 'system.js' },
  { name: 'Xpayments/server.js',               preferred: 4000, file: 'Xpayments/server.js' },
  { name: 'Xcontainerx/server.js',             preferred: 3000, file: 'Xcontainerx/server.js' },
  { name: 'laptop1-streaming-orchestrator.js', preferred: 9000, file: 'agents/laptop1-streaming-orchestrator.js' },
  { name: 'laptop2-streaming-orchestrator.js', preferred: 9001, file: 'agents/laptop2-streaming-orchestrator.js' },
  { name: 'laptop3-minimax-orchestrator.js',   preferred: 9002, file: 'agents/laptop3-minimax-orchestrator.js' },
];

const SCAN_START        = 3001;
const SCAN_END          = 9999;
const RESERVED          = new Set([3306, 5432, 5672, 6379, 27017, 9092]);
const ASSIGNMENTS_FILE  = path.join(__dirname, 'port-assignments.json');
const PORT_MAPPER_PORT  = parseInt(process.env.PORT_MAPPER_PORT, 10) || 3999;
const DEFAULT_INTERVAL  = 10_000; // ms

// ─── State ───────────────────────────────────────────────────────────────────
let _resolved    = null;   // Map<name, assignedPort> — latest resolved snapshot
let _pollCount   = 0;
let _lastChanged = null;   // ISO timestamp of last assignment change
let _changes     = [];     // ring buffer of recent change events (max 50)

// ─── Port Probing ─────────────────────────────────────────────────────────────

function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '127.0.0.1');
  });
}

async function findFreePort(start, taken) {
  for (let p = start; p <= SCAN_END; p++) {
    if (taken.has(p) || RESERVED.has(p)) continue;
    if (await isPortFree(p)) return p;
  }
  throw new Error(`No free port found between ${start} and ${SCAN_END}`);
}

// ─── Core Resolution ─────────────────────────────────────────────────────────

/**
 * Runs a fresh resolution pass — always re-probes ports, never uses cache.
 * Returns { assigned: Map<name,port>, conflicts: Array }
 */
async function runResolution() {
  const assigned   = new Map();
  const takenPorts = new Set();
  const conflicts  = [];

  for (const svc of SERVICE_REGISTRY) {
    const pref = svc.preferred;
    if (!takenPorts.has(pref) && !RESERVED.has(pref)) {
      assigned.set(svc.name, pref);
      takenPorts.add(pref);
    } else {
      const alt = await findFreePort(SCAN_START, takenPorts);
      conflicts.push({ service: svc.name, preferred: pref, assigned: alt });
      assigned.set(svc.name, alt);
      takenPorts.add(alt);
    }
  }

  return { assigned, conflicts };
}

/**
 * Compares two Maps and returns an array of { service, from, to } for any diff.
 */
function diff(prev, next) {
  const changed = [];
  for (const [name, port] of next) {
    const old = prev ? prev.get(name) : undefined;
    if (old !== port) changed.push({ service: name, from: old ?? null, to: port });
  }
  return changed;
}

// ─── Polling Loop ─────────────────────────────────────────────────────────────

function ts() { return new Date().toISOString(); }

async function poll(opts = {}) {
  _pollCount++;
  const label = `[port-mapper] poll #${_pollCount} ${ts()}`;

  let result;
  try {
    result = await runResolution();
  } catch (err) {
    console.error(`[port-mapper] ✗  Resolution error: ${err.message}`);
    return;
  }

  const { assigned, conflicts } = result;
  const changed = diff(_resolved, assigned);

  if (changed.length > 0) {
    _lastChanged = ts();
    console.log(`\n${label}  ⚠  ${changed.length} assignment(s) changed:`);
    for (const c of changed) {
      const arrow = c.from === null ? '(new)' : `${c.from} → ${c.to}`;
      console.log(`  ${c.service.padEnd(42)} ${arrow}`);
      _changes.unshift({ ts: _lastChanged, ...c });
      if (_changes.length > 50) _changes.pop();
    }
  } else {
    process.stdout.write(`\r${label}  ✓  all ports stable`);
  }

  if (conflicts.length > 0 && (!_resolved || changed.length > 0)) {
    console.log(`\n[port-mapper]    Conflicts remapped:`);
    for (const c of conflicts) {
      console.log(`  ${c.service.padEnd(42)} preferred:${c.preferred}  →  assigned:${c.assigned}`);
    }
  }

  _resolved = assigned;

  if (!opts.dryRun) {
    saveAssignments();
  }
}

function startPolling(intervalMs, opts = {}) {
  console.log(`[port-mapper] ◎  Auto-polling started  (interval: ${intervalMs / 1000}s)`);
  console.log(`[port-mapper]    Press Ctrl+C to stop.\n`);

  // First poll immediately, then on interval
  poll(opts).then(() => {
    setInterval(() => poll(opts), intervalMs);
  });
}

// ─── Persistence ─────────────────────────────────────────────────────────────

function saveAssignments() {
  if (!_resolved) return;

  const out = {
    generated: ts(),
    note: 'Auto-generated by port-mapper.js — do not edit by hand',
    assignments: SERVICE_REGISTRY.map(svc => ({
      service:        svc.name,
      file:           svc.file,
      preferred_port: svc.preferred,
      assigned_port:  _resolved.get(svc.name),
      conflict:       _resolved.get(svc.name) !== svc.preferred,
    }))
  };

  fs.writeFileSync(ASSIGNMENTS_FILE, JSON.stringify(out, null, 2) + '\n');
}

function loadAssignments(filePath = ASSIGNMENTS_FILE) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const map = new Map();
  for (const entry of raw.assignments) map.set(entry.service, entry.assigned_port);
  return map;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** One-shot resolve (cached after first call). Use startPolling() for live mode. */
async function resolveAll() {
  if (_resolved) return _resolved;
  const { assigned, conflicts } = await runResolution();
  _resolved = assigned;
  if (conflicts.length > 0) {
    for (const c of conflicts) {
      console.log(`[port-mapper] ⚠  ${c.service}: preferred:${c.preferred} → assigned:${c.assigned}`);
    }
  }
  return _resolved;
}

function getPort(serviceName) {
  if (!_resolved) throw new Error('resolveAll() has not been called yet');
  const port = _resolved.get(serviceName);
  if (port === undefined) throw new Error(`Unknown service: "${serviceName}"`);
  return port;
}

// ─── HTTP Service ─────────────────────────────────────────────────────────────

function startHttpService() {
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');

    // GET /ports
    if (req.method === 'GET' && req.url === '/ports') {
      const body = SERVICE_REGISTRY.map(svc => ({
        service:        svc.name,
        preferred_port: svc.preferred,
        assigned_port:  _resolved ? _resolved.get(svc.name) : null,
        conflict:       _resolved ? _resolved.get(svc.name) !== svc.preferred : null,
      }));
      res.writeHead(200);
      res.end(JSON.stringify(body, null, 2));
      return;
    }

    // GET /ports/:service
    const matchSvc = req.url.match(/^\/ports\/(.+)$/);
    if (req.method === 'GET' && matchSvc) {
      const name = decodeURIComponent(matchSvc[1]);
      const port = _resolved ? _resolved.get(name) : undefined;
      if (port === undefined) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: `Service not found: ${name}` }));
      } else {
        res.writeHead(200);
        res.end(JSON.stringify({ service: name, assigned_port: port }));
      }
      return;
    }

    // GET /status
    if (req.method === 'GET' && req.url === '/status') {
      res.writeHead(200);
      res.end(JSON.stringify({
        status:       'ok',
        poll_count:   _pollCount,
        last_changed: _lastChanged,
        recent_changes: _changes.slice(0, 10),
      }));
      return;
    }

    // GET /health
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'ok', resolved: !!_resolved }));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({
      error: 'Not found',
      endpoints: ['/ports', '/ports/:service', '/status', '/health'],
    }));
  });

  server.listen(PORT_MAPPER_PORT, () => {
    console.log(`[port-mapper] ✓  HTTP service  →  http://localhost:${PORT_MAPPER_PORT}`);
    console.log(`[port-mapper]    GET /ports              full assignment table`);
    console.log(`[port-mapper]    GET /ports/:service     single service lookup`);
    console.log(`[port-mapper]    GET /status             poll stats + recent changes`);
  });

  return server;
}

// ─── Exports ─────────────────────────────────────────────────────────────────
module.exports = {
  resolveAll, getPort, saveAssignments, loadAssignments,
  isPortFree, startPolling, SERVICE_REGISTRY,
};

// ─── Standalone entry ─────────────────────────────────────────────────────────
if (require.main === module) {
  const args       = process.argv.slice(2);
  const dryRun     = args.includes('--dry-run');
  const intervalMs = (() => {
    const idx = args.indexOf('--interval');
    return idx !== -1 ? parseInt(args[idx + 1], 10) * 1000 : DEFAULT_INTERVAL;
  })();

  if (dryRun) {
    // Single scan, print, exit
    runResolution().then(({ assigned, conflicts }) => {
      console.log('\n[port-mapper] Resolved port assignments (dry-run):');
      console.log('─'.repeat(60));
      for (const svc of SERVICE_REGISTRY) {
        const p    = assigned.get(svc.name);
        const flag = p !== svc.preferred ? '  ← REMAPPED' : '';
        console.log(`  ${svc.name.padEnd(42)} ${p}${flag}`);
      }
      console.log('─'.repeat(60));
      process.exit(0);
    }).catch(err => { console.error(err.message); process.exit(1); });

  } else {
    // Start HTTP service first, then begin polling
    startHttpService();
    startPolling(intervalMs);

    process.on('SIGINT', () => {
      process.stdout.write('\n');
      console.log('[port-mapper] Stopped.');
      process.exit(0);
    });
  }
}
