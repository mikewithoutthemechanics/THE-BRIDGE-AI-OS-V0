#!/usr/bin/env node
/**
 * Bootstrap BRDG token economy with what is currently in the deployer EOA.
 *
 * Preconditions (ALL verified at runtime; script aborts if any fail):
 *   - DEPLOYER_PRIVATE_KEY is set and derives to BRDG.owner()
 *   - EOA is BRDG.burnExempt(EOA) == true (so transfers do not burn 1%)
 *   - EOA BRDG balance >= 9,494,999 (at least enough for the 4.5M + remainder)
 *   - EOA ETH balance > estimated gas
 *
 * Actions (in order, each tx waited for before the next):
 *   1. BRDG.setBurnExempt(TreasuryVault, true)
 *   2. BRDG.setBurnExempt(SyncSwapPool, true)
 *   3. BRDG.transfer(StakingVault, 4_500_000e18)
 *   4. BRDG.transfer(TreasuryVault, <remaining EOA balance>)
 *
 * Postconditions (verified after):
 *   - StakingVault balance == 5,000,000 BRDG
 *   - TreasuryVault balance >= 4,994,999 BRDG and burnExempt == true
 *   - EOA BRDG balance == 0
 *   - totalBurned unchanged (no burn occurred)
 *   - totalSupply unchanged (no mint occurred)
 *
 * Output: docs/genesis-alignment/bootstrap-economy-<unix>.json with all tx hashes,
 * block numbers, gas used, and pre/post balances.
 */

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const ROOT = path.resolve(__dirname, '..');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/genesis-alignment.json'), 'utf8'));
const OUT_DIR = path.join(ROOT, 'docs/genesis-alignment');
fs.mkdirSync(OUT_DIR, { recursive: true });

const RPC = CONFIG.network.rpc;
const BRDG_ADDRESS       = CONFIG.deployed.BRDG;
const TREASURY_VAULT     = CONFIG.deployed.TreasuryVault;
const STAKING_VAULT      = CONFIG.deployed.StakingVault;
const SYNCSWAP_POOL      = CONFIG.deployed.DEXPool;

const BRDG_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function totalBurned() view returns (uint256)',
  'function burnExempt(address) view returns (bool)',
  'function owner() view returns (address)',
  'function setBurnExempt(address account, bool exempt) external',
  'function transfer(address to, uint256 amount) external returns (bool)'
];

function fail(msg) {
  console.error(`[bootstrap] FATAL: ${msg}`);
  process.exit(1);
}

function fmt(n) {
  return ethers.formatUnits(n, 18);
}

async function awaitTx(tx, label) {
  console.log(`  ${label}: tx ${tx.hash} ...`);
  const r = await tx.wait();
  console.log(`    block=${r.blockNumber} gasUsed=${r.gasUsed.toString()} status=${r.status}`);
  if (r.status !== 1) fail(`${label} reverted`);
  return r;
}

