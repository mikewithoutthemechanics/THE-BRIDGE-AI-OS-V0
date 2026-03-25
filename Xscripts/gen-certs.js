#!/usr/bin/env node
// Generate self-signed TLS cert for local HTTPS development (PORT=443)
// Usage: npm run certs
// Output: certs/cert.pem  certs/key.pem
'use strict';

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const CERTS = path.join(__dirname, '..', 'certs');

if (!fs.existsSync(CERTS)) fs.mkdirSync(CERTS, { recursive: true });

const certPath = path.join(CERTS, 'cert.pem');
const keyPath  = path.join(CERTS, 'key.pem');

if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  console.log('\n  ✓  Certs already exist:');
  console.log(`     ${certPath}`);
  console.log(`     ${keyPath}\n`);
  process.exit(0);
}

console.log('\n  ⚡  Generating self-signed TLS certificate…');

try {
  execSync(
    `openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" ` +
    `-days 365 -nodes -subj "/CN=localhost"`,
    { stdio: 'inherit' }
  );
  console.log('\n  ✓  Certs generated:');
  console.log(`     ${certPath}`);
  console.log(`     ${keyPath}`);
  console.log('\n  Start HTTPS server:  PORT=443 node system.js\n');
} catch {
  console.error('\n  ✗  openssl not found.');
  console.error('     Install OpenSSL or place your own cert.pem + key.pem in ./certs/\n');
  process.exit(1);
}
