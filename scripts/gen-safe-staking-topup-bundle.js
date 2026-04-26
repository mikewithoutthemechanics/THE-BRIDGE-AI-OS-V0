#!/usr/bin/env node
/**
 * scripts/gen-safe-staking-topup-bundle.js — Phase C2.
 *
 * Emits a Safe-Transaction-Builder bundle that, executed by the PROTOCOL_SAFE
 * (the new owner of BRDG after Phase C1), mints exactly enough BRDG to bring
 * the StakingVault up to the genesis §1A target (5,000,000 BRDG).
 *
 * The script READS the current StakingVault balance live from Linea and
 * computes the exact top-up — it does not assume the balance. If the vault
 * already meets or exceeds 5M, the script refuses to emit a bundle.
 *
 * Output: docs/genesis-alignment/safe-bundles/staking-topup.json
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const CONFIG_PATH = path.join(__dirname, '..', 'config', 'genesis-alignment.json');
const OUT_DIR = path.join(__dirname, '..', 'docs', 'genesis-alignment', 'safe-bundles');

const BRDG_IFACE = new ethers.Interface([
  'function mint(address to, uint256 amount)',
]);
const BRDG_VIEW = new ethers.Interface([
  'function balanceOf(address) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function MAX_SUPPLY() view returns (uint256)',
  'function owner() view returns (address)',
]);

async function main() {
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const provider = new ethers.JsonRpcProvider(cfg.network.rpc);
  const BRDG = ethers.getAddress(cfg.deployed.BRDG);
  const StakingVault = ethers.getAddress(cfg.deployed.StakingVault);
  const PROTOCOL_SAFE = cfg.safes.PROTOCOL_SAFE.address;
  if (!PROTOCOL_SAFE || !ethers.isAddress(PROTOCOL_SAFE)) {
    throw new Error('config.safes.PROTOCOL_SAFE.address not set.');
  }

  const brdg = new ethers.Contract(BRDG, BRDG_VIEW, provider);
  const [currentBal, totalSupply, maxSupply, owner] = await Promise.all([
    brdg.balanceOf(StakingVault), brdg.totalSupply(), brdg.MAX_SUPPLY(), brdg.owner(),
  ]);
  if (owner.toLowerCase() !== PROTOCOL_SAFE.toLowerCase()) {
    throw new Error(`BRDG.owner() = ${owner} is not PROTOCOL_SAFE (${PROTOCOL_SAFE}). Run Phase C1 first.`);
  }

  const target = ethers.parseUnits(cfg.genesisTargets.initialStakingPoolBRDG, 18); // 5M
  if (currentBal >= target) {
    throw new Error(`StakingVault already holds ${ethers.formatUnits(currentBal, 18)} BRDG (>= ${cfg.genesisTargets.initialStakingPoolBRDG}). Nothing to do.`);
  }
  const delta = target - currentBal;
  const newTotal = totalSupply + delta;
  if (newTotal > maxSupply) {
    throw new Error(`Minting ${ethers.formatUnits(delta, 18)} would breach MAX_SUPPLY (${ethers.formatUnits(maxSupply, 18)}).`);
  }

  const tx = {
    to: BRDG,
    value: '0',
    data: BRDG_IFACE.encodeFunctionData('mint', [StakingVault, delta]),
    operation: 0,
    description: `BRDG.mint(StakingVault=${StakingVault}, ${ethers.formatUnits(delta, 18)} BRDG) — brings staking pool to genesis 5M target`,
  };

  const bundle = {
    version: '1.0',
    chainId: String(cfg.network.chainId),
    createdAt: new Date().toISOString(),
    meta: {
      name: 'BRDG Genesis Alignment — Phase C2 Staking Top-Up',
      description: `Top up StakingVault from ${ethers.formatUnits(currentBal, 18)} → 5,000,000 BRDG (genesis §1A).`,
      txBuilderVersion: '1.18.0',
    },
    liveSnapshotAtBuild: {
      stakingVaultBalance: ethers.formatUnits(currentBal, 18),
      totalSupply: ethers.formatUnits(totalSupply, 18),
      maxSupply: ethers.formatUnits(maxSupply, 18),
      owner,
      deltaToMint: ethers.formatUnits(delta, 18),
      deltaWei: delta.toString(),
    },
    transactions: [tx],
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, 'staking-topup.json');
  fs.writeFileSync(outPath, JSON.stringify(bundle, null, 2));
  console.log(`[safe-bundle] wrote ${path.relative(process.cwd(), outPath)}`);
  console.log(`[safe-bundle] mint amount: ${ethers.formatUnits(delta, 18)} BRDG to ${StakingVault}`);
  console.log(`[safe-bundle] Execute from PROTOCOL_SAFE (${PROTOCOL_SAFE}) via app.safe.global Transaction Builder.`);
}

main().catch(e => { console.error('[safe-bundle] FAILED:', e.message); process.exit(1); });
