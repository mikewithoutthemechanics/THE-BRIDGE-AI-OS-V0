require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const sqlite3 = require("better-sqlite3");
const axios = require("axios");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const path = require("path");
const { Pool } = require('pg');

const economyDb = new Pool({
  connectionString: process.env.ECONOMY_DB_URL || 'postgresql://postgres:password@localhost:5432/bridgeai_economy'
});

const app = express();
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname)));
app.use(express.static(path.join(__dirname, "public")));

// Rate limiting
const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60000);
const maxReq = Number(process.env.RATE_LIMIT_MAX || 1000);
app.use(rateLimit({ windowMs, max: maxReq, standardHeaders: true, legacyHeaders: false }));
app.use("/payfast/notify", rateLimit({ windowMs, max: Math.min(maxReq, 30), standardHeaders: true, legacyHeaders: false }));

// IP allowlist helpers
function getClientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length) return xf.split(",")[0].trim();
  return req.socket?.remoteAddress || "";
}

function ipAllowlisted(ip) {
  const enabled = String(process.env.PAYFAST_ENABLE_IP_ALLOWLIST || "false").toLowerCase() === "true";
  if (!enabled) return true;

  const raw = String(process.env.PAYFAST_IP_ALLOWLIST || "").trim();
  if (!raw) return false;

  const allowed = raw.split(",").map(s => s.trim()).filter(Boolean);
  return allowed.includes(ip);
}

// PayFast server validation
async function validateWithPayfastServer(originalBody) {
  const url = process.env.PAYFAST_VALIDATE_URL || "https://www.payfast.co.za/eng/query/validate";
  const payload = new URLSearchParams(originalBody).toString();

  const resp = await axios.post(url, payload, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 10000,
    validateStatus: () => true
  });

  const text = typeof resp.data === "string" ? resp.data.trim().toUpperCase() : "";
  return { ok: resp.status >= 200 && resp.status < 300 && text.includes("VALID"), status: resp.status, text };
}

// Generate PayFast signature
function generateSignature(unsigned, passphrase) {
  let pfOutput = "";
  for (const key of Object.keys(unsigned)) {
    if (key !== "signature" && unsigned[key] !== undefined && unsigned[key] !== "") {
      pfOutput += `${key}=${String(unsigned[key]).trim()}&`;
    }
  }
  pfOutput += `passphrase=${String(passphrase).trim()}`;
  return crypto.createHash("md5").update(pfOutput).digest("hex");
}

