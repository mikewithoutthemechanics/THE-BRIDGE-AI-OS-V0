/*******************************************************************************************
  GOD MODE — UNIFIED SYSTEM v3
  Engine scanner · Economic flow · AI recommendations · Live logging
  API: /api/full  /api/scan  /api/engines  /api/economic  /api/recommendations  /api/logs
  UI:  http://localhost:PORT  (topology.html)
*******************************************************************************************/
'use strict';

const http   = require('http');
const https  = require('https');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const { execSync } = require('child_process');

// ─── Environment ─────────────────────────────────────────────────────────────
const PORT     = parseInt(process.env.PORT, 10) || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD  = NODE_ENV === 'production';
const IS_HTTPS = PORT === 443 || process.env.HTTPS === 'true';
const PROTOCOL = IS_HTTPS ? 'https' : 'http';
const PLATFORM = process.platform;
const ROOT     = __dirname;
const HTML     = path.join(ROOT, 'public', 'topology.html');
const CERTS    = path.join(ROOT, 'certs');
const LOG_DIR  = path.join(ROOT, 'logs');
const LOG_FILE = path.join(LOG_DIR, `scan-${new Date().toISOString().slice(0,10)}.jsonl`);
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.log('\x1b[33m⚠ WARNING: JWT_SECRET not set — auth features will be unavailable.\x1b[0m');
}

// Ensure log dir
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

// ─── Logging ─────────────────────────────────────────────────────────────────
const logBuffer = [];

function log(level, category, msg, data = null) {
  const entry = { ts: Date.now(), level, category, msg, data };
  logBuffer.unshift(entry);
  if (logBuffer.length > 300) logBuffer.pop();
  fs.appendFile(LOG_FILE, JSON.stringify(entry) + '\n', () => {});
  if (!IS_PROD) {
    const tag = { INFO:'ℹ', WARN:'⚠', ERROR:'✗', OK:'✓', SCAN:'◎' }[level] || '·';
    console.log(`  ${tag}  [${category}] ${msg}`);
  }
}

// ─── Safe exec ───────────────────────────────────────────────────────────────
function run(cmd, fallback = []) {
  try {
    return execSync(cmd, { timeout: 3000, stdio: ['ignore','pipe','pipe'] })
      .toString().split('\n').map(l => l.trim()).filter(Boolean);
  } catch { return fallback; }
}

function ver(cmd) {
  try {
    return execSync(cmd, { timeout: 2000, stdio: ['ignore','pipe','pipe'] })
      .toString().trim().split('\n')[0].slice(0, 80);
  } catch { return null; }
}

// ─── ENGINE SCANNER ──────────────────────────────────────────────────────────
const ENGINE_DEFS = [
  // Runtimes
  { name:'Node.js',     cmd:'node --version',         type:'RUNTIME',     eco_impact:9, doc:'https://nodejs.org' },
  { name:'Python',      cmd:'python --version',        type:'RUNTIME',     eco_impact:7, doc:'https://python.org' },
  { name:'Python3',     cmd:'python3 --version',       type:'RUNTIME',     eco_impact:7, doc:'https://python.org' },
  { name:'Bun',         cmd:'bun --version',           type:'RUNTIME',     eco_impact:8, doc:'https://bun.sh' },
  { name:'Deno',        cmd:'deno --version',          type:'RUNTIME',     eco_impact:6, doc:'https://deno.land' },
  { name:'Go',          cmd:'go version',              type:'RUNTIME',     eco_impact:7, doc:'https://go.dev' },
  { name:'Ruby',        cmd:'ruby --version',          type:'RUNTIME',     eco_impact:5, doc:'https://ruby-lang.org' },
  { name:'PHP',         cmd:'php --version',           type:'RUNTIME',     eco_impact:5, doc:'https://php.net' },
  { name:'Java',        cmd:'java --version',          type:'RUNTIME',     eco_impact:6, doc:'https://openjdk.org' },
  { name:'Rust',        cmd:'rustc --version',         type:'RUNTIME',     eco_impact:6, doc:'https://rust-lang.org' },
  // Databases
  { name:'PostgreSQL',  cmd:'psql --version',          type:'DATABASE',    eco_impact:9, doc:'https://postgresql.org' },
  { name:'MySQL',       cmd:'mysql --version',         type:'DATABASE',    eco_impact:8, doc:'https://mysql.com' },
  { name:'MongoDB',     cmd:'mongod --version',        type:'DATABASE',    eco_impact:8, doc:'https://mongodb.com' },
  { name:'SQLite',      cmd:'sqlite3 --version',       type:'DATABASE',    eco_impact:5, doc:'https://sqlite.org' },
  { name:'Redis',       cmd:'redis-cli --version',     type:'CACHE',       eco_impact:9, doc:'https://redis.io' },
  { name:'Memcached',   cmd:'memcached --version',     type:'CACHE',       eco_impact:6, doc:'https://memcached.org' },
  { name:'Elasticsearch',cmd:'elasticsearch --version',type:'SEARCH',      eco_impact:8, doc:'https://elastic.co' },
  // Web servers / Proxies
  { name:'NGINX',       cmd:'nginx -v',                type:'WEBSERVER',   eco_impact:9, doc:'https://nginx.org' },
  { name:'Apache',      cmd:'apache2 -v',              type:'WEBSERVER',   eco_impact:7, doc:'https://httpd.apache.org' },
  { name:'Caddy',       cmd:'caddy version',           type:'WEBSERVER',   eco_impact:8, doc:'https://caddyserver.com' },
  { name:'HAProxy',     cmd:'haproxy -v',              type:'LOADBALANCER',eco_impact:8, doc:'https://haproxy.org' },
  // Queue / Messaging
  { name:'RabbitMQ',    cmd:'rabbitmqctl version',     type:'QUEUE',       eco_impact:8, doc:'https://rabbitmq.com' },
  // Container / Orchestration
  { name:'Docker',      cmd:'docker --version',        type:'CONTAINER',   eco_impact:10,doc:'https://docker.com' },
  { name:'Docker Compose',cmd:'docker compose version',type:'CONTAINER',   eco_impact:9, doc:'https://docs.docker.com/compose' },
  { name:'kubectl',     cmd:'kubectl version --client',type:'ORCHESTRATOR',eco_impact:9, doc:'https://kubernetes.io' },
  { name:'Helm',        cmd:'helm version',            type:'ORCHESTRATOR',eco_impact:8, doc:'https://helm.sh' },
  // Process managers
  { name:'PM2',         cmd:'pm2 --version',           type:'PROCESS',     eco_impact:9, doc:'https://pm2.io' },
  // Build / Package
  { name:'npm',         cmd:'npm --version',           type:'BUILD',       eco_impact:8, doc:'https://npmjs.com' },
  { name:'yarn',        cmd:'yarn --version',          type:'BUILD',       eco_impact:7, doc:'https://yarnpkg.com' },
  { name:'pnpm',        cmd:'pnpm --version',          type:'BUILD',       eco_impact:7, doc:'https://pnpm.io' },
  { name:'git',         cmd:'git --version',           type:'BUILD',       eco_impact:9, doc:'https://git-scm.com' },
  // Cloud CLIs
  { name:'Heroku CLI',  cmd:'heroku --version',        type:'CLOUD',       eco_impact:7, doc:'https://devcenter.heroku.com' },
  { name:'Railway',     cmd:'railway --version',       type:'CLOUD',       eco_impact:8, doc:'https://railway.app' },
  { name:'Fly.io',      cmd:'fly version',             type:'CLOUD',       eco_impact:8, doc:'https://fly.io' },
  { name:'AWS CLI',     cmd:'aws --version',           type:'CLOUD',       eco_impact:9, doc:'https://aws.amazon.com/cli' },
  { name:'gcloud',      cmd:'gcloud --version',        type:'CLOUD',       eco_impact:9, doc:'https://cloud.google.com/sdk' },
  { name:'Azure CLI',   cmd:'az --version',            type:'CLOUD',       eco_impact:9, doc:'https://learn.microsoft.com/cli/azure' },
  // Monitoring
  { name:'Prometheus',  cmd:'prometheus --version',    type:'MONITOR',     eco_impact:8, doc:'https://prometheus.io' },
  { name:'Grafana',     cmd:'grafana-server --version',type:'MONITOR',     eco_impact:8, doc:'https://grafana.com' },
  { name:'Datadog',     cmd:'ddagent --version',       type:'MONITOR',     eco_impact:8, doc:'https://datadoghq.com' },
  // Security
  { name:'certbot',     cmd:'certbot --version',       type:'SECURITY',    eco_impact:9, doc:'https://certbot.eff.org' },
  { name:'openssl',     cmd:'openssl version',         type:'SECURITY',    eco_impact:9, doc:'https://openssl.org' },
  // Serverless / Edge
  { name:'Wrangler',    cmd:'wrangler --version',      type:'EDGE',        eco_impact:8, doc:'https://developers.cloudflare.com/workers' },
  { name:'Vercel CLI',  cmd:'vercel --version',        type:'EDGE',        eco_impact:8, doc:'https://vercel.com' },
  { name:'Netlify CLI', cmd:'netlify --version',       type:'EDGE',        eco_impact:7, doc:'https://netlify.com' },
];

