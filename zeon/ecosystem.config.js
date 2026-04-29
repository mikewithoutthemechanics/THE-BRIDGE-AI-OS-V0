// PM2 ecosystem for ZEON Guardian stack.
//
// Only the sentinel runs continuously — it's the one that must be awake to
// win gas-price races. The pauser is a CLI, invoked on-demand.
//
// Env is read from /root/.env.zeon on the VPS (loaded by ecosystem at boot).
// Keep this process's env NARROW: it only needs LINEA_RPC_URL,
// ZEON_GUARDIAN_ADDR, ZEON_SENTINEL_KEY, ZEON_HOT_WALLETS, ZEON_WATCHED_TOKENS,
// and optional tuning knobs. No JWT secrets, no core-gateway secrets, no DB.

module.exports = {
  apps: [
    {
      name: 'zeon-sentinel',
      script: 'scripts/sentinel.js',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_restarts: 20,
      min_uptime: '10s',
      restart_delay: 2000,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
        GAS_BUMP_PCT: '120',
        GAS_BUMP_MAX_GWEI: '500',
        RESCUE_COOLDOWN_MS: '10000',
        POLL_INTERVAL_MS: '1500',
        // LINEA_RPC_URL, ZEON_GUARDIAN_ADDR, ZEON_SENTINEL_KEY,
        // ZEON_HOT_WALLETS, ZEON_WATCHED_TOKENS come from /root/.env.zeon
      },
      out_file: './logs/sentinel.out.log',
      error_file: './logs/sentinel.err.log',
      merge_logs: true,
      time: true,
    },
  ],
};
