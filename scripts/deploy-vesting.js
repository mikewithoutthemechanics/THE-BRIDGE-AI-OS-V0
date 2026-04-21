#!/usr/bin/env node
/**
 * scripts/deploy-vesting.js — Phase B of the genesis alignment.
 *
 * Deploys FounderVesting, CommunityDistributor, TreasuryOpsTimelock, ReserveLock
 * with parameters sourced ONLY from config/genesis-alignment.json. No values
 * are invented by the script; if any REQUIRED_HUMAN field is missing, the
 * script refuses to run and prints exactly what must be filled in.
 *
 * Usage (from repo root):
 *   npx hardhat compile
 *   npx hardhat run scripts/deploy-vesting.js --network linea
 *
 * Required env:
 *   DEPLOYER_PRIVATE_KEY  — 32-byte hex, must be a dedicated seed (not derived).
 *   GENESIS_TGE_ISO       — ISO 8601 timestamp of Token Generation Event,
 *                           e.g. "2026-05-01T00:00:00Z". Used as the vesting
 *                           `startTimestamp` for all four contracts. If unset,
 *                           the script will refuse to run.
 *
 * On success:
 *   1. Writes the four deployed addresses into config/genesis-alignment.json
 *      under `vestingContracts.*`.
 *   2. Writes a per-run receipt to docs/genesis-alignment/deploy-vesting-<unix>.json.
 *   3. Prints the Lineascan URLs so the operator can verify contracts.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const hre = require('hardhat');
const { ethers } = hre;

const CONFIG_PATH = path.join(__dirname, '..', 'config', 'genesis-alignment.json');
const RECEIPTS_DIR = path.join(__dirname, '..', 'docs', 'genesis-alignment');

const MONTH_SECONDS = 30n * 24n * 60n * 60n; // 30-day month, matches typical vesting conventions

function readConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  return JSON.parse(raw);
}

function writeConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n');
}

function requireHumanField(cfg, dotted) {
  const parts = dotted.split('.');
  let node = cfg;
  for (const p of parts) {
    if (!node || node[p] === undefined) {
      throw new Error(`config/genesis-alignment.json missing ${dotted} — still marked REQUIRED_HUMAN.`);
    }
    node = node[p];
  }
  if (node === null || node === '' || node === 'REQUIRED_HUMAN') {
    throw new Error(`config/genesis-alignment.json.${dotted} is still a placeholder. Fill in the real address/value before running this script.`);
  }
  return node;
}

function tgeTimestamp() {
  const raw = process.env.GENESIS_TGE_ISO;
  if (!raw) {
    throw new Error('GENESIS_TGE_ISO env var not set (e.g. "2026-05-01T00:00:00Z"). The script refuses to guess the TGE time.');
  }
  const t = Math.floor(new Date(raw).getTime() / 1000);
  if (!Number.isFinite(t) || t <= 0) {
    throw new Error(`GENESIS_TGE_ISO ("${raw}") did not parse to a valid Unix timestamp.`);
  }
  return BigInt(t);
}

async function deployContract(name, args) {
  console.log(`\n[deploy] ${name}  args=${JSON.stringify(args.map(a => a.toString()))}`);
  const Factory = await ethers.getContractFactory(name);
  const c = await Factory.deploy(...args);
  await c.waitForDeployment();
  const addr = await c.getAddress();
  const tx = c.deploymentTransaction();
  console.log(`  → ${addr}  (tx ${tx.hash})`);
  return { address: addr, deployTx: tx.hash };
}

async function main() {
  const cfg = readConfig();

  // Preflight: every Safe must already exist.
  const protocolSafe = requireHumanField(cfg, 'safes.PROTOCOL_SAFE.address');
  const founderSafe  = requireHumanField(cfg, 'safes.FOUNDER_SAFE.address');
  const communitySafe = requireHumanField(cfg, 'safes.COMMUNITY_SAFE.address');
  const lpSafe       = requireHumanField(cfg, 'safes.LP_SAFE.address');
  void lpSafe; // used by Phase C; validated here so we fail fast

  for (const [k, v] of Object.entries({ PROTOCOL_SAFE: protocolSafe, FOUNDER_SAFE: founderSafe, COMMUNITY_SAFE: communitySafe, LP_SAFE: lpSafe })) {
    if (!ethers.isAddress(v)) throw new Error(`config.safes.${k}.address is not a valid 0x address: ${v}`);
  }

  const tge = tgeTimestamp();
  console.log(`[genesis] TGE = ${tge} (${new Date(Number(tge) * 1000).toISOString()})`);

  const [deployer] = await ethers.getSigners();
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log(`[genesis] Deployer = ${deployer.address}  balance = ${ethers.formatEther(bal)} ETH`);
  if (bal === 0n) throw new Error('Deployer has 0 ETH on Linea — cannot pay gas.');

  // Durations in seconds (per public/tokenomics.html, now mirrored into config).
  const ONE_MONTH   = MONTH_SECONDS;
  const THREE_MO    = 3n * MONTH_SECONDS;
  const TWELVE_MO   = 12n * MONTH_SECONDS;
  const THIRTYSIX_MO = 36n * MONTH_SECONDS;

  // Founders: 12-mo cliff + 36-mo linear  ⇒  total duration = 48 months.
  const founderArgs = [founderSafe, tge, TWELVE_MO, TWELVE_MO + THIRTYSIX_MO];
  // Community: 1-mo cliff + 36-mo linear  ⇒  total duration = 37 months.
  const communityArgs = [communitySafe, tge, ONE_MONTH, ONE_MONTH + THIRTYSIX_MO];
  // Treasury Ops: 3-mo cliff + 36-mo linear ⇒ total duration = 39 months.
  // Beneficiary = TreasuryVault (so releases flow back into the 40/25/20/15 split).
  const treasuryVault = cfg.deployed.TreasuryVault;
  if (!ethers.isAddress(treasuryVault)) throw new Error('deployed.TreasuryVault is not a valid address');
  const treasuryOpsArgs = [treasuryVault, tge, THREE_MO, THREE_MO + THIRTYSIX_MO];
  // Reserve: pure 12-month timelock.
  const reserveUnlock = tge + TWELVE_MO;
  const reserveArgs = [protocolSafe, reserveUnlock];

  const results = {
    FounderVesting:      await deployContract('FounderVesting', founderArgs),
    CommunityDistributor: await deployContract('CommunityDistributor', communityArgs),
    TreasuryOpsTimelock: await deployContract('TreasuryOpsTimelock', treasuryOpsArgs),
    ReserveLock:         await deployContract('ReserveLock', reserveArgs),
  };

  // Write back to config.
  cfg.vestingContracts = cfg.vestingContracts || {};
  for (const [name, r] of Object.entries(results)) {
    cfg.vestingContracts[name] = r.address;
  }
  cfg.phases.B_deployVesting.status = 'DEPLOYED';
  cfg.phases.B_deployVesting.deployedAt = new Date().toISOString();
  writeConfig(cfg);

  // Per-run receipt.
  fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
  const receipt = {
    network: cfg.network,
    deployer: deployer.address,
    tgeIso: new Date(Number(tge) * 1000).toISOString(),
    tgeUnix: Number(tge),
    args: {
      FounderVesting: founderArgs.map(a => a.toString()),
      CommunityDistributor: communityArgs.map(a => a.toString()),
      TreasuryOpsTimelock: treasuryOpsArgs.map(a => a.toString()),
      ReserveLock: reserveArgs.map(a => a.toString()),
    },
    results,
    safes: { PROTOCOL_SAFE: protocolSafe, FOUNDER_SAFE: founderSafe, COMMUNITY_SAFE: communitySafe, LP_SAFE: lpSafe },
    deployedAt: new Date().toISOString(),
  };
  const receiptPath = path.join(RECEIPTS_DIR, `deploy-vesting-${Math.floor(Date.now() / 1000)}.json`);
  fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));

  console.log('\n[genesis] Deploy complete. Receipt:', receiptPath);
  console.log('\n  Verify on Lineascan:');
  for (const [n, r] of Object.entries(results)) {
    console.log(`    ${n.padEnd(22)} ${cfg.network.explorer}/address/${r.address}`);
  }
  console.log('\n  Next: run `npx hardhat verify --network linea <address> <constructor args>` for each.');
  console.log('  Then:  node scripts/gen-safe-ownership-bundle.js');
}

main().catch((err) => {
  console.error('\n[genesis] DEPLOY FAILED:', err.message);
  process.exit(1);
});