// ================= DATABASE =================
const db = new sqlite3("./users.db");
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  phone TEXT,
  service TEXT,
  status TEXT
)`);

db.exec(`CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client TEXT,
  amount REAL,
  status TEXT,
  reference TEXT UNIQUE,
  pf_payment_id TEXT
)`);

// ================= CONFIG =================
const CONFIG = {
  business: "Empeleni Health Services Africa (PTY) LTD",
  payfast_merchant_id: process.env.PAYFAST_MERCHANT_ID,
  payfast_merchant_key: process.env.PAYFAST_MERCHANT_KEY,
  passphrase: process.env.PAYFAST_PASSPHRASE,
  notify_url: process.env.PAYFAST_NOTIFY_URL,
  return_url: process.env.PAYFAST_RETURN_URL,
  cancel_url: process.env.PAYFAST_CANCEL_URL
};

// ================= CLIENT CAPTURE =================
app.post("/lead", (req, res) => {
  const { name, phone, service } = req.body;

  const insertClient = db.prepare("INSERT INTO clients(name, phone, service, status) VALUES(?,?,?,?)");
  insertClient.run(name, phone, service, "new");

  res.json({ status: "lead captured" });
});

// ================= AI SALES AUTO CLOSE =================
app.post("/auto-close", (req, res) => {
  const selectNewClients = db.prepare("SELECT * FROM clients WHERE status='new'");
  const rows = selectNewClients.all();

  const updateClient = db.prepare("UPDATE clients SET status='closed' WHERE id=?");
  rows.forEach(client => {
    updateClient.run(client.id);
  });

  res.json({ status: "deals closed", count: rows.length });
});

// ================= PAYFAST PAYMENT =================
app.post("/create-payment", (req, res) => {
  const { client, amount } = req.body;

  const reference = `REF_${Date.now()}`;

  const paymentData = {
    merchant_id: CONFIG.payfast_merchant_id,
    merchant_key: CONFIG.payfast_merchant_key,
    return_url: CONFIG.return_url,
    cancel_url: CONFIG.cancel_url,
    notify_url: CONFIG.notify_url,
    name_first: client,
    amount: amount,
    item_name: "Health Service",
    m_payment_id: reference
  };

  const signature = generateSignature(paymentData, CONFIG.passphrase);
  paymentData.signature = signature;

  const insertPayment = db.prepare("INSERT INTO payments(client, amount, status, reference) VALUES(?,?,?,?)");
  insertPayment.run(client, amount, "pending", reference);

  const query = new URLSearchParams(paymentData).toString();

  res.json({
    payment_url: "https://www.payfast.co.za/eng/process?" + query
  });
});

// ================= PAYFAST CALLBACK =================
app.post("/payfast/notify", async (req, res) => {
  const body = req.body || {};

  // IP allowlist
  const ip = getClientIp(req);
  if (!ipAllowlisted(ip)) return res.sendStatus(403);

  // Signature verification
  const receivedSig = String(body.signature || "").trim().toLowerCase();
  const unsigned = { ...body };
  delete unsigned.signature;

  const computedSig = generateSignature(unsigned, CONFIG.passphrase);
  if (!receivedSig || receivedSig !== computedSig) return res.sendStatus(400);

  // Merchant binding
  if (String(unsigned.merchant_id || "").trim() !== String(CONFIG.payfast_merchant_id || "").trim()) return res.sendStatus(400);

  // PayFast server validation
  const validation = await validateWithPayfastServer(body);
  if (!validation.ok) return res.sendStatus(400);

  const reference = String(unsigned.m_payment_id || "").trim();
  const status = String(unsigned.payment_status || "").toUpperCase();
  const pfId = String(unsigned.pf_payment_id || "").trim() || null;

  if (!reference) return res.sendStatus(400);
  if (status !== "COMPLETE") return res.sendStatus(200);

  const gross = parseFloat(unsigned.amount_gross || "0");
  if (isNaN(gross) || gross <= 0) return res.sendStatus(400);

  const selectPayment = db.prepare("SELECT * FROM payments WHERE reference=?");
  const payment = selectPayment.get(reference);
  if (!payment) return res.sendStatus(404);

  const expected = parseFloat(payment.amount || "0");
  if (isNaN(expected) || expected !== gross) return res.sendStatus(400);
  if (payment.status === "paid") return res.sendStatus(200);

  const updatePayment = db.prepare("UPDATE payments SET status='paid', pf_payment_id=? WHERE reference=?");
  updatePayment.run(pfId, reference);

  // === BridgeAI Economy: record payment and split revenue ===
  try {
    const paymentRec = await economyDb.query(
      'INSERT INTO payments_received (provider, payment_id, amount, currency, payer_email, item_name, raw_payload) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      ['payfast', pfId, gross, 'ZAR', String(unsigned.email_address || ''), String(unsigned.item_name || ''), JSON.stringify(unsigned)]
    );

    const splits = [
      { bucket: 'ubi', pct: 40 },
      { bucket: 'treasury', pct: 30 },
      { bucket: 'ops', pct: 20 },
      { bucket: 'founder', pct: 10 }
    ];
    for (const s of splits) {
      const splitAmount = (gross * s.pct / 100).toFixed(2);
      await economyDb.query(
        'INSERT INTO revenue_splits (payment_id, bucket, amount, percentage) VALUES ($1, $2, $3, $4)',
        [paymentRec.rows[0].id, s.bucket, splitAmount, s.pct]
      );
      await economyDb.query(
        'UPDATE treasury_buckets SET balance = balance + $1, updated_at = NOW() WHERE name = $2',
        [splitAmount, s.bucket]
      );
    }

    // Ledger entry
    await economyDb.query(
      'INSERT INTO treasury_ledger (type, source, amount, currency, bucket, reference, metadata) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      ['income', 'payfast', gross, 'ZAR', 'all', reference, JSON.stringify({ pf_payment_id: pfId, splits: splits.map(s => ({ ...s, amount: (gross * s.pct / 100).toFixed(2) })) })]
    );
  } catch (econErr) {
    console.error('[economy] Failed to record payment split:', econErr.message);
  }

  res.sendStatus(200);
});

// ================= PAYMENT SUCCESS / CANCEL PAGES =================
app.get("/payment/success", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Payment Successful</title>
<style>
  body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f0fdf4}
  .card{background:#fff;border-radius:12px;padding:3rem;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08);max-width:440px}
  .icon{font-size:4rem;margin-bottom:1rem}
  h1{color:#166534;margin:0 0 .5rem}
  p{color:#4b5563;line-height:1.6}
  a{display:inline-block;margin-top:1.5rem;padding:.75rem 2rem;background:#166534;color:#fff;border-radius:8px;text-decoration:none}
</style></head><body>
<div class="card">
  <div class="icon">&#10003;</div>
  <h1>Payment Successful</h1>
  <p>Thank you! Your payment to <strong>Empeleni Health Services Africa</strong> has been received. You will receive confirmation shortly.</p>
  <a href="/">Return Home</a>
</div>
</body></html>`);
});

