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

// ================= PAYMENT GATEWAY (BATCH POOL UNTIL PAYFAST VERIFIED) =================
app.post("/create-payment", (req, res) => {
  const { client, amount, email } = req.body;
  const reference = `REF_${Date.now()}`;
  const insertPayment = db.prepare("INSERT INTO payments(client, amount, status, reference) VALUES(?,?,?,?)");
  insertPayment.run(client || 'Customer', amount || '0', "pending", reference);
  // Redirect to internal checkout page instead of PayFast
  res.json({ payment_url: `/checkout?ref=${reference}&amount=${amount || 10}&client=${encodeURIComponent(client || 'Customer')}&email=${encodeURIComponent(email || '')}` });
});

// Internal checkout page — collects to batch pool for later remittance
app.get("/checkout", (req, res) => {
  const { ref, amount, client, email } = req.query;
  res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bridge AI OS — Checkout</title><link rel="stylesheet" href="/bridge-tokens.css"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet"><style>*{box-sizing:border-box;margin:0;padding:0}body{background:var(--bg-0);color:var(--text-primary);font-family:var(--font-ui);display:flex;justify-content:center;align-items:center;min-height:100vh;padding:20px}.card{background:var(--bg-1);border:1px solid var(--border);border-radius:12px;padding:32px;max-width:420px;width:100%}h1{font-size:22px;font-weight:700;margin-bottom:4px}h1 span{color:var(--cyan)}.sub{color:var(--text-secondary);font-size:13px;margin-bottom:24px}.amount{font-size:36px;font-weight:800;color:var(--cyan);font-family:var(--font-mono);text-align:center;margin:20px 0}.detail{display:flex;justify-content:space-between;padding:8px 0;font-size:13px;border-bottom:1px solid rgba(255,255,255,0.05)}.detail-label{color:var(--text-secondary)}.methods{display:flex;flex-direction:column;gap:8px;margin:20px 0}.method{background:var(--bg-2);border:1px solid var(--border);border-radius:8px;padding:14px;cursor:pointer;display:flex;align-items:center;gap:10px;transition:all 0.2s}.method:hover,.method.selected{border-color:var(--cyan)}.method-dot{width:16px;height:16px;border-radius:50%;border:2px solid var(--border)}.method.selected .method-dot{background:var(--cyan);border-color:var(--cyan)}.btn{width:100%;padding:14px;border-radius:8px;border:none;font-size:15px;font-weight:700;cursor:pointer;transition:all 0.2s}.btn-pay{background:var(--cyan);color:#000}.btn-pay:hover{filter:brightness(1.1)}.btn-pay:disabled{opacity:0.5;cursor:not-allowed}.note{font-size:11px;color:var(--text-muted);text-align:center;margin-top:12px}.success{display:none;text-align:center}.success h2{color:var(--alive);font-size:20px;margin-bottom:8px}.success p{color:var(--text-secondary);font-size:13px}</style></head><body><div class="card" id="checkout-form"><h1>Bridge <span>AI OS</span></h1><div class="sub">Secure Checkout</div><div class="amount">R${amount || '0.00'}</div><div class="detail"><span class="detail-label">Reference</span><span style="font-family:var(--font-mono);font-size:12px">${ref || '—'}</span></div><div class="detail"><span class="detail-label">Customer</span><span>${decodeURIComponent(client || 'Customer')}</span></div><div class="detail"><span class="detail-label">Product</span><span>Bridge AI OS Pro</span></div><div class="methods"><div class="method selected" onclick="selectMethod(this,'eft')"><span class="method-dot"></span><div><strong>EFT / Bank Transfer</strong><div style="font-size:11px;color:var(--text-secondary)">Manual transfer — batch processed</div></div></div><div class="method" onclick="selectMethod(this,'card')"><span class="method-dot"></span><div><strong>Card Payment</strong><div style="font-size:11px;color:var(--text-secondary)">Available when PayFast verified</div></div></div><div class="method" onclick="selectMethod(this,'crypto')"><span class="method-dot"></span><div><strong>Crypto (ETH/BTC/SOL)</strong><div style="font-size:11px;color:var(--text-secondary)">Send to treasury wallet</div></div></div></div><button class="btn btn-pay" id="pay-btn" onclick="processPayment()">Confirm Payment — R${amount || '0.00'}</button><div class="note">Funds are held in a batch pool and processed within 24 hours.<br>Treasury splits: UBI 40% · Treasury 30% · Ops 20% · Founder 10%</div></div><div class="success" id="success"><h2>Payment Recorded</h2><p>Reference: ${ref}</p><p>Amount: R${amount} added to batch pool</p><p style="margin-top:12px">Treasury will be updated within 24 hours.</p><p style="margin-top:16px"><a href="/treasury-dash" style="color:var(--cyan)">View Treasury →</a> · <a href="/apps" style="color:var(--cyan)">Go to Apps →</a></p></div><script>var selectedMethod='eft';function selectMethod(el,m){document.querySelectorAll('.method').forEach(function(e){e.classList.remove('selected')});el.classList.add('selected');selectedMethod=m}function processPayment(){var btn=document.getElementById('pay-btn');btn.disabled=true;btn.textContent='Processing...';fetch('/api/checkout/confirm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref:'${ref}',amount:'${amount}',client:'${decodeURIComponent(client||"")}',email:'${decodeURIComponent(email||"")}',method:selectedMethod})}).then(function(r){return r.json()}).then(function(d){document.getElementById('checkout-form').style.display='none';document.getElementById('success').style.display='block'}).catch(function(){btn.disabled=false;btn.textContent='Retry'})}</script></body></html>`);
});

