#!/usr/bin/env node

const fs = require("fs");

if (process.argv.length < 3) {
  console.error("Usage: node har-analyzer.js <har-file.json>");
  process.exit(1);
}

const file = process.argv[2];
const raw = fs.readFileSync(file, "utf-8");
const har = JSON.parse(raw);

const entries = har.log.entries || [];

const results = {
  slow: [],
  redirects: [],
  cacheHits: 0,
  total: entries.length,
  authFlow: [],
  endpoints: {},
};

for (const e of entries) {
  const url = e.request.url;
  const time = e.time || 0;
  const status = e.response.status;
  const fromCache = e._fromCache;

  const path = new URL(url).pathname;
  results.endpoints[path] = (results.endpoints[path] || 0) + 1;

  if (time > 100) {
    results.slow.push({ url, time: Math.round(time), status });
  }

  if (status >= 300 && status < 400) {
    results.redirects.push({
      url,
      location: e.response.redirectURL || "unknown",
    });
  }

  if (fromCache) {
    results.cacheHits++;
  }

  if (url.includes("/auth") || url.includes("supabase")) {
    results.authFlow.push({ url, time: Math.round(time), status });
  }
}

results.slow.sort((a, b) => b.time - a.time);

const topEndpoints = Object.entries(results.endpoints)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10);

console.log("\n=== AI-OS TRACE ANALYSIS ===\n");

console.log("Requests:", results.total);
console.log("Cache Hits:", results.cacheHits);
console.log("Cache Ratio:", ((results.cacheHits / results.total) * 100).toFixed(2) + "%");

console.log("\n--- SLOW REQUESTS (>100ms) ---");
results.slow.slice(0, 10).forEach((r) => {
  console.log(`${r.time}ms | ${r.status} | ${r.url}`);
});

console.log("\n--- REDIRECT CHAINS ---");
results.redirects.forEach((r) => {
  console.log(`${r.url} -> ${r.location}`);
});

console.log("\n--- AUTH FLOW ---");
results.authFlow.forEach((r) => {
  console.log(`${r.time}ms | ${r.status} | ${r.url}`);
});

console.log("\n--- TOP ENDPOINTS ---");
topEndpoints.forEach(([path, count]) => {
  console.log(`${count}x | ${path}`);
});

console.log("\n=== DETECTIONS ===\n");

if (entries.some((e) => e.request.url.includes("next="))) {
  console.log("⚠️  Open redirect vector detected (?next=)");
}

const oauth = results.authFlow.find((r) => r.url.includes("supabase"));
if (oauth && oauth.time > 1000) {
  console.log("⚠️  Slow OAuth flow:", oauth.time + "ms");
}

const htmlCached = entries.filter(
  (e) =>
    e._fromCache &&
    e.response.content.mimeType.includes("text/html")
).length;

if (htmlCached > 0) {
  console.log("⚠️  HTML cached via service worker (risk)");
}

if (results.slow.length > 0) {
  console.log("⚠️  Backend latency detected");
}

console.log("\n=== ACTIONS ===\n");

console.log("1. Disable HTML caching in service worker");
console.log("2. Validate redirect params (?next whitelist)");
console.log("3. Introduce BFF layer for auth");
console.log("4. Add LLM/API cost guardrails");
console.log("5. Optimize slow endpoints");

console.log("\n=== DONE ===\n");
