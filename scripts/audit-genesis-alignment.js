#!/usr/bin/env node
/**
 * scripts/audit-genesis-alignment.js
 *
 * Read-only audit: compares the *actual* on-chain state of the BRDG economy
 * against the genesis targets in config/genesis-alignment.json, and emits:
 *   docs/genesis-alignment/audit-latest.json   (machine-readable, for agents)
 *   docs/genesis-alignment/audit-latest.md     (human-readable)
 *
 * This script NEVER signs or sends a transaction. It only calls `eth_call`
 * and view methods. Safe to run from any environment that can reach
 * https://rpc.linea.build .
 *
 * Exit codes:
 *   0  — every hard check passes.
 *   1  — one or more hard checks FAIL (non-matching target).
 *   2  — config file / RPC / bytecode problem; audit could not complete.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const CONFIG_PATH = path.join(__dirname, '..', 'config', 'genesis-alignment.json');
const OUT_DIR = path.join(__dirname, '..', 'docs', 'genesis-alignment');

const BRDG_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function owner() view returns (address)',
  'function burnExempt(address) view returns (bool)',
  'function totalBurned() view returns (uint256)',
  'function MAX_SUPPLY() view returns (uint256)',
  'function BURN_BPS() view returns (uint256)',
];
const TREASURY_VAULT_ABI = [
  'function owner() view returns (address)',
  'function brdg() view returns (address)',
  'function OPS_BPS() view returns (uint256)',
  'function LIQ_BPS() view returns (uint256)',
  'function RESERVE_BPS() view returns (uint256)',
  'function FOUNDER_BPS() view returns (uint256)',
  'function brdgBuckets() view returns (uint256 ops, uint256 liquidity, uint256 reserve, uint256 founder)',
];
const STAKING_VAULT_ABI = [
  'function owner() view returns (address)',
  'function brdg() view returns (address)',
];
const VESTING_ABI = [
  'function owner() view returns (address)',
  'function start() view returns (uint256)',
  'function duration() view returns (uint256)',
  'function released(address) view returns (uint256)',
];

const ZERO = ethers.ZeroAddress;

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    console.error(`[audit] cannot read ${CONFIG_PATH}: ${e.message}`);
    process.exit(2);
  }
}

function fmt(bn, decimals = 18) {
  try { return ethers.formatUnits(bn, decimals); } catch { return String(bn); }
}

function check(list, label, actual, expected, severity = 'hard') {
  const ok = actual === expected || (typeof actual === 'bigint' && typeof expected === 'bigint' && actual === expected);
  list.push({ label, actual: typeof actual === 'bigint' ? actual.toString() : actual, expected: typeof expected === 'bigint' ? expected.toString() : expected, ok, severity });
  return ok;
}

function checkBig(list, label, actualBn, expectedBn, severity = 'hard') {
  const ok = actualBn === expectedBn;
  list.push({ label, actual: actualBn.toString(), expected: expectedBn.toString(), ok, severity });
  return ok;
}

async function getCodeSize(provider, addr) {
  const code = await provider.getCode(addr);
  return code === '0x' ? 0 : (code.length - 2) / 2;
}

async function main() {
  const cfg = loadConfig();
  const provider = new ethers.JsonRpcProvider(cfg.network.rpc);
  const checks = [];
  const snapshot = { network: cfg.network, generatedAt: new Date().toISOString(), balances: {}, contracts: {} };

  // ── 1. Network reachable & correct chain id ──────────────────────────
  let net;
  try { net = await provider.getNetwork(); } catch (e) {
    console.error(`[audit] RPC unreachable (${cfg.network.rpc}): ${e.message}`);
    process.exit(2);
  }
  check(checks, 'network.chainId matches config', Number(net.chainId), cfg.network.chainId);
  snapshot.blockNumber = await provider.getBlockNumber();

  // ── 2. Each deployed contract exists (has bytecode) ──────────────────
  const deployed = cfg.deployed;
  for (const key of ['BRDG', 'TreasuryVault', 'StakingVault', 'DEXPool']) {
    const addr = deployed[key];
    const size = await getCodeSize(provider, addr);
    checks.push({ label: `${key} has bytecode`, actual: `${size} bytes`, expected: '> 0 bytes', ok: size > 0, severity: 'hard' });
    snapshot.contracts[key] = { address: addr, codeSize: size };
  }

  // ── 3. BRDG token state ──────────────────────────────────────────────
  const brdg = new ethers.Contract(deployed.BRDG, BRDG_ABI, provider);
  const [name, symbol, decimals, totalSupply, maxSupply, burnBps, totalBurned, owner] = await Promise.all([
    brdg.name(), brdg.symbol(), brdg.decimals(),
    brdg.totalSupply(), brdg.MAX_SUPPLY(), brdg.BURN_BPS(),
    brdg.totalBurned(), brdg.owner(),
  ]);

  snapshot.contracts.BRDG = {
    ...snapshot.contracts.BRDG,
    name, symbol, decimals: Number(decimals),
    totalSupply: fmt(totalSupply), totalSupplyRaw: totalSupply.toString(),
    maxSupply: fmt(maxSupply), maxSupplyRaw: maxSupply.toString(),
    burnBps: Number(burnBps),
    totalBurned: fmt(totalBurned),
    owner,
  };

  check(checks, 'BRDG.symbol', symbol, 'BRDG');
  check(checks, 'BRDG.decimals', Number(decimals), 18);
  const expectedMax = ethers.parseUnits(cfg.genesisTargets.maxSupplyBRDG, 18);
  checkBig(checks, 'BRDG.MAX_SUPPLY == genesis maxSupplyBRDG', maxSupply, expectedMax);
  check(checks, 'BRDG.BURN_BPS == genesis taskFeeBurnBps', Number(burnBps), cfg.genesisTargets.taskFeeBurnBps);

  // Ownership: should be PROTOCOL_SAFE if set, otherwise surfaces the EOA.
  const protocolSafe = cfg.safes.PROTOCOL_SAFE.address;
  if (protocolSafe) {
    check(checks, 'BRDG.owner == PROTOCOL_SAFE', owner.toLowerCase(), protocolSafe.toLowerCase());
  } else {
    checks.push({ label: 'BRDG.owner is not yet PROTOCOL_SAFE (safe unset in config)', actual: owner, expected: 'a Gnosis Safe address', ok: false, severity: 'soft' });
  }

  // ── 4. TreasuryVault state ───────────────────────────────────────────
  const vault = new ethers.Contract(deployed.TreasuryVault, TREASURY_VAULT_ABI, provider);
  const [vOwner, vBrdg, opsBps, liqBps, resBps, foundBps, buckets, vaultBal] = await Promise.all([
    vault.owner(), vault.brdg(),
    vault.OPS_BPS(), vault.LIQ_BPS(), vault.RESERVE_BPS(), vault.FOUNDER_BPS(),
    vault.brdgBuckets(),
    brdg.balanceOf(deployed.TreasuryVault),
  ]);
  snapshot.contracts.TreasuryVault = {
    ...snapshot.contracts.TreasuryVault,
    owner: vOwner, brdg: vBrdg,
    splitBps: { ops: Number(opsBps), liquidity: Number(liqBps), reserve: Number(resBps), founder: Number(foundBps) },
    buckets: { ops: fmt(buckets[0]), liquidity: fmt(buckets[1]), reserve: fmt(buckets[2]), founder: fmt(buckets[3]) },
    brdgBalance: fmt(vaultBal),
  };
  check(checks, 'TreasuryVault.brdg == BRDG', vBrdg.toLowerCase(), deployed.BRDG.toLowerCase());
  check(checks, 'TreasuryVault.OPS_BPS', Number(opsBps), cfg.genesisTargets.treasurySplitBps.ops);
  check(checks, 'TreasuryVault.LIQ_BPS', Number(liqBps), cfg.genesisTargets.treasurySplitBps.liquidity);
  check(checks, 'TreasuryVault.RESERVE_BPS', Number(resBps), cfg.genesisTargets.treasurySplitBps.reserve);
  check(checks, 'TreasuryVault.FOUNDER_BPS', Number(foundBps), cfg.genesisTargets.treasurySplitBps.founder);

  const vaultBurnExempt = await brdg.burnExempt(deployed.TreasuryVault);
  check(checks, 'BRDG.burnExempt(TreasuryVault) == true', vaultBurnExempt, true);
  snapshot.contracts.TreasuryVault.burnExempt = vaultBurnExempt;

  if (protocolSafe) check(checks, 'TreasuryVault.owner == PROTOCOL_SAFE', vOwner.toLowerCase(), protocolSafe.toLowerCase());

  // ── 5. StakingVault state ────────────────────────────────────────────
  const staking = new ethers.Contract(deployed.StakingVault, STAKING_VAULT_ABI, provider);
  const [sOwner, sBrdg, stakingBal] = await Promise.all([
    staking.owner(), staking.brdg(), brdg.balanceOf(deployed.StakingVault),
  ]);
  snapshot.contracts.StakingVault = {
    ...snapshot.contracts.StakingVault,
    owner: sOwner, brdg: sBrdg, brdgBalance: fmt(stakingBal), brdgBalanceRaw: stakingBal.toString(),
  };
  check(checks, 'StakingVault.brdg == BRDG', sBrdg.toLowerCase(), deployed.BRDG.toLowerCase());
  const stakingBurnExempt = await brdg.burnExempt(deployed.StakingVault);
  check(checks, 'BRDG.burnExempt(StakingVault) == true', stakingBurnExempt, true);
  snapshot.contracts.StakingVault.burnExempt = stakingBurnExempt;
  const genesisStakingTarget = ethers.parseUnits(cfg.genesisTargets.initialStakingPoolBRDG, 18);
  const stakingOk = stakingBal >= genesisStakingTarget;
  checks.push({
    label: 'StakingVault.balance >= genesis initialStakingPoolBRDG (5M)',
    actual: fmt(stakingBal) + ' BRDG',
    expected: `>= ${cfg.genesisTargets.initialStakingPoolBRDG} BRDG`,
    ok: stakingOk,
    severity: 'hard',
  });
  if (protocolSafe) check(checks, 'StakingVault.owner == PROTOCOL_SAFE', sOwner.toLowerCase(), protocolSafe.toLowerCase());

  // ── 6. Vesting contracts (only if config has populated them) ─────────
  const vc = cfg.vestingContracts || {};
  for (const name of ['FounderVesting', 'CommunityDistributor', 'TreasuryOpsTimelock', 'ReserveLock']) {
    const addr = vc[name];
    if (!addr) {
      checks.push({ label: `${name} deployed`, actual: 'null', expected: 'deployed address', ok: false, severity: 'soft' });
      continue;
    }
    const size = await getCodeSize(provider, addr);
    const ok = size > 0;
    checks.push({ label: `${name} has bytecode`, actual: `${size} bytes`, expected: '> 0 bytes', ok, severity: 'hard' });
    if (!ok) { snapshot.contracts[name] = { address: addr, codeSize: 0 }; continue; }
    const v = new ethers.Contract(addr, VESTING_ABI, provider);
    const [vcOwner, start, duration, bal, exempt] = await Promise.all([
      v.owner(), v.start(), v.duration(), brdg.balanceOf(addr), brdg.burnExempt(addr),
    ]);
    snapshot.contracts[name] = {
      address: addr, codeSize: size, beneficiary: vcOwner,
      start: Number(start), startIso: new Date(Number(start) * 1000).toISOString(),
      duration: Number(duration), brdgBalance: fmt(bal), burnExempt: exempt,
    };
    check(checks, `BRDG.burnExempt(${name}) == true`, exempt, true);
  }

  // ── 7. Deployer EOA audit ────────────────────────────────────────────
  const eoaBal = await brdg.balanceOf(deployed.deployerEOA);
  snapshot.balances.deployerEOA = { address: deployed.deployerEOA, brdg: fmt(eoaBal), brdgRaw: eoaBal.toString() };
  // After the full migration the deployer EOA should hold 0 BRDG.
  // Before migration this is expected to be high — flagged as soft until complete.
  checks.push({
    label: 'Deployer EOA drained (balance == 0 after migration)',
    actual: fmt(eoaBal) + ' BRDG',
    expected: '0 BRDG',
    ok: eoaBal === 0n,
    severity: cfg.phases.C1_ownershipMigration.status === 'COMPLETE' ? 'hard' : 'soft',
  });

  // ── 8. SyncSwap pool sanity ──────────────────────────────────────────
  const poolBal = await brdg.balanceOf(deployed.DEXPool);
  snapshot.balances.dexPool = { address: deployed.DEXPool, brdg: fmt(poolBal) };
  const poolTarget = ethers.parseUnits(cfg.genesisTargets.initialLiquidity.brdg, 18);
  checks.push({
    label: `SyncSwap pool has >= genesis initialLiquidity.brdg (${cfg.genesisTargets.initialLiquidity.brdg})`,
    actual: fmt(poolBal) + ' BRDG',
    expected: `>= ${cfg.genesisTargets.initialLiquidity.brdg} BRDG`,
    ok: poolBal >= poolTarget,
    severity: 'hard',
  });

  // ── 9. Legacy / superseded addresses should have 0 BRDG ──────────────
  for (const legacy of ['0x5f0541302bd4fC672018b07a35FA5f294A322947', '0xDb8d8ca8A65d36eFbD5C84C145B58Ee62C872d88']) {
    const b = await brdg.balanceOf(legacy);
    checks.push({
      label: `Legacy/superseded ${legacy} holds 0 BRDG`,
      actual: fmt(b) + ' BRDG', expected: '0 BRDG',
      ok: b === 0n, severity: 'soft',
    });
  }

  // ── Output ──────────────────────────────────────────────────────────
  const hardFails = checks.filter(c => !c.ok && c.severity === 'hard');
  const softFails = checks.filter(c => !c.ok && c.severity === 'soft');
  const result = {
    summary: {
      totalChecks: checks.length,
      passed: checks.filter(c => c.ok).length,
      hardFails: hardFails.length,
      softFails: softFails.length,
      verdict: hardFails.length === 0 ? 'PASS' : 'FAIL',
    },
    snapshot,
    checks,
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'audit-latest.json'), JSON.stringify(result, null, 2));

  const lines = [];
  lines.push('# BRDG Genesis Alignment Audit');
  lines.push('');
  lines.push(`Generated: ${result.snapshot.generatedAt}`);
  lines.push(`Network: ${snapshot.network.name} (chainId ${snapshot.network.chainId}) @ block ${snapshot.blockNumber}`);
  lines.push('');
  lines.push(`**Verdict: ${result.summary.verdict}** — ${result.summary.passed}/${result.summary.totalChecks} checks passed (${result.summary.hardFails} hard fails, ${result.summary.softFails} soft fails).`);
  lines.push('');
  lines.push('## Checks');
  lines.push('');
  lines.push('| Severity | Pass | Check | Actual | Expected |');
  lines.push('|---|---|---|---|---|');
  for (const c of checks) {
    const mark = c.ok ? 'yes' : 'NO';
    lines.push(`| ${c.severity} | ${mark} | ${c.label} | \`${c.actual}\` | \`${c.expected}\` |`);
  }
  lines.push('');
  lines.push('## Snapshot');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(snapshot, null, 2));
  lines.push('```');
  fs.writeFileSync(path.join(OUT_DIR, 'audit-latest.md'), lines.join('\n') + '\n');

  console.log(`\n[audit] ${result.summary.verdict}  (${result.summary.passed}/${result.summary.totalChecks} pass, ${hardFails.length} hard fail, ${softFails.length} soft fail)`);
  console.log(`[audit] wrote ${path.relative(process.cwd(), path.join(OUT_DIR, 'audit-latest.json'))}`);
  console.log(`[audit] wrote ${path.relative(process.cwd(), path.join(OUT_DIR, 'audit-latest.md'))}`);
  if (hardFails.length > 0) {
    console.log('\nHard fails:');
    for (const f of hardFails) console.log(`  - ${f.label}  actual=${f.actual}  expected=${f.expected}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('[audit] fatal:', err.message);
  process.exit(2);
});
