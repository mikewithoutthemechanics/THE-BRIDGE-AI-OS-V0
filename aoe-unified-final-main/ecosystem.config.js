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
      script: 'server.js',
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
    },
  ],
};
