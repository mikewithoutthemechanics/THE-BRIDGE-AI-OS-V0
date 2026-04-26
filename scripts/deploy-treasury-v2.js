#!/usr/bin/env node
/**
 * Deploy TreasuryVaultV2 on Linea, top it up with 10M BRDG via mint, and
 * classify() so the 40/25/20/15 buckets populate.
 *
 * Preconditions:
 *   - DEPLOYER_PRIVATE_KEY set, derives to BRDG.owner()
 *   - BRDG totalSupply + 10M <= MAX_SUPPLY (100M)
 *
 * Actions:
 *   1. Deploy TreasuryVaultV2(brdg) — constructor takes the BRDG token address
 *   2. setBurnExempt(v2, true) on BRDG
 *   3. mint(v2, 10_000_000e18)
 *   4. classify(10_000_000e18) — populates ops 4M / liq 2.5M / reserve 2M / founder 1.5M
 *
 * Postcheck:
 *   - v2.brdgBuckets = (4M, 2.5M, 2M, 1.5M) exactly
 *   - brdg.balanceOf(v2) == 10M
 *   - brdg.burnExempt(v2) == true
 *   - totalBurned unchanged
 *
 * Output: docs/genesis-alignment/deploy-treasury-v2-<unix>.json
 */
'use strict';

const fs = require('fs');
const path = require('path');
const hre = require('hardhat');
const { ethers } = hre;

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config/genesis-alignment.json');
const OUT_DIR = path.join(ROOT, 'docs/genesis-alignment');
fs.mkdirSync(OUT_DIR, { recursive: true });

// Well-known legacy v1 vault — used in receipt when cfg.deployed.TreasuryVault_legacy is absent.
const LEGACY_TREASURY_VAULT_V1 = '0x6daA8db214B7c7D95fB26d98c4Fc4DE82430572A';

function fail(msg) { console.error(`[deploy-tv2] FATAL: ${msg}`); process.exit(1); }
function fmt(n) { return ethers.formatUnits(n, 18); }
async function awaitTx(tx, label) {
  console.log(`  ${label}: ${tx.hash} ...`);
  const r = await tx.wait();
  console.log(`    block=${r.blockNumber} gasUsed=${r.gasUsed.toString()} status=${r.status}`);
  if (r.status !== 1) fail(`${label} reverted`);
  return r;
}

