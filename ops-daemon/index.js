// =============================================================================
// BRIDGE AI OS — Ops Daemon
// Autonomous health monitoring + self-healing restart hooks
// Watches all registered services via the registry, restarts on failure.
// =============================================================================
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const { exec } = require('child_process');

const PORT = parseInt(process.env.OPS_DAEMON_PORT, 10) || 6080;
const REGISTRY_URL = process.env.REGISTRY_URL || 'http://localhost:9000';
const HEALTH_INTERVAL = parseInt(process.env.HEALTH_INTERVAL, 10) || 15000;
const MAX_RESTART_ATTEMPTS = 3;

const app = express();
app.use(express.json());

// ── State ───────────────────────────────────────────────────────────────────
const serviceHealth = {};  // { name: { status, lastCheck, failures, restarts } }
let stats = {
  checks: 0,
  failures_detected: 0,
  restarts_triggered: 0,
  started_at: new Date().toISOString(),
  last_check_at: null,
};

// ── Health check loop ───────────────────────────────────────────────────────
async function checkServices() {
  let services = {};

  try {
    const res = await fetch(`${REGISTRY_URL}/services`);
    services = await res.json();
  } catch {
    // Registry itself is down — try known defaults
    services = {
      gateway:       { url: 'http://localhost:3000' },
      'svg-engine':  { url: 'http://localhost:7070' },
      billing:       { url: 'http://localhost:6060' },
      subscriptions: { url: 'http://localhost:6061' },
      'revenue-engine': { url: 'http://localhost:6070' },
    };
  }

  for (const [name, svc] of Object.entries(services)) {
    if (!serviceHealth[name]) {
      serviceHealth[name] = { status: 'unknown', lastCheck: null, failures: 0, restarts: 0, url: svc.url };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(`${svc.url}/health`, { signal: controller.signal });
      clearTimeout(timeout);

      if (res.ok) {
        serviceHealth[name].status = 'healthy';
        serviceHealth[name].failures = 0;
      } else {
        serviceHealth[name].status = 'degraded';
        serviceHealth[name].failures++;
        stats.failures_detected++;
      }
    } catch {
      serviceHealth[name].status = 'down';
      serviceHealth[name].failures++;
      stats.failures_detected++;

      // Self-healing: attempt restart after 3 consecutive failures
      if (serviceHealth[name].failures >= 3 && serviceHealth[name].restarts < MAX_RESTART_ATTEMPTS) {
        restartService(name);
      }
    }

    serviceHealth[name].lastCheck = new Date().toISOString();
    serviceHealth[name].url = svc.url;
  }

  stats.checks++;
  stats.last_check_at = new Date().toISOString();
}

// ── Self-healing restart ────────────────────────────────────────────────────
function restartService(name) {
  console.warn(`[OPS] Service "${name}" failed ${serviceHealth[name].failures}x — attempting restart`);

  // Try Docker restart first, then PM2
  exec(`docker restart ${name} 2>/dev/null || pm2 restart ${name} --update-env 2>/dev/null`, (err) => {
    if (!err) {
      console.log(`[OPS] Restarted ${name} successfully`);
      serviceHealth[name].restarts++;
      serviceHealth[name].failures = 0;
      stats.restarts_triggered++;
    } else {
      console.warn(`[OPS] Failed to restart ${name}: ${err.message}`);
    }
  });
}

// ── API endpoints ───────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'ops-daemon', monitoring: Object.keys(serviceHealth).length });
});

app.get('/status', (_req, res) => {
  res.json({ services: serviceHealth, stats });
});

app.get('/metrics', (_req, res) => {
  const lines = [
    '# HELP ops_checks_total Total health checks performed',
    '# TYPE ops_checks_total counter',
    `ops_checks_total ${stats.checks}`,
    '# HELP ops_failures_total Total failures detected',
    '# TYPE ops_failures_total counter',
    `ops_failures_total ${stats.failures_detected}`,
    '# HELP ops_restarts_total Total service restarts triggered',
    '# TYPE ops_restarts_total counter',
    `ops_restarts_total ${stats.restarts_triggered}`,
  ];

  // Per-service gauges
  for (const [name, health] of Object.entries(serviceHealth)) {
    const val = health.status === 'healthy' ? 1 : health.status === 'degraded' ? 0.5 : 0;
    lines.push(`# HELP ops_service_health Service health (1=healthy, 0.5=degraded, 0=down)`);
    lines.push(`# TYPE ops_service_health gauge`);
    lines.push(`ops_service_health{service="${name}"} ${val}`);
  }

  res.type('text/plain').send(lines.join('\n') + '\n');
});

// Manual restart trigger
app.post('/restart/:service', (req, res) => {
  const name = req.params.service;
  if (!serviceHealth[name]) {
    return res.status(404).json({ error: `Service "${name}" not monitored` });
  }
  restartService(name);
  res.json({ triggered: true, service: name });
});

// ── Start ───────────────────────────────────────────────────────────────────
let timer = null;

app.listen(PORT, () => {
  console.log(`[OPS] Daemon running on http://localhost:${PORT}`);
  console.log(`[OPS] Registry: ${REGISTRY_URL}`);
  console.log(`[OPS] Health check interval: ${HEALTH_INTERVAL / 1000}s`);
  console.log(`[OPS] Max restart attempts: ${MAX_RESTART_ATTEMPTS}`);

  // Initial check after 3s warmup
  setTimeout(checkServices, 3000);
  timer = setInterval(checkServices, HEALTH_INTERVAL);
});

process.on('SIGTERM', () => {
  if (timer) clearInterval(timer);
  process.exit(0);
});
