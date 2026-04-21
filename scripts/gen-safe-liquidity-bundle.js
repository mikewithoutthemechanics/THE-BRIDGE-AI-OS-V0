#!/usr/bin/env node
/**
 * scripts/gen-safe-liquidity-bundle.js — Phase C3.
 *
 * Emits a Safe-Transaction-Builder bundle that re-seeds the SyncSwap
 * BRDG/ETH pool on Linea to the genesis §3 target of
 *   10,000 BRDG + 1 ETH
 * at the target initial price of 0.0001 ETH per BRDG.
 *
 * The mint for those 10,000 BRDG goes to PROTOCOL_SAFE; the Safe then
 * approves the SyncSwap classic-pool-factory router for the BRDG amount,
 * and calls `addLiquidity2` on the router with the matching ETH value.
 *
 * PROVENANCE NOTE: the SyncSwap router address on Linea MUST be filled in
 * config.syncSwap.router before running this script. The script refuses to
 * invent it. Confirm the official address here:
 *   https://syncswap.xyz/ → Docs → Deployments → Linea mainnet.
 *
 * Output: docs/genesis-alignment/safe-bundles/liquidity-seed.json
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const CONFIG_PATH = path.join(__dirname, '..', 'config', 'genesis-alignment.json');
const OUT_DIR = path.join(__dirname, '..', 'docs', 'genesis-alignment', 'safe-bundles');

const BRDG_IFACE = new ethers.Interface([
  'function mint(address to, uint256 amount)',
  'function approve(address spender, uint256 amount)',
]);

function main() {
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const PROTOCOL_SAFE = cfg.safes.PROTOCOL_SAFE.address;
  const LP_SAFE = cfg.safes.LP_SAFE.address;
  if (!PROTOCOL_SAFE || !ethers.isAddress(PROTOCOL_SAFE)) throw new Error('safes.PROTOCOL_SAFE.address missing');
  if (!LP_SAFE || !ethers.isAddress(LP_SAFE)) throw new Error('safes.LP_SAFE.address missing');

  const router = cfg.syncSwap && cfg.syncSwap.router;
  if (!router || !ethers.isAddress(router)) {
    throw new Error('config.syncSwap.router not set. Confirm the official SyncSwap router on Linea from https://syncswap.xyz/ docs and add it to config/genesis-alignment.json under `syncSwap.router` before running.');
  }
  const pool = cfg.deployed.DEXPool;
  const brdg = cfg.genesisTargets.initialLiquidity.brdg;  // "10000"
  const ethAmt = cfg.genesisTargets.initialLiquidity.eth; // "1.0"

  const brdgWei = ethers.parseUnits(brdg, 18);
  const ethWei  = ethers.parseEther(ethAmt);

  // Step 1: mint 10,000 BRDG to PROTOCOL_SAFE (so the Safe can approve the router).
  const mintTx = {
    to: cfg.deployed.BRDG,
    value: '0',
    data: BRDG_IFACE.encodeFunctionData('mint', [PROTOCOL_SAFE, brdgWei]),
    operation: 0,
    description: `BRDG.mint(PROTOCOL_SAFE, ${brdg} BRDG) — source of the pool seed`,
  };

  // Step 2: approve router to spend BRDG.
  const approveTx = {
    to: cfg.deployed.BRDG,
    value: '0',
    data: BRDG_IFACE.encodeFunctionData('approve', [router, brdgWei]),
    operation: 0,
    description: `BRDG.approve(SyncSwapRouter=${router}, ${brdg} BRDG)`,
  };

  // Step 3: a manual-hold placeholder for the router call.
  //
  // SyncSwap's classic router exposes (approximately):
  //   addLiquidity2(address pool, TokenInput[] inputs, bytes data, uint256 minLiquidity, address callback, bytes callbackData, address staker)
  // The exact ABI differs per SyncSwap version/router. Rather than encode a
  // call with the wrong ABI (drift), this bundle stops at step 2 and leaves
  // step 3 as an operator instruction. The operator completes it in the
  // SyncSwap UI ("Add Liquidity") from PROTOCOL_SAFE using WalletConnect, or
  // replaces the placeholder after pasting the correct router ABI.
  //
  // This is intentional: we will not guess an ABI that controls 1 ETH + 10k BRDG.
  const bundle = {
    version: '1.0',
    chainId: String(cfg.network.chainId),
    createdAt: new Date().toISOString(),
    meta: {
      name: 'BRDG Genesis Alignment — Phase C3 Liquidity Seed (mint + approve only)',
      description: 'Mint 10,000 BRDG to PROTOCOL_SAFE and approve the SyncSwap router. The router addLiquidity call is intentionally left to the operator via the SyncSwap UI from PROTOCOL_SAFE (WalletConnect), to avoid ABI drift.',
      txBuilderVersion: '1.18.0',
    },
    liquidityTargets: { brdg, eth: ethAmt, targetPriceEthPerBrdg: cfg.genesisTargets.initialLiquidity.targetPriceBRDGperETH, existingPool: pool, recipientOfLpTokens: LP_SAFE },
    router,
    transactions: [mintTx, approveTx],
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, 'liquidity-seed.json');
  fs.writeFileSync(outPath, JSON.stringify(bundle, null, 2));
  console.log(`[safe-bundle] wrote ${path.relative(process.cwd(), outPath)}`);
  console.log('[safe-bundle] After executing this bundle, complete step 3 in the SyncSwap UI:');
  console.log('               https://syncswap.xyz/pool   (connect PROTOCOL_SAFE via WalletConnect → Add Liquidity)');
  console.log(`               Target: ${brdg} BRDG + ${ethAmt} ETH, LP tokens to ${LP_SAFE}.`);
}

try { main(); } catch (e) { console.error('[safe-bundle] FAILED:', e.message); process.exit(1); }