app.get("/payment/cancel", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Payment Cancelled</title>
<style>
  body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#fef2f2}
  .card{background:#fff;border-radius:12px;padding:3rem;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08);max-width:440px}
  .icon{font-size:4rem;margin-bottom:1rem}
  h1{color:#991b1b;margin:0 0 .5rem}
  p{color:#4b5563;line-height:1.6}
  a{display:inline-block;margin-top:1.5rem;padding:.75rem 2rem;background:#991b1b;color:#fff;border-radius:8px;text-decoration:none}
</style></head><body>
<div class="card">
  <div class="icon">&#10007;</div>
  <h1>Payment Cancelled</h1>
  <p>Your payment was not completed. If this was a mistake, you can try again or contact us for assistance.</p>
  <a href="/">Return Home</a>
</div>
</body></html>`);
});

// ================= WHATSAPP BOT (WEBHOOK READY) =================
app.post("/whatsapp", (req, res) => {
  const message = req.body.message;
  const from = req.body.from;

  if (message.includes("price")) {
    return res.json({
      reply: "Our services start from R1000. Reply YES to proceed."
    });
  }

  if (message === "YES") {
    const insertClient = db.prepare("INSERT INTO clients(name, phone, service, status) VALUES(?,?,?,?)");
    insertClient.run(from, from, "Health Service", "closed");

    return res.json({
      reply: "Booking confirmed. Payment link coming..."
    });
  }

  res.json({ reply: "Welcome to Empeleni Health Services." });
});

// ================= SYSTEM HEALTH ENDPOINTS =================
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/ui.html");
});

app.get("/health", (req, res) => {
  res.json({ status: "OK", core: "reachable" });
});

app.get("/api/agents", (req, res) => {
  res.json({ layers: { L1: { count: 0 }, L2: { count: 0 } } });
});

app.get("/api/contracts", (req, res) => {
  res.json({ count: 0 });
});

app.get("/api/status", (req, res) => {
  res.json({ services: [], overall: "up" });
});

app.get("/api/full", (req, res) => {
  res.json({ status: "operational" });
});

app.get("/api/economics", (req, res) => {
  res.json({ metrics: {} });
});

app.get("/skills/definitions", (req, res) => {
  res.json({
    count: 0,
    skills: []
  });
});

app.get("/api/logs", (req, res) => {
  const logs = [
    "[INFO] System initialized",
    "[INFO] Bridge AI OS Gateway OK",
    "[INFO] Network topology loaded",
    "[INFO] Agent layers active: L1=0, L2=0",
    "[INFO] Marketplace operational",
    "[INFO] Avatar engine ready",
    "[INFO] Terminal proxy active",
    "[INFO] Control panel online"
  ].join('\n');
  res.type('text/plain').send(logs);
});

// ================= UNIVERSAL SHARE ENDPOINTS =================

// GET /share/:id/context - Returns just the context bundle for agents
app.get("/share/:id/context", (req, res) => {
  const shareId = req.params.id;

  try {
    const shareData = require(`./artifacts/share/${shareId}.json`);
    res.json(shareData.context);
  } catch (error) {
    res.status(404).json({ error: "Share not found" });
  }
});

// GET /share/:id/history - Returns timeline/audit trail (placeholder for now)
app.get("/share/:id/history", (req, res) => {
  const shareId = req.params.id;

  // For now, return basic history structure
  res.json({
    shareId,
    created: new Date().toISOString(),
    events: [
      {
        timestamp: new Date().toISOString(),
        action: "created",
        agent: "bridgeos.operator.v3"
      }
    ]
  });
});

// GET /share/:id/metadata - Returns everything except heavy blobs
app.get("/share/:id/metadata", (req, res) => {
  const shareId = req.params.id;

  try {
    const shareData = require(`./artifacts/share/${shareId}.json`);
    const { context, ...metadata } = shareData;
    // Remove base64 image data from context if present
    const cleanContext = { ...context };
    delete cleanContext.imageBase64;

    res.json({ ...metadata, context: cleanContext });
  } catch (error) {
    res.status(404).json({ error: "Share not found" });
  }
});

// ================= SECRETS MANAGEMENT API =================
const secrets = require('./lib/secrets');

// Seed env vars into DB on first boot
secrets.seedFromEnv([
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM',
  'PAYFAST_MERCHANT_ID', 'PAYFAST_MERCHANT_KEY', 'PAYFAST_PASSPHRASE',
  'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY'
]);

// Internal-only secrets API — requires ADMIN_TOKEN header
function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  const expected = secrets.getSecret('ADMIN_TOKEN') || process.env.ADMIN_TOKEN;
  if (!expected) return res.status(503).json({ error: 'ADMIN_TOKEN not configured' });
  if (!token || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

app.get('/api/secrets', requireAdmin, (req, res) => {
  res.json(secrets.listSecrets());
});

app.post('/api/secrets', requireAdmin, (req, res) => {
  const { key_name, key_value, service } = req.body;
  if (!key_name || !key_value) return res.status(400).json({ error: 'key_name and key_value required' });
  secrets.setSecret(key_name, key_value, service || 'API', 'api');
  res.json({ ok: true, key_name });
});

app.delete('/api/secrets/:key', requireAdmin, (req, res) => {
  secrets.deleteSecret(req.params.key);
  res.json({ ok: true });
});

// Webhook: Notion Secrets Vault → local DB sync
app.post('/api/webhook/secrets-sync', (req, res) => {
  const sig = req.headers['x-webhook-signature'];
  const expected = secrets.getSecret('WEBHOOK_SECRET') || process.env.WEBHOOK_SECRET;
  if (!expected) return res.status(503).json({ error: 'WEBHOOK_SECRET not configured' });
  if (!sig || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const result = secrets.syncFromNotion(req.body);
  res.json(result);
});

// ================= LEADGEN + CRM + OSINT ENGINE =================
const leadgenEngine = require('./leadgen-engine');
leadgenEngine.mount(app);

// ================= NOTION REPORTING LAYER =================
const notionSync = require('./lib/notion-sync');

app.post('/api/notion/init', async (req, res) => {
  try {
    const ok = await notionSync.init();
    res.json({ ok, message: ok ? 'Notion databases initialized' : 'NOTION_TOKEN not set' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/notion/sync', async (req, res) => {
  try {
    const results = await notionSync.syncAll();
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/notion/stats', async (req, res) => {
  try {
    res.json(await notionSync.getStats());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Auto-init Notion on boot (non-blocking)
notionSync.init().catch(() => {});

// ================= BRIDGEAI ECONOMY API =================
app.get('/api/treasury', async (req, res) => {
  try {
    const buckets = await economyDb.query('SELECT name, balance, percentage FROM treasury_buckets ORDER BY percentage DESC');
    const recent = await economyDb.query('SELECT * FROM treasury_ledger ORDER BY timestamp DESC LIMIT 20');
    const total = buckets.rows.reduce((sum, b) => sum + parseFloat(b.balance), 0);
    res.json({ total, buckets: buckets.rows, recent: recent.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/treasury/payments', async (req, res) => {
  try {
    const payments = await economyDb.query('SELECT * FROM payments_received ORDER BY received_at DESC LIMIT 50');
    res.json(payments.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= PROXY AUTH ROUTES TO BRAIN SERVICE =================
const BRAIN_URL = 'http://localhost:8000';
app.post('/auth/register', async (req, res) => {
  try {
    const resp = await axios.post(BRAIN_URL + '/auth/register', req.body);
    res.status(resp.status).json(resp.data);
  } catch (err) {
    res.status(err.response?.status || 502).json(err.response?.data || { error: 'Brain service unavailable' });
  }
});
app.post('/auth/login', async (req, res) => {
  try {
    const resp = await axios.post(BRAIN_URL + '/auth/login', req.body);
    res.status(resp.status).json(resp.data);
  } catch (err) {
    res.status(err.response?.status || 502).json(err.response?.data || { error: 'Brain service unavailable' });
  }
});
app.post('/referral/claim', async (req, res) => {
  try {
    const resp = await axios.post(BRAIN_URL + '/referral/claim', req.body);
    res.status(resp.status).json(resp.data);
  } catch (err) {
    res.status(err.response?.status || 502).json(err.response?.data || { error: 'Brain service unavailable' });
  }
});

// ================= LEADGEN AI PIPELINE (must be before catch-all proxy) =================
app.post('/api/leadgen/auto-prospect', async (req, res) => {
  const { industry, region, count } = req.body;
  try {
    const resp = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: 'nousresearch/hermes-3-llama-3.1-405b:free',
      messages: [{ role: 'user', content: `Generate ${count||5} business leads for ${industry||'technology'} in ${region||'South Africa'}. Each: company_name, contact_name, email, phone, budget, pain_points. Return JSON array only.` }],
      max_tokens: 800
    }, { headers: { 'Authorization': 'Bearer ' + (process.env.OPENROUTER_API_KEY||''), 'Content-Type': 'application/json' }, timeout: 30000 });
    const text = resp.data.choices[0].message.content;
    let leads = [];
    try { leads = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] || '[]'); } catch(e) {}
    res.json({ ok: true, leads_generated: leads.length, leads, raw: leads.length ? undefined : text });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});
app.post('/api/leadgen/auto-nurture', async (req, res) => {
  try {
    const camp = await axios.post('http://localhost:3000/api/crm/campaigns', { name: req.body.subject || 'AI Nurture', template_type: 'intro' }).then(r=>r.data).catch(()=>({}));
    const queue = await axios.post('http://localhost:3000/api/outreach/leads', { filter: 'all', template: 'intro' }).then(r=>r.data).catch(()=>({}));
    res.json({ ok: true, campaign: camp, queued: queue });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});
app.post('/api/leadgen/auto-close', async (req, res) => {
  const { lead_id, offer } = req.body;
  try {
    const lead = await axios.get('http://localhost:3000/api/crm/leads/' + lead_id).then(r=>r.data).catch(()=>null);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const resp = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: 'nousresearch/hermes-3-llama-3.1-405b:free',
      messages: [{ role: 'user', content: `Write a 3-sentence sales email to ${lead.company||'a business'} about Bridge AI OS. Offer: ${offer||'Pro plan R299/mo'}. CTA: https://go.ai-os.co.za/landing. Professional, direct.` }],
      max_tokens: 300
    }, { headers: { 'Authorization': 'Bearer ' + (process.env.OPENROUTER_API_KEY||''), 'Content-Type': 'application/json' }, timeout: 30000 });
    const email = resp.data.choices[0].message.content;
    const queued = await axios.post('http://localhost:3000/api/outreach/queue', { to: lead.email, subject: offer||'AI for your business', body: email, lead_id }).then(r=>r.data).catch(()=>({}));
    res.json({ ok: true, email_content: email, queued, lead_email: lead.email });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// ================= PROXY UNHANDLED /api/* TO BRAIN SERVICE =================
app.all('/api/{*path}', async (req, res) => {
  try {
    const resp = await axios({
      method: req.method,
      url: BRAIN_URL + req.originalUrl,
      data: req.body,
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });
    res.status(resp.status).json(resp.data);
  } catch (err) {
    res.status(err.response?.status || 502).json(err.response?.data || { error: 'Service unavailable' });
  }
});

// ================= API INDEX =================
app.get('/api', (req, res) => res.json({
  service: 'Bridge AI OS', version: '1.0.0',
  endpoints: {
    health: 'GET /health', treasury: 'GET /api/treasury', payments: 'GET /api/treasury/payments',
    create_payment: 'POST /create-payment', share: 'GET /share/:id/context'
  }
}));

// ================= SHORT URL REDIRECTS =================
const shortRoutes = {
  '/ban': '/ban-home.html', '/ehsa': '/ehsa-home.html', '/aid': '/aid-home.html',
  '/ubi': '/ubi-home.html', '/aurora': '/aurora-home.html', '/supac': '/supac-home.html',
  '/hospital': '/hospital-home.html', '/rootedearth': '/rootedearth-home.html',
  '/abaas': '/abaas.html', '/apps': '/50-applications.html', '/defi': '/defi.html',
  '/governance': '/governance.html', '/twins': '/digital-twin-console.html',
  '/wallet': '/wallet.html', '/docs': '/docs.html', '/pricing': '/pricing.html',
  '/settings': '/settings.html', '/affiliate': '/affiliate.html',
  '/brand': '/brand.html', '/corporate': '/corporate.html', '/join': '/join.html',
  '/admin': '/admin.html', '/agents': '/agents.html', '/avatar': '/avatar.html',
  '/control': '/control.html', '/dashboard': '/aoe-dashboard.html',
  '/ehsa-app': '/ehsa-app.html', '/ehsa-brain': '/ehsa-brain.html',
  '/executive': '/executive-dashboard.html', '/home': '/home.html',
  '/intelligence': '/intelligence.html', '/landing': '/landing.html',
  '/logs': '/logs.html', '/marketplace': '/marketplace.html',
  '/onboarding': '/onboarding.html', '/platforms': '/platforms.html',
  '/registry': '/registry.html', '/sitemap': '/sitemap.html',
  '/status': '/system-status-dashboard.html', '/terminal': '/terminal.html',
  '/topology': '/topology.html', '/trading': '/trading.html',
  '/twin-wall': '/twin-wall.html', '/welcome': '/welcome.html', '/face': '/anatomical_face.html',
  '/leadgen': '/leadgen.html', '/crm': '/crm.html', '/invoicing': '/invoicing.html', '/tickets': '/tickets.html',
  '/legal': '/legal.html', '/marketing': '/marketing.html', '/vendors': '/vendors.html',
  '/quotes': '/quotes.html', '/customers': '/customers.html', '/workforce': '/workforce.html'
};
Object.entries(shortRoutes).forEach(([short, target]) => {
  app.get(short, (req, res) => res.redirect(target));
});

// ================= SERVER =================
app.listen(3000, () => {
  console.log("SYSTEM LIVE -> http://localhost:3000");
});
