#!/usr/bin/env node

require('dotenv').config();
const { fetch } = require("undici");
const { createClient } = require("@supabase/supabase-js");

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  console.error("Missing Supabase env");
  process.exit(1);
}

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

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

    console.log("ALERT SENT:", msg);
  } catch (err) {
    console.log("TELEGRAM ERROR:", err.message);
  }
};

supabase
  .channel("alerts-phone")
  .on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "events" },
    async (payload) => {
      const e = payload.new;

      console.log("EVENT:", e);

      // === TELEGRAM ===
      if (e.type === "auth") {
        send("AUTH " + e.meta);
      }

      if (e.type === "latency" && e.value > 500) {
        send("LATENCY " + e.value + " " + e.meta);
      }

      if (e.type === "latency-critical") {
        send("CRITICAL " + e.value + " " + e.meta);
      }

      if (e.type === "cost") {
        send("COST " + e.meta);
      }

      // === REACTIVE ENFORCEMENT ===
      if (e.type === "auth") {
        fetch("http://localhost:3000/block", { method: "POST" }).catch(()=>{});
      }
    }
  )
  .subscribe((s)=>console.log("SUB:", s));

console.log("ALERT ENGINE READY");
