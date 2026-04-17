#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const HAR_DIR = path.join(process.cwd(), "har");

if (!fs.existsSync(HAR_DIR)) {
  fs.mkdirSync(HAR_DIR);
}

console.log("\n=== LIVE HAR ORCHESTRATOR ===\n");
console.log("Watching:", HAR_DIR);
console.log("Drop .har files ? auto-analyze\n");

const analyze = (filePath) => {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const har = JSON.parse(raw);

    const entries = har.log.entries || [];

    let slow = 0;
    let cache = 0;
    let auth = 0;

    for (const e of entries) {
      if ((e.time || 0) > 100) slow++;
      if (e._fromCache) cache++;
      if (e.request.url.includes("/auth")) auth++;
    }

    console.log("\n--- ANALYSIS ---");
    console.log("File:", path.basename(filePath));
    console.log("Requests:", entries.length);
    console.log("Slow:", slow);
    console.log("Cache Hits:", cache);
    console.log("Auth Calls:", auth);

    if (entries.some(e => e.request.url.includes("next="))) {
      console.log("?? Open redirect risk detected");
    }

    console.log("---------------\n");

  } catch (err) {
    console.log("Error processing:", filePath);
  }
};

fs.watch(HAR_DIR, (event, filename) => {
  if (filename && filename.endsWith(".har")) {
    const full = path.join(HAR_DIR, filename);

    // debounce
    setTimeout(() => {
      if (fs.existsSync(full)) {
        analyze(full);
      }
    }, 500);
  }
});
