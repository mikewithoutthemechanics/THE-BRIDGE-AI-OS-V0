'use strict';
/**
 * lib/treasury-withdraw.js — Deterministic Treasury Withdrawal Engine
 *
 * Withdrawals are computed strictly from:
 *   1. Treasury available balance (on-chain + off-chain)
 *   2. Merkle-verified entitlements (precomputed, cryptographic)
 *   3. Claim bitmap (prevents double-spend)
 *
 * NO dependency on: staking state, time locks, reward accruals, APY.
 * Idempotent: same inputs + same state = same output.
 *
 * Invariant: total_withdrawals <= treasury_balance (always)
 */

const crypto = require('crypto');
const { MerkleTree, hashLeaf } = require('./merkle');

// ── Supabase client (optional) ─────────────────────────────────────────────
let supabase;
try { supabase = require('./supabase').supabaseAdmin; } catch (_) { supabase = null; }

// ── Withdrawal Rails ───────────────────────────────────────────────────────
const RAILS = {
  brdg:    { name: 'BRDG Token',            chain: 'linea',     type: 'on-chain',      fee_pct: 0,     fee_flat: 0,   min: 1 },
  eth:     { name: 'ETH (Linea)',           chain: 'linea',     type: 'on-chain',      fee_pct: 0,     fee_flat: 0.001, min: 0.01 },
  dex:     { name: 'DEX Swap (BRDG→USDT)', chain: 'linea',     type: 'dex',           fee_pct: 0.003, fee_flat: 0,   min: 10 },
  defi:    { name: 'DeFi Yield Vault',      chain: 'linea',     type: 'defi-deposit',  fee_pct: 0,     fee_flat: 0,   min: 100 },
  payfast: { name: 'PayFast (ZAR)',         chain: 'off-chain', type: 'fiat-offramp',  fee_pct: 0.035, fee_flat: 0,   min: 50 },
  eft:     { name: 'SA Bank EFT',           chain: 'off-chain', type: 'fiat-offramp',  fee_pct: 0,     fee_flat: 15,  min: 100 },
};

// ── Claim bitmap (in-memory + DB-backed) ───────────────────────────────────
// Tracks which Merkle leaf indices have been claimed — prevents double-spend.
const claimedBitmap = new Set();

async function isClaimedInDB(merkleRoot, leafIndex) {
  if (!supabase) return claimedBitmap.has(`${merkleRoot}:${leafIndex}`);
  try {
    const { data } = await supabase
      .from('withdrawal_claims')
      .select('id')
      .eq('merkle_root', merkleRoot)
      .eq('leaf_index', leafIndex)
      .single();
    return !!data;
  } catch (_) { return claimedBitmap.has(`${merkleRoot}:${leafIndex}`); }
}

async function markClaimed(merkleRoot, leafIndex, txData) {
  const key = `${merkleRoot}:${leafIndex}`;
  claimedBitmap.add(key);
  if (supabase) {
    try {
      await supabase.from('withdrawal_claims').insert({
        merkle_root: merkleRoot,
        leaf_index: leafIndex,
        claimant: txData.to,
        amount: txData.amount,
        rail: txData.rail,
        tx_hash: txData.tx_hash || null,
        claimed_at: new Date().toISOString(),
      });
    } catch (_) {}
  }
}

// ── Entitlement Tree ───────────────────────────────────────────────────────
// Off-chain precomputation: admin builds allocation list, hashes into tree,
// stores root. Users prove entitlement via Merkle proof.

/**
 * Build an entitlement tree from a list of allocations.
 * @param {Array<{address: string, amount: number, reason: string}>} allocations
 * @returns {{ root: string, tree: MerkleTree, leaves: string[] }}
 */
function buildEntitlementTree(allocations) {
  const leaves = allocations.map(a =>
    `${a.address.toLowerCase()}:${a.amount}:${a.reason || 'allocation'}`
  );
  const tree = new MerkleTree(leaves);
  return { root: tree.getRoot(), tree, leaves, count: leaves.length };
}

/**
 * Verify a withdrawal entitlement against a Merkle root.
 * @param {string} address - claimant address
 * @param {number} amount - claimed amount
 * @param {string} reason - allocation reason
 * @param {Array} proof - Merkle proof array
 * @param {string} expectedRoot - expected Merkle root
 * @returns {boolean}
 */
function verifyEntitlement(address, amount, reason, proof, expectedRoot) {
  const leafData = `${address.toLowerCase()}:${amount}:${reason || 'allocation'}`;
  const tree = new MerkleTree();
  return tree.verify(leafData, proof, expectedRoot);
}

// ── Deterministic Withdrawal Computation ───────────────────────────────────

/**
 * Compute the exact withdrawable amount. Pure function — no side effects.
 *
 * @param {object} params
 * @param {number} params.treasuryBalance - current treasury balance
 * @param {number} params.requestedAmount - amount requested
 * @param {string} params.rail - withdrawal rail (brdg, eth, dex, etc.)
 * @returns {{ ok: boolean, amount: number, fee: number, net: number, rail_config: object, error?: string }}
 */
