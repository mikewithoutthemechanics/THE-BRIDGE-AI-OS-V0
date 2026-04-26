'use strict';
/**
 * lib/chain-verify.js — On-Chain Verification Layer
 *
 * Wraps blockchain reads with verification metadata:
 *   - Block number at time of read (proves freshness)
 *   - Block explorer deep links (proves source)
 *   - Contract ABI call signatures (proves method)
 *   - RPC endpoint used (proves network)
 *
 * Every value returned includes enough info for a third party
 * to independently reproduce the same read and verify.
 */
const brdgChain = require('./brdg-chain');
const zt = require('./zero-trust');

const LINEASCAN_BASE = 'https://lineascan.build';
const LINEA_RPC = process.env.BRIDGE_SIWE_RPC_URL || 'https://rpc.linea.build';

const {
  BRDG_ADDRESS,
  VAULT_ADDRESS,
  TREASURY_OWNER,
} = brdgChain;

// ── Verified token metrics ───────────────────────────────────────────────────

/**
 * Fetch BRDG token stats with full verification metadata.
 * Every field includes how to independently verify it.
 */
async function getVerifiedTokenMetrics() {
  let blockNumber;
  try {
    const provider = require('./treasury').getProvider();
    blockNumber = await provider.getBlockNumber();
  } catch (_) {
    blockNumber = null;
  }

  const stats = await brdgChain.getTokenStats();

  return {
    token: {
      ...stats.token,
      verification: {
        source: 'on-chain',
        contract: BRDG_ADDRESS,
        chain: 'linea-mainnet',
        chainId: 59144,
        rpc: LINEA_RPC,
        blockNumber,
        methods: {
          totalSupply: {
            call: 'totalSupply()',
            returns: 'uint256 (18 decimals)',
            explorerLink: `${LINEASCAN_BASE}/token/${BRDG_ADDRESS}#readContract`,
          },
          totalBurned: {
            call: 'totalBurned()',
            returns: 'uint256 (18 decimals)',
            explorerLink: `${LINEASCAN_BASE}/token/${BRDG_ADDRESS}#readContract`,
          },
          maxSupply: {
            call: 'MAX_SUPPLY()',
            returns: 'uint256 (constant: 100000000 * 1e18)',
            explorerLink: `${LINEASCAN_BASE}/token/${BRDG_ADDRESS}#readContract`,
          },
        },
        links: {
          contract: `${LINEASCAN_BASE}/token/${BRDG_ADDRESS}`,
          holders: `${LINEASCAN_BASE}/token/${BRDG_ADDRESS}#balances`,
          transfers: `${LINEASCAN_BASE}/token/${BRDG_ADDRESS}#transfers`,
          sourcify: `https://repo.sourcify.dev/contracts/full_match/59144/${BRDG_ADDRESS}/`,
        },
        howToVerify: [
          `1. Go to ${LINEASCAN_BASE}/token/${BRDG_ADDRESS}#readContract`,
          '2. Call totalSupply() — divide result by 1e18 for human-readable BRDG amount',
          '3. Call totalBurned() — this is the cumulative amount burned via 1% transfer tax',
          '4. Or use any Linea RPC: eth_call to contract with function selector 0x18160ddd (totalSupply)',
        ],
      },
    },
    treasury: {
      owner: TREASURY_OWNER,
      brdgBalance: stats.treasury.brdgBalance,
      vault: stats.treasury.vault,
      verification: {
        source: 'on-chain',
        methods: {
          ownerBalance: {
            call: `balanceOf("${TREASURY_OWNER}")`,
            explorerLink: `${LINEASCAN_BASE}/token/${BRDG_ADDRESS}?a=${TREASURY_OWNER}`,
          },
          vaultEth: {
            call: `eth_getBalance("${VAULT_ADDRESS}")`,
            explorerLink: `${LINEASCAN_BASE}/address/${VAULT_ADDRESS}`,
          },
        },
        links: {
          treasuryWallet: `${LINEASCAN_BASE}/address/${TREASURY_OWNER}`,
          vaultContract: `${LINEASCAN_BASE}/address/${VAULT_ADDRESS}`,
          vaultCode: `${LINEASCAN_BASE}/address/${VAULT_ADDRESS}#code`,
        },
      },
    },
    readAt: {
      timestamp: Date.now(),
      blockNumber,
      iso: new Date().toISOString(),
    },
  };
}

// ── Verified vault buckets ───────────────────────────────────────────────────

