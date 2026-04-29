/**
 * ETH Treasury — Linea L2 wallet.
 *
 * Genesis-alignment requirement (BRIDGE_REAL_SYSTEM_BLUEPRINT.md §Security):
 *   "ETH treasury wallet uses dedicated seed (not derived from app secrets)."
 *
 * Therefore this module REFUSES to start if `TREASURY_PRIVATE_KEY` (or the
 * explicit `DEPLOYER_PRIVATE_KEY`) is not set. The legacy JWT_SECRET /
 * BRIDGE_SIWE_JWT_SECRET / BRIDGE_INTERNAL_SECRET derivation has been removed
 * — a key that can be reconstructed from the app's JWT secret is not a
 * dedicated treasury seed.
 *
 * For CI / test environments that have no real treasury wallet, set
 * `TREASURY_TEST_KEY=1` along with a disposable `TREASURY_PRIVATE_KEY`.
 */
'use strict';

const { ethers } = require('ethers');

// ── Singleton instances ────────────────────────────────────────────────────
// Provider is lazy-loaded from treasury.js shared singleton to avoid circular deps
let _wallet = null;

function getProvider() {
  return require('./treasury').getProvider();
}

function getWallet() {
  if (_wallet) return _wallet;

  const envKey = process.env.TREASURY_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
  if (!envKey) {
    throw new Error(
      '[eth-treasury] TREASURY_PRIVATE_KEY (or DEPLOYER_PRIVATE_KEY) is not set. ' +
      'Genesis alignment requires a dedicated treasury seed — deriving the key from ' +
      'JWT_SECRET / BRIDGE_SIWE_JWT_SECRET / BRIDGE_INTERNAL_SECRET is no longer ' +
      'supported (see docs/GENESIS_ALIGNMENT.md §Phase A).'
    );
  }

  const trimmed = envKey.trim();
  const keyHex = trimmed.startsWith('0x') ? trimmed : '0x' + trimmed;
  if (!/^0x[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new Error('[eth-treasury] TREASURY_PRIVATE_KEY must be a 32-byte hex value (64 hex chars, optional 0x prefix).');
  }

  _wallet = new ethers.Wallet(keyHex, getProvider());
  return _wallet;
}

// ── Public API ─────────────────────────────────────────────────────────────

/** Treasury wallet address (safe to expose publicly) */
function getAddress() {
  return getWallet().address;
}

/** On-chain ETH balance on Linea */
async function getBalance() {
  const bal = await getProvider().getBalance(getWallet().address);
  return {
    wei:  bal.toString(),
    eth:  ethers.formatEther(bal),
    gwei: ethers.formatUnits(bal, 'gwei'),
  };
}

/** Current gas price on Linea */
async function getGasPrice() {
  const fee = await getProvider().getFeeData();
  return {
    gasPrice:     fee.gasPrice?.toString()     || '0',
    maxFeePerGas: fee.maxFeePerGas?.toString() || '0',
    gasPriceGwei: fee.gasPrice ? ethers.formatUnits(fee.gasPrice, 'gwei') : '0',
  };
}

/** Current block number (health check) */
async function getBlockNumber() {
  return await getProvider().getBlockNumber();
}

/**
 * Send ETH from treasury to an external address.
 * @param {string} to    - destination 0x address
 * @param {string} amount - ETH amount as decimal string (e.g. "0.05")
 * @returns {{ ok, tx_hash, from, to, amount, chain, block }}
 */
async function withdraw(to, amount) {
  if (!ethers.isAddress(to)) throw new Error('Invalid destination address');

  const value = ethers.parseEther(amount);
  if (value <= 0n) throw new Error('Amount must be positive');

  // Safety: estimate gas and check balance covers value + gas
  const bal = await getProvider().getBalance(getWallet().address);
  const feeData = await getProvider().getFeeData();
  const gasLimit = 21000n; // standard ETH transfer gas limit
  const gasPrice = feeData.maxFeePerGas || feeData.gasPrice || 0n;
  const gasCost = gasLimit * gasPrice;
  const totalNeeded = value + gasCost;

  if (bal < totalNeeded) {
    throw new Error(
      `Insufficient balance: have ${ethers.formatEther(bal)} ETH, ` +
      `need ${ethers.formatEther(value)} ETH + ~${ethers.formatEther(gasCost)} ETH gas ` +
      `(total ${ethers.formatEther(totalNeeded)} ETH)`
    );
  }

  const tx = await getWallet().sendTransaction({ to, value });
  const receipt = await tx.wait();

  return {
    ok:       true,
    tx_hash:  receipt.hash,
    from:     getWallet().address,
    to,
    amount,
    chain:    'linea',
    chainId:  parseInt(process.env.BRIDGE_SIWE_CHAIN_ID || '59144', 10),
    block:    receipt.blockNumber,
    gasUsed:  receipt.gasUsed.toString(),
    status:   receipt.status === 1 ? 'confirmed' : 'failed',
  };
}

module.exports = { getAddress, getBalance, getGasPrice, getBlockNumber, getWallet, withdraw };
