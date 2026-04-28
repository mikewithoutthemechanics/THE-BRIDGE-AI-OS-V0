"use strict";

/**
 * Minimal HTTP entry — Docker production CMD + /health for HEALTHCHECK.
 * VPS stack: see docker-compose.vps.yml + nginx/nginx.vps.conf
 */
const http = require("node:http");

const port = Number(process.env.PORT || 3000);

const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url === "/health") {
    const body =
      req.url === "/health"
        ? JSON.stringify({ ok: true, service: "bridge-ai-os-vps-api", port })
        : "Bridge AI OS · VPS API · GET /health for JSON.";
    res.writeHead(200, { "Content-Type": req.url === "/health" ? "application/json" : "text/plain; charset=utf-8" });
    res.end(body);
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("not found");
});

server.listen(port, "0.0.0.0", () => {
  console.log(`[launch] listening on ${port}`);
});