/**
 * Fetch TreasuryVault bucket balances with verification.
 */
async function getVerifiedVaultBuckets() {
  const buckets = await brdgChain.getVaultBuckets();

  return {
    buckets,
    verification: {
      source: 'on-chain',
      contract: VAULT_ADDRESS,
      method: 'bucketBalances()',
      returns: '(uint256[4] ethBuckets, uint256[4] brdgBuckets)',
      explorerLink: `${LINEASCAN_BASE}/address/${VAULT_ADDRESS}#readContract`,
      bucketAllocation: {
        ops: '40% (4000 bps)',
        liquidity: '25% (2500 bps)',
        reserve: '20% (2000 bps)',
        founder: '15% (1500 bps)',
      },
      howToVerify: [
        `1. Go to ${LINEASCAN_BASE}/address/${VAULT_ADDRESS}#readContract`,
        '2. Call bucketBalances() — returns 8 uint256 values',
        '3. First 4 = ETH buckets (ops, liquidity, reserve, founder)',
        '4. Last 4 = BRDG buckets (same order)',
        '5. Divide each by 1e18 for human-readable amounts',
      ],
    },
  };
}

// ── Verified treasury (combined on-chain + off-chain) ────────────────────────

/**
 * Full treasury status combining on-chain and off-chain sources.
 * Each component is individually attestable.
 */
async function getVerifiedTreasury() {
  const db = require('./db');

  // On-chain: read directly from blockchain
  let onChain = null;
  try {
    const stats = await brdgChain.getTokenStats();
    const vaultBuckets = await brdgChain.getVaultBuckets();
    onChain = {
      brdgBalance: parseFloat(stats.treasury.brdgBalance),
      vaultEth: parseFloat(stats.treasury.vault.ethBalance),
      vaultBuckets: vaultBuckets,
      source: 'on-chain',
      verifiable: true,
      verifyLinks: {
        wallet: `${LINEASCAN_BASE}/address/${TREASURY_OWNER}`,
        vault: `${LINEASCAN_BASE}/address/${VAULT_ADDRESS}`,
        token: `${LINEASCAN_BASE}/token/${BRDG_ADDRESS}`,
      },
    };
  } catch (e) {
    onChain = { error: e.message, source: 'on-chain', verifiable: false };
  }

  // Off-chain: fiat balance from reconciled DB
  const reconciliation = await db.reconcileTreasury();
  const fiatBalance = reconciliation.computed || (await db.getTreasuryBalance());
  const offChain = zt.createAttestation(
    'treasury.fiat.balance',
    { balance: fiatBalance, currency: 'ZAR', reconciliation },
    'signed-internal',
    `reconcile:${new Date().toISOString().slice(0, 10)}`
  );

  return {
    onChain,
    offChain: {
      ...offChain,
      howToVerify: [
        '1. Obtain BRIDGE_VERIFY_SECRET from system operator',
        '2. Derive attestation key: HMAC-SHA256(secret, "bridge-zero-trust:attestation")',
        '3. Reconstruct canonical: "treasury.fiat.balance|<value_json>|signed-internal|<ref>|<timestamp>"',
        '4. Verify HMAC matches the signature field',
        '5. Cross-reference with payment processor records for independent confirmation',
      ],
    },
    combined: {
      fiatZar: fiatBalance,
      cryptoEth: onChain?.vaultEth || 0,
      cryptoBrdg: onChain?.brdgBalance || 0,
    },
    trustLevel: {
      onChain: 'trustless — independently verifiable by anyone',
      offChain: 'signed — verifiable with operator key, cross-referenced with payment processors',
    },
    computedAt: new Date().toISOString(),
  };
}

// ── Event log verification ───────────────────────────────────────────────────

/**
 * Create a verified event entry.
 * Events are hashed and can be batch-anchored via Merkle trees.
 */
function createVerifiedEvent(type, data) {
  const timestamp = Date.now();
  const eventHash = require('crypto')
    .createHash('sha256')
    .update(JSON.stringify({ type, data, timestamp }))
    .digest('hex');

  return {
    type,
    data,
    timestamp,
    eventHash,
    signed: zt.signResponse({ type, eventHash, timestamp }, 'event-log'),
  };
}

module.exports = {
  getVerifiedTokenMetrics,
  getVerifiedVaultBuckets,
  getVerifiedTreasury,
  createVerifiedEvent,
  BRDG_ADDRESS,
  VAULT_ADDRESS,
  TREASURY_OWNER,
  LINEASCAN_BASE,
};
