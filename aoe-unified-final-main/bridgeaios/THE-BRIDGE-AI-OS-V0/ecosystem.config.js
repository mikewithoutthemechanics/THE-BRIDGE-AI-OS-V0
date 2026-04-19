module.exports = {
  apps: [{
    name: 'the-bridge-ai-os',
    script: 'server.js',
    instances: 'max',
    exec_mode: 'cluster',
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      MCP_WPCOM_URL: 'https://public-api.wordpress.com/wpcom/v2/mcp/v1',
      LOG_LEVEL: 'info'
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000,
      MCP_WPCOM_URL: 'https://public-api.wordpress.com/wpcom/v2/mcp/v1',
      LOG_LEVEL: 'warn'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    merge_logs: true,
    time: true,
    // Health check
    health_check: {
      enabled: true,
      url: 'http://localhost:3000/api/health',
      interval: 30000,
      timeout: 5000,
      retries: 3
    }
  }],

  deploy: {
    production: {
      user: 'ubuntu',
      host: process.env.VPS_HOST || 'your-vps-ip',
      ref: 'origin/main',
      repo: 'https://github.com/yourusername/the-bridge-ai-os.git',
      path: '/opt/the-bridge-ai-os',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};