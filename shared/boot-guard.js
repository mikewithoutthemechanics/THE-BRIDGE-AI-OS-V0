// shared/boot-guard.js
const REQUIRED = ["JWT_SECRET"];

module.exports = function bootGuard() {
  const missing = REQUIRED.filter(k => !process.env[k]);
  if (missing.length) {
    console.error("Missing ENV:", missing);
    process.exit(1);
  }
};
