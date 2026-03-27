// PM2 process manager configuration — FULL SYSTEM
// Usage:
//   npm run pm2:start       → development
//   npm run pm2:prod        → production
//   pm2 save && pm2 startup → auto-start on reboot

module.exports = {
  apps: [
    // ── Gateway (port 8080) — main entry point ──────────────────────────────
    {
      name:         'bridge-gateway',
      script:       'gateway.js',
      instances:    1,
      autorestart:  true,
      max_restarts: 10,
      restart_delay: 2000,
      watch:        false,
      out_file:     './logs/gateway-out.log',
      error_file:   './logs/gateway-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs:   true,
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
    },

    // ── System / GOD MODE (port 3000) ───────────────────────────────────────
    {
      name:         'god-mode-system',
      script:       'system.js',
      instances:    1,
      autorestart:  true,
      max_restarts: 10,
      restart_delay: 2000,
      watch:        ['public'],
      watch_delay:  500,
      ignore_watch: ['node_modules', 'certs', '*.log'],
      out_file:     './logs/system-out.log',
      error_file:   './logs/system-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs:   true,
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        watch: false,
      },
    },

    // ── Terminal Proxy (port 5002) ──────────────────────────────────────────
    {
      name:         'terminal-proxy',
      script:       'terminal-proxy.js',
      instances:    1,
      autorestart:  true,
      max_restarts: 5,
      restart_delay: 3000,
      watch:        false,
      out_file:     './logs/terminal-out.log',
      error_file:   './logs/terminal-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs:   true,
      env: {
        TERMINAL_PROXY_PORT: 5002,
      },
    },

    // ── Auth Service (port 5001) ────────────────────────────────────────────
    {
      name:         'auth-service',
      script:       'auth.js',
      instances:    1,
      autorestart:  true,
      max_restarts: 10,
      restart_delay: 2000,
      watch:        false,
      out_file:     './logs/auth-out.log',
      error_file:   './logs/auth-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs:   true,
      env: {
        AUTH_PORT: 5001,
      },
    },

    // ── Super Brain (port 8000) — Unified control plane ────────────────────
    {
      name:         'super-brain',
      script:       'brain.js',
      instances:    1,
      autorestart:  true,
      max_restarts: 10,
      restart_delay: 2000,
      watch:        false,
      out_file:     './logs/brain-out.log',
      error_file:   './logs/brain-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs:   true,
      env: {
        BRAIN_PORT: 8000,
      },
    },

    // ── BAN Task Engine (port 8001) — Python/FastAPI ────────────────────────
    {
      name:         'ban-engine',
      script:       'python',
      args:         '-c "import uvicorn; uvicorn.run(\'backend.main:app\', host=\'0.0.0.0\', port=8001)"',
      cwd:          './BAN',
      interpreter:  'none',
      instances:    1,
      autorestart:  true,
      max_restarts: 10,
      restart_delay: 3000,
      watch:        false,
      out_file:     './logs/ban-out.log',
      error_file:   './logs/ban-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs:   true,
    },
  ],
};
