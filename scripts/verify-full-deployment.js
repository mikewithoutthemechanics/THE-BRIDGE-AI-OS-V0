#!/usr/bin/env node
/**
 * Full Deployment Verification - GitHub, VPS, and Supabase
 * 
 * Checks that all three targets are in sync and operational.
 */

'use strict';

const { execSync } = require('child_process');
const https = require('https');
const http = require('http');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const VPS_HOST = process.env.VPS_HOST || '37.27.245.219';
const VPS_PORT = process.env.VPS_PORT || '3000';
const GITHUB_REPO = 'bridgeaios/THE-BRIDGE-AI-OS-V0';

// Colors
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const NC = '\x1b[0m';

let exitCode = 0;

function log(section, message, type = 'info') {
  const color = type === 'success' ? GREEN : type === 'error' ? RED : type === 'warn' ? YELLOW : BLUE;
  console.log(`${color}[${section}]${NC} ${message}`);
}

function check(section, condition, successMsg, errorMsg) {
  if (condition) {
    log(section, successMsg, 'success');
    return true;
  } else {
    log(section, errorMsg, 'error');
    exitCode = 1;
    return false;
  }
}

async function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }));
    });
    req.on('error', reject);
    req.setTimeout(options.timeout || 10000, () => reject(new Error('Request timeout')));
    req.end();
  });
}

// ============================================================================
// SECTION 1: Local Git Status
// ============================================================================
console.log('\n' + '='.repeat(70));
console.log('SECTION 1: LOCAL GIT REPOSITORY');
console.log('='.repeat(70));

try {
  // Check if we're in a git repo
  const gitStatus = execSync('git status --short', { cwd: path.join(__dirname, '..'), encoding: 'utf8' }).trim();
  const gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: path.join(__dirname, '..'), encoding: 'utf8' }).trim();
  const gitCommit = execSync('git rev-parse --short HEAD', { cwd: path.join(__dirname, '..'), encoding: 'utf8' }).trim();
  const gitCommitMsg = execSync('git log -1 --pretty=%B', { cwd: path.join(__dirname, '..'), encoding: 'utf8' }).trim().split('\n')[0];
  
  check('GIT', gitBranch === 'main', `On branch: ${gitBranch}`, `Not on main branch: ${gitBranch}`);
  check('GIT', gitCommit, `Latest commit: ${gitCommit}`, 'Failed to get commit');
  check('GIT', true, `Message: ${gitCommitMsg.substring(0, 50)}${gitCommitMsg.length > 50 ? '...' : ''}`, '');
  
  if (gitStatus) {
    log('GIT', `Uncommitted changes:\n${gitStatus}`, 'warn');
    exitCode = 1;
  } else {
    check('GIT', true, 'Working directory clean', '');
  }
} catch (e) {
  check('GIT', false, '', `Git check failed: ${e.message}`);
}

// ============================================================================
// SECTION 2: GitHub Remote Status
// ============================================================================
console.log('\n' + '='.repeat(70));
console.log('SECTION 2: GITHUB REMOTE');
console.log('='.repeat(70));

try {
  // Check remote URL
  const remoteUrl = execSync('git remote get-url origin', { cwd: path.join(__dirname, '..'), encoding: 'utf8' }).trim();
  const hasGitHub = remoteUrl.includes('github.com') && remoteUrl.includes(GITHUB_REPO);
  check('GITHUB', hasGitHub, `Remote: ${GITHUB_REPO}`, `Wrong remote: ${remoteUrl}`);
  
  // Check if local is ahead/behind remote
  try {
    execSync('git fetch origin main --quiet', { cwd: path.join(__dirname, '..') });
    const localCommit = execSync('git rev-parse HEAD', { cwd: path.join(__dirname, '..'), encoding: 'utf8' }).trim();
    const remoteCommit = execSync('git rev-parse origin/main', { cwd: path.join(__dirname, '..'), encoding: 'utf8' }).trim();
    
    if (localCommit === remoteCommit) {
      check('GITHUB', true, 'Local and remote are in sync', '');
    } else {
      const ahead = execSync('git rev-list origin/main..HEAD --count', { cwd: path.join(__dirname, '..'), encoding: 'utf8' }).trim();
      const behind = execSync('git rev-list HEAD..origin/main --count', { cwd: path.join(__dirname, '..'), encoding: 'utf8' }).trim();
      
      if (parseInt(ahead) > 0) {
        log('GITHUB', `Local is ${ahead} commit(s) AHEAD of remote - needs push`, 'warn');
        exitCode = 1;
      }
      if (parseInt(behind) > 0) {
        log('GITHUB', `Local is ${behind} commit(s) BEHIND remote - needs pull`, 'warn');
        exitCode = 1;
      }
    }
  } catch (e) {
    log('GITHUB', `Could not compare with remote: ${e.message}`, 'warn');
  }
} catch (e) {
  check('GITHUB', false, '', `GitHub check failed: ${e.message}`);
}

