/**
 * Consolidated Treasury Module
 *
 * Single entry point for all treasury operations:
 *   - Shared Linea provider (no duplicate RPC connections)
 *   - Bucket calculation (ops/growth/reserve/founder split)
 *   - On-chain reads (BRDG token, TreasuryVault)
 *   - ETH wallet operations
 *   - Off-chain balance (Supabase)
 */
'use strict';

const { ethers } = require('ethers');

// ── Shared Linea Provider (singleton) ──────────────────────────────────────
let _provider = null;

function getProvider() {
  if (!_provider) {
    const rpc = process.env.BRIDGE_SIWE_RPC_URL || 'https://rpc.linea.build';
    const chainId = parseInt(process.env.BRIDGE_SIWE_CHAIN_ID || '59144', 10);
    _provider = new ethers.JsonRpcProvider(rpc, { name: 'linea', chainId });
  }
  return _provider;
}

// ── Bucket Definitions ─────────────────────────────────────────────────────
const BUCKETS = [
  { name: 'ops',      label: 'Operations', pct: 40 },
  { name: 'treasury', label: 'Growth',     pct: 25 },
  { name: 'ubi',      label: 'Reserve',    pct: 20 },
  { name: 'founder',  label: 'Founder',    pct: 15 },
];

/**
 * Compute bucket balances from a total balance.
 * @param {number} total - total treasury balance
 * @param {object} [opts] - options
 * @param {boolean} [opts.includeValue] - include `value` field (alias for balance)
 * @returns {Array<{ name, label, pct, balance, value? }>}
 */
function computeBuckets(total, opts = {}) {
  return BUCKETS.map(b => {
    const balance = +(total * b.pct / 100).toFixed(2);
    const entry = { name: b.name, label: b.label, pct: b.pct, balance };
    if (opts.includeValue) entry.value = balance;
    return entry;
  });
}

// ── Re-exports ─────────────────────────────────────────────────────────────
const ethTreasury = require('./eth-treasury');
const brdgChain   = require('./brdg-chain');
const db          = require('./db');

module.exports = {
  // Shared infra
  getProvider,
  BUCKETS,
  computeBuckets,

  // ETH wallet (Linea)
  getAddress:    ethTreasury.getAddress,
  getBalance:    ethTreasury.getBalance,
  getGasPrice:   ethTreasury.getGasPrice,
  getBlockNumber:ethTreasury.getBlockNumber,
  withdraw:      ethTreasury.withdraw,

  // On-chain BRDG / Vault reads
  getTokenStats:   brdgChain.getTokenStats,
  getVaultBuckets: brdgChain.getVaultBuckets,
  BRDG_ADDRESS:    brdgChain.BRDG_ADDRESS,
  VAULT_ADDRESS:   brdgChain.VAULT_ADDRESS,
  TREASURY_OWNER:  brdgChain.TREASURY_OWNER,

  // Off-chain balance (Supabase)
  getTreasuryBalance: db.getTreasuryBalance,
  addToTreasury:      db.addToTreasury,
  reconcileTreasury:  db.reconcileTreasury,
};
