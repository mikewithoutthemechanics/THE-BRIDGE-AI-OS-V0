// PM2 process manager configuration
// Usage:
//   npm run pm2:start       → development
//   npm run pm2:prod        → production
//   pm2 save && pm2 startup → auto-start on reboot

module.exports = {
  apps: [
    {
      name:         'god-mode-topology',
      script:       'system.js',
      instances:    1,
      autorestart:  true,
      max_restarts: 10,
      restart_delay:2000,

      // Watch public/ for changes (dev only — disabled in prod below)
      watch:        ['public'],
      watch_delay:  500,
      ignore_watch: ['node_modules', 'certs', '*.log'],

      // Logging
      out_file:     './logs/out.log',
      error_file:   './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs:   true,

      // Development environment (npm run pm2:start)
      env: {
        NODE_ENV: 'development',
        PORT:     3000,
      },

      // Production environment (npm run pm2:prod)
      env_production: {
        NODE_ENV:  'production',
        PORT:      process.env.PORT || 80,
        watch:     false,
      },
    },
    {
      name:         'bridge-gateway',
      script:       'gateway.js',
      instances:    1,
      autorestart:  true,
      max_restarts: 10,
      restart_delay:2000,
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
        watch:    false,
      },
    },
  ],
};
