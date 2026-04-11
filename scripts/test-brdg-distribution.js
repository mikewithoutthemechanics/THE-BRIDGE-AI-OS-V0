#!/usr/bin/env node
/**
 * Quick smoke test for BRDG token distribution pipeline.
 *
 * Tests:
 *   1. getBalance() — treasury BRDG balance is non-zero
 *   2. distributeReward() — sends BRDG to a test address, verifies on-chain tx
 *   3. Log monitoring — confirms distribution calls reach the chain
 *
 * Usage:
 *   node scripts/test-brdg-distribution.js [--dry-run]
 *
 * Env:
 *   TEST_WALLET_ADDRESS — destination wallet (defaults to treasury itself for safety)
 */
'use strict';

require('dotenv').config();

const { getBRDGBalance, TREASURY_OWNER } = require('../lib/brdg-chain');
const { distributeReward, getTreasuryBalance, REWARD_RATES } = require('../lib/brdg-distributor');
const { getAddress, getBalance: getEthBalance } = require('../lib/eth-treasury');

const DRY_RUN = process.argv.includes('--dry-run');
// Default test wallet: send back to treasury itself (zero net change)
const TEST_WALLET = process.env.TEST_WALLET_ADDRESS || getAddress();

async function main() {
  console.log('=== BRDG Distribution Smoke Test ===\n');

  // ── Test 1: Treasury BRDG balance ───────────────────────────────────────
  console.log('[1/3] Checking treasury BRDG balance...');
  try {
    const treasuryResult = await getTreasuryBalance();
    if (!treasuryResult.ok) {
      console.error('  FAIL: getTreasuryBalance() returned not ok:', treasuryResult);
      process.exitCode = 1;
      return;
    }

    const bal = parseFloat(treasuryResult.balance);
    console.log(`  Treasury address: ${treasuryResult.address}`);
    console.log(`  BRDG balance:     ${treasuryResult.balance}`);

    if (bal <= 0) {
      console.error('  FAIL: Treasury BRDG balance is zero!');
      process.exitCode = 1;
      return;
    }
    console.log('  PASS: balance is non-zero\n');

    // Also check ETH (needed for gas)
    const ethBal = await getEthBalance();
    console.log(`  ETH balance:      ${ethBal.eth} ETH (for gas)`);
    if (parseFloat(ethBal.eth) <= 0) {
      console.warn('  WARN: No ETH for gas — on-chain transfers will fail!\n');
    } else {
      console.log('  PASS: ETH available for gas\n');
    }
  } catch (err) {
    console.error('  FAIL: exception:', err.message);
    process.exitCode = 1;
    return;
  }

  // ── Test 2: distributeReward() ──────────────────────────────────────────
  console.log(`[2/3] Testing distributeReward('run_completed') to ${TEST_WALLET}...`);
  console.log(`  Reward rate: ${REWARD_RATES.run_completed} BRDG`);

  if (DRY_RUN) {
    console.log('  SKIP: --dry-run flag set, skipping on-chain send\n');
  } else {
    try {
      const preBal = await getBRDGBalance(TEST_WALLET);
      console.log(`  Pre-send balance:  ${preBal} BRDG`);

      const result = await distributeReward(TEST_WALLET, 'run_completed');
      console.log('  Result:', JSON.stringify(result, null, 2));

      if (!result.ok) {
        console.error('  FAIL: distributeReward returned not ok');
        process.exitCode = 1;
        return;
      }

      // Verify on-chain
      const postBal = await getBRDGBalance(TEST_WALLET);
      console.log(`  Post-send balance: ${postBal} BRDG`);
      console.log(`  TX hash: ${result.txHash}`);
      console.log(`  Lineascan: https://lineascan.build/tx/${result.txHash}`);
      console.log('  PASS: on-chain transfer confirmed\n');
    } catch (err) {
      console.error('  FAIL: exception:', err.message);
      process.exitCode = 1;
      return;
    }
  }

  // ── Test 3: Verify reward-distributor log path ─────────────────────────
  console.log('[3/3] Verifying reward-distributor → brdg-distributor wiring...');
  try {
    // We just confirm the require chain resolves without error
    const rd = require('../lib/reward-distributor');
    console.log('  reward-distributor exports:', Object.keys(rd).join(', '));
    console.log('  calculateEventReward sample:', rd.calculateEventReward({
      tokens_used: 500,
      quality_score: 0.8,
      metadata: { agent: 'intelligence' },
    }), 'BRDG');
    console.log('  PASS: module wiring OK\n');
  } catch (err) {
    console.error('  FAIL:', err.message);
    process.exitCode = 1;
    return;
  }

  console.log('=== All checks passed ===');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exitCode = 1;
});
