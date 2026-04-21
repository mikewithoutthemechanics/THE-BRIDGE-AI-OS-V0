'use strict';

/**
 * BRDG Token Distributor
 * Linea mainnet (chainId 59144)
 *
 * Distributes BRDG tokens from the treasury wallet to users as rewards.
 * Uses the shared provider + wallet from treasury.js / eth-treasury.js.
 *
 * Env vars (all optional — falls back to project defaults):
 *   BRDG_CONTRACT_ADDRESS — deployed ERC20 contract (falls back to deployment.json / hardcoded)
 *   TREASURY_PRIVATE_KEY  — wallet holding BRDG (falls back to derived key from JWT secret)
 *   BRIDGE_SIWE_RPC_URL   — Linea RPC (falls back to https://rpc.linea.build)
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// ── Contract address (mirrors brdg-chain.js resolution) ─────────────────────
let _deploymentAddress = null;
function resolveContractAddress() {
  if (process.env.BRDG_CONTRACT_ADDRESS) return process.env.BRDG_CONTRACT_ADDRESS;
  if (_deploymentAddress) return _deploymentAddress;
  try {
    const dep = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'deployment.json'), 'utf8'));
    _deploymentAddress = dep.contracts?.BRDG || '0x6Ee9Fb40b97139EEEc406c096393e0b53C89975f';
  } catch (_) {
    _deploymentAddress = '0x6Ee9Fb40b97139EEEc406c096393e0b53C89975f';
  }
  return _deploymentAddress;
}

// ── Minimal ERC20 ABI — only what we need ────────────────────────────────────
const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

// ── Reward rates in BRDG tokens (whole units, before decimal adjustment) ─────
const REWARD_RATES = {
  run_completed:       1,    // 1 BRDG per agent run
  output_created:      0.5,  // 0.5 BRDG per output
  project_created:     5,    // 5 BRDG for creating a project
  plan_upgraded:      50,    // 50 BRDG on any paid plan upgrade
  referral_converted: 25,   // 25 BRDG when a referred user converts
  daily_active:        2,    // 2 BRDG for daily platform use
};

// ── Cached decimals to avoid repeated RPC reads ───────────────────────────────
let _decimals = null;

// ── Build a signer-connected contract instance ────────────────────────────────
function getSignerContract() {
  const address = resolveContractAddress();
  const { getWallet } = require('./eth-treasury');
  const wallet = getWallet();
  return new ethers.Contract(address, ERC20_ABI, wallet);
}

// ── Build a read-only contract instance ──────────────────────────────────────
function getReadContract() {
  const address = resolveContractAddress();
  const provider = require('./treasury').getProvider();
  return new ethers.Contract(address, ERC20_ABI, provider);
}

async function getDecimals() {
  if (_decimals !== null) return _decimals;
  const contract = getReadContract();
  _decimals = await contract.decimals();
  return _decimals;
}

/**
 * Distribute BRDG tokens to a wallet address.
 *
 * @param {string} toAddress  - EVM wallet address (0x...)
 * @param {string} rewardType - key from REWARD_RATES
 * @param {number} [multiplier=1] - scale the base reward
 * @returns {Promise<{ok: boolean, txHash?: string, amount?: number, error?: string, reason?: string}>}
 */
