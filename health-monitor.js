const http = require('http');
const { Pool } = require('pg');
const db = new Pool({ connectionString: 'postgresql://postgres:password@localhost:5432/bridgeai_economy' });

// Create table
db.query(`CREATE TABLE IF NOT EXISTS health_checks (
  id SERIAL PRIMARY KEY, ts TIMESTAMPTZ DEFAULT NOW(),
  service VARCHAR(100), url VARCHAR(255), status INTEGER, latency_ms INTEGER, ok BOOLEAN
)`).catch(() => {});

const endpoints = [
  { service: 'node0-core', url: 'http://localhost:3000/health' },
  { service: 'god-mode', url: 'http://localhost:3001/health' },
  { service: 'super-brain', url: 'http://localhost:8000/api/health' },
  { service: 'gateway', url: 'http://localhost:8080/health' },
  { service: 'svg-engine', url: 'http://localhost:7070/health' },
  { service: 'terminal', url: 'http://localhost:5002/' },
  { service: 'bridge-auth', url: 'http://localhost:3030/' },
  { service: 'fastapi', url: 'http://localhost:8081/health' }
];

async function check() {
  for (const ep of endpoints) {
    const start = Date.now();
    try {
      const code = await new Promise((resolve, reject) => {
        http.get(ep.url, { timeout: 5000 }, r => resolve(r.statusCode)).on('error', reject);
      });
      const latency = Date.now() - start;
      const ok = code >= 200 && code < 400;
      await db.query('INSERT INTO health_checks (service, url, status, latency_ms, ok) VALUES ($1,$2,$3,$4,$5)', [ep.service, ep.url, code, latency, ok]);
      console.log(`${ok ? '✓' : '✗'} ${ep.service}: ${code} (${latency}ms)`);
      if (!ok) console.error(`[ALERT] ${ep.service} returned ${code}`);
    } catch(err) {
      await db.query('INSERT INTO health_checks (service, url, status, latency_ms, ok) VALUES ($1,$2,$3,$4,$5)', [ep.service, ep.url, 0, Date.now()-start, false]);
      console.error(`[DOWN] ${ep.service}: ${err.message}`);
    }
  }
}

// Run every 60 seconds
check();
setInterval(check, 60000);
console.log('[health-monitor] Running — checking 8 endpoints every 60s');
