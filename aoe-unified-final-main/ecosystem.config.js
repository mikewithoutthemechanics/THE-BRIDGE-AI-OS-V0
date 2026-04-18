module.exports = {
  apps: [{
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
    },
    out_file: './logs/orchestra.out.log',
    error_file: './logs/orchestra.err.log',
    merge_logs: true,
    time: true,
  }],
};
