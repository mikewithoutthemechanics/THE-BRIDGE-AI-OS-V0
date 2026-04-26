<<<<<<< HEAD
// PM2 ecosystem: two processes with distinct trust boundaries.
//   orchestra-core : public-facing HTTP (port 7777), full env, proxied by nginx.
//   config-advisor : loopback-only (127.0.0.1:4721), narrow env, AI-call worker.
//
// config-advisor ONLY gets ANTHROPIC_API_KEY + ADVISOR_SHARED_SECRET so a
// compromise of the advisor process cannot read JWT secrets, DB credentials,
// or any operator tokens.
module.exports = {
  apps: [
    {
      name: 'orchestra-core',
      script: 'orchestra-server.js',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 2000,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 7777,
        // ADVISOR_SHARED_SECRET + ADVISOR_PORT read from process env on VPS
      },
      out_file: './logs/orchestra.out.log',
      error_file: './logs/orchestra.err.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'config-advisor',
      script: 'services/config-advisor.js',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 2000,
      max_memory_restart: '150M',
      env: {
        NODE_ENV: 'production',
        ADVISOR_PORT: 4721,
        // ADVISOR_SHARED_SECRET + ANTHROPIC_API_KEY read from process env
      },
      out_file: './logs/advisor.out.log',
      error_file: './logs/advisor.err.log',
      merge_logs: true,
      time: true,
=======
// PM2 process manager configuration — FULL SYSTEM
// Usage:
//   pm2 start ecosystem.config.js --env production   ← VPS (always use this)
//   pm2 save && pm2 startup                          ← persist across reboots
//   pm2 restart all                                  ← rolling restart

const isProd = process.env.NODE_ENV === 'production';

// Shared defaults applied to every process
const BASE = {
  instances:               1,
  autorestart:             true,
  max_restarts:            50,         // cap at 50 — prevents 144K restart storms
  min_uptime:              '30s',      // under 30s = crash loop → apply backoff
  exp_backoff_restart_delay: 1000,     // 1s → 2s → 4s … caps at 16s (slower ramp)
  watch:                   false,
  merge_logs:              true,
  log_date_format:         'YYYY-MM-DD HH:mm:ss',
  max_memory_restart:      '512M',     // auto-restart before OOM kills the process
  kill_timeout:            5000,       // give process 5s to drain before SIGKILL
  listen_timeout:          10000,      // wait 10s for ready signal before marking as failed
};

module.exports = {
  apps: [
    // ── Gateway (port 8080) — nginx → this → all other services ──────────────
    {
      ...BASE,
      name:        'bridge-gateway',
      script:      'gateway.js',
      out_file:    './logs/gateway-out.log',
      error_file:  './logs/gateway-error.log',
      env: {
        NODE_ENV: 'production',
        PORT: 8080,
      },
    },

    // ── Unified Server (port 3000) — CRM, LeadGen, OSINT, Payments ───────────
    {
      ...BASE,
      name:        'unified-server',
      script:      'server.js',
      out_file:    './logs/unified-out.log',
      error_file:  './logs/unified-error.log',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },

    // ── Super Brain (port 8000) — control plane + agent orchestration ─────────
    {
      ...BASE,
      name:        'super-brain',
      script:      'brain.js',
      out_file:    './logs/brain-out.log',
      error_file:  './logs/brain-error.log',
      env: {
        NODE_ENV: 'production',
        BRAIN_PORT: 8000,
      },
    },

    // ── Auth Service (port 5001) ───────────────────────────────────────────────
    {
      ...BASE,
      name:        'auth-service',
      script:      'auth.js',
      out_file:    './logs/auth-out.log',
      error_file:  './logs/auth-error.log',
      env: {
        NODE_ENV: 'production',
        AUTH_PORT: 5001,
      },
    },

    // ── Terminal Proxy (port 5002) — secure ops terminal ─────────────────────
    {
      ...BASE,
      name:           'terminal-proxy',
      script:         'terminal-proxy.js',
      max_memory_restart: '128M',     // terminal proxy is lightweight
      out_file:       './logs/terminal-out.log',
      error_file:     './logs/terminal-error.log',
      env: {
        NODE_ENV: 'production',
        TERMINAL_PROXY_PORT: 5002,
      },
    },

    // ── GOD MODE Monitor (port 3001) — topology dashboard ────────────────────
    {
      ...BASE,
      name:        'god-mode-topology',
      script:      'system.js',
      out_file:    './logs/system-out.log',
      error_file:  './logs/system-error.log',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
    },

    // ── BAN Task Engine (port 8001) — Python/FastAPI ──────────────────────────
    // NOTE: script path is environment-specific. On VPS use: /usr/bin/python3
    // Override by setting BAN_PYTHON env var before starting PM2.
    // cwd matches VPS_DIR in deploy-vps.sh (rsync target). Override with BAN_CWD.
    {
      ...BASE,
      name:        'ban-engine',
      script:      process.env.BAN_PYTHON || '/usr/bin/python3',
      args:        '-m uvicorn backend.main:app --host 0.0.0.0 --port 8001 --workers 1',
      cwd:         process.env.BAN_CWD || '/var/www/bridgeai',
      interpreter: 'none',
      max_memory_restart: '256M',
      out_file:    './logs/ban-out.log',
      error_file:  './logs/ban-error.log',
      env: {
        NODE_ENV: 'production',
      },
    },

    // ── SVG Skill Engine (port 7070) — skill execution + graph visualization ─
    {
      ...BASE,
      name:        'svg-engine',
      script:      'api/server.js',
      cwd:         './svg-engine',
      node_args:   '--experimental-modules',
      out_file:    './logs/svg-engine-out.log',
      error_file:  './logs/svg-engine-error.log',
      env: {
        NODE_ENV: 'production',
        SVG_ENGINE_PORT: 7070,
        BRIDGE_API_BASE: 'http://localhost:8000',
      },
>>>>>>> a65a24150727639fde77daadeba4361af473827a
    },
  ],
};
