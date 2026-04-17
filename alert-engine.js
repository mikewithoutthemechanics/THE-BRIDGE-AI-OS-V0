require('dotenv').config();
const fetch = require("node-fetch");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const send = async (msg) => {
  if (!TELEGRAM_TOKEN) return;

  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: msg
    })
  });
};

supabase
  .channel("alerts-phone")
  .on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "events" },
    async (payload) => {
      const e = payload.new;

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
  .subscribe();

console.log("PHONE ALERTS ACTIVE");
