// CANDIDATE snippet to splice into the apps[] array in:
//   C:\aoe-unified-final\ecosystem.config.js
//
// Insert after the 'svg-engine' block and before the closing `] };`.
// DO NOT run this file — it's a patch artifact. See README.md.

// ── Admin API (port 4011, loopback-only) — nginx /admin/ → this ─────────
// Reads PM2 state via `pm2 jlist` and exposes it at /admin/overview,
// /admin/topology, /events/stream. Orchestra + admin-dashboard depend on it.
//
// Without this entry, PM2 never starts the admin-api listener, nothing binds
// to 127.0.0.1:4011, and nginx returns 502 Bad Gateway on /admin/*.
{
  ...BASE,
  name:        'admin-api',
  script:      'services/admin-api/index.js',
  max_memory_restart: '150M',
  out_file:    './logs/admin-api-out.log',
  error_file:  './logs/admin-api-error.log',
  env: {
    NODE_ENV: 'production',
    ADMIN_PORT: 4011,
    // PM2_HOME must match the daemon that owns the managed processes.
    // If admin-api runs as root but PM2 God is owned by another user,
    // `pm2 jlist` returns [] and /admin/overview emits a pm2_error field.
    PM2_HOME: '/root/.pm2',
  },
},
