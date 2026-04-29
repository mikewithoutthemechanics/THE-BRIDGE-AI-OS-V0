#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const target = (process.argv[2] || 'local').toLowerCase();

function log(msg) {
  process.stdout.write(`[deploy] ${msg}\n`);
}

function run(cmd, opts = {}) {
  log(`$ ${cmd}`);
  return execSync(cmd, {
    cwd: ROOT,
    stdio: 'inherit',
    ...opts,
  });
}

function runSafe(cmd) {
  try {
    run(cmd);
    return true;
  } catch (err) {
    log(`WARN: command failed: ${cmd}`);
    return false;
  }
}

function cmdOk(cmd) {
  try {
    execSync(cmd, { cwd: ROOT, stdio: 'ignore' });
    return true;
  } catch (_) {
    return false;
  }
}

function getPm2Command() {
  if (cmdOk('pm2 -v')) return 'pm2';
  if (cmdOk('npx pm2 -v')) return 'npx pm2';
  return null;
}

async function checkJson(url, headers = {}) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', ...headers },
  });
  const text = await res.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch (_) {
    payload = text;
  }
  return { ok: res.ok, status: res.status, payload };
}

async function main() {
  if (target !== 'local') {
    log(`Target "${target}" is not configured in this repository.`);
    log('Use "npm run deploy" for local/VM deployment with PM2.');
    process.exit(1);
  }

  const requiredFiles = ['gateway.js', 'ecosystem.config.js'];
  for (const rel of requiredFiles) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) {
      throw new Error(`Missing required file: ${rel}`);
    }
  }

  const pm2Cmd = getPm2Command();
  // Same app names as ecosystem.config.js apps[] — keep in sync when adding processes
  const managedApps = [
    'bridge-gateway',
    'unified-server',
    'super-brain',
    'auth-service',
    'terminal-proxy',
    'god-mode-topology',
    'god-mode-system',
    'ban-engine',
    'svg-engine',
    'overseer',
    'admin-api',
  ];
  if (pm2Cmd) {
    for (const app of managedApps) {
      const restarted = runSafe(`${pm2Cmd} restart ${app} --update-env`);
      if (!restarted) {
        runSafe(`${pm2Cmd} start ecosystem.config.js --only ${app} --update-env`);
      }
    }
  } else {
    log('PM2 not found. Skipping process-manager restart.');
    log('Install PM2 to use managed deploys: npm i -g pm2');
  }

  log('Running post-deploy health checks...');
  const health = await checkJson('http://localhost:8080/health');
  if (!health.ok) {
    throw new Error(`/health failed (${health.status}): ${JSON.stringify(health.payload)}`);
  }

  let crm = await checkJson('http://localhost:8080/api/crm/leads?limit=5');
  if (crm.status === 401 && process.env.ADMIN_TOKEN) {
    crm = await checkJson(
      'http://localhost:8080/api/crm/leads?limit=5',
      { Authorization: `Bearer ${process.env.ADMIN_TOKEN}` }
    );
  }
  if (crm.status === 401) {
    log('CRM leads endpoint is auth-protected (401) — gateway is up and route is reachable.');
    log('Deploy completed successfully.');
    return;
  }
  if (!crm.ok) {
    throw new Error(`/api/crm/leads failed (${crm.status}): ${JSON.stringify(crm.payload)}`);
  }

  const leadCount = Array.isArray(crm.payload?.leads) ? crm.payload.leads.length : 'n/a';
  log(`Health OK (${health.status})`);
  log(`CRM leads OK (${crm.status}) count=${leadCount}`);
  log('Deploy completed successfully.');
}

main().catch((err) => {
  process.stderr.write(`[deploy] FAILED: ${err.message}\n`);
  process.exit(1);
});
