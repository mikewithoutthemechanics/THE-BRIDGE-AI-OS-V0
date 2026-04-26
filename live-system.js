#!/usr/bin/env node

const loadEnv = require('./env-manager');

(async () => {
  const ENV = await loadEnv();

  // ✅ HARD VALIDATION (prevents your crash)
  if (!ENV.SUPABASE_URL || ENV.SUPABASE_URL.includes("your_")) {
    console.error("❌ SUPABASE_URL missing or invalid");
    process.exit(1);
  }

  if (!ENV.SUPABASE_KEY || ENV.SUPABASE_KEY.includes("your_")) {
    console.error("❌ SUPABASE_KEY missing or invalid");
    process.exit(1);
  }

  console.log("✅ ENV LOADED");

  const fs = require("fs");
  const http = require("http");
  const WebSocket = require("ws");
  const express = require("express");
  const chokidar = require("chokidar");
  const { createClient } = require("@supabase/supabase-js");

  // === CONFIG (FIXED) ===
  const supabase = createClient(
    ENV.SUPABASE_URL,
    ENV.SUPABASE_KEY
  );

  // === SERVER ===
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocket.Server({ server });

  const broadcast = (data) => {
    wss.clients.forEach(c => {
      if (c.readyState === 1) c.send(JSON.stringify(data));
    });
  };

  // === REALTIME SUBSCRIPTION ===
  supabase
    .channel('events-stream')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'events' },
      payload => {
        const e = payload.new;
        broadcast({
          alert: e.type,
          value: e.value,
          url: e.meta,
          ts: e.ts
        });
      }
    )
    .subscribe((status) => {
      console.log("📡 Realtime status:", status);
    });

  // === ANALYSIS ENGINE ===
  const analyze = async (entry) => {
    const t = entry.time || 0;
    const url = entry.request?.url || "";

    let events = [];

    if (t > 300) events.push({ type: "latency", value: t });
    if (t > 800) events.push({ type: "latency-critical", value: t });
    if (url.includes("/auth")) events.push({ type: "auth", value: 1 });
    if (url.includes("/llm") || url.includes("/infer")) events.push({ type: "cost", value: 1 });

    for (const e of events) {
      try {
        await supabase.from("events").insert({
          ts: new Date().toISOString(),
          type: e.type,
          value: e.value,
          meta: url
        });
      } catch (err) {
        console.error("❌ Supabase insert error:", err.message);
      }
    }
  };

  // === HAR WATCHER ===
  const HAR_DIR = "./har";
  if (!fs.existsSync(HAR_DIR)) fs.mkdirSync(HAR_DIR);

  chokidar.watch(HAR_DIR).on("add", async (file) => {
    if (!file.endsWith(".har")) return;

    try {
      const data = JSON.parse(fs.readFileSync(file));
      const entries = data.log.entries || [];

      for (const e of entries) {
        await analyze(e);
      }

      console.log("✅ Processed:", file);
    } catch (e) {
      console.log("❌ HAR parse error:", file);
    }
  });

  // === DASHBOARD ===
  app.get("/", (req, res) => {
    res.sendFile(__dirname + "/dashboard.html");
  });

  // === WS CONNECTION ===
  wss.on("connection", ws => {
    ws.send(JSON.stringify({ status: "connected (realtime)" }));
  });

  server.listen(7777, () => {
    console.log("🚀 REALTIME SYSTEM → http://localhost:7777");
  });

})();