#!/usr/bin/env node
// Pre-flight check — run before deploy or on startup to verify environment
'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const ROOT = path.join(__dirname, '..');
const PORT = parseInt(process.env.PORT, 10) || 3000;

let pass = 0, fail = 0, warn = 0;

function ok(msg)   { console.log(`  ✓  ${msg}`); pass++; }
function no(msg)   { console.error(`  ✗  ${msg}`); fail++; }
function w(msg)    { console.warn(`  ⚠  ${msg}`); warn++; }

console.log('\n  ⚡  GOD MODE — PRE-FLIGHT CHECKS');
console.log('  ──────────────────────────────────────');

// Node version
const [major] = process.versions.node.split('.').map(Number);
major >= 18 ? ok(`Node.js v${process.versions.node}`) : no(`Node.js v${process.versions.node} — require >=18`);

// Required files
[
  ['system.js',             'Main server'],
  ['public/topology.html',  'Topology UI'],
  ['package.json',          'Package manifest'],
].forEach(([rel, label]) => {
  fs.existsSync(path.join(ROOT, rel)) ? ok(`${label} (${rel})`) : no(`Missing: ${rel}`);
});

// Optional files
[
  ['Procfile',       'Heroku Procfile'],
  ['railway.json',   'Railway config'],
  ['render.yaml',    'Render config'],
  ['fly.toml',       'Fly.io config'],
  ['.env.example',   '.env.example'],
  ['ecosystem.config.js', 'PM2 config'],
].forEach(([rel, label]) => {
  fs.existsSync(path.join(ROOT, rel)) ? ok(`${label}`) : w(`Optional missing: ${rel}`);
});

// PORT sanity
if (PORT === 443) {
  const cert = path.join(ROOT, 'certs', 'cert.pem');
  const key  = path.join(ROOT, 'certs', 'key.pem');
  (fs.existsSync(cert) && fs.existsSync(key))
    ? ok('TLS certs found (certs/cert.pem + key.pem)')
    : no('PORT=443 but certs/cert.pem or certs/key.pem missing — run: npm run certs');
}

// .env vs .env.example
if (!fs.existsSync(path.join(ROOT, '.env'))) {
  w('.env not found — using defaults / process.env. Copy .env.example to .env for local dev.');
}

// System resources
const freeMb = Math.round(os.freemem() / 1e6);
freeMb > 128 ? ok(`Free memory: ${freeMb} MB`) : w(`Low memory: ${freeMb} MB`);

// Summary
console.log('  ──────────────────────────────────────');
console.log(`  PASS ${pass}  |  WARN ${warn}  |  FAIL ${fail}`);
if (fail > 0) { console.error('\n  ✗  Pre-flight FAILED — fix errors above.\n'); process.exit(1); }
else { console.log('\n  ✓  Pre-flight OK — ready to launch.\n'); }
