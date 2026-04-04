#!/usr/bin/env node
// Single-button deploy script
// Usage:
//   npm run deploy              → interactive platform picker
//   npm run deploy:heroku
//   npm run deploy:railway
//   npm run deploy:render
//   npm run deploy:fly
'use strict';

const { execSync, spawnSync } = require('child_process');
const readline = require('readline');
const path     = require('path');
const fs       = require('fs');

const ROOT = path.join(__dirname, '..');

function sh(cmd, opts = {}) {
  console.log(`\n  $ ${cmd}`);
  return spawnSync(cmd, { shell: true, stdio: 'inherit', cwd: ROOT, ...opts });
}

function check(cli, installHint) {
  try { execSync(`${cli} --version`, { stdio: 'ignore' }); return true; }
  catch { console.error(`\n  ✗  '${cli}' not found. Install: ${installHint}`); return false; }
}

// ─── Pre-deploy steps ─────────────────────────────────────────────────────
function preDeploy() {
  console.log('\n  ⚡  PRE-DEPLOY CHECKS');
  console.log('  ─────────────────────────────');

  // Preflight
  const r = spawnSync('node', ['scripts/preflight.js'], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) { console.error('\n  ✗  Preflight failed — aborting deploy.\n'); process.exit(1); }

  // Ensure git is clean (warn only)
  try {
    const dirty = execSync('git status --porcelain', { cwd: ROOT }).toString().trim();
    if (dirty) console.warn('  ⚠  Uncommitted changes detected — deploying working tree.');
  } catch { /* not a git repo */ }
}

// ─── Platform deployers ───────────────────────────────────────────────────
const platforms = {

  heroku: () => {
    if (!check('heroku', 'https://devcenter.heroku.com/articles/heroku-cli')) return;
    console.log('\n  ⚡  DEPLOYING → Heroku');
    sh('heroku login --interactive');
    // Create app if Procfile exists
    if (fs.existsSync(path.join(ROOT, 'Procfile'))) {
      sh('git add -A && git commit -m "deploy: god-mode-topology" --allow-empty');
      sh('git push heroku main');
    } else {
      console.error('  ✗  Procfile not found'); process.exit(1);
    }
    sh('heroku open');
  },

  railway: () => {
    if (!check('railway', 'npm install -g @railway/cli')) return;
    console.log('\n  ⚡  DEPLOYING → Railway');
    sh('railway login');
    sh('railway up');
    sh('railway open');
  },

  render: () => {
    console.log('\n  ⚡  DEPLOYING → Render');
    console.log('  Render deploys automatically from your Git repo.');
    console.log('  Ensure render.yaml is committed, then push:');
    sh('git add -A && git commit -m "deploy: god-mode-topology" --allow-empty');
    sh('git push');
    console.log('\n  ✓  Push complete — Render will auto-deploy from render.yaml.');
  },

  fly: () => {
    if (!check('fly', 'https://fly.io/docs/hands-on/install-flyctl/')) return;
    console.log('\n  ⚡  DEPLOYING → Fly.io');
    if (!fs.existsSync(path.join(ROOT, 'fly.toml'))) {
      sh('fly launch --no-deploy');
    }
    sh('fly deploy');
    sh('fly open');
  },
};

// ─── Main ─────────────────────────────────────────────────────────────────
async function main() {
  const target = process.argv[2];

  if (target && platforms[target]) {
    preDeploy();
    platforms[target]();
    return;
  }

  // Interactive picker
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('\n  ⚡  GOD MODE — ONE-BUTTON DEPLOY');
  console.log('  ─────────────────────────────────');
  console.log('  [1] Heroku');
  console.log('  [2] Railway');
  console.log('  [3] Render');
  console.log('  [4] Fly.io');
  console.log('  [q] Quit\n');

  rl.question('  Select platform: ', answer => {
    rl.close();
    const map = { '1':'heroku', '2':'railway', '3':'render', '4':'fly' };
    const choice = map[answer.trim()];
    if (!choice) { console.log('  Cancelled.\n'); return; }
    preDeploy();
    platforms[choice]();
  });
}

main();
