const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');
const pexec = promisify(exec);
const { pm2List } = require('./pm2Reader');
async function gitCommit() {
  try { const { stdout } = await pexec('git -C /var/www/bridgeai rev-parse HEAD'); return stdout.trim(); }
  catch { return null; }
}
function cpuAvgPct() {
  const load = os.loadavg()[0];
  const cores = os.cpus().length || 1;
  return Math.min(100, Math.round((load / cores) * 100));
}
function memAvgPct() {
  const t = os.totalmem(), f = os.freemem();
  return Math.round(((t - f) / t) * 100);
}
async function buildOverview() {
  const procs = await pm2List();
  const services = procs.map(p => ({
    name: p.name,
    status: p.pm2_env?.status || 'unknown',
    cpu: p.monit?.cpu ?? 0,
    mem_mb: Math.round((p.monit?.memory ?? 0) / (1024 * 1024)),
    restarts: p.pm2_env?.restart_time ?? 0,
    pid: p.pid || null,
  }));
  return {
    services_up: services.filter(s => s.status === 'online').length,
    services_total: services.length,
    git_commit: await gitCommit(),
    cpu_avg: cpuAvgPct(),
    mem_avg: memAvgPct(),
    latency_p95_ms: 0,
    services,
    ts: Date.now(),
  };
}
module.exports = { buildOverview };