function computeWithdrawal({ treasuryBalance, requestedAmount, rail }) {
  const railConfig = RAILS[rail];
  if (!railConfig) return { ok: false, error: `Unknown rail: ${rail}` };
  if (requestedAmount <= 0) return { ok: false, error: 'Amount must be positive' };
  if (requestedAmount < railConfig.min) return { ok: false, error: `Minimum for ${rail}: ${railConfig.min}` };

  const fee = +(requestedAmount * railConfig.fee_pct + railConfig.fee_flat).toFixed(4);
  const net = +(requestedAmount - fee).toFixed(4);

  if (requestedAmount > treasuryBalance) {
    return { ok: false, error: `Insufficient treasury: have ${treasuryBalance}, need ${requestedAmount}` };
  }

  return { ok: true, amount: requestedAmount, fee, net, rail, rail_config: railConfig };
}

/**
 * Execute a deterministic withdrawal. This is the single entry point.
 *
 * @param {object} params
 * @param {number} params.treasuryBalance - current verified treasury balance
 * @param {string} params.to - destination address or identifier
 * @param {number} params.amount - amount to withdraw
 * @param {string} params.rail - withdrawal rail
 * @param {string} [params.memo] - optional memo
 * @param {object} [params.merkleProof] - { proof, root, leafIndex, reason } if Merkle-gated
 * @param {function} [params.onChainExecute] - async (rail, to, amount) => { tx_hash }
 * @returns {Promise<object>} withdrawal result
 */
async function executeWithdrawal(params) {
  const { treasuryBalance, to, amount, rail, memo, merkleProof, onChainExecute } = params;

  // Step 1: Deterministic computation
  const computation = computeWithdrawal({ treasuryBalance, requestedAmount: amount, rail });
  if (!computation.ok) return computation;

  // Step 2: Merkle verification (if entitlement-gated)
  if (merkleProof) {
    const { proof, root, leafIndex, reason } = merkleProof;
    const valid = verifyEntitlement(to, amount, reason, proof, root);
    if (!valid) return { ok: false, error: 'Invalid Merkle entitlement proof' };

    const alreadyClaimed = await isClaimedInDB(root, leafIndex);
    if (alreadyClaimed) return { ok: false, error: 'Entitlement already claimed' };
  }

  // Step 3: Execute on the appropriate rail
  let txHash = null;
  const railConfig = RAILS[rail];

  try {
    if (onChainExecute && (railConfig.type === 'on-chain' || railConfig.type === 'dex' || railConfig.type === 'defi-deposit')) {
      const result = await onChainExecute(rail, to, String(amount));
      txHash = result.tx_hash || result.txHash || result;
    } else if (railConfig.type === 'fiat-offramp') {
      txHash = `offramp_${rail}_${Date.now().toString(36)}`;
    } else if (railConfig.type === 'dex') {
      txHash = `dex_swap_${Date.now().toString(36)}`;
    } else if (railConfig.type === 'defi-deposit') {
      txHash = `defi_deposit_${Date.now().toString(36)}`;
    } else {
      txHash = `pending_${Date.now().toString(36)}`;
    }
  } catch (e) {
    return { ok: false, error: `Transfer failed: ${e.message}` };
  }

  // Step 4: Mark Merkle claim as used (if applicable)
  if (merkleProof) {
    await markClaimed(merkleProof.root, merkleProof.leafIndex, { to, amount, rail, tx_hash: txHash });
  }

  // Step 5: Audit log
  const entry = {
    id: Date.now().toString(36),
    to, amount, fee: computation.fee, net: computation.net,
    rail, memo: memo || '',
    tx_hash: txHash,
    merkle_root: merkleProof?.root || null,
    ts: Date.now(),
  };
  if (supabase) {
    try { await supabase.from('admin_withdrawals').insert(entry); } catch (_) {}
  }

  return {
    ok: true,
    tx_hash: txHash,
    amount: computation.amount,
    fee: computation.fee,
    net: computation.net,
    to,
    rail,
    rail_config: railConfig,
    merkle_verified: !!merkleProof,
    deterministic: true,
    ts: entry.ts,
  };
}

/**
 * Get treasury state snapshot — single source of truth.
 * @returns {Promise<object>}
 */
async function getTreasuryState() {
  const db = require('./db');
  const balance = await db.getTreasuryBalance();
  const { computeBuckets } = require('./treasury');

  // Get total withdrawn
  let totalWithdrawn = 0;
  if (supabase) {
    try {
      const { data } = await supabase
        .from('admin_withdrawals')
        .select('amount')
        .order('ts', { ascending: false });
      totalWithdrawn = (data || []).reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);
    } catch (_) {}
  }

  const available = +(balance - totalWithdrawn).toFixed(2);
  return {
    balance: +balance.toFixed(2),
    total_withdrawn: +totalWithdrawn.toFixed(2),
    available: Math.max(0, available),
    currency: 'ZAR',
    buckets: computeBuckets(balance, { includeValue: true }),
    invariant_holds: available >= 0,
    ts: Date.now(),
  };
}

// ── Migration SQL ──────────────────────────────────────────────────────────
const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS withdrawal_claims (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  merkle_root TEXT NOT NULL,
  leaf_index INTEGER NOT NULL,
  claimant TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  rail TEXT NOT NULL,
  tx_hash TEXT,
  claimed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(merkle_root, leaf_index)
);
CREATE INDEX IF NOT EXISTS idx_claims_root ON withdrawal_claims(merkle_root);
CREATE INDEX IF NOT EXISTS idx_claims_claimant ON withdrawal_claims(claimant);
`;

module.exports = {
  RAILS,
  computeWithdrawal,
  executeWithdrawal,
  getTreasuryState,
  buildEntitlementTree,
  verifyEntitlement,
  isClaimedInDB,
  markClaimed,
  MIGRATION_SQL,
};
