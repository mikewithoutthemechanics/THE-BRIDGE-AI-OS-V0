#!/usr/bin/env node
// Quick health-check against the running server
// Usage: npm run health
'use strict';

const http  = require('http');
const https = require('https');

const PORT     = parseInt(process.env.PORT, 10) || 3000;
const IS_HTTPS = PORT === 443 || process.env.HTTPS === 'true';
const client   = IS_HTTPS ? https : http;
const url      = `${IS_HTTPS ? 'https' : 'http'}://localhost:${PORT}/health`;

console.log(`\n  ⚡  Health check → ${url}`);

const req = client.get(url, { rejectUnauthorized: false }, res => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    try {
      const json = JSON.parse(body);
      console.log(`  STATUS  : ${json.status?.toUpperCase() || '?'}`);
      console.log(`  PORT    : ${json.port}`);
      console.log(`  ENV     : ${json.env}`);
      console.log(`  UPTIME  : ${json.uptime}s`);
      console.log(`  HTTP    : ${res.statusCode}\n`);
      process.exit(json.status === 'ok' ? 0 : 1);
    } catch {
      console.log(`  RAW: ${body}\n`);
    }
  });
});

req.on('error', err => {
  console.error(`  ✗  Server unreachable on port ${PORT}: ${err.message}`);
  console.error('     Is it running?  npm run dev\n');
  process.exit(1);
});

req.setTimeout(3000, () => {
  console.error(`  ✗  Timeout after 3s\n`);
  process.exit(1);
});