async function distributeReward(toAddress, rewardType, multiplier = 1) {
  if (!ethers.isAddress(toAddress)) {
    return { ok: false, error: 'Invalid wallet address' };
  }

  const rate = REWARD_RATES[rewardType];
  if (rate === undefined) {
    return { ok: false, error: `Unknown reward type: ${rewardType}` };
  }

  // Soft-fail if treasury wallet is not configured (avoids crashes in dev/CI).
  // Only an explicit, dedicated treasury seed counts — the genesis plan
  // (BRIDGE_REAL_SYSTEM_BLUEPRINT.md §Security) forbids deriving the key
  // from JWT_SECRET / BRIDGE_SIWE_JWT_SECRET / BRIDGE_INTERNAL_SECRET.
  const hasSecret = !!(process.env.TREASURY_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY);
  if (!hasSecret) {
    console.warn('[brdg-distributor] TREASURY_PRIVATE_KEY not set — skipping on-chain distribution');
    return { ok: false, reason: 'not_configured' };
  }

  try {
    const contract = getSignerContract();
    const decimals = await getDecimals();
    const total = rate * multiplier;
    const amount = ethers.parseUnits(total.toFixed(18), decimals);

    const tx = await contract.transfer(toAddress, amount);
    const receipt = await tx.wait();

    console.log(`[brdg-distributor] distributed ${total} BRDG to ${toAddress} — tx ${receipt.hash}`);
    return { ok: true, txHash: receipt.hash, amount: total };
  } catch (err) {
    console.error('[brdg-distributor] distribution failed:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Get the treasury wallet BRDG balance.
 *
 * @returns {Promise<{ok: boolean, balance?: string, address?: string, error?: string, reason?: string}>}
 */
async function getTreasuryBalance() {
  const hasSecret = !!(
    process.env.TREASURY_PRIVATE_KEY ||
    process.env.DEPLOYER_PRIVATE_KEY ||
    process.env.BRIDGE_SIWE_JWT_SECRET ||
    process.env.BRIDGE_INTERNAL_SECRET ||
    process.env.JWT_SECRET
  );
  if (!hasSecret) return { ok: false, reason: 'not_configured' };

  try {
    const { getWallet } = require('./eth-treasury');
    const wallet = getWallet();
    const contract = getReadContract();
    const decimals = await getDecimals();
    const balance = await contract.balanceOf(wallet.address);
    return {
      ok: true,
      address: wallet.address,
      balance: ethers.formatUnits(balance, decimals),
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Batch-distribute rewards to multiple addresses sequentially.
 * A 500 ms delay between sends avoids nonce collisions.
 *
 * @param {Array<{address: string, rewardType: string, multiplier?: number}>} distributions
 * @returns {Promise<Array>}
 */
async function batchDistribute(distributions) {
  const results = [];
  for (const d of distributions) {
    const result = await distributeReward(d.address, d.rewardType, d.multiplier || 1);
    results.push({ ...d, ...result });
    if (result.ok) {
      // Small delay only after a successful on-chain send to avoid nonce collision
      await new Promise(r => setTimeout(r, 500));
    }
  }
  return results;
}

/**
 * Distribute an explicit BRDG amount to a wallet address.
 * Use when the caller has already calculated the token amount.
 *
 * @param {string} toAddress - EVM wallet address
 * @param {number} amount    - whole token units (e.g. 2.5 for 2.5 BRDG)
 * @param {string} [memo]    - log label only
 */
async function distributeAmount(toAddress, amount, memo = 'reward') {
  if (!ethers.isAddress(toAddress)) return { ok: false, error: 'Invalid wallet address' };
  if (!amount || amount <= 0) return { ok: false, error: 'Amount must be > 0' };

  const hasSecret = !!(
    process.env.TREASURY_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY ||
    process.env.BRIDGE_SIWE_JWT_SECRET || process.env.BRIDGE_INTERNAL_SECRET || process.env.JWT_SECRET
  );
  if (!hasSecret) {
    console.warn('[brdg-distributor] no treasury key — skipping on-chain distribution');
    return { ok: false, reason: 'not_configured' };
  }

  try {
    const contract = getSignerContract();
    const decimals = await getDecimals();
    const parsed   = ethers.parseUnits(Number(amount).toFixed(18), decimals);
    const tx       = await contract.transfer(toAddress, parsed);
    const receipt  = await tx.wait();
    console.log(`[brdg-distributor] ${amount} BRDG (${memo}) → ${toAddress} tx ${receipt.hash}`);
    return { ok: true, txHash: receipt.hash, amount };
  } catch (err) {
    console.error('[brdg-distributor] distributeAmount failed:', err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { distributeReward, distributeAmount, getTreasuryBalance, batchDistribute, REWARD_RATES };
