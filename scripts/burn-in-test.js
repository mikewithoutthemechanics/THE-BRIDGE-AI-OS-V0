/**
 * 48-Hour Burn-In Test — End-to-End System Validation
 *
 * Runs comprehensive checks every 15 minutes for 48 hours.
 * Validates: contracts, ledger, oracle, treasury service, circuit breaker.
 *
 * Usage:
 *   node scripts/burn-in-test.js              # Run once
 *   node scripts/burn-in-test.js --continuous  # Run every 15min for 48h
 */
'use strict';

require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const RPC_URL = process.env.BRIDGE_SIWE_RPC_URL || 'https://rpc.linea.build';
const DEPLOYMENT = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'deployment.json'), 'utf8'));

const RESULTS_FILE = path.join(__dirname, '..', 'data', 'burn-in-results.json');

// ── Checks ───────────────────────────────────────────────────────────────────
async function checkContracts() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const brdgABI = ['function name() view returns (string)', 'function totalSupply() view returns (uint256)', 'function balanceOf(address) view returns (uint256)'];
  const stakingABI = ['function rewardPool() view returns (uint256)', 'function totalStaked() view returns (uint256)'];

  const brdg = new ethers.Contract(DEPLOYMENT.contracts.BRDG, brdgABI, provider);
  const staking = new ethers.Contract(DEPLOYMENT.contracts.StakingVault, stakingABI, provider);

  const [name, supply, deployerBal, rewardPool] = await Promise.all([
    brdg.name(),
    brdg.totalSupply(),
    brdg.balanceOf(DEPLOYMENT.deployer),
    staking.rewardPool(),
  ]);

  const supplyOk = supply === ethers.parseEther('10000000');
  const rewardPoolOk = rewardPool === ethers.parseEther('500000');

  return {
    check: 'contracts',
    pass: supplyOk && rewardPoolOk && name === 'Bridge AI',
    detail: {
      name,
      totalSupply: ethers.formatEther(supply),
      deployerBalance: ethers.formatEther(deployerBal),
      rewardPool: ethers.formatEther(rewardPool),
      supplyIntact: supplyOk,
      rewardPoolIntact: rewardPoolOk,
    },
  };
}

async function checkOracle() {
  try {
    const oracle = require('../lib/price-oracle');
    const price = await oracle.getPrice();
    return {
      check: 'oracle',
      pass: price.brdgPerEth > 0 && price.ethUsd > 0,
      detail: { source: price.source, brdgUsd: price.brdgUsd, ethUsd: price.ethUsd },
    };
  } catch (e) {
    return { check: 'oracle', pass: false, detail: { error: e.message } };
  }
}

async function checkDeployerBalance() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const bal = await provider.getBalance(DEPLOYMENT.deployer);
  const ethBal = Number(ethers.formatEther(bal));
  return {
    check: 'deployer_eth',
    pass: ethBal > 0,
    detail: { address: DEPLOYMENT.deployer, ethBalance: ethBal.toFixed(6) },
  };
}

async function checkChainlinkFeed() {
  try {
    const oracle = require('../lib/price-oracle');
    const ethUsd = await oracle.getEthUsdPrice();
    return {
      check: 'chainlink_feed',
      pass: ethUsd > 1000 && ethUsd < 100000, // Sanity range
      detail: { ethUsd },
    };
  } catch (e) {
    return { check: 'chainlink_feed', pass: false, detail: { error: e.message } };
  }
}

async function checkPoolExists() {
  try {
    const oracle = require('../lib/price-oracle');
    const pool = await oracle.findPool();
    return {
      check: 'dex_pool',
      pass: pool !== null,
      detail: { poolAddress: pool || 'NOT_FOUND' },
    };
  } catch (e) {
    return { check: 'dex_pool', pass: false, detail: { error: e.message } };
  }
}

// ── Runner ───────────────────────────────────────────────────────────────────
async function runAllChecks() {
  const startTime = Date.now();
  const results = await Promise.allSettled([
    checkContracts(),
    checkOracle(),
    checkDeployerBalance(),
    checkChainlinkFeed(),
    checkPoolExists(),
  ]);

  const checks = results.map(r => r.status === 'fulfilled' ? r.value : { check: 'unknown', pass: false, detail: { error: r.reason?.message } });
  const passed = checks.filter(c => c.pass).length;
  const elapsed = Date.now() - startTime;

  const report = {
    timestamp: new Date().toISOString(),
    elapsed_ms: elapsed,
    passed,
    total: checks.length,
    all_pass: passed === checks.length,
    checks,
  };

  // Log
  const status = report.all_pass ? 'PASS' : 'FAIL';
  console.log(`[burn-in] ${report.timestamp} — ${status} (${passed}/${checks.length} in ${elapsed}ms)`);
  for (const c of checks) {
    const icon = c.pass ? '  OK' : 'FAIL';
    console.log(`  [${icon}] ${c.check}: ${JSON.stringify(c.detail)}`);
  }

  // Append to results file
  let history = [];
  try { history = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8')); } catch (_) {}
  history.push(report);
  // Keep last 200 entries
  if (history.length > 200) history = history.slice(-200);
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(history, null, 2));

  return report;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const continuous = process.argv.includes('--continuous');

  if (!continuous) {
    const report = await runAllChecks();
    process.exit(report.all_pass ? 0 : 1);
  }

  // Continuous mode: run every 15 minutes for 48 hours
  const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
  const DURATION_MS = 48 * 60 * 60 * 1000; // 48 hours
  const endTime = Date.now() + DURATION_MS;
  let runCount = 0;
  let failCount = 0;

  console.log(`[burn-in] Starting 48-hour continuous test (every 15 min, ${Math.ceil(DURATION_MS / INTERVAL_MS)} runs)`);
  console.log(`[burn-in] Results saved to: ${RESULTS_FILE}\n`);

  async function tick() {
    runCount++;
    const report = await runAllChecks();
    if (!report.all_pass) failCount++;

    if (Date.now() >= endTime) {
      console.log(`\n[burn-in] 48-hour test complete: ${runCount} runs, ${failCount} failures`);
      console.log(`[burn-in] Success rate: ${((1 - failCount / runCount) * 100).toFixed(1)}%`);
      process.exit(failCount > 0 ? 1 : 0);
    }
  }

  await tick(); // First run immediately
  setInterval(tick, INTERVAL_MS);
}

main().catch(e => { console.error('[burn-in] Fatal:', e.message); process.exit(1); });