// ============================================================================
// SECTION 3: VPS Deployment Status
// ============================================================================
console.log('\n' + '='.repeat(70));
console.log('SECTION 3: VPS DEPLOYMENT');
console.log('='.repeat(70));

async function checkVPS() {
  const baseUrl = `http://${VPS_HOST}:${VPS_PORT}`;
  
  // Health check
  try {
    const health = await httpRequest(`${baseUrl}/health`);
    check('VPS', health.status === 200, `Health endpoint: HTTP ${health.status}`, `Health check failed: HTTP ${health.status}`);
    if (health.status === 200) {
      try {
        const healthData = JSON.parse(health.data);
        log('VPS', `Status: ${healthData.status || 'OK'}, Uptime: ${healthData.uptime || 'unknown'}`, 'info');
      } catch (_) {}
    }
  } catch (e) {
    check('VPS', false, '', `VPS unreachable at ${baseUrl}: ${e.message}`);
    return;
  }
  
  // Check withdrawal endpoints
  const endpoints = [
    { path: '/api/user/withdraw/limits', name: 'Withdrawal limits' },
    { path: '/api/swap/quote?amount=100', name: 'Swap quote' },
    { path: '/api/swap/pool', name: 'Pool liquidity' }
  ];
  
  for (const endpoint of endpoints) {
    try {
      const res = await httpRequest(`${baseUrl}${endpoint.path}`);
      const ok = res.status === 200 || res.status === 401; // 401 is OK (needs auth)
      check('VPS', ok, `${endpoint.name}: HTTP ${res.status}`, `${endpoint.name}: Failed (HTTP ${res.status})`);
    } catch (e) {
      check('VPS', false, '', `${endpoint.name}: ${e.message}`);
    }
  }
  
  // Compare Git commit on VPS
  try {
    const { exec } = require('child_process');
    const vpsCommit = execSync(`ssh root@${VPS_HOST} "cd /opt/bridge-os && git rev-parse --short HEAD"`, { encoding: 'utf8' }).trim();
    const localCommit = execSync('git rev-parse --short HEAD', { cwd: path.join(__dirname, '..'), encoding: 'utf8' }).trim();
    
    if (vpsCommit === localCommit) {
      check('VPS', true, `VPS code matches local (${vpsCommit})`, '');
    } else {
      log('VPS', `VPS commit (${vpsCommit}) != Local commit (${localCommit})`, 'warn');
      log('VPS', 'Run: ssh root@' + VPS_HOST + ' "cd /opt/bridge-os && git pull origin main"', 'info');
      exitCode = 1;
    }
  } catch (e) {
    log('VPS', `Could not check VPS git status: ${e.message}`, 'warn');
  }
}

(async () => {

await checkVPS();

// ============================================================================
// SECTION 4: Supabase Database Status
// ============================================================================
console.log('\n' + '='.repeat(70));
console.log('SECTION 4: SUPABASE DATABASE');
console.log('='.repeat(70));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ADMIN_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  check('SUPABASE', false, '', 'SUPABASE_URL or SUPABASE_SERVICE_KEY not set in .env');
} else {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    
    // Check required tables
    const requiredTables = [
      'withdrawal_requests',
      'agent_claims',
      'fiat_payouts',
      'withdrawal_claims',
      'admin_withdrawals'
    ];
    
    for (const table of requiredTables) {
      try {
        const { error } = await supabase.from(table).select('*', { head: true, count: 'exact' });
        if (error && error.code === '42P01') {
          check('SUPABASE', false, '', `${table}: Table does not exist`);
          log('SUPABASE', `Run: node migrations/apply-withdrawal-system.js`, 'info');
        } else if (error) {
          check('SUPABASE', false, '', `${table}: ${error.message}`);
        } else {
          check('SUPABASE', true, `${table}: Exists`, '');
        }
      } catch (e) {
        check('SUPABASE', false, '', `${table}: ${e.message}`);
      }
    }
    
    // Check users.wallet_address column
    try {
      const { error } = await supabase.from('users').select('wallet_address').limit(1);
      if (error && error.message.includes('wallet_address')) {
        log('SUPABASE', 'users.wallet_address column missing', 'warn');
        log('SUPABASE', 'Run: ALTER TABLE users ADD COLUMN wallet_address TEXT;', 'info');
      } else {
        check('SUPABASE', true, 'users.wallet_address: Exists', '');
      }
    } catch (e) {
      log('SUPABASE', `Could not check users.wallet_address: ${e.message}`, 'warn');
    }
    
  } catch (e) {
    check('SUPABASE', false, '', `Supabase connection failed: ${e.message}`);
  }
}