async function main() {
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const BRDG_ADDRESS = cfg.deployed.BRDG;

  const BRDG_ABI = [
    'function owner() view returns (address)',
    'function balanceOf(address) view returns (uint256)',
    'function totalSupply() view returns (uint256)',
    'function totalBurned() view returns (uint256)',
    'function burnExempt(address) view returns (bool)',
    'function setBurnExempt(address,bool)',
    'function mint(address,uint256)',
    'function MAX_SUPPLY() view returns (uint256)'
  ];

  const [deployer] = await ethers.getSigners();
  const provider = ethers.provider;
  const brdg = new ethers.Contract(BRDG_ADDRESS, BRDG_ABI, deployer);

  const [owner, totalSupply0, totalBurned0, maxSupply, ethBal] = await Promise.all([
    brdg.owner(), brdg.totalSupply(), brdg.totalBurned(), brdg.MAX_SUPPLY(), provider.getBalance(deployer.address)
  ]);
  if (owner.toLowerCase() !== deployer.address.toLowerCase()) fail(`signer ${deployer.address} != BRDG.owner ${owner}`);

  console.log(`[deploy-tv2] signer         = ${deployer.address}`);
  console.log(`[deploy-tv2] ETH            = ${ethers.formatEther(ethBal)}`);
  console.log(`[deploy-tv2] BRDG           = ${BRDG_ADDRESS}`);
  console.log(`[deploy-tv2] totalSupply    = ${fmt(totalSupply0)}`);
  console.log(`[deploy-tv2] MAX_SUPPLY     = ${fmt(maxSupply)}`);

  const MINT_AMOUNT = ethers.parseUnits('10000000', 18);
  if (totalSupply0 + MINT_AMOUNT > maxSupply) fail('projected mint would exceed MAX_SUPPLY');

  // 1. Deploy
  console.log('\n[deploy-tv2] deploying TreasuryVaultV2...');
  const Factory = await ethers.getContractFactory('TreasuryVaultV2');
  const v2 = await Factory.deploy(BRDG_ADDRESS);
  await v2.waitForDeployment();
  const v2Address = await v2.getAddress();
  const deployTx = v2.deploymentTransaction();
  const deployReceipt = await deployTx.wait();
  console.log(`  -> ${v2Address}  tx ${deployTx.hash}  gasUsed=${deployReceipt.gasUsed.toString()}`);

  const txs = [{
    step: 'deploy',
    address: v2Address,
    hash: deployTx.hash,
    block: deployReceipt.blockNumber,
    gasUsed: deployReceipt.gasUsed.toString()
  }];

  // 2. setBurnExempt
  {
    const tx = await brdg.setBurnExempt(v2Address, true);
    const r = await awaitTx(tx, `setBurnExempt(v2=${v2Address}, true)`);
    txs.push({ step: 'setBurnExempt', hash: tx.hash, block: r.blockNumber, gasUsed: r.gasUsed.toString() });
  }

  // 3. mint
  {
    const tx = await brdg.mint(v2Address, MINT_AMOUNT);
    const r = await awaitTx(tx, `mint(v2, ${fmt(MINT_AMOUNT)})`);
    txs.push({ step: 'mint', hash: tx.hash, block: r.blockNumber, gasUsed: r.gasUsed.toString(), amount: MINT_AMOUNT.toString() });
  }

  // 4. classify
  {
    const tx = await v2.classify(MINT_AMOUNT);
    const r = await awaitTx(tx, `classify(${fmt(MINT_AMOUNT)})`);
    txs.push({ step: 'classify', hash: tx.hash, block: r.blockNumber, gasUsed: r.gasUsed.toString(), amount: MINT_AMOUNT.toString() });
  }

  // postcheck
  const [v2bal, v2ops, v2liq, v2res, v2fnd, v2exempt, totalSupply1, totalBurned1] = await Promise.all([
    brdg.balanceOf(v2Address),
    v2.brdgBuckets().then(r => r[0]), // struct returns as array
    v2.brdgBuckets().then(r => r[1]),
    v2.brdgBuckets().then(r => r[2]),
    v2.brdgBuckets().then(r => r[3]),
    brdg.burnExempt(v2Address),
    brdg.totalSupply(),
    brdg.totalBurned()
  ]);

  const expected = {
    ops: (MINT_AMOUNT * 4000n) / 10000n,
    liq: (MINT_AMOUNT * 2500n) / 10000n,
    res: (MINT_AMOUNT * 2000n) / 10000n,
  };
  expected.fnd = MINT_AMOUNT - expected.ops - expected.liq - expected.res;

  console.log('\n[deploy-tv2] post-state:');
  console.log(`  balanceOf(v2)       = ${fmt(v2bal)}`);
  console.log(`  buckets.ops         = ${fmt(v2ops)}  (expect ${fmt(expected.ops)})`);
  console.log(`  buckets.liquidity   = ${fmt(v2liq)}  (expect ${fmt(expected.liq)})`);
  console.log(`  buckets.reserve     = ${fmt(v2res)}  (expect ${fmt(expected.res)})`);
  console.log(`  buckets.founder     = ${fmt(v2fnd)}  (expect ${fmt(expected.fnd)})`);
  console.log(`  burnExempt(v2)      = ${v2exempt}`);
  console.log(`  totalSupply delta   = ${fmt(totalSupply1 - totalSupply0)}`);
  console.log(`  totalBurned delta   = ${fmt(totalBurned1 - totalBurned0)}`);

  const errors = [];
  if (v2bal !== MINT_AMOUNT) errors.push(`v2 balance != 10M: ${fmt(v2bal)}`);
  if (v2ops !== expected.ops) errors.push('ops bucket mismatch');
  if (v2liq !== expected.liq) errors.push('liquidity bucket mismatch');
  if (v2res !== expected.res) errors.push('reserve bucket mismatch');
  if (v2fnd !== expected.fnd) errors.push('founder bucket mismatch');
  if (!v2exempt) errors.push('v2 not burn-exempt');
  if (totalBurned1 !== totalBurned0) errors.push('totalBurned changed');
  if (totalSupply1 - totalSupply0 !== MINT_AMOUNT) errors.push('totalSupply delta != 10M');

  const receipt = {
    network: cfg.network,
    deployer: deployer.address,
    TreasuryVaultV2: v2Address,
    legacyTreasuryVault: (cfg.deployed.TreasuryVault_legacy && cfg.deployed.TreasuryVault_legacy.address) || LEGACY_TREASURY_VAULT_V1,
    mintAmount: MINT_AMOUNT.toString(),
    buckets: { ops: v2ops.toString(), liquidity: v2liq.toString(), reserve: v2res.toString(), founder: v2fnd.toString() },
    totalSupplyBefore: totalSupply0.toString(),
    totalSupplyAfter:  totalSupply1.toString(),
    totalBurnedBefore: totalBurned0.toString(),
    totalBurnedAfter:  totalBurned1.toString(),
    txs,
    errors,
    ok: errors.length === 0,
    deployedAt: new Date().toISOString()
  };

  const out = path.join(OUT_DIR, `deploy-treasury-v2-${Math.floor(Date.now() / 1000)}.json`);
  fs.writeFileSync(out, JSON.stringify(receipt, null, 2));
  console.log(`\n[deploy-tv2] receipt: ${out}`);

  if (errors.length) { errors.forEach(e => console.error('  - ' + e)); process.exit(1); }
  console.log('[deploy-tv2] OK');
}

main().catch(e => { console.error('[deploy-tv2] CRASH:', e); process.exit(2); });