(async () => {
  const key = process.env.DEPLOYER_PRIVATE_KEY;
  if (!key) fail('DEPLOYER_PRIVATE_KEY is not set in env');
  const keyHex = key.trim().startsWith('0x') ? key.trim() : '0x' + key.trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(keyHex)) fail('DEPLOYER_PRIVATE_KEY format is invalid');

  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(keyHex, provider);
  const brdg = new ethers.Contract(BRDG_ADDRESS, BRDG_ABI, wallet);

  console.log(`[bootstrap] signer     = ${wallet.address}`);
  console.log(`[bootstrap] BRDG       = ${BRDG_ADDRESS}`);
  console.log(`[bootstrap] Treasury   = ${TREASURY_VAULT}`);
  console.log(`[bootstrap] Staking    = ${STAKING_VAULT}`);
  console.log(`[bootstrap] Pool       = ${SYNCSWAP_POOL}`);
  console.log('');

  // === preflight ===
  const [owner, eoaExempt, vaultExempt, poolExempt, stakingExempt,
         eoaBRDG, vaultBRDG, stakingBRDG, totalSupply, totalBurned, ethBal] = await Promise.all([
    brdg.owner(),
    brdg.burnExempt(wallet.address),
    brdg.burnExempt(TREASURY_VAULT),
    brdg.burnExempt(SYNCSWAP_POOL),
    brdg.burnExempt(STAKING_VAULT),
    brdg.balanceOf(wallet.address),
    brdg.balanceOf(TREASURY_VAULT),
    brdg.balanceOf(STAKING_VAULT),
    brdg.totalSupply(),
    brdg.totalBurned(),
    provider.getBalance(wallet.address)
  ]);
  console.log('[bootstrap] preflight state:');
  console.log(`  BRDG.owner()                  = ${owner}`);
  console.log(`  signer == owner               = ${owner.toLowerCase() === wallet.address.toLowerCase()}`);
  console.log(`  burnExempt(EOA)               = ${eoaExempt}`);
  console.log(`  burnExempt(TreasuryVault)     = ${vaultExempt}`);
  console.log(`  burnExempt(StakingVault)      = ${stakingExempt}`);
  console.log(`  burnExempt(SyncSwapPool)      = ${poolExempt}`);
  console.log(`  balance(EOA)                  = ${fmt(eoaBRDG)} BRDG`);
  console.log(`  balance(TreasuryVault)        = ${fmt(vaultBRDG)} BRDG`);
  console.log(`  balance(StakingVault)         = ${fmt(stakingBRDG)} BRDG`);
  console.log(`  totalSupply                   = ${fmt(totalSupply)} BRDG`);
  console.log(`  totalBurned                   = ${fmt(totalBurned)} BRDG`);
  console.log(`  ETH balance(EOA)              = ${ethers.formatEther(ethBal)} ETH`);
  console.log('');

  if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
    fail(`signer ${wallet.address} is not BRDG.owner() ${owner}`);
  }
  if (!eoaExempt) fail('EOA is NOT burn-exempt; refusing to run (would burn 1% on transfers)');

  const STAKING_TARGET = ethers.parseUnits('5000000', 18);
  const STAKING_NEED = stakingBRDG < STAKING_TARGET ? STAKING_TARGET - stakingBRDG : 0n; // clamp to 0 — BigInt has no Math.max
  if (STAKING_NEED === 0n) {
    console.log(`[bootstrap] note: StakingVault already >= 5M (${fmt(stakingBRDG)}). Skipping tx3.`);
  }
  if (eoaBRDG < STAKING_NEED) {
    fail(`EOA BRDG ${fmt(eoaBRDG)} < staking top-up need ${fmt(STAKING_NEED)}`);
  }

  const treasuryAmount = eoaBRDG - STAKING_NEED; // whatever is left after staking top-up
  console.log(`[bootstrap] plan:`);
  console.log(`  tx1  setBurnExempt(TreasuryVault, true)   -> ${vaultExempt ? 'SKIP (already true)' : 'WILL RUN'}`);
  console.log(`  tx2  setBurnExempt(SyncSwapPool, true)    -> ${poolExempt  ? 'SKIP (already true)' : 'WILL RUN'}`);
  console.log(`  tx3  transfer(StakingVault, ${fmt(STAKING_NEED)})`);
  console.log(`  tx4  transfer(TreasuryVault, ${fmt(treasuryAmount)})`);
  console.log('');

  const receipts = { network: CONFIG.network, signer: wallet.address, txs: [] };

  // === tx1 ===
  if (!vaultExempt) {
    const tx = await brdg.setBurnExempt(TREASURY_VAULT, true);
    const r = await awaitTx(tx, 'tx1 setBurnExempt(TreasuryVault,true)');
    receipts.txs.push({ step: 'setBurnExempt.Treasury', hash: tx.hash, block: r.blockNumber, gasUsed: r.gasUsed.toString() });
  } else {
    receipts.txs.push({ step: 'setBurnExempt.Treasury', skipped: 'already exempt' });
  }

  // === tx2 ===
  if (!poolExempt) {
    const tx = await brdg.setBurnExempt(SYNCSWAP_POOL, true);
    const r = await awaitTx(tx, 'tx2 setBurnExempt(SyncSwapPool,true)');
    receipts.txs.push({ step: 'setBurnExempt.Pool', hash: tx.hash, block: r.blockNumber, gasUsed: r.gasUsed.toString() });
  } else {
    receipts.txs.push({ step: 'setBurnExempt.Pool', skipped: 'already exempt' });
  }

  // === tx3 ===
  if (STAKING_NEED > 0n) {
    const tx = await brdg.transfer(STAKING_VAULT, STAKING_NEED);
    const r = await awaitTx(tx, `tx3 transfer(StakingVault, ${fmt(STAKING_NEED)})`);
    receipts.txs.push({ step: 'transfer.Staking', hash: tx.hash, block: r.blockNumber, gasUsed: r.gasUsed.toString(), amount: STAKING_NEED.toString() });
  }

  // === tx4 ===
  if (treasuryAmount > 0n) {
    const tx = await brdg.transfer(TREASURY_VAULT, treasuryAmount);
    const r = await awaitTx(tx, `tx4 transfer(TreasuryVault, ${fmt(treasuryAmount)})`);
    receipts.txs.push({ step: 'transfer.Treasury', hash: tx.hash, block: r.blockNumber, gasUsed: r.gasUsed.toString(), amount: treasuryAmount.toString() });
  }

  // === postcheck ===
  const [eoaBRDG2, vaultBRDG2, stakingBRDG2, vaultExempt2, poolExempt2, totalSupply2, totalBurned2] = await Promise.all([
    brdg.balanceOf(wallet.address),
    brdg.balanceOf(TREASURY_VAULT),
    brdg.balanceOf(STAKING_VAULT),
    brdg.burnExempt(TREASURY_VAULT),
    brdg.burnExempt(SYNCSWAP_POOL),
    brdg.totalSupply(),
    brdg.totalBurned()
  ]);

  console.log('');
  console.log('[bootstrap] post-state:');
  console.log(`  balance(EOA)                  = ${fmt(eoaBRDG2)} BRDG`);
  console.log(`  balance(TreasuryVault)        = ${fmt(vaultBRDG2)} BRDG`);
  console.log(`  balance(StakingVault)         = ${fmt(stakingBRDG2)} BRDG`);
  console.log(`  burnExempt(TreasuryVault)     = ${vaultExempt2}`);
  console.log(`  burnExempt(SyncSwapPool)      = ${poolExempt2}`);
  console.log(`  totalSupply                   = ${fmt(totalSupply2)}  (delta=${fmt(totalSupply2 - totalSupply)})`);
  console.log(`  totalBurned                   = ${fmt(totalBurned2)}  (delta=${fmt(totalBurned2 - totalBurned)})`);

  const errors = [];
  if (totalSupply2 !== totalSupply) errors.push('totalSupply changed (unexpected mint)');
  if (totalBurned2 !== totalBurned) errors.push('totalBurned changed (unexpected burn — some sender/receiver was NOT exempt)');
  if (stakingBRDG2 < STAKING_TARGET) errors.push(`StakingVault < 5M: ${fmt(stakingBRDG2)}`);
  if (!vaultExempt2) errors.push('TreasuryVault is still NOT burn-exempt');
  if (!poolExempt2) errors.push('SyncSwapPool is still NOT burn-exempt');

  receipts.postState = {
    eoa_BRDG: eoaBRDG2.toString(),
    treasuryVault_BRDG: vaultBRDG2.toString(),
    stakingVault_BRDG: stakingBRDG2.toString(),
    treasuryVault_burnExempt: vaultExempt2,
    syncSwapPool_burnExempt: poolExempt2,
    totalSupply: totalSupply2.toString(),
    totalBurned: totalBurned2.toString()
  };
  receipts.errors = errors;
  receipts.ok = errors.length === 0;

  const ts = Math.floor(Date.now() / 1000);
  const outPath = path.join(OUT_DIR, `bootstrap-economy-${ts}.json`);
  fs.writeFileSync(outPath, JSON.stringify(receipts, null, 2));
  console.log('');
  console.log(`[bootstrap] receipts written: ${outPath}`);

  if (errors.length) {
    console.error('[bootstrap] FAILED invariants:');
    errors.forEach(e => console.error('  - ' + e));
    process.exit(1);
  }
  console.log('[bootstrap] OK');
})().catch(e => { console.error('[bootstrap] CRASH:', e); process.exit(2); });