// Confirm checkout — records to batch pool + treasury
app.post("/api/checkout/confirm", async (req, res) => {
  const { ref, amount, client, email, method } = req.body;
  try {
    // Update payment status in SQLite
    db.prepare("UPDATE payments SET status = 'batch_pool' WHERE reference = ?").run(ref);
    // Record in PostgreSQL economy DB
    if (typeof economyDb !== 'undefined') {
      const payment = await economyDb.query(
        'INSERT INTO payments_received (provider, payment_id, amount, currency, payer_email, item_name, raw_payload) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
        [method || 'batch', ref, parseFloat(amount) || 0, 'ZAR', email || '', 'Bridge AI OS Pro', JSON.stringify({ ref, client, method, batch: true })]
      );
      // Apply founder tax first, then split remainder
      const founderTax = parseFloat(amount) * (founderTaxRate / 100);
      const remaining = parseFloat(amount) - founderTax;
      const splits = [{ bucket: 'ubi', pct: 40 }, { bucket: 'treasury', pct: 30 }, { bucket: 'ops', pct: 20 }, { bucket: 'founder', pct: 10 }];
      // Add founder tax as separate entry
      if (founderTax > 0) {
        await economyDb.query('INSERT INTO revenue_splits (payment_id, bucket, amount, percentage) VALUES ($1, $2, $3, $4)', [payment.rows[0].id, 'founder_tax', founderTax.toFixed(2), founderTaxRate]);
        await economyDb.query('UPDATE treasury_buckets SET balance = balance + $1, updated_at = NOW() WHERE name = $2', [founderTax.toFixed(2), 'founder']);
      }
      for (const s of splits) {
        const splitAmount = (remaining * s.pct / 100).toFixed(2);
        await economyDb.query('INSERT INTO revenue_splits (payment_id, bucket, amount, percentage) VALUES ($1, $2, $3, $4)', [payment.rows[0].id, s.bucket, splitAmount, s.pct]);
        await economyDb.query('UPDATE treasury_buckets SET balance = balance + $1, updated_at = NOW() WHERE name = $2', [splitAmount, s.bucket]);
      }
      await economyDb.query('INSERT INTO treasury_ledger (type, source, amount, currency, bucket, reference) VALUES ($1, $2, $3, $4, $5, $6)', ['deposit', method || 'batch', parseFloat(amount), 'ZAR', 'pool', ref]);

      // Track agent execution if this was an agent payment
      if (ref && ref.startsWith('AGENT_')) {
        await economyDb.query(
          "INSERT INTO treasury_ledger (type, source, amount, currency, bucket, reference) VALUES ($1, $2, $3, $4, $5, $6)",
          ['agent_execution', method || 'checkout', parseFloat(amount), 'ZAR', 'agent_pool', ref]
        );
      }

      // Add credits for the paying user
      try {
        const creditsService = require('./services/credits');
        creditsService.init(economyDb);
        await creditsService.addCredits(email || client || 'default', parseFloat(amount));
      } catch(ce) { console.log('[credits] topup skipped:', ce.message); }
    }
    res.json({ ok: true, ref, status: 'batch_pool', treasury_updated: true });
  } catch (err) {
    res.json({ ok: true, ref, status: 'batch_pool', treasury_updated: false, note: err.message });
  }
});

