#!/usr/bin/env node
require('dotenv').config();

const fs = require("fs");
const http = require("http");
const WebSocket = require("ws");
const express = require("express");
const chokidar = require("chokidar");
const { createClient } = require("@supabase/supabase-js");

// === CONFIG ===
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE env vars");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// === SERVER ===
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const broadcast = (data) => {
  wss.clients.forEach(c => {
    if (c.readyState === 1) c.send(JSON.stringify(data));
  });
};

// === ANALYSIS ENGINE ===
const analyze = async (entry) => {
  const t = entry.time || 0;
  const url = entry.request?.url || "";

  let events = [];

  if (t > 300) events.push({ type: "latency", value: t });
  if (url.includes("/auth")) events.push({ type: "auth", value: 1 });
  if (url.includes("/llm") || url.includes("/infer")) events.push({ type: "cost", value: 1 });

  for (const e of events) {
    await supabase.from("events").insert({
      ts: new Date().toISOString(),
      type: e.type,
      value: e.value,
      meta: url
    });

    broadcast({ alert: e.type, value: e.value, url });
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

    console.log("Processed:", file);
  } catch (e) {
    console.log("ERR:", file);
  }
});

// === DASHBOARD ===
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/dashboard.html");
});

app.get("/stats", async (req, res) => {
  const { data } = await supabase
    .from("events")
    .select("type")
  
  const counts = {};
  data.forEach(d => counts[d.type] = (counts[d.type] || 0) + 1);

  res.json(counts);
});

wss.on("connection", ws => {
  ws.send(JSON.stringify({ status: "connected" }));
});

server.listen(7777, () => {
  console.log("SUPABASE LIVE ? http://localhost:7777");
});