// ============================================================================
// SECTION 5: On-Chain Status (Linea)
// ============================================================================
console.log('\n' + '='.repeat(70));
console.log('SECTION 5: ON-CHAIN STATUS (Linea L2)');
console.log('='.repeat(70));

try {
  const { getProvider } = require('../lib/treasury');
  const provider = getProvider();
  
  const blockNumber = await provider.getBlockNumber();
  check('CHAIN', blockNumber > 0, `Linea RPC connected (block ${blockNumber})`, 'Linea RPC connection failed');
  
  // Check treasury wallet
  try {
    const { getAddress, getBalance } = require('../lib/eth-treasury');
    const address = getAddress();
    const balance = await getBalance();
    check('CHAIN', address, `Treasury wallet: ${address}`, '');
    check('CHAIN', true, `ETH balance: ${balance.eth} ETH`, '');
    
    if (parseFloat(balance.eth) < 0.01) {
      log('CHAIN', 'WARNING: Low ETH balance for gas fees', 'warn');
    }
  } catch (e) {
    check('CHAIN', false, '', `Treasury wallet error: ${e.message}`);
  }
  
  // Check BRDG contract
  try {
    const { getTokenStats } = require('../lib/brdg-chain');
    const stats = await getTokenStats();
    check('CHAIN', stats.token.address, `BRDG contract: ${stats.token.address}`, '');
    check('CHAIN', true, `Total supply: ${stats.token.totalSupply}`, '');
  } catch (e) {
    check('CHAIN', false, '', `BRDG contract error: ${e.message}`);
  }
  
  // Check swap pool liquidity
  try {
    const { checkPoolLiquidity } = require('../lib/brdg-swap');
    const pool = await checkPoolLiquidity();
    if (pool.exists) {
      check('CHAIN', true, `Swap pool: ${pool.pool}`, '');
      check('CHAIN', true, `Liquidity: ${pool.brdgReserve} BRDG / ${pool.ethReserve} ETH`, '');
    } else {
      log('CHAIN', 'Swap pool does not exist or has no liquidity', 'warn');
    }
  } catch (e) {
    log('CHAIN', `Pool check failed: ${e.message}`, 'warn');
  }
  
} catch (e) {
  check('CHAIN', false, '', `On-chain check failed: ${e.message}`);
}

// ============================================================================
// SUMMARY
// ============================================================================
console.log('\n' + '='.repeat(70));
console.log('VERIFICATION SUMMARY');
console.log('='.repeat(70));

if (exitCode === 0) {
  console.log(`${GREEN}✓ ALL CHECKS PASSED${NC}`);
  console.log('\nAll systems operational:');
  console.log('  • GitHub repository up to date');
  console.log('  • VPS running latest code');
  console.log('  • Supabase tables created');
  console.log('  • Linea blockchain connected');
  console.log('\nWithdrawal system is READY');
} else {
  console.log(`${RED}✗ SOME CHECKS FAILED${NC}`);
  console.log('\nRequired actions:');
  console.log('  1. If uncommitted changes: git add -A && git commit && git push');
  console.log('  2. If VPS behind: ssh root@' + VPS_HOST + ' "cd /opt/bridge-os && git pull"');
  console.log('  3. If tables missing: node migrations/apply-withdrawal-system.js');
  console.log('  4. If on-chain issues: Check .env for TREASURY_PRIVATE_KEY and RPC settings');
}

console.log('\nSee DEPLOY_NOW.md for detailed deployment instructions');
console.log('='.repeat(70) + '\n');

process.exit(exitCode);

})();
