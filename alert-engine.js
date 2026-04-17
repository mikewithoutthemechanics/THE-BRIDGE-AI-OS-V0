#!/usr/bin/env node

require('dotenv').config();

// ? BULLETPROOF FETCH (works in all Node/Windows setups)
const { fetch } = require("undici");

const { createClient } = require("@supabase/supabase-js");

// === ENV VALIDATION ===
if (!process.env.SUPABASE_URL) {
  console.error("? SUPABASE_URL missing");
  process.exit(1);
}

if (!process.env.SUPABASE_KEY) {
  console.error("? SUPABASE_KEY missing");
  process.exit(1);
}

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!TELEGRAM_TOKEN || !CHAT_ID) {
  console.warn("?? Telegram not configured ? alerts disabled");
}

// === SUPABASE CLIENT ===
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// === TELEGRAM SENDER ===
const send = async (msg) => {
  if (!TELEGRAM_TOKEN || !CHAT_ID) return;

  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: msg
      })
    });

    console.log("?? Sent alert:", msg);
  } catch (err) {
    console.error("? Telegram send failed:", err.message);
  }
};

// === REALTIME SUBSCRIPTION ===
supabase
  .channel("alerts-phone")
  .on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "events" },
    async (payload) => {
      const e = payload.new;

      console.log("?? Event received:", e);

      if (e.type === "latency-critical") {
        send(`?? CRITICAL ${e.value}ms ? ${e.meta}`);
      }

      if (e.type === "latency" && e.value > 500) {
        send(`?? LATENCY ${e.value}ms ? ${e.meta}`);
      }

      if (e.type === "auth") {
        send(`?? AUTH activity ? ${e.meta}`);
      }

      if (e.type === "cost") {
        send(`?? COST trigger ? ${e.meta}`);
      }
    }
  )
  .subscribe((status) => {
    console.log("?? Alert subscription status:", status);
  });

console.log("?? PHONE ALERT ENGINE ACTIVE");
