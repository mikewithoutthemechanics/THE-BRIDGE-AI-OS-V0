/**
 * ETH Treasury — Linea L2 wallet derived from KeyForge master secret.
 * No separate private key needed: the wallet is deterministically derived
 * from the same master secret chain that powers KeyForge auth.
 *
 * Derivation: HMAC-SHA256(KF_MASTER, "bridge-treasury-eth-wallet-v1") → 32-byte private key
 */
'use strict';

const crypto = require('crypto');
const { ethers } = require('ethers');

// ── Master secret (same derivation as brain.js KeyForge) ───────────────────
const MIN_SECRET_LENGTH = 32;

function masterSecret() {
  const sources = [
    process.env.BRIDGE_SIWE_JWT_SECRET,
    process.env.BRIDGE_INTERNAL_SECRET,
    process.env.JWT_SECRET,
  ].filter(s => s && s.length >= MIN_SECRET_LENGTH);

  if (sources.length === 0) {
    throw new Error(
      `[eth-treasury] No secret env var meets the minimum length of ${MIN_SECRET_LENGTH} chars. ` +
      'Set BRIDGE_SIWE_JWT_SECRET, BRIDGE_INTERNAL_SECRET, or JWT_SECRET to a strong value.'
    );
  }

  // Do NOT mix in os.hostname() — it is predictable and leaks infrastructure info
  const combined = sources.join(':');
  return crypto.createHash('sha512').update(combined).digest();
}

// ── Derive a deterministic ETH private key from the master ─────────────────
function deriveTreasuryKey(master) {
  return crypto.createHmac('sha256', master)
    .update('bridge-treasury-eth-wallet-v1')
    .digest();                                       // 32 bytes = valid secp256k1 key
}

// ── Singleton instances ────────────────────────────────────────────────────
// Provider is lazy-loaded from treasury.js shared singleton to avoid circular deps
let _wallet   = null;

function getProvider() {
  return require('./treasury').getProvider();
}

function getWallet() {
  if (!_wallet) {
    let keyHex;
    if (process.env.TREASURY_PRIVATE_KEY) {
      keyHex = process.env.TREASURY_PRIVATE_KEY.startsWith('0x')
        ? process.env.TREASURY_PRIVATE_KEY
        : '0x' + process.env.TREASURY_PRIVATE_KEY;
    } else {
      console.warn('[eth-treasury] WARNING: TREASURY_PRIVATE_KEY not set — falling back to derived key from JWT/internal secret. Set TREASURY_PRIVATE_KEY for production use.');
      keyHex = '0x' + deriveTreasuryKey(masterSecret()).toString('hex');
    }
    _wallet = new ethers.Wallet(keyHex, getProvider());
  }
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

module.exports = { getAddress, getBalance, getGasPrice, getBlockNumber, withdraw };