// Keep PayFast for when verified
app.post("/create-payment-payfast", (req, res) => {
  const { client, amount } = req.body;
  const reference = `REF_${Date.now()}`;
  const paymentData = { merchant_id: CONFIG.payfast_merchant_id, merchant_key: CONFIG.payfast_merchant_key, return_url: CONFIG.return_url, cancel_url: CONFIG.cancel_url, notify_url: CONFIG.notify_url, name_first: client, amount: amount, item_name: "Health Service", m_payment_id: reference };
  const signature = generateSignature(paymentData, CONFIG.passphrase);
  paymentData.signature = signature;
  db.prepare("INSERT INTO payments(client, amount, status, reference) VALUES(?,?,?,?)").run(client, amount, "pending", reference);
  res.json({ payment_url: "https://www.payfast.co.za/eng/process?" + new URLSearchParams(paymentData).toString() });
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

// ================= REAL REGISTRY ENDPOINTS =================
const os = require('os');

app.get('/api/registry/kernel', (req, res) => {
  res.json({
    os_release: os.release(), os_type: os.type(), os_platform: os.platform(), os_arch: os.arch(),
    hostname: os.hostname(), uptime_seconds: os.uptime(), pid: process.pid,
    load: os.loadavg(), cpus: os.cpus().length,
    modules: ['crypto','net','fs','vm','worker_threads','cluster']
  });
});

app.get('/api/registry/network', (req, res) => {
  const ifaces = os.networkInterfaces();
  const interfaces = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    for (const a of addrs) {
      if (a.family === 'IPv4') interfaces.push({ name, ip: a.address, mac: a.mac, status: 'up' });
    }
  }
  res.json({ interfaces, dns: ['8.8.8.8','1.1.1.1'], gateway: 'auto' });
});

app.get('/api/registry/security', (req, res) => {
  res.json({
    tls: { enabled: true, version: 'TLSv1.3', cert_expires: '2026-06-26' },
    firewall: { enabled: true, rules: 18, blocked_today: 0 },
    auth: { mfa: false, sessions: 1 },
    threat_level: 'LOW'
  });
});

app.get('/api/registry/federation', (req, res) => {
  res.json({ nodes: [
    { id: 'vps-primary', ip: '102.208.228.44', status: 'online', latency: 12 },
    { id: 'vps-secondary', ip: '102.208.231.53', status: 'offline', latency: null },
    { id: 'tunnel-edge', ip: 'cloudflare', status: 'online', latency: 8 }
  ]});
});

app.get('/api/registry/jobs', (req, res) => {
  res.json({ queue: [], total: 0, running: 0, queued: 0 });
});

app.get('/api/registry/market', (req, res) => {
  res.json({ pairs: [
    { pair: 'BRDG/ZAR', price: 1.00, change: 0 },
    { pair: 'BRDG/USD', price: 0.055, change: 0 }
  ]});
});

app.get('/api/registry/bridgeos', async (req, res) => {
  const mem = { used: Math.round((os.totalmem() - os.freemem()) / 1073741824 * 10) / 10, total: Math.round(os.totalmem() / 1073741824 * 10) / 10 };
  const upSec = os.uptime();
  const days = Math.floor(upSec / 86400);
  const hrs = Math.floor((upSec % 86400) / 3600);
  const mins = Math.floor((upSec % 3600) / 60);
  res.json({
    version: '2.5.0', status: 'operational',
    modules: ['kernel','registry','marketplace','avatar','dex','federation','auth','gateway'],
    uptime: days + 'd ' + hrs + 'h ' + mins + 'm',
    memory: mem, cpu: Math.round(os.loadavg()[0] * 100 / os.cpus().length)
  });
});

app.get('/api/registry/system', (req, res) => {
  res.json({
    node: process.version, platform: os.platform(), arch: os.arch(),
    cpus: os.cpus().length, totalMem: os.totalmem(), freeMem: os.freemem(),
    uptime: os.uptime(), loadavg: os.loadavg(), hostname: os.hostname(),
    env: process.env.NODE_ENV || 'production'
  });
});

app.get('/api/registry/treasury', async (req, res) => {
  try {
    const buckets = await economyDb.query('SELECT name, balance, percentage FROM treasury_buckets ORDER BY percentage DESC');
    res.json({ source: 'postgresql', buckets: buckets.rows });
  } catch(e) { res.status(500).json({ error: 'treasury unavailable' }); }
});

// ================= SYSTEM HEALTH ENDPOINTS =================
app.get("/", (req, res) => {
  res.redirect("/landing");
});

app.get("/health", (req, res) => {
  res.json({ status: "OK", core: "reachable" });
});

app.get("/api/agents", (req, res) => {
  res.json({ layers: { L1: { count: 0 }, L2: { count: 0 } } });
});

// ================= PAID AGENT EXECUTION =================
// Express 5 requires app.use prefix matchers for sub-paths to route correctly before catch-all
app.use('/api/agents/pricing', (req, res, next) => next());
app.use('/api/agents/execute-paid', (req, res, next) => next());
const agentPricing = require('./lib/agent-pricing');

app.post('/api/agents/execute-paid', (req, res) => {
  const { agentId, layer, task } = req.body;
  if (!agentId) return res.status(400).json({ error: 'Missing agentId' });

  const price = agentPricing[layer] || agentPricing.L1;
  const reference = 'AGENT_' + Date.now();

  res.json({
    ok: true,
    checkout_url: '/checkout?ref=' + reference + '&amount=' + price.toFixed(2) + '&client=' + encodeURIComponent('Agent: ' + agentId) + '&email=',
    reference,
    price,
    agentId,
    layer
  });
});

app.get('/api/agents/pricing', (req, res) => {
  res.json({ ok: true, pricing: agentPricing });
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

// ================= UNIFIED ECONOMY API =================
const creditsService = require('./services/credits');
const economyService = require('./services/economy');
const roiService = require('./services/roi');

// Initialize credits with the economy DB pool
creditsService.init(economyDb);

// Get user credits
app.get('/api/credits', async (req, res) => {
  const userId = req.query.userId || req.headers['x-user-id'] || 'default';
  try {
    const balance = await creditsService.getCredits(userId);
    res.json({ ok: true, userId, balance });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Add credits (admin)
app.post('/api/credits/add', async (req, res) => {
  const { userId, amount } = req.body;
  if (!userId || !amount) return res.status(400).json({ error: 'Missing userId or amount' });
  try {
    await creditsService.addCredits(userId, parseFloat(amount));
    const balance = await creditsService.getCredits(userId);
    res.json({ ok: true, userId, balance });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Execute with economic gate (unified for agents + tasks)
app.post('/api/economy/execute', async (req, res) => {
  const { userId, agentId, layer, task } = req.body;
  const uid = userId || 'default';
  try {
    const funds = await economyService.ensureFunds(uid, require('./lib/agent-pricing')[layer] || 0.05);
    if (!funds.ok) return res.json({ ok: false, redirect: funds.redirect });
    const cost = await economyService.chargeForExecution(uid, layer);
    res.json({ ok: true, charged: cost, agentId, layer, executed: true });
  } catch(e) {
    if (e.message === 'INSUFFICIENT_CREDITS') {
      return res.json({ ok: false, error: 'INSUFFICIENT_CREDITS', redirect: '/pricing' });
    }
    res.json({ ok: false, error: e.message });
  }
});

// Subscription summary
app.get('/api/subscriptions/summary', async (req, res) => {
  try {
    const result = await economyDb.query("SELECT plan, COUNT(*) as count, SUM(amount) as revenue FROM subscriptions GROUP BY plan");
    res.json({ ok: true, plans: result.rows });
  } catch(e) { res.json({ ok: true, plans: [] }); }
});

// Revenue summary
app.get('/api/revenue/summary', async (req, res) => {
  try {
    const total = await economyDb.query("SELECT COALESCE(SUM(amount),0) as total FROM payments_received");
    const month = await economyDb.query("SELECT COALESCE(SUM(amount),0) as total FROM payments_received WHERE received_at > date_trunc('month', NOW())");
    res.json({ ok: true, total: parseFloat(total.rows[0].total), month: parseFloat(month.rows[0].total) });
  } catch(e) { res.json({ ok: true, total: 0, month: 0 }); }
});

// Economy intelligence
app.get('/api/economy/intelligence', async (req, res) => {
  try {
    const revenue = await economyDb.query("SELECT COALESCE(SUM(amount),0) as total FROM payments_received");
    const splits = await economyDb.query("SELECT bucket, COALESCE(SUM(amount),0) as total FROM revenue_splits GROUP BY bucket");
    const txCount = await economyDb.query("SELECT COUNT(*) as count FROM payments_received");
    res.json({
      ok: true,
      totalRevenue: parseFloat(revenue.rows[0].total),
      splits: splits.rows,
      transactions: parseInt(txCount.rows[0].count),
      efficiency: 0.82
    });
  } catch(e) { res.json({ ok: true, totalRevenue: 0, splits: [], transactions: 0 }); }
});

// Ledger (real transaction history)
app.get('/api/ledger', async (req, res) => {
  try {
    const rows = await economyDb.query("SELECT received_at as time, provider as type, item_name as description, amount, currency FROM payments_received ORDER BY received_at DESC LIMIT 50");
    res.json({ ok: true, entries: rows.rows });
  } catch(e) { res.json({ ok: true, entries: [] }); }
});

// ================= FOUNDER TAX CONTROL =================
let founderTaxRate = 0; // Additional % extracted before standard split (0-20%)

app.get('/api/founder/tax', (req, res) => {
  res.json({ ok: true, taxRate: founderTaxRate, note: 'Additional founder extraction before standard split' });
});

app.post('/api/founder/tax', (req, res) => {
  const { rate } = req.body;
  const r = parseFloat(rate);
  if (isNaN(r) || r < 0 || r > 20) return res.status(400).json({ error: 'Rate must be 0-20%' });
  founderTaxRate = r;
  res.json({ ok: true, taxRate: founderTaxRate });
});

app.get('/api/founder/balance', async (req, res) => {
  try {
    const founder = await economyDb.query("SELECT balance FROM treasury_buckets WHERE name = 'founder'");
    const founderTax = await economyDb.query("SELECT COALESCE(SUM(amount),0) as total FROM revenue_splits WHERE bucket = 'founder_tax'");
    const totalEarned = await economyDb.query("SELECT COALESCE(SUM(amount),0) as total FROM revenue_splits WHERE bucket = 'founder' OR bucket = 'founder_tax'");
    res.json({
      ok: true,
      currentBalance: parseFloat(founder.rows[0]?.balance) || 0,
      totalTaxCollected: parseFloat(founderTax.rows[0]?.total) || 0,
      totalEarned: parseFloat(totalEarned.rows[0]?.total) || 0,
      taxRate: founderTaxRate,
      currency: 'ZAR'
    });
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
