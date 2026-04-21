#!/usr/bin/env node
/**
 * Fund the freshly deployed vesting contracts + top up TreasuryVault to genesis 10M.
 *
 * Preconditions (verified at runtime):
 *   - config.vestingContracts.* all populated (deploy-vesting.js ran)
 *   - signer == BRDG.owner() (only owner can setBurnExempt + mint)
 *   - all vesting contracts are smart contracts (have code)
 *
 * Actions (in order, each tx waited for, aborts on any failure):
 *   1..4. setBurnExempt(vesting[i], true) for each of the 4 vesting contracts
 *   5. mint(FounderVesting,        10,000,000 BRDG)  // 10% bucket
 *   6. mint(CommunityDistributor,  15,000,000 BRDG)  // 15% bucket
 *   7. mint(TreasuryOpsTimelock,   15,000,000 BRDG)  // 15% bucket
 *   8. mint(ReserveLock,            5,000,000 BRDG)  //  5% bucket
 *   9. mint(TreasuryVault, max(0, 10,000,000 - balanceOf(TreasuryVault)))
 *         // dynamic top-up: mints only the delta needed to reach 10M; if the vault
 *         // already holds >= 10M this step is skipped entirely.
 *
 * Total new supply minted: 45,000,000 BRDG (vesting) + delta (treasury top-up).
 * The delta depends on the vault's pre-existing balance; on a fresh genesis run it is
 * 0 (vault already funded by bootstrap-economy.js or deploy-treasury-v2.js).
 * The remaining portion of the 100M hard cap stays un-minted — governance provision
 * for upscaling (Ecosystem Incentives, Liquidity, and on-demand top-ups).
 *
 * Postcondition assertions:
 *   - totalBurned unchanged
 *   - balance(each vesting) == allocated amount
 *   - balance(TreasuryVault) == 10,000,000 BRDG (exactly)
 *   - burnExempt(each vesting) == true
 *
 * Output: docs/genesis-alignment/fund-vesting-<unix>.json
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const ROOT = path.resolve(__dirname, '..');
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/genesis-alignment.json'), 'utf8'));
const OUT_DIR = path.join(ROOT, 'docs/genesis-alignment');
fs.mkdirSync(OUT_DIR, { recursive: true });

const RPC = CONFIG.network.rpc;
const BRDG_ADDRESS  = CONFIG.deployed.BRDG;
const TREASURY_VAULT = CONFIG.deployed.TreasuryVault;

const BRDG_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function totalBurned() view returns (uint256)',
  'function burnExempt(address) view returns (bool)',
  'function owner() view returns (address)',
  'function setBurnExempt(address account, bool exempt) external',
  'function mint(address to, uint256 amount) external',
  'function MAX_SUPPLY() view returns (uint256)'
];

const GENESIS_TREASURY_TARGET = ethers.parseUnits('10000000', 18);

const VESTING_ALLOCATIONS = [
  { name: 'FounderVesting',       cfgKey: 'FounderVesting',       amount: ethers.parseUnits('10000000', 18) },
  { name: 'CommunityDistributor', cfgKey: 'CommunityDistributor', amount: ethers.parseUnits('15000000', 18) },
  { name: 'TreasuryOpsTimelock',  cfgKey: 'TreasuryOpsTimelock',  amount: ethers.parseUnits('15000000', 18) },
  { name: 'ReserveLock',          cfgKey: 'ReserveLock',          amount: ethers.parseUnits('5000000',  18) },
];

function fail(msg) { console.error(`[fund] FATAL: ${msg}`); process.exit(1); }
function fmt(n) { return ethers.formatUnits(n, 18); }

async function awaitTx(tx, label) {
  console.log(`  ${label}: ${tx.hash} ...`);
  const r = await tx.wait();
  console.log(`    block=${r.blockNumber} gasUsed=${r.gasUsed.toString()} status=${r.status}`);
  if (r.status !== 1) fail(`${label} reverted`);
  return r;
}

(async () => {
  const key = process.env.DEPLOYER_PRIVATE_KEY;
  if (!key) fail('DEPLOYER_PRIVATE_KEY not set');
  const keyHex = key.trim().startsWith('0x') ? key.trim() : '0x' + key.trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(keyHex)) fail('DEPLOYER_PRIVATE_KEY format invalid');

  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(keyHex, provider);
  const brdg = new ethers.Contract(BRDG_ADDRESS, BRDG_ABI, wallet);

  // Preflight
  const vc = CONFIG.vestingContracts || {};
  for (const a of VESTING_ALLOCATIONS) {
    const addr = vc[a.cfgKey];
    if (!addr || !ethers.isAddress(addr)) fail(`config.vestingContracts.${a.cfgKey} missing; run deploy-vesting.js first`);
    const code = await provider.getCode(addr);
    if (!code || code === '0x') fail(`${a.cfgKey} at ${addr} has no code`);
    a.address = addr;
  }

  const [owner, totalSupply0, totalBurned0, maxSupply, vaultBal0, ethBal] = await Promise.all([
    brdg.owner(),
    brdg.totalSupply(),
    brdg.totalBurned(),
    brdg.MAX_SUPPLY().catch(() => null),
    brdg.balanceOf(TREASURY_VAULT),
    provider.getBalance(wallet.address)
  ]);

  if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
    fail(`signer ${wallet.address} is not BRDG.owner() ${owner}`);
  }

  const treasuryTopUp = GENESIS_TREASURY_TARGET - vaultBal0;
  if (treasuryTopUp < 0n) fail(`TreasuryVault already over 10M: ${fmt(vaultBal0)}`);

  let totalMint = treasuryTopUp;
  for (const a of VESTING_ALLOCATIONS) totalMint += a.amount;
  const projectedSupply = totalSupply0 + totalMint;

  console.log('[fund] preflight');
  console.log(`  signer              = ${wallet.address}`);
  console.log(`  ETH balance         = ${ethers.formatEther(ethBal)}`);
  console.log(`  BRDG.totalSupply    = ${fmt(totalSupply0)}`);
  console.log(`  BRDG.totalBurned    = ${fmt(totalBurned0)}`);
  console.log(`  MAX_SUPPLY          = ${maxSupply ? fmt(maxSupply) : 'n/a'}`);
  console.log(`  TreasuryVault bal   = ${fmt(vaultBal0)}  top-up=${fmt(treasuryTopUp)}`);
  console.log(`  Total new mint      = ${fmt(totalMint)}`);
  console.log(`  Projected supply    = ${fmt(projectedSupply)}`);
  if (maxSupply && projectedSupply > maxSupply) fail(`projected supply ${fmt(projectedSupply)} > MAX_SUPPLY ${fmt(maxSupply)}`);

  const receipts = { network: CONFIG.network, signer: wallet.address, startedAt: new Date().toISOString(), txs: [] };

  // 1..4 setBurnExempt on each vesting contract
  for (const a of VESTING_ALLOCATIONS) {
    const exempt = await brdg.burnExempt(a.address);
    if (exempt) {
      console.log(`  burnExempt(${a.name}) already true — skip`);
      receipts.txs.push({ step: `setBurnExempt.${a.name}`, skipped: 'already exempt', address: a.address });
      continue;
    }
    const tx = await brdg.setBurnExempt(a.address, true);
    const r = await awaitTx(tx, `setBurnExempt(${a.name}=${a.address}, true)`);
    receipts.txs.push({ step: `setBurnExempt.${a.name}`, address: a.address, hash: tx.hash, block: r.blockNumber, gasUsed: r.gasUsed.toString() });
  }

  // 5..8 mint to each vesting contract
  for (const a of VESTING_ALLOCATIONS) {
    const tx = await brdg.mint(a.address, a.amount);
    const r = await awaitTx(tx, `mint(${a.name}, ${fmt(a.amount)})`);
    receipts.txs.push({ step: `mint.${a.name}`, address: a.address, amount: a.amount.toString(), hash: tx.hash, block: r.blockNumber, gasUsed: r.gasUsed.toString() });
  }

  // 9 mint to TreasuryVault to reach genesis 10M
  if (treasuryTopUp > 0n) {
    const tx = await brdg.mint(TREASURY_VAULT, treasuryTopUp);
    const r = await awaitTx(tx, `mint(TreasuryVault, ${fmt(treasuryTopUp)})`);
    receipts.txs.push({ step: 'mint.TreasuryVault', address: TREASURY_VAULT, amount: treasuryTopUp.toString(), hash: tx.hash, block: r.blockNumber, gasUsed: r.gasUsed.toString() });
  }

  // Postcheck
  const post = {};
  post.totalSupply = await brdg.totalSupply();
  post.totalBurned = await brdg.totalBurned();
  post.treasuryVault_bal = await brdg.balanceOf(TREASURY_VAULT);
  for (const a of VESTING_ALLOCATIONS) {
    post[a.name + '_bal']    = await brdg.balanceOf(a.address);
    post[a.name + '_exempt'] = await brdg.burnExempt(a.address);
  }

  console.log('\n[fund] post-state:');
  console.log(`  totalSupply            = ${fmt(post.totalSupply)}`);
  console.log(`  totalBurned            = ${fmt(post.totalBurned)}`);
  console.log(`  TreasuryVault balance  = ${fmt(post.treasuryVault_bal)}`);
  for (const a of VESTING_ALLOCATIONS) {
    console.log(`  ${a.name.padEnd(22)} bal=${fmt(post[a.name + '_bal']).padStart(14)}  exempt=${post[a.name + '_exempt']}`);
  }

  const errors = [];
  if (post.totalBurned !== totalBurned0) errors.push('totalBurned changed — some mint/transfer was NOT on the exempt path');
  if (post.totalSupply !== totalSupply0 + totalMint) errors.push(`totalSupply mismatch: expected ${fmt(totalSupply0 + totalMint)}, got ${fmt(post.totalSupply)}`);
  if (post.treasuryVault_bal !== GENESIS_TREASURY_TARGET) errors.push(`TreasuryVault != 10M: ${fmt(post.treasuryVault_bal)}`);
  for (const a of VESTING_ALLOCATIONS) {
    if (post[a.name + '_bal'] !== a.amount) errors.push(`${a.name} balance mismatch: ${fmt(post[a.name + '_bal'])} vs expected ${fmt(a.amount)}`);
    if (!post[a.name + '_exempt']) errors.push(`${a.name} not burn-exempt`);
  }

  receipts.postState = {
    totalSupply: post.totalSupply.toString(),
    totalBurned: post.totalBurned.toString(),
    treasuryVault_bal: post.treasuryVault_bal.toString(),
    ...Object.fromEntries(VESTING_ALLOCATIONS.flatMap(a => [
      [a.name + '_bal',    post[a.name + '_bal'].toString()],
      [a.name + '_exempt', post[a.name + '_exempt']]
    ]))
  };
  receipts.errors = errors;
  receipts.ok = errors.length === 0;

  const ts = Math.floor(Date.now() / 1000);
  const outPath = path.join(OUT_DIR, `fund-vesting-${ts}.json`);
  fs.writeFileSync(outPath, JSON.stringify(receipts, null, 2));
  console.log(`\n[fund] receipts: ${outPath}`);

  if (errors.length) {
    console.error('[fund] FAILED invariants:');
    errors.forEach(e => console.error('  - ' + e));
    process.exit(1);
  }
  console.log('[fund] OK');
})().catch(e => { console.error('[fund] CRASH:', e); process.exit(2); });