function scanEngines() {
  log('SCAN', 'ENGINES', `Scanning ${ENGINE_DEFS.length} engines…`);
  const results = ENGINE_DEFS.map(e => {
    const version = ver(e.cmd);
    const status  = version ? 'INSTALLED' : 'MISSING';
    if (version) log('OK',   'ENGINES', `${e.name}: ${version}`);
    return { ...e, version, status };
  });
  const installed = results.filter(e => e.status === 'INSTALLED').length;
  log('INFO', 'ENGINES', `Scan complete: ${installed}/${results.length} installed`);
  return results;
}

// ─── ECONOMIC SCANNER ────────────────────────────────────────────────────────
const PAYMENT_DEPS = ['stripe','braintree','paypal','square','razorpay','paddle',
                      'chargebee','recurly','mollie','klarna','adyen'];
const ANALYTICS_DEPS = ['mixpanel','amplitude','segment','posthog','analytics','rudderstack'];
const EMAIL_DEPS     = ['sendgrid','mailgun','nodemailer','ses','postmark','resend'];
const AUTH_DEPS      = ['passport','jsonwebtoken','bcrypt','clerk','auth0','supertokens'];

function scanProjectFiles() {
  const found = { payment:[], analytics:[], email:[], auth:[], apis:[], envKeys:[], dbs:[] };

  // Scan package.json files
  const pkgPaths = [
    path.join(ROOT, 'package.json'),
    path.join(ROOT, '..', 'package.json'),
  ];
  pkgPaths.forEach(p => {
    try {
      const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      Object.keys(deps).forEach(dep => {
        if (PAYMENT_DEPS.some(d => dep.includes(d)))   found.payment.push(dep);
        if (ANALYTICS_DEPS.some(d => dep.includes(d))) found.analytics.push(dep);
        if (EMAIL_DEPS.some(d => dep.includes(d)))     found.email.push(dep);
        if (AUTH_DEPS.some(d => dep.includes(d)))      found.auth.push(dep);
      });
    } catch {}
  });

  // Scan .env files for keys (masked)
  [path.join(ROOT,'.env'), path.join(ROOT,'..', '.env')].forEach(ep => {
    try {
      fs.readFileSync(ep,'utf8').split('\n').forEach(line => {
        const m = line.match(/^([A-Z_]+(?:KEY|SECRET|TOKEN|ID|URL|API)[A-Z_]*)=/i);
        if (m) found.envKeys.push(m[1]);
      });
    } catch {}
  });

  // Scan server files for route patterns
  const serverFiles = [
    path.join(ROOT,'server.js'),
    path.join(ROOT,'..','server','index.js'),
  ];
  serverFiles.forEach(sf => {
    try {
      const src = fs.readFileSync(sf,'utf8');
      const routeMatches = src.match(/(get|post|put|delete)\(['"`]([^'"`]+)/gi) || [];
      routeMatches.forEach(m => {
        const route = m.replace(/.*['"`]/, '');
        found.apis.push(route);
      });
      if (src.includes('sqlite') || src.includes('sqlite3')) found.dbs.push('SQLite');
      if (src.includes('postgres') || src.includes('pg'))    found.dbs.push('PostgreSQL');
      if (src.includes('mongoose') || src.includes('mongodb'))found.dbs.push('MongoDB');
      if (src.includes('redis'))                              found.dbs.push('Redis');
    } catch {}
  });

  return found;
}

function scanEconomic() {
  log('SCAN','ECONOMIC','Scanning project for economic indicators…');
  const proj = scanProjectFiles();

  // Infer revenue streams from what we found
  const streams = [];

  // SaaS signals
  if (proj.auth.length > 0 || proj.apis.some(a => a.includes('register') || a.includes('auth'))) {
    streams.push({ id:'saas', name:'SaaS Subscriptions', type:'REVENUE',
      potential:'HIGH', monthly_est:2000, confidence:0.7,
      note:'Auth system + registration flow detected → subscription model' });
  }
  // Affiliate signals (from server.js /go/r.php)
  if (proj.apis.some(a => a.includes('/go') || a.includes('r.php'))) {
    streams.push({ id:'affiliate', name:'Affiliate / Referral', type:'REVENUE',
      potential:'MEDIUM', monthly_est:500, confidence:0.8,
      note:'Redirect funnel detected (/go/r.php → ai-os.co.za)' });
  }
  // API monetisation signal
  if (proj.apis.filter(a => a.includes('/api/')).length > 3) {
    streams.push({ id:'api', name:'API Access / Usage', type:'REVENUE',
      potential:'MEDIUM', monthly_est:300, confidence:0.4,
      note:`${proj.apis.filter(a=>a.includes('/api/')).length} API endpoints detected` });
  }
  // Payment processor
  if (proj.payment.length > 0) {
    streams.push({ id:'payments', name:'Direct Payments', type:'REVENUE',
      potential:'HIGH', monthly_est:5000, confidence:0.9,
      note:`Payment libs: ${proj.payment.join(', ')}` });
  }

  // Cost centers
  const costs = [
    { id:'hosting',   name:'Hosting / VPS',     type:'COST', monthly_est:20,  note:'Estimated VPS cost' },
    { id:'domain',    name:'Domain Names',       type:'COST', monthly_est:5,   note:'ai-os.co.za + others' },
    { id:'storage',   name:'Storage / DB',       type:'COST', monthly_est:10,  note:`DBs detected: ${[...new Set(proj.dbs)].join(', ') || 'SQLite (free)'}` },
    { id:'bandwidth', name:'Bandwidth / CDN',    type:'COST', monthly_est:15,  note:'Estimated outbound traffic' },
    { id:'dev',       name:'Development',        type:'COST', monthly_est:0,   note:'Owner-operated (no direct cost)' },
  ];

  const totalRevEst  = streams.reduce((s, r) => s + r.monthly_est, 0);
  const totalCostEst = costs.reduce((s, c) => s + c.monthly_est, 0);
  const netFlow      = totalRevEst - totalCostEst;

  log('INFO','ECONOMIC',`Revenue est: $${totalRevEst}/mo | Costs: $${totalCostEst}/mo | Net: $${netFlow}/mo`);

  return {
    streams, costs,
    summary: {
      revenue_est:  totalRevEst,
      cost_est:     totalCostEst,
      net_flow:     netFlow,
      margin_pct:   totalRevEst > 0 ? Math.round((netFlow / totalRevEst) * 100) : 0,
      payment_deps: proj.payment,
      auth_deps:    proj.auth,
      analytics:    proj.analytics,
      email:        proj.email,
      apis:         proj.apis.slice(0, 20),
      env_keys:     proj.envKeys.slice(0, 20),
      dbs:          [...new Set(proj.dbs)],
    },
  };
}

// ─── AI RECOMMENDATION ENGINE ────────────────────────────────────────────────
function generateRecommendations(engines, economic, scan) {
  log('SCAN','AI_RECS','Generating recommendations…');
  const installed = new Set(engines.filter(e => e.status === 'INSTALLED').map(e => e.name));
  const ports     = new Set((scan.ports || []).map(p => p.port));
  const recs      = [];

  function rec(cat, priority, title, description, action, impact, effort, revenue_impact = null) {
    const roi = Math.round((impact / effort) * 10) / 10;
    recs.push({ category:cat, priority, title, description, action, impact, effort, revenue_impact, roi });
  }

  // ── PERFORMANCE ────────────────────────────────────────────────────────────
  if (!installed.has('Redis')) rec(
    'PERFORMANCE','HIGH',
    'Add Redis Caching Layer',
    'No Redis detected. Caching eliminates repeated DB reads, cuts response time 60–90%.',
    'docker run -d -p 6379:6379 redis:7-alpine\n# then: npm install ioredis',
    9, 2, '+30% throughput'
  );
  if (!installed.has('NGINX') && !installed.has('Caddy')) rec(
    'PERFORMANCE','HIGH',
    'Add Reverse Proxy (NGINX or Caddy)',
    'No reverse proxy detected. NGINX adds TLS termination, compression, static file serving and load balancing with near-zero overhead.',
    '# Ubuntu: sudo apt install nginx\n# Windows: choco install nginx\n# Or use Caddy: choco install caddy',
    9, 3, '+25% perceived speed'
  );
  if (!installed.has('PostgreSQL') && !installed.has('MySQL') && !installed.has('MongoDB')) rec(
    'PERFORMANCE','MEDIUM',
    'Upgrade from SQLite to PostgreSQL',
    'SQLite detected as primary DB. PostgreSQL supports concurrent writes, connection pooling, and horizontal reads — critical for >100 concurrent users.',
    'docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=secret postgres:15-alpine\n# Migrate: dump SQLite → import to PG',
    8, 5, 'Scales to 10k+ users'
  );
  if (!installed.has('Docker Compose') && installed.has('Docker')) rec(
    'PERFORMANCE','LOW',
    'Add Docker Compose Orchestration',
    'Docker installed but Compose not found. Compose allows defining app + DB + cache as one unit for one-command startup.',
    'Install Docker Compose: included in Docker Desktop\nnpm run deploy then use docker compose up',
    6, 2, 'Dev velocity +40%'
  );

  // ── FIX ────────────────────────────────────────────────────────────────────
  if (!ports.has(443)) rec(
    'FIX','HIGH',
    'Enable HTTPS / TLS (Port 443)',
    'Port 443 not listening. All production traffic should use TLS. Modern browsers mark HTTP sites as insecure, hurting conversion.',
    'npm run certs        # generate self-signed\n# OR use Caddy (auto-HTTPS):\nPORT=443 npm start',
    10, 2, 'Required for payments'
  );
  if (!installed.has('certbot') && !installed.has('openssl')) rec(
    'FIX','HIGH',
    'Install OpenSSL / Certbot for TLS',
    'No TLS certificate tooling detected. Certbot provides free Let\'s Encrypt certs.',
    '# Ubuntu: sudo apt install certbot python3-certbot-nginx\n# Windows: choco install openssl\nnpm run certs',
    9, 1, 'Security baseline'
  );
  if (!installed.has('PM2') && !IS_PROD) rec(
    'FIX','MEDIUM',
    'Ensure PM2 is Managing Processes',
    'PM2 not detected in production context. Without a process manager, crashes are unrecovered.',
    'npm install -g pm2\nnpm run pm2:start\npm2 save && pm2 startup',
    8, 1, '99.9% uptime SLA'
  );
  if (economic.summary.env_keys.length === 0) rec(
    'FIX','MEDIUM',
    'Audit & Secure Environment Variables',
    'No sensitive env keys detected — either not configured or .env missing. All secrets must be in env vars, never hardcoded.',
    'cp .env.example .env\n# Fill in your API keys\n# Verify .env is in .gitignore ✓',
    7, 1, 'Security compliance'
  );

  // ── GROWTH ─────────────────────────────────────────────────────────────────
  if (economic.summary.payment_deps.length === 0) rec(
    'GROWTH','HIGH',
    'Integrate Stripe Payment Processing',
    'No payment processor detected. The affiliate funnel (ai-os.co.za) and auth system indicate a paid product — direct payment capture is the highest-ROI addition.',
    'npm install stripe\n# Add POST /api/checkout endpoint\n# Add Stripe webhook: POST /api/webhooks/stripe\n# Set STRIPE_SECRET_KEY in .env',
    10, 4, '+$2k–$20k/mo est.'
  );
  if (economic.summary.analytics.length === 0) rec(
    'GROWTH','HIGH',
    'Add Product Analytics (PostHog)',
    'No analytics detected. Without funnel data you cannot optimize conversions. PostHog is open-source and self-hostable.',
    'npm install posthog-node\n# Add to server: posthog.capture events\n# Or add PostHog JS snippet to topology.html',
    8, 2, 'Conversion insight'
  );
  if (economic.summary.email.length === 0) rec(
    'GROWTH','MEDIUM',
    'Add Email Capture & Sequences (Resend)',
    'No email service detected. Email is the highest-ROI marketing channel (avg $36 per $1 spent). Capture on onboarding.',
    'npm install resend\n# Trigger welcome email on /api/auth/register\n# Set RESEND_API_KEY in .env',
    8, 2, '+20% LTV per user'
  );
  rec(
    'GROWTH','MEDIUM',
    'Expose Topology API as SaaS Product',
    'The GOD MODE topology scanner is itself a monetisable product. Add auth + billing to /api/scan and sell infrastructure insight as a service.',
    '# Add JWT middleware to /api/scan\n# Add Stripe checkout for API key generation\n# Tier: Free=1req/min, Pro=unlimited',
    9, 6, '+$500–$3k/mo ARR'
  );
  if (!installed.has('Wrangler') && !installed.has('Vercel CLI')) rec(
    'GROWTH','LOW',
    'Deploy Edge Functions (Cloudflare Workers)',
    'No edge deployment tooling found. Moving API endpoints to Cloudflare Workers cuts global latency to <50ms and enables geo-targeting.',
    'npm install -g wrangler\nwrangler login && wrangler deploy',
    7, 4, 'Global latency -70%'
  );

  // ── STABILITY ──────────────────────────────────────────────────────────────
  if (!installed.has('git')) rec(
    'STABILITY','HIGH',
    'Initialize Git Version Control',
    'Git not detected or not in PATH. All code must be version-controlled before any deployment.',
    'git init && git add -A\ngit commit -m "init: god-mode system"\ngit remote add origin <your-repo>',
    10, 1, 'Deployment gate'
  );
  rec(
    'STABILITY','MEDIUM',
    'Add Automated Health-Check Monitoring',
    'External uptime monitoring ensures you know about outages before users do. UptimeRobot (free) pings /health every 5 min.',
    '# 1. Sign up at uptimerobot.com (free)\n# 2. Add monitor: HTTP(s) → https://yourdomain.com/health\n# 3. Alert: email + Slack on downtime\n# /health endpoint already implemented ✓',
    8, 1, 'MTTR -80%'
  );
  rec(
    'STABILITY','MEDIUM',
    'Set Up Automated Database Backups',
    'No backup schedule detected. SQLite db should be snapshotted daily off-site.',
    '# Add to crontab or PM2 cron:\n# 0 2 * * * tar -czf backup-$(date +%F).tar.gz bridgeos.db\n# Upload to S3/R2: aws s3 cp backup-*.tar.gz s3://your-bucket/',
    9, 2, 'Data loss prevention'
  );
  rec(
    'STABILITY','LOW',
    'Add Rate Limiting to API Endpoints',
    'No rate limiter detected on /api/* routes. Unprotected APIs are vulnerable to abuse and accidental DDoS.',
    'npm install express-rate-limit\n# app.use(\'/api\', rateLimit({ windowMs: 60000, max: 100 }))',
    7, 1, 'Abuse prevention'
  );

  // Sort: HIGH first, then by ROI descending
  const order = { HIGH:0, MEDIUM:1, LOW:2 };
  recs.sort((a, b) => order[a.priority] - order[b.priority] || b.roi - a.roi);

  log('INFO','AI_RECS',`Generated ${recs.length} recommendations`);
  return recs;
}

// ─── SYSTEM SCANNERS (unchanged) ─────────────────────────────────────────────
function scanPorts() {
  const raw = PLATFORM === 'win32' ? run('netstat -ano') : run('ss -tulnp || netstat -tulnp');
  const seen = new Set(), ports = [];
  raw.forEach(line => {
    const m = line.match(/[:\s](\d{2,5})\s/);
    if (!m) return;
    const port = parseInt(m[1]);
    if (port < 1 || port > 65535 || seen.has(port)) return;
    seen.add(port); ports.push({ port, raw: line.slice(0, 90) });
  });
  return ports.sort((a,b) => a.port - b.port).slice(0, 40);
}
function scanProcesses() {
  const raw = PLATFORM === 'win32' ? run('tasklist /fo csv /nh') : run('ps -eo pid,comm,%cpu,%mem --sort=-%cpu');
  return raw.slice(0, 30).map(line => {
    if (PLATFORM === 'win32') {
      const p = line.replace(/"/g,'').split(',');
      return { name:p[0]||'?', pid:p[1]||'?', cpu:'—', mem:p[4]||'—' };
    }
    const p = line.split(/\s+/);
    return { pid:p[0], name:p[1], cpu:p[2], mem:p[3] };
  }).filter(p => p.name && p.name !== 'PID');
}
function scanDocker() {
  const raw = run('docker ps --format "{{.ID}}|{{.Image}}|{{.Status}}|{{.Names}}|{{.Ports}}"', []);
  return raw.map(line => {
    const [id,image,status,name,ports] = line.split('|');
    return { id:id?.slice(0,8), image, status, name, ports };
  }).filter(c => c.name);
}
function scanNetwork() {
  const raw = PLATFORM === 'win32' ? run('ipconfig') : run('ip -o addr show || ifconfig');
  const ifaces = [];
  if (PLATFORM === 'win32') {
    let cur = null;
    raw.forEach(line => {
      if (line.includes('adapter')) { cur = { name:line.replace('adapter','').replace(':','').trim(), addrs:[] }; ifaces.push(cur); }
      else if (cur && line.match(/IPv[46]/)) { const m = line.match(/:\s*(.+)/); if (m) cur.addrs.push(m[1].trim()); }
    });
  } else {
    raw.forEach(line => {
      const m = line.match(/^(\d+):\s+(\S+)\s+inet6?\s+([\d.a-f:/]+)/);
      if (!m) return;
      const ex = ifaces.find(i => i.name === m[2]);
      if (ex) ex.addrs.push(m[3]); else ifaces.push({ name:m[2], addrs:[m[3]] });
    });
  }
  return ifaces.slice(0, 10);
}
function sysInfo() {
  return {
    hostname: os.hostname(), platform: PLATFORM, arch: os.arch(),
    cpus: os.cpus().length,
    totalMem: Math.round(os.totalmem()/1e9*10)/10,
    freeMem:  Math.round(os.freemem()/1e9*10)/10,
    uptime:   Math.round(os.uptime()),
    loadavg:  os.loadavg().map(v => Math.round(v*100)/100),
    nodeEnv:  NODE_ENV, port: PORT, protocol: PROTOCOL,
  };
}

// ─── FULL SCAN ────────────────────────────────────────────────────────────────
let cachedFull = null, lastFullScan = 0;
const CACHE_TTL = 10000; // 10s

function fullScan() {
  const now = Date.now();
  if (cachedFull && (now - lastFullScan) < CACHE_TTL) return cachedFull;

  log('SCAN','SYSTEM','Starting full system scan…');
  const sys       = sysInfo();
  const ports     = scanPorts();
  const processes = scanProcesses();
  const docker    = scanDocker();
  const network   = scanNetwork();
  const engines   = scanEngines();
  const economic  = scanEconomic();
  const recs      = generateRecommendations(engines, economic, { ports });

  cachedFull    = { ts:now, sys, ports, processes, docker, network, engines, economic, recommendations:recs };
  lastFullScan  = now;
  log('OK','SYSTEM',`Full scan complete — ${engines.filter(e=>e.status==='INSTALLED').length} engines, ${recs.length} recs`);
  return cachedFull;
}

// ─── CORS origin allowlist (matches gateway.js pattern) ──────────────────────
const ALLOWED_ORIGINS = new Set([
  'https://wall.bridge-ai-os.com',
  'https://go.ai-os.co.za',
  'http://localhost:3000',
  'http://localhost:8080',
]);

// ─── JWT auth helper ──────────────────────────────────────────────────────────
function verifyJWT(req) {
  if (!JWT_SECRET) return null;
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const jsonwebtoken = require('jsonwebtoken');
    return jsonwebtoken.verify(authHeader.slice(7), JWT_SECRET);
  } catch { return null; }
}

// ─── NeuroLink Service Setup ──────────────────────────────────────────────────
let neurolinkService = null;
try {
  const { getNeuroLinkService } = require('./api/neurolink/routes');
  neurolinkService = getNeuroLinkService();
  if (process.env.NEUROLINK_ENABLED !== 'false') {
    neurolinkService.start();
    console.log('  ✓ NeuroLink cognitive service initialized');
  }
} catch (e) {
  console.warn('  ⚠ NeuroLink service not available:', e.message);
}

// ─── HTTP HANDLER ─────────────────────────────────────────────────────────────
function handler(req, res) {
  const url = req.url.split('?')[0];

  // CORS: allowlisted origins only (no wildcard)
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const json = (data, status=200) => {
    res.writeHead(status, { 'Content-Type':'application/json','Cache-Control':'no-store' });
    res.end(JSON.stringify(data));
  };

  // Health endpoints are always unauthenticated
  if (url === '/health' || url === '/healthz')
    return json({ status:'ok', uptime:Math.round(process.uptime()), port:PORT, env:NODE_ENV, ts:Date.now() });

  // NeuroLink endpoints (no auth required)
  if (neurolinkService) {
    if (url === '/api/neurolink/status') return json(neurolinkService.getStatus());
    if (url === '/api/neurolink/state') {
      const state = neurolinkService.getState();
      if (!state) return json({ error: 'NeuroLink not ready' }, 503);
      return json(state);
    }
    if (url === '/api/neurolink/twin') {
      const emotion = neurolinkService.getEmotion();
      if (!emotion) return json({ error: 'NeuroLink not ready' }, 503);
      return json(emotion);
    }
    if (url === '/api/neurolink/summary') {
      return neurolinkService.getTodaySummary().then(summary => {
        json(summary || { message: 'No data for today' });
      }).catch(err => json({ error: err.message }, 500));
    }
  }

  // All other /api/* endpoints require JWT authentication
  if (url.startsWith('/api/')) {
    const user = verifyJWT(req);
    if (!user) return json({ error: 'Unauthorized — valid Bearer token required' }, 401);
  }

  if (url === '/api/full')            return json(fullScan());
  if (url === '/api/scan')            return json(fullScan());
  if (url === '/api/engines')         return json(fullScan().engines);
  if (url === '/api/economic')        return json(fullScan().economic);
  if (url === '/api/recommendations') return json(fullScan().recommendations);
  if (url === '/api/logs')            return json(logBuffer.slice(0, 100));
  if (url === '/api/metrics')         return json(collectMetrics());
  if (url === '/api/revenue')         return json(revenueFlow.transactions.slice(-50));
  if (url === '/api/audit')           return json(fs.existsSync(AUDIT_FILE) ? fs.readFileSync(AUDIT_FILE,'utf8').trim().split('\n').slice(-100) : []);
  if (url === '/api/nodes')           return json(Object.keys(NODE_ROUTING).map(k=>({ id:k, ...NODE_ROUTING[k] })));
  if (url === '/api/finance')         return json(Finance.report());
  if (url === '/api/ai/status')       return json({ risk: FailureModel.evaluate(Brain.history), agents: AgentSwarm.agents, history: Brain.history.slice(-10) });
  if (url === '/api/agents')          return json(orchestrator.status());
  if (url === '/api/swarms')          return json(orchestrator.swarms);
  if (url === '/api/economics')       return json(aggregateEconomics());
  if (url === '/api/marketplace/stats') return json(aggregateEconomics());
  if (url === '/api/treasury/summary') {
    return new Promise(resolve => {
      require('http').get('http://localhost:8000/api/treasury/status', r => {
        let body = '';
        r.on('data', c => body += c);
        r.on('end', () => {
          try {
            const d = JSON.parse(body);
            resolve(json({ balance: d.balance || 0, earned: d.earned || 0, spent: d.spent || 0, currency: d.currency || 'USD', subscriptions: 0, plans: [] }));
          } catch { resolve(json({ balance: 0, earned: 0, spent: 0, currency: 'USD', subscriptions: 0, plans: [] })); }
        });
      }).on('error', () => resolve(json({ balance: 0, earned: 0, spent: 0, currency: 'USD', subscriptions: 0, plans: [] })));
    });
  }

  // ================= UNIVERSAL SHARE ENDPOINTS =================
  if (url.startsWith('/share/')) {
    const parts = url.split('/');
    const shareId = path.basename(parts[2] || '');   // sanitize: strip path traversal
    const action = parts[3]; // context, history, or metadata

    if (!shareId || /[^a-zA-Z0-9_\-]/.test(shareId)) {
      return json({ error: 'Invalid share ID' }, 400);
    }

    try {
      const shareDir  = path.join(ROOT, 'artifacts', 'share');
      const sharePath = path.join(shareDir, `${shareId}.json`);
      // Guard: resolved path must stay inside the share directory
      if (!sharePath.startsWith(shareDir + path.sep)) {
        return json({ error: 'Invalid share ID' }, 400);
      }
      const shareData = JSON.parse(fs.readFileSync(sharePath, 'utf8'));

      if (action === 'context') {
        return json(shareData.context);
      } else if (action === 'history') {
        return json({
          shareId,
          created: new Date().toISOString(),
          events: [{
            timestamp: new Date().toISOString(),
            action: "created",
            agent: "bridgeos.operator.v3"
          }]
        });
      } else if (action === 'metadata') {
        const { context, ...metadata } = shareData;
        // Remove base64 image data from context if present
        const cleanContext = { ...context };
        delete cleanContext.imageBase64;
        return json({ ...metadata, context: cleanContext });
      }
    } catch (error) {
      return json({ error: "Share not found" }, 404);
    }
  }

  fs.readFile(HTML, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('topology.html not found'); }
    res.writeHead(200, {
      'Content-Type':            'text/html',
      'Cache-Control':           'no-store',
      // Permissive CSP — allows CDN scripts/styles/fonts + localhost WS
      'Content-Security-Policy': [
        "default-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data:",
        "script-src  'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
        "style-src   'self' 'unsafe-inline' https://cdn.jsdelivr.net",
        "font-src    'self' data: https://cdn.jsdelivr.net",
        "connect-src 'self' ws: wss: http://localhost:* http://127.0.0.1:* https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
        "img-src     'self' data: blob:",
        "worker-src  blob:",
      ].join('; '),
    });
    res.end(buf);
  });
}

// ─── Server + boot ────────────────────────────────────────────────────────────
function createServer() {
  if (!IS_HTTPS) return http.createServer(handler);
  const cp = path.join(CERTS,'cert.pem'), kp = path.join(CERTS,'key.pem');
  if (!fs.existsSync(cp) || !fs.existsSync(kp)) {
    log('WARN','SERVER','HTTPS requested but certs missing — falling back to HTTP');
    return http.createServer(handler);
  }
  return https.createServer({ cert:fs.readFileSync(cp), key:fs.readFileSync(kp) }, handler);
}

// ─── Port auto-resolution (finds next free port if preferred is busy) ─────────
const net = require('net');

function findFreePort(startPort) {
  return new Promise(resolve => {
    const probe = net.createServer();
    probe.unref();
    probe.listen(startPort, () => {
      probe.close(() => resolve(startPort));
    });
    probe.on('error', () => resolve(findFreePort(startPort + 1)));
  });
}

const server = createServer();

function onListening() {
  const LIVE_PORT = server.address().port;   // actual bound port (may differ from PORT)
  const line = '  ─────────────────────────────────────────────';
  console.log('\n  ⚡  GOD MODE — UNIFIED SYSTEM v3');
  console.log(line);
  console.log(`  ENV      →  ${NODE_ENV.toUpperCase()}`);
  console.log(`  PORT     →  ${LIVE_PORT}  (${PROTOCOL.toUpperCase()})`);
  console.log(`  UI       →  ${PROTOCOL}://localhost:${LIVE_PORT}`);
  console.log(`  API/FULL →  ${PROTOCOL}://localhost:${LIVE_PORT}/api/full`);
  console.log(`  HEALTH   →  ${PROTOCOL}://localhost:${LIVE_PORT}/health`);
  console.log(`  TERMINAL →  ws://localhost:${LIVE_PORT}/terminal`);
  console.log(line);
  if (!IS_PROD) {
    fs.watch(path.join(ROOT,'public'), { recursive:true }, (e,f) => f && log('INFO','WATCH',`${e}: public/${f}`));
    console.log('  WATCH    →  ON  (public/)');
  }
  console.log('  LOGS     →  ' + LOG_FILE);
  console.log('  REFRESH  →  5s\n');
  log('OK','SERVER',`Listening on ${PROTOCOL}://localhost:${PORT}`);
  // Boot orchestrator after server is ready
  setTimeout(() => orchestrator.boot(), 500);
}

server.on('error', err => {
  log('ERROR','SERVER', err.message);
  console.error(`\n  ✗  Server error: ${err.message}\n`);
  process.exit(1);
});

// ─── Orchestrator stub (agents/swarms/skills — always defined) ───────────────
const orchestrator = {
  agents: [
    { id:'monitor-agent',  role:'observer',   autoStart: true  },
    { id:'deploy-agent',   role:'executor',   autoStart: false },
    { id:'security-agent', role:'guardian',   autoStart: true  },
    { id:'scan-agent',     role:'scanner',    autoStart: true  },
    { id:'data-agent',     role:'analyst',    autoStart: false },
  ],
  swarms: [
    { id:'cluster-alpha', members:['monitor-agent','scan-agent']           },
    { id:'cluster-beta',  members:['deploy-agent','security-agent','data-agent'] },
  ],
  states: new Map(),
  boot() {
    this.agents.filter(a => a.autoStart).forEach(a => {
      this.states.set(a.id, { status:'running', startedAt: Date.now() });
      log('OK','ORCH',`Agent ${a.id} (${a.role}) started`);
    });
    log('OK','ORCH',`Orchestrator ready — ${this.agents.length} agents, ${this.swarms.length} swarms`);
  },
  status() {
    return this.agents.map(a => ({
      ...a,
      state: this.states.get(a.id) || { status:'idle' },
    }));
  },
};

// Async boot via findFreePort
(async () => {
  const bindPort = await findFreePort(PORT);
  if (bindPort !== PORT) {
    log('WARN','SERVER',`Port ${PORT} in use — binding to ${bindPort} instead`);
    console.log(`\n  ⚠  Port ${PORT} busy → using port ${bindPort}`);
  }
  server.listen(bindPort, onListening);
})();

process.on('SIGTERM', () => { log('INFO','SERVER','SIGTERM — shutting down'); server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 8000); });
process.on('SIGINT',  () => { log('INFO','SERVER','SIGINT — shutting down');  server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 8000); });
process.on('uncaughtException',  err    => log('ERROR','SERVER', err.message));
process.on('unhandledRejection', reason => log('ERROR','SERVER', String(reason)));

// ═══════════════════════════════════════════════════════════════════════════════
//  TERMINAL ENGINE  —  WebSocket + PTY multi-session
//  ws://localhost:PORT  (same port, upgraded connection)
//  Protocol (JSON frames):
//    C→S  {type:'create',  sessionId, cols, rows}
//    S→C  {type:'ready',   sessionId}
//    C→S  {type:'input',   sessionId, data}
//    S→C  {type:'output',  sessionId, data}
//    C→S  {type:'resize',  sessionId, cols, rows}
//    C→S  {type:'kill',    sessionId}
//    S→C  {type:'exit',    sessionId, code}
//    S→C  {type:'error',   sessionId, message}
// ═══════════════════════════════════════════════════════════════════════════════

let pty, WebSocketLib;

try { pty           = require('node-pty');  log('OK',  'PTY',  'node-pty loaded'); }
catch { log('WARN','PTY',  'node-pty unavailable — exec fallback active'); }

try { WebSocketLib  = require('ws');        log('OK',  'WS',   'ws loaded'); }
catch { log('WARN','WS',   'ws not installed — terminals disabled'); }

// Per-connection session map
const activeSessions = new Map();   // sessionId → ptyProcess

const SHELL = PLATFORM === 'win32' ? 'powershell.exe' : 'bash';
const SHELL_ARGS = PLATFORM === 'win32' ? [] : ['--login'];

// Audit log for every command entered
function auditCommand(sessionId, data) {
  const lines = data.replace(/\r/g,'\n').split('\n').map(s=>s.trim()).filter(Boolean);
  lines.forEach(cmd => {
    if (cmd) log('INFO','TERMINAL', `[${sessionId}] ${cmd}`);
  });
}

// Create a real PTY session
function spawnPTY(sessionId, cols, rows) {
  const proc = pty.spawn(SHELL, SHELL_ARGS, {
    name:  'xterm-256color',
    cols:  cols  || 120,
    rows:  rows  || 30,
    cwd:   ROOT,
    env:   { ...process.env, TERM:'xterm-256color' },
  });
  activeSessions.set(sessionId, { proc, type:'pty' });
  log('OK','PTY',`Session ${sessionId} created (${SHELL}, ${cols}×${rows})`);
  return proc;
}

// Fallback: exec-based pseudo-terminal (no color/cursor but functional)
function spawnExec(sessionId) {
  const { spawn } = require('child_process');
  const proc = spawn(SHELL, SHELL_ARGS, {
    stdio: ['pipe','pipe','pipe'],
    cwd:   ROOT,
    env:   { ...process.env, TERM:'dumb' },
    shell: false,
  });
  activeSessions.set(sessionId, { proc, type:'exec' });
  log('OK','PTY',`Session ${sessionId} created via exec fallback`);
  return proc;
}

function killSession(sessionId) {
  const s = activeSessions.get(sessionId);
  if (!s) return;
  try { s.proc.kill(); } catch {}
  activeSessions.delete(sessionId);
  log('INFO','PTY',`Session ${sessionId} killed`);
}

// ─── RBAC ─────────────────────────────────────────────────────────────────
const ROLES = {
  admin:    ['*'],
  operator: ['read', 'exec', 'monitor'],
  viewer:   ['read'],
};
const USERS = {
  root:  { role: 'admin' },
  ops:   { role: 'operator' },
  guest: { role: 'viewer' },
};
function authorize(user, action) {
  const role = (USERS[user] || {}).role;
  if (!role) return false;
  return ROLES[role].includes('*') || ROLES[role].includes(action);
}

// ─── Audit file (command + action history) ───────────────────────────────
const AUDIT_FILE = path.join(LOG_DIR, 'audit.log');
function auditEntry(entry) {
  const line = `[${new Date().toISOString()}] ${JSON.stringify(entry)}\n`;
  fs.appendFile(AUDIT_FILE, line, () => {});
  log('INFO', 'AUDIT', JSON.stringify(entry));
}

// ─── Node-routing map (topology node → working directory) ────────────────
const NODE_ROUTING = {
  bridgeos:     { cwd: PLATFORM === 'win32' ? 'C:\\bridgeos' : '/c/bridgeos' },
  BRIDGE_AI_OS: { cwd: PLATFORM === 'win32' ? 'C:\\BRIDGE_AI_OS' : '/c/BRIDGE_AI_OS' },
  BRIDGE_PY:    { cwd: PLATFORM === 'win32' ? 'D:\\BRIDGE'    : '/d/BRIDGE' },
  IdentityVault:{ cwd: PLATFORM === 'win32' ? 'E:\\IdentityVault' : '/e/IdentityVault' },
  BridgeAudit:  { cwd: PLATFORM === 'win32' ? 'E:\\BridgeAudit'   : '/e/BridgeAudit' },
};

function spawnNodePTY(sessionId, nodeId, cols, rows) {
  const cfg = NODE_ROUTING[nodeId] || {};
  const cwd = (cfg.cwd && fs.existsSync(cfg.cwd)) ? cfg.cwd : ROOT;
  if (pty) {
    const proc = pty.spawn(SHELL, SHELL_ARGS, {
      name: 'xterm-256color', cols: cols||120, rows: rows||30,
      cwd, env: { ...process.env, TERM:'xterm-256color', NODE_ID: nodeId },
    });
    activeSessions.set(sessionId, { proc, type:'pty', nodeId });
    log('OK','PTY',`Node session ${sessionId} → ${nodeId} (cwd:${cwd})`);
    return { ok: true, proc };
  }
  return { ok: false };
}

// ─── System metrics ───────────────────────────────────────────────────────
function collectMetrics() {
  const cpuLoad = os.loadavg()[0];
  const memUsed = process.memoryUsage().heapUsed;
  const memTotal = os.totalmem();
  return {
    cpu:    Math.round(cpuLoad * 100),
    mem:    Math.round((memUsed / memTotal) * 100),
    memMB:  Math.round(memUsed / 1024 / 1024),
    uptime: Math.round(process.uptime()),
    load:   os.loadavg(),
  };
}

// ─── Cognitive AI Brain (reactive + predictive + strategic) ──────────────
const Brain = {
  history: [],
  ingest(m) {
    this.history.push({ t: Date.now(), metrics: m });
    if (this.history.length > 500) this.history.shift();
  },
  predict() {
    const r = this.history.slice(-20);
    if (r.length < 5) return null;
    const avgCpu = r.reduce((a,b) => a + b.metrics.cpu, 0) / r.length;
    const trend  = r[r.length-1].metrics.cpu - r[0].metrics.cpu;
    return { cpuTrend: trend, risk: avgCpu > 75 ? 'HIGH' : avgCpu > 50 ? 'MEDIUM' : 'LOW' };
  },
  decide(m) {
    const actions = [];
    const pred = this.predict();
    // Reactive
    if (m.cpu > 85) actions.push('scale_immediate');
    if (m.mem > 85) actions.push('memory_cleanup');
    // Predictive
    if (pred) {
      if (pred.cpuTrend > 10) actions.push('pre_scale');
      if (pred.risk === 'HIGH') actions.push('load_balance');
    }
    // Strategic (under-utilised — cost save)
    if (m.cpu < 20 && m.mem < 20 && this.history.length > 30) actions.push('cost_downscale');
    return actions;
  },
  plan(action) {
    const win = PLATFORM === 'win32';
    return {
      scale_immediate: win ? 'pm2 restart all' : 'docker-compose up --scale app=3',
      pre_scale:       win ? 'pm2 restart all' : 'docker-compose up --scale app=2',
      load_balance:    win ? 'ipconfig /flushdns' : 'nginx -s reload',
      memory_cleanup:  'pm2 restart all',
      cost_downscale:  null,  // do nothing destructive automatically
    }[action] || null;
  },
};

// ─── Agent Swarm (server-side) ───────────────────────────────────────────
const AgentSwarm = {
  agents: [
    { id:'agent_monitor',   role:'observer'   },
    { id:'agent_healer',    role:'executor'   },
    { id:'agent_optimizer', role:'strategist' },
  ],
  selectAgent(action) {
    if (action.includes('scale')) return 'agent_optimizer';
    if (action.includes('cleanup') || action.includes('restart')) return 'agent_healer';
    return 'agent_monitor';
  },
  execute(actions) {
    actions.forEach(action => {
      const cmd = Brain.plan(action);
      if (!cmd) return;
      const agent = this.selectAgent(action);
      auditEntry({ ai: true, action, cmd, agent });
      try { execSync(cmd, { timeout: 10000, stdio: 'ignore' }); log('OK','AI',`[${agent}] ${action} → ${cmd}`); }
      catch (e) { log('WARN','AI',`[${agent}] ${action} failed — ${e.message}`); }
    });
  },
};

// ─── Financial Intelligence ───────────────────────────────────────────────
const Finance = {
  ledger:  [],
  balance: 0,
  recordRevenue(amount, source) {
    this.balance += amount;
    this.ledger.push({ type:'revenue', amount, source, t: Date.now() });
    auditEntry({ finance: true, type:'revenue', amount, source });
  },
  recordCost(amount, service) {
    this.balance -= amount;
    this.ledger.push({ type:'cost', amount, service, t: Date.now() });
    auditEntry({ finance: true, type:'cost', amount, service });
  },
  report() {
    return {
      balance:  this.balance,
      revenues: this.ledger.filter(x => x.type === 'revenue').length,
      costs:    this.ledger.filter(x => x.type === 'cost').length,
      ledger:   this.ledger.slice(-50),
    };
  },
};

// ─── Predictive Failure Model ─────────────────────────────────────────────
const FailureModel = {
  evaluate(history) {
    if (history.length < 10) return 'LOW';
    const spikes = history.filter(h => h.metrics.cpu > 85).length;
    if (spikes > 5) return 'CRITICAL';
    if (spikes > 2) return 'WARNING';
    return 'STABLE';
  },
};

// ─── Autonomous loop (Brain-driven, every 15s) ────────────────────────────
setInterval(() => {
  const m = collectMetrics();
  Brain.ingest(m);
  const actions  = Brain.decide(m);
  const riskLevel = FailureModel.evaluate(Brain.history);
  if (actions.length > 0) log('INFO','AI',`Risk:${riskLevel} actions:[${actions.join(',')}]`);
  AgentSwarm.execute(actions);
}, 15000).unref();

// ─── Cross-platform economics aggregator ─────────────────────────────────
function aggregateEconomics() {
  const result = {
    ts: Date.now(),
    platforms: [],
    totals: { usd_monthly: 0, usd_yearly: 0, zar_invoice: 0, leads: 0, clicks: 0 },
  };

  // ── 1. BridgeAI Node — SaaS subscription plans ──────────────────────────
  result.platforms.push({
    id:       'bridgeai-node',
    name:     'BridgeAI Node (ainode)',
    type:     'saas',
    currency: 'USD',
    location: 'C:/BridgeAI/ainode',
    plans: [
      { name:'Free',       price_monthly:0,   price_yearly:0,     api_limit:100,    token_limit:10000   },
      { name:'Starter',    price_monthly:29,  price_yearly:290,   api_limit:10000,  token_limit:100000  },
      { name:'Pro',        price_monthly:99,  price_yearly:990,   api_limit:100000, token_limit:1000000 },
      { name:'Enterprise', price_monthly:499, price_yearly:4990,  api_limit:null,   token_limit:null    },
    ],
    mrr_potential: 29 + 99 + 499,   // one of each paid plan
    arr_potential: 290 + 990 + 4990,
    status: 'configured',
  });
  result.totals.usd_monthly += 627;   // 29+99+499
  result.totals.usd_yearly  += 6270;

  // ── 2. BRIDGE Invoice Engine — ZAR event services ────────────────────────
  const invoiceLines = [
    { description:'Festival Access Control (per attendee)', qty:12500, unit_zar:12,    total_zar:150000 },
    { description:'Remote Operations & Monitoring (2 wks)', qty:1,     unit_zar:85000, total_zar:85000  },
    { description:'Staff Coordination & Ledger Tracking',   qty:1,     unit_zar:45000, total_zar:45000  },
  ];
  const invoiceSub = invoiceLines.reduce((a,l) => a + l.total_zar, 0);
  const invoiceVAT = Math.round(invoiceSub * 0.15 * 100) / 100;
  result.platforms.push({
    id:        'bridge-invoice',
    name:      'BRIDGE Invoice Engine',
    type:      'professional-services',
    currency:  'ZAR',
    location:  'D:/BRIDGE',
    vat_rate:  '15%',
    line_items: invoiceLines,
    subtotal_zar: invoiceSub,
    vat_zar:    invoiceVAT,
    total_zar:  invoiceSub + invoiceVAT,
    status:    'demo-invoice',
  });
  result.totals.zar_invoice += invoiceSub + invoiceVAT;

  // ── 3. VPS Referral — ai-os.co.za lead funnel ────────────────────────────
  let referralStats = { users: 0, leads: 0, clicks: 0, db_size_kb: 0 };
  const refDbPath = path.join(ROOT, '..', 'vps-referral', 'referrals.db');
  try {
    if (fs.existsSync(refDbPath)) {
      const sz = fs.statSync(refDbPath).size;
      referralStats.db_size_kb = Math.round(sz / 1024);
    }
  } catch {}
  // Try to read via HTTP probe (if referral server is running)
  result.platforms.push({
    id:       'vps-referral',
    name:     'VPS Referral Funnel (ai-os.co.za)',
    type:     'referral',
    currency: 'N/A',
    location: 'C:/bridgeos/vps-referral',
    base_url: 'https://go.ai-os.co.za',
    stats:    referralStats,
    status:   'deployed',
  });

  // ── 4. Settlement Layer — USDC/USDT ──────────────────────────────────────
  result.platforms.push({
    id:       'settlement',
    name:     'Settlement Layer (USDC/USDT)',
    type:     'settlement',
    currency: 'USDC',
    location: 'C:/bridge-state-authority',
    model:    'Verified Revenue Certificate (VRC)',
    mechanism:'SHA-256 hash + Ed25519 signature → USDC payout',
    flows:    ['Pay-per-Verification','Notarized State Token','Revenue Event Backing'],
    status:   'protocol-defined',
  });

  // ── 5. BridgeOS User DB ────────────────────────────────────────────────────
  let dbStats = { tables: [], total_users: 0, size_kb: 0 };
  try {
    const dbPath = path.join(ROOT, '..', 'bridgeos.db');
    if (fs.existsSync(dbPath)) {
      dbStats.size_kb = Math.round(fs.statSync(dbPath).size / 1024);
      dbStats.tables  = ['users (id,name,email,bio,interests,referral,profile_type)'];
    }
  } catch {}
  result.platforms.push({
    id:       'bridgeos-db',
    name:     'BridgeOS User DB',
    type:     'database',
    currency: 'N/A',
    location: 'C:/bridgeos/bridgeos.db',
    schema:   dbStats,
    status:   'active',
  });

  log('OK','ECON', `Economics aggregated — ${result.platforms.length} platforms, R${result.totals.zar_invoice} ZAR invoice, $${result.totals.usd_monthly}/mo SaaS potential`);
  return result;
}

// ─── Revenue flow tracker (in-memory) ────────────────────────────────────
const revenueFlow = { transactions: [] };
function recordTransaction(tx) {
  revenueFlow.transactions.push({ ...tx, ts: Date.now() });
  if (revenueFlow.transactions.length > 500) revenueFlow.transactions.shift();
  auditEntry({ type:'transaction', tx });
}

// Wire up WebSocket server
if (WebSocketLib) {
  const wss = new WebSocketLib.Server({ server, path: '/terminal' });
  log('OK','WS',`WebSocket terminal endpoint ready at ws://localhost:${PORT}/terminal`);
  console.log(`  TERMINAL →  ws://localhost:${PORT}/terminal  (${activeSessions.size} sessions)\n`);

  wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    log('INFO','WS',`Client connected from ${clientIp}`);
    let wsUser = 'guest'; // unauthenticated until auth message received

    function send(obj) {
      if (ws.readyState === WebSocketLib.OPEN) ws.send(JSON.stringify(obj));
    }

    ws.on('message', raw => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      const { type } = msg;
      // Accept both 'id' (new protocol) and 'sessionId' (legacy)
      const sessionId = msg.id || msg.sessionId;

      switch (type) {

        case 'auth': {
          // Support both token-based and user-based auth
          if (msg.token) {
            // JWT token verification
            try {
              const jwt = require('jsonwebtoken');
              if (!JWT_SECRET) { send({ type:'auth_fail', error: 'Server misconfigured: JWT_SECRET not set' }); break; }
              const decoded = jwt.verify(msg.token, JWT_SECRET);
              wsUser = decoded.user || decoded.sub || 'token-user';
              send({ type:'auth_ok', user: wsUser, role: decoded.role || 'operator', method: 'token' });
              log('INFO','AUTH',`Token auth success for ${wsUser}`);
            } catch (e) {
              send({ type:'auth_fail', error: 'Invalid token' });
              log('WARN','AUTH',`Token auth failed: ${e.message}`);
            }
          } else if (msg.user && USERS[msg.user]) {
            // Legacy user-based auth (deprecated - only works locally)
            wsUser = msg.user;
            send({ type:'auth_ok', user: wsUser, role: USERS[wsUser].role, method: 'legacy' });
            log('INFO','AUTH',`Legacy auth for ${wsUser} (deprecated)`);
          } else {
            send({ type:'auth_fail', error: 'Authentication required' });
          }
          break;
        }

        case 'monitor': {
          if (!authorize(wsUser, 'monitor')) { send({ type:'error', message:'forbidden' }); return; }
          send({ type:'monitor', stats: collectMetrics() });
          break;
        }

        case 'create_node': {
          if (wsUser === 'guest') { send({ type:'error', message:'Authenticate first' }); return; }
          if (!authorize(wsUser, 'exec')) { send({ type:'error', message:'forbidden' }); return; }
          const nodeId = msg.node || 'HOST';
          const cols = parseInt(msg.cols)||120, rows = parseInt(msg.rows)||30;
          const { ok, proc } = spawnNodePTY(sessionId || ('node-'+nodeId+'-'+Date.now()), nodeId, cols, rows);
          const sid = sessionId || ('node-'+nodeId+'-'+Date.now());
          auditEntry({ user:wsUser, action:'create_node', node:nodeId });
          if (ok) {
            proc.onData(d => send({ type:'output', id:sid, data:d }));
            proc.onExit(({ exitCode }) => { send({ type:'exit', id:sid, code:exitCode }); activeSessions.delete(sid); });
          }
          send({ type:'created', id:sid });
          break;
        }

        case 'create': {
          if (wsUser === 'guest') { send({ type:'error', message:'Authenticate first' }); return; }
          if (!authorize(wsUser, 'exec')) { send({ type:'error', message:'forbidden' }); return; }
          const cols = parseInt(msg.cols) || 120;
          const rows = parseInt(msg.rows) || 30;
          if (activeSessions.has(sessionId)) killSession(sessionId);

          if (pty) {
            const proc = spawnPTY(sessionId, cols, rows);
            proc.onData(data => send({ type:'output', sessionId, data }));
            proc.onExit(({ exitCode }) => {
              send({ type:'exit', sessionId, code: exitCode });
              activeSessions.delete(sessionId);
              log('INFO','PTY',`Session ${sessionId} exited (code ${exitCode})`);
            });
          } else {
            const proc = spawnExec(sessionId);
            const push = d => send({ type:'output', sessionId, data: d.toString() });
            proc.stdout.on('data', push);
            proc.stderr.on('data', push);
            proc.on('exit', code => {
              send({ type:'exit', sessionId, code });
              activeSessions.delete(sessionId);
            });
          }
          send({ type:'ready', sessionId });
          send({ type:'created', id: sessionId }); // new protocol alias
          break;
        }

        case 'exec': {
          // Automation hook — write cmd + newline to the named session
          const s = activeSessions.get(sessionId);
          if (!s) return;
          const cmd = (msg.cmd || '') + '\r';
          auditCommand(sessionId, cmd);
          try { s.proc.write(cmd); } catch (e) { send({ type:'error', sessionId, message: e.message }); }
          break;
        }

        case 'input': {
          if (wsUser === 'guest') { send({ type:'error', message:'Authenticate first' }); return; }
          const s = activeSessions.get(sessionId);
          if (!s) return;
          auditCommand(sessionId, msg.data || '');
          try { s.proc.write(msg.data); } catch (e) { send({ type:'error', sessionId, message: e.message }); }
          break;
        }

        case 'resize': {
          const s = activeSessions.get(sessionId);
          if (!s) return;
          const c = parseInt(msg.cols)||80, r = parseInt(msg.rows)||24;
          try {
            if (s.type === 'pty') s.proc.resize(c, r);
          } catch {}
          break;
        }

        case 'kill': {
          killSession(sessionId);
          send({ type:'exit', sessionId, code: 0 });
          break;
        }
      }
    });

    ws.on('close', () => {
      // Clean up all sessions from this connection
      log('INFO','WS',`Client ${clientIp} disconnected`);
    });

    ws.on('error', err => log('ERROR','WS', err.message));
  });
}
