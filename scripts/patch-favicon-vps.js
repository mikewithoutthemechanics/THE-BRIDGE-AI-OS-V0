#!/usr/bin/env node
// Idempotent in-place patch: inject /favicon.ico handler into gateway.js.
// Safer than `sed -i` because it matches exact substrings (no regex), skips
// if already patched, and fails loudly instead of silently corrupting braces.
//
// Usage on VPS:
//   node /var/www/bridgeai/scripts/patch-favicon-vps.js
//   pm2 restart bridge-gateway
//   curl -sI https://go.ai-os.co.za/favicon.ico | head -3
//
// Run location: anywhere; script resolves gateway.js relative to GATEWAY_PATH
// env var, or defaults to /var/www/bridgeai/gateway.js.

'use strict';
const fs = require('fs');
const path = require('path');

const GATEWAY = process.env.GATEWAY_PATH || '/var/www/bridgeai/gateway.js';
const SENTINEL = '// FAVICON_HANDLER_v1'; // idempotency marker
const ANCHOR = "app.use(express.static(path.join(ROOT, 'public')";

const HANDLER = `
${SENTINEL} — serves favicon.svg for /favicon.ico requests so browser
// speculative fetches (tabs, bookmarks) stop 404'ing. Must sit before
// express.static so the .ico path is caught before the static layer
// gives up on it.
app.get('/favicon.ico', (_req, res) => {
  res.set({
    'Content-Type': 'image/svg+xml',
    'Cache-Control': 'public, max-age=604800, must-revalidate',
  });
  res.sendFile(path.join(ROOT, 'public', 'favicon.svg'), (err) => {
    if (err) res.status(204).end();
  });
});

`;

function die(msg, code = 1) {
  console.error('[patch-favicon] ' + msg);
  process.exit(code);
}

if (!fs.existsSync(GATEWAY)) die('gateway not found at ' + GATEWAY);
const original = fs.readFileSync(GATEWAY, 'utf8');

if (original.includes(SENTINEL)) {
  console.log('[patch-favicon] already patched (sentinel present) — no-op');
  process.exit(0);
}

const anchorIdx = original.indexOf(ANCHOR);
if (anchorIdx === -1) {
  die('anchor string not found: "' + ANCHOR + '" — gateway.js may have diverged');
}

// Back up next to the file with a timestamp so rollback is one `cp` away.
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const backup = GATEWAY + '.pre-favicon-' + ts;
fs.copyFileSync(GATEWAY, backup);
console.log('[patch-favicon] backup -> ' + backup);

// Insert at the START of the anchor line (walk back to the preceding newline).
const lineStart = original.lastIndexOf('\n', anchorIdx) + 1;
const patched =
  original.slice(0, lineStart) + HANDLER + original.slice(lineStart);

fs.writeFileSync(GATEWAY, patched);
console.log('[patch-favicon] inserted handler before anchor at offset ' + lineStart);
console.log('[patch-favicon] run `node --check ' + GATEWAY + '` next, then pm2 restart bridge-gateway');
