// Sidecar ecosystem for admin-api. Separate from ecosystem.config.js so the
// main config can be redeployed without coordinating the admin-api app block.
//
// Usage:
//   pm2 start ecosystem.admin-api.config.js
//
// Token discovery: parse .env with fs directly (no dotenv dep) so this file
// works under any cwd. Falls back through three env var names to match the
// priority order that services/admin-api/index.js looks at.
const fs = require("fs");
const env = {};
try {
  fs.readFileSync("/var/www/bridgeai/.env", "utf8").split("\n").forEach(line => {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["]|["]$/g, "").replace(/^[]|[]$/g, "");
  });
} catch (e) {
  console.error("[ecosystem.admin-api] WARNING: could not read .env:", e.message);
}

module.exports = {
  apps: [{
    name: "admin-api",
    script: "services/admin-api/index.js",
    cwd: "/var/www/bridgeai",
    exec_mode: "fork",
    autorestart: true,
    max_restarts: 5,
    env: {
      NODE_ENV: "production",
      ADMIN_PORT: "4011",
      ADMIN_API_TOKEN: env.ADMIN_API_TOKEN || env.ORCHESTRA_ADMIN_TOKEN,
      ORCHESTRA_ADMIN_TOKEN: env.ORCHESTRA_ADMIN_TOKEN,
      BRIDGE_INTERNAL_SECRET: env.BRIDGE_INTERNAL_SECRET,
    },
  }],
};
