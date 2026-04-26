#!/usr/bin/env node
/**
 * scripts/gen-safe-ownership-bundle.js — Phase C1.
 *
 * Generates a Safe-Transaction-Builder JSON bundle that, when executed by
 * the CURRENT owner EOA (0xAC30…6F64) via the Safe Transaction Builder app
 * or imported into Safe{Wallet} → "Transaction Builder":
 *
 *   1. setBurnExempt(TreasuryVault, true)
 *   2. setBurnExempt(FounderVesting, true)
 *   3. setBurnExempt(CommunityDistributor, true)
 *   4. setBurnExempt(TreasuryOpsTimelock, true)
 *   5. setBurnExempt(ReserveLock, true)
 *   6. BRDG.transferOwnership(PROTOCOL_SAFE)
 *   7. TreasuryVault.transferOwnership(PROTOCOL_SAFE)
 *   8. StakingVault.transferOwnership(PROTOCOL_SAFE)
 *
 * IMPORTANT: steps 1–5 must be signed by the CURRENT owner (the EOA),
 * because once ownership moves to the Safe in step 6–8, only the Safe can
 * call setBurnExempt(). That is why we do exempts first and ownership last
 * within the same atomic bundle.
 *
 * This script does NOT execute anything. It only writes JSON to
 * docs/genesis-alignment/safe-bundles/ownership-migration.json.
 *
 * The bundle is formatted for use with either:
 *   (a) The Gnosis Safe Transaction Builder app (import JSON), if the EOA
 *       is first "promoted" to a single-signer Safe; or
 *   (b) A Foundry / Hardhat "cast send"-style script that iterates through
 *       `transactions[]` in order (see scripts/exec-eoa-bundle.js — not
 *       provided; operator can write this trivially and sign with the EOA's
 *       key which they already control).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const CONFIG_PATH = path.join(__dirname, '..', 'config', 'genesis-alignment.json');
const OUT_DIR = path.join(__dirname, '..', 'docs', 'genesis-alignment', 'safe-bundles');

const BRDG_IFACE = new ethers.Interface([
  'function setBurnExempt(address account, bool exempt)',
  'function transferOwnership(address newOwner)',
]);
const OWNABLE_IFACE = new ethers.Interface([
  'function transferOwnership(address newOwner)',
]);

function requireAddr(cfg, dotted) {
  const parts = dotted.split('.');
  let n = cfg;
  for (const p of parts) n = n ? n[p] : undefined;
  if (!n || !ethers.isAddress(n)) {
    throw new Error(`config/genesis-alignment.json.${dotted} is not a valid address (got ${JSON.stringify(n)}). Fill it in before running.`);
  }
  return ethers.getAddress(n);
}

function main() {
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const BRDG = requireAddr(cfg, 'deployed.BRDG');
  const TreasuryVault = requireAddr(cfg, 'deployed.TreasuryVault');
  const StakingVault = requireAddr(cfg, 'deployed.StakingVault');
  const PROTOCOL_SAFE = requireAddr(cfg, 'safes.PROTOCOL_SAFE.address');
  const FounderVesting = requireAddr(cfg, 'vestingContracts.FounderVesting');
  const CommunityDistributor = requireAddr(cfg, 'vestingContracts.CommunityDistributor');
  const TreasuryOpsTimelock = requireAddr(cfg, 'vestingContracts.TreasuryOpsTimelock');
  const ReserveLock = requireAddr(cfg, 'vestingContracts.ReserveLock');

  const txs = [];

  // 1-5: burn-exempt the vault + all four vesting contracts.
  for (const [label, addr] of Object.entries({ TreasuryVault, FounderVesting, CommunityDistributor, TreasuryOpsTimelock, ReserveLock })) {
    txs.push({
      to: BRDG,
      value: '0',
      data: BRDG_IFACE.encodeFunctionData('setBurnExempt', [addr, true]),
      operation: 0,
      description: `BRDG.setBurnExempt(${label}=${addr}, true)`,
    });
  }

  // 6-8: hand all three infrastructure contracts to the Safe.
  for (const [label, addr] of Object.entries({ BRDG, TreasuryVault, StakingVault })) {
    txs.push({
      to: addr,
      value: '0',
      data: OWNABLE_IFACE.encodeFunctionData('transferOwnership', [PROTOCOL_SAFE]),
      operation: 0,
      description: `${label}.transferOwnership(PROTOCOL_SAFE=${PROTOCOL_SAFE})`,
    });
  }

  const bundle = {
    version: '1.0',
    chainId: String(cfg.network.chainId),
    createdAt: new Date().toISOString(),
    meta: {
      name: 'BRDG Genesis Alignment — Phase C1 Ownership Migration',
      description: 'Burn-exempt infra then transfer ownership of BRDG, TreasuryVault, StakingVault to PROTOCOL_SAFE. Signed by the current BRDG.owner() (deployer EOA).',
      txBuilderVersion: '1.18.0',
    },
    currentOwnerEOA: cfg.deployed.deployerEOA,
    protocolSafe: PROTOCOL_SAFE,
    transactions: txs,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, 'ownership-migration.json');
  fs.writeFileSync(outPath, JSON.stringify(bundle, null, 2));
  console.log(`[safe-bundle] wrote ${path.relative(process.cwd(), outPath)}`);
  console.log(`[safe-bundle] ${txs.length} transactions — execute in order, signed by the CURRENT BRDG.owner() (${cfg.deployed.deployerEOA}).`);
}

try { main(); } catch (e) { console.error('[safe-bundle] FAILED:', e.message); process.exit(1); }
