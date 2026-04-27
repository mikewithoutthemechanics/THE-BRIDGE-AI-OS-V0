// PM2 process manager configuration — FULL SYSTEM
// Usage:
//   pm2 start ecosystem.config.js --env production   <- VPS (always use this)
//   pm2 save && pm2 startup                          <- persist across reboots
//   pm2 restart all                                  <- rolling restart

const BASE = {
  instances:                 1,
  autorestart:               true,
  max_restarts:              50,
  min_uptime:                '30s',
  exp_backoff_restart_delay: 1000,
  watch:                     false,
  merge_logs:                true,
  log_date_format:           'YYYY-MM-DD HH:mm:ss',
  max_memory_restart:        '512M',
  kill_timeout:              5000,
  listen_timeout:            10000,
};

module.exports = {
  apps: [
    {
      ...BASE,
      name:       'bridge-gateway',
      script:     'gateway.js',
      out_file:   './logs/gateway-out.log',
      error_file: './logs/gateway-error.log',
      env: { NODE_ENV: 'production', PORT: 8082, GATEWAY_LISTEN_HOST: '127.0.0.1' },
    },
    {
      ...BASE,
      name:       'unified-server',
      script:     'server.js',
      out_file:   './logs/unified-out.log',
      error_file: './logs/unified-error.log',
      env: { NODE_ENV: 'production', PORT: 3000 },
    },
    {
      ...BASE,
      name:       'super-brain',
      script:     'brain.js',
      out_file:   './logs/brain-out.log',
      error_file: './logs/brain-error.log',
      env: { NODE_ENV: 'production', BRAIN_PORT: 8000 },
    },
    {
      ...BASE,
      name:       'auth-service',
      script:     'auth.js',
      out_file:   './logs/auth-out.log',
      error_file: './logs/auth-error.log',
      env: { NODE_ENV: 'production', AUTH_PORT: 5001 },
    },
    {
      ...BASE,
      name:               'terminal-proxy',
      script:             'terminal-proxy.js',
      max_memory_restart: '128M',
      out_file:           './logs/terminal-out.log',
      error_file:         './logs/terminal-error.log',
      env: { NODE_ENV: 'production', TERMINAL_PROXY_PORT: 5002 },
    },
    {
      ...BASE,
      name:       'god-mode-topology',
      script:     'system.js',
      out_file:   './logs/system-out.log',
      error_file: './logs/system-error.log',
      env: { NODE_ENV: 'production', PORT: 3001 },
    },
    {
      ...BASE,
      name:               'god-mode-system',
      script:             'god-mode.js',
      max_memory_restart: '256M',
      out_file:           './logs/god-mode-out.log',
      error_file:         './logs/god-mode-error.log',
      env: { NODE_ENV: 'production', GOD_MODE_PORT: 6000 },
    },
    {
      ...BASE,
      name:               'ban-engine',
      script:             process.env.BAN_PYTHON || '/usr/bin/python3',
      args:               '-m uvicorn backend.main:app --host 0.0.0.0 --port 8001 --workers 1',
      cwd:                process.env.BAN_CWD || '/var/www/bridgeai',
      interpreter:        'none',
      max_memory_restart: '256M',
      out_file:           './logs/ban-out.log',
      error_file:         './logs/ban-error.log',
      env: { NODE_ENV: 'production' },
    },
    {
      ...BASE,
      name:       'svg-engine',
      script:     'api/server.js',
      cwd:        './svg-engine',
      node_args:  '--experimental-modules',
      out_file:   './logs/svg-engine-out.log',
      error_file: './logs/svg-engine-error.log',
      env: {
        NODE_ENV:        'production',
        SVG_ENGINE_PORT: 7070,
        BRIDGE_API_BASE: 'http://localhost:8000',
      },
    },
    {
      ...BASE,
      name:               'admin-api',
      script:             'admin-api.js',
      max_memory_restart: '128M',
      out_file:           './logs/admin-out.log',
      error_file:         './logs/admin-error.log',
      env: { NODE_ENV: 'production', ADMIN_PORT: 9000 },
    },
  ],
};
