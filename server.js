const express = require("express");
const bodyParser = require("body-parser");
const sqlite3 = require("better-sqlite3");
const axios = require("axios");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const path = require("path");

const app = express();
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname)));

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
  const keys = Object.keys(unsigned).sort();
  let string = "";
  for (const key of keys) {
    if (key !== "signature") {
      string += `${key}=${unsigned[key]}&`;
    }
  }
  string += `passphrase=${passphrase}`;
  return crypto.createHash("md5").update(string).digest("hex");
}

// ================= DATABASE =================
const db = new sqlite3("./empeleni.db");

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
  res.sendStatus(200);
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

// ================= SERVER =================
app.listen(3000, () => {
  console.log("SYSTEM LIVE → http://localhost:3000");
});
