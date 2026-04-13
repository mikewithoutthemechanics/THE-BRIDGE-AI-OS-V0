// GOD MODE — AUTO-HEAL + SUPABASE + LOG FIX (DROP-IN PATCH SYSTEM)
// Apply across: gateway.js, system.js, agent-ledger.js, neurolink loader

require("dotenv").config();

const fs = require("fs");

// =========================
// ENV HARD ENFORCEMENT
// =========================
function validateEnv() {
  const required = ["JWT_SECRET", "SUPABASE_URL", "SUPABASE_SERVICE_KEY"];

  const missing = required.filter(k => !process.env[k] || process.env[k].includes("your-"));

  if (missing.length) {
    console.error("BLOCKED: Missing/invalid ENV:", missing);
    return false;
  }

  return true;
}

// =========================
// SUPABASE SAFE CLIENT
// =========================
function createSafeSupabase() {
  const { createClient } = require("@supabase/supabase-js");

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  const isConfigured =
    url &&
    key &&
    !url.includes("your-project") &&
    !url.includes("example");

  if (!isConfigured) {
    console.warn("[SUPABASE] Running in OFFLINE MODE");
    return null;
  }

  return createClient(url, key);
}

const supabase = createSafeSupabase();

// =========================
// SAFE DB WRAPPER
// =========================
async function db(table) {
  if (!supabase) {
    return {
      insert: async () => ({ data: null }),
      select: async () => ({ data: [] }),
      upsert: async () => ({ data: null })
    };
  }
  return supabase.from(table);
}

// =========================
// SAFE FETCH (KILLS LOOP)
// =========================
async function safeFetch(url, options = {}) {
  try {
    if (!url.startsWith("http")) {
      throw new Error("Invalid URL: " + url);
    }

    const res = await fetch(url, options);
    if (!res.ok) throw new Error("Bad response");

    return await res.json();
  } catch (err) {
    console.warn("[SAFE-FETCH]", err.message);
    return null;
  }
}

// =========================
// NEUROLINK LOG FIX (JSONL)
// =========================
function appendLog(file, data) {
  try {
    fs.appendFileSync(file, JSON.stringify(data) + "\n");
  } catch (e) {
    console.warn("[LOG WRITE FAIL]", e.message);
  }
}

function repairLogs(file) {
  if (!fs.existsSync(file)) return;

  const lines = fs.readFileSync(file, "utf-8").split("\n");

  const valid = lines.filter(l => {
    try {
      if (!l.trim()) return false;
      JSON.parse(l);
      return true;
    } catch {
      return false;
    }
  });

  fs.writeFileSync(file, valid.join("\n") + "\n");
  console.log(`[LOG] Repaired: ${valid.length} valid entries`);
}

// =========================
// AUTO-ECON GUARD
// =========================
async function safeAgentTask(task) {
  if (!supabase) {
    console.warn("[AUTO-ECON] Disabled (no DB)");
    return;
  }

  try {
    const table = await db("agents");
    await table.upsert(task);
  } catch (e) {
    console.warn("[AUTO-ECON FAIL]", e.message);
  }
}

// =========================
// BOOT GUARD (GLOBAL)
// =========================
async function boot() {
  console.log("[GOD MODE] BOOT");

  const envOk = validateEnv();

  repairLogs("./logs/scan-2026-04-13.jsonl");

  if (!envOk) {
    console.error("SYSTEM HALTED — FIX ENV");
    process.exit(1);
  }

  console.log("[GOD MODE] SYSTEM READY");
}

// =========================
// APPLY EVERYWHERE
// =========================
(async () => {
  await boot();

  global.safeFetch = safeFetch;
  global.db = db;
  global.safeAgentTask = safeAgentTask;
  global.appendLog = appendLog;

  require("./gateway"); // or system.js depending entry
})();
