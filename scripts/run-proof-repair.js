#!/usr/bin/env node
/**
 * Direct proof chain repair — runs locally with Supabase credentials
 * Executes: diagnoseChain() then rebuildChainFrom(14)
 */

require('dotenv').config();

const proofStore = require('./lib/proof-store');

async function main() {
  try {
    console.log('\n=== PROOF CHAIN REPAIR ===\n');

    console.log('Step 1: Diagnosing chain integrity...');
    const diagnosis = await proofStore.diagnoseChain(1000);

    console.log(`Total proofs: ${diagnosis.totalProofs}`);
    console.log(`Chain health: ${diagnosis.chainHealth}`);
    console.log(`Issues found: ${diagnosis.integrityIssues.length}`);

    if (diagnosis.integrityIssues.length > 0) {
      console.log(`\nFirst broken point: Transaction #${diagnosis.firstBrokenAt}`);
      console.log('\nDetails of first 3 issues:');
      diagnosis.integrityIssues.slice(0, 3).forEach((issue, i) => {
        console.log(`  ${i+1}. Index ${issue.index} (${issue.transactionId}): ${issue.type}`);
        if (issue.type === 'hash_mismatch') {
          console.log(`     Stored: ${issue.stored.slice(0, 32)}...`);
          console.log(`     Computed: ${issue.computed.slice(0, 32)}...`);
        }
      });
    } else {
      console.log('\n✓ Chain is healthy! No repair needed.');
      return;
    }

    // Repair from the first broken point
    const startIndex = diagnosis.firstBrokenAt || 0;
    console.log(`\nStep 2: Rebuilding chain from transaction #${startIndex}...`);

    const result = await proofStore.rebuildChainFrom(startIndex);

    if (result.error) {
      console.error(`✗ Repair failed: ${result.error}`);
      process.exit(1);
    }

    console.log(`✓ Rebuilt ${result.rebuilt} transactions`);
    if (result.newTipHash) {
      console.log(`  New chain tip: ${result.newTipHash.slice(0, 32)}...`);
    }

    // Verify the chain after repair
    console.log('\nStep 3: Verifying repaired chain...');
    const verification = await proofStore.verifyChain(1000);

    if (verification.valid) {
      console.log(`✓ Chain integrity verified!`);
      console.log(`  Total proofs: ${verification.length}`);
      console.log(`  Status: ${verification.status}`);
    } else {
      console.log(`✗ Chain still has issues:`);
      console.log(`  Broken at: ${verification.brokenAt}`);
      console.log(`  Reason: ${verification.reason}`);
      process.exit(1);
    }

    console.log('\n=== REPAIR COMPLETE ===\n');

  } catch (e) {
    console.error('Error:', e.message);
    console.error(e.stack);
    process.exit(1);
  }
}

main();
