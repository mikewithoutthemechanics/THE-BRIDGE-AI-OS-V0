'use strict';
/**
 * lib/proof-store.js — Payment Proof Storage & Hash Chain
 *
 * Every payment that enters the system gets:
 *   1. A unique transaction hash (SHA-256 of canonical fields + previous hash)
 *   2. A signed proof receipt (HMAC over the hash)
 *   3. Inclusion in a Merkle tree (batched, for optional on-chain anchoring)
 *
 * The hash chain is append-only: modifying any past transaction breaks
 * every subsequent hash, making tampering detectable.
 *
 * Storage: Supabase `payment_proofs` table + `merkle_anchors` table.
 */
const { supabaseAdmin, isConfigured } = require('./supabase');
const zt = require('./zero-trust');

// In-memory chain for when Supabase is unavailable
const memChain = [];
let lastHash = '0'.repeat(64);

// ── Core: record a payment proof ─────────────────────────────────────────────

/**
 * Record a verified payment and produce a cryptographic proof.
 *
 * @param {Object} tx - Transaction data
 * @param {string} tx.id - Unique transaction ID (from payment processor)
 * @param {number} tx.amount - Payment amount
 * @param {string} tx.currency - Currency code (ZAR, USD, ETH, BRDG)
 * @param {string} tx.source - Payment rail (payfast, paystack, crypto, brdg)
 * @param {string} tx.webhookId - Webhook event ID from processor
 * @param {Object} tx.webhookSignature - Original webhook signature data
 * @param {string} tx.timestamp - ISO 8601 timestamp
 * @returns {Object} Proof receipt
 */
async function recordPayment(tx) {
  // Get the previous hash (tip of the chain)
  const prevHash = await getChainTip();

  // Create the proof
  const proof = zt.createPaymentProof(tx, prevHash);

  // Store in Supabase
  if (isConfigured) {
    try {
      await supabaseAdmin.from('payment_proofs').insert({
        transaction_id: proof.transactionId,
        amount: proof.amount,
        currency: proof.currency,
        source: proof.source,
        tx_hash: proof.txHash,
        previous_hash: proof.previousHash,
        proof_signature: proof.proofSignature,
        webhook_id: tx.webhookId || null,
        webhook_signature: tx.webhookSignature || null,
        raw_meta: tx.meta || null,
        created_at: proof.timestamp || new Date().toISOString(),
      });
    } catch (e) {
      // Duplicate protection — idempotent on transaction_id
      if (e.code !== '23505') {
        console.warn('[proof-store] insert failed:', e.message);
      }
    }
  }

  // Update in-memory chain
  memChain.push(proof);
  lastHash = proof.txHash;

  return proof;
}

// ── Chain integrity ──────────────────────────────────────────────────────────

/**
 * Get the latest hash in the chain (tip).
 */
async function getChainTip() {
  if (isConfigured) {
    try {
      const { data } = await supabaseAdmin
        .from('payment_proofs')
        .select('tx_hash')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (data) return data.tx_hash;
    } catch (_) {}
  }
  return lastHash;
}

/**
 * Verify the entire payment chain is intact.
 * Returns { valid, length, brokenAt } or { valid: true, length }.
 */
async function verifyChain(limit = 1000) {
  try {
    const proofs = await getAllProofs(limit);
    if (proofs.length === 0) return { valid: true, length: 0, status: 'empty_chain' };

    let prevHash = '0'.repeat(64);
    for (let i = 0; i < proofs.length; i++) {
      const p = proofs[i];

      // Ensure required fields exist
      if (!p.tx_hash || !p.transaction_id) {
        return {
          valid: false,
          length: proofs.length,
          brokenAt: i,
          reason: 'missing_fields',
          transactionId: p.transaction_id || '?',
        };
      }

      // Check chain link
      if (p.previous_hash !== prevHash) {
        return {
          valid: false,
          length: proofs.length,
          brokenAt: i,
          expected: prevHash,
          found: p.previous_hash,
          transactionId: p.transaction_id,
        };
      }

      // Recompute hash
      const recomputed = zt.hashTransaction({
        id: p.transaction_id,
        amount: p.amount,
        currency: p.currency,
        source: p.source,
        timestamp: p.created_at,
      }, prevHash);

      if (recomputed !== p.tx_hash) {
        return {
          valid: false,
          length: proofs.length,
          brokenAt: i,
          reason: 'hash_mismatch',
          transactionId: p.transaction_id,
        };
      }

      prevHash = p.tx_hash;
    }

    return { valid: true, length: proofs.length, tipHash: prevHash, status: 'intact' };
  } catch (e) {
    console.warn('[proof-store] verifyChain error:', e.message);
    return { valid: false, error: e.message, status: 'verification_error' };
  }
}

// ── Lookup ───────────────────────────────────────────────────────────────────

/**
 * Get proof for a specific payment by transaction ID.
 */
async function getProof(transactionId) {
  if (isConfigured) {
    try {
      const { data } = await supabaseAdmin
        .from('payment_proofs')
        .select('*')
        .eq('transaction_id', transactionId)
        .single();
      if (data) return formatProofResponse(data);
    } catch (_) {}
  }
  // Fallback to in-memory
  const found = memChain.find(p => p.transactionId === transactionId);
  return found || null;
}

/**
 * Get all proofs (ordered oldest-first for chain verification).
 */
async function getAllProofs(limit = 1000) {
  if (isConfigured) {
    try {
      const { data } = await supabaseAdmin
        .from('payment_proofs')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(limit);
      return data || [];
    } catch (_) {}
  }
  return memChain.slice(0, limit);
}

// ── Merkle batch anchoring ───────────────────────────────────────────────────

/**
 * Create a Merkle root from recent unanchored transactions.
 * This root can be submitted to the blockchain for permanent anchoring.
 */
async function createMerkleAnchor() {
  const proofs = await getUnanchoredProofs();
  if (proofs.length === 0) return { anchored: 0 };

  const hashes = proofs.map(p => p.tx_hash);
  const tree = zt.buildMerkleTree(hashes);

  const anchor = {
    merkle_root: tree.root,
    leaf_count: tree.leaves,
    depth: tree.depth,
    first_tx: proofs[0].transaction_id,
    last_tx: proofs[proofs.length - 1].transaction_id,
    computed_at: new Date().toISOString(),
    anchored_on_chain: false,
    chain_tx_hash: null,
  };

  if (isConfigured) {
    try {
      const { data } = await supabaseAdmin
        .from('merkle_anchors')
        .insert(anchor)
        .select()
        .single();

      // Mark proofs as anchored
      const txIds = proofs.map(p => p.transaction_id);
      await supabaseAdmin
        .from('payment_proofs')
        .update({ merkle_anchor_id: data.id })
        .in('transaction_id', txIds);

      return { ...data, anchored: proofs.length };
    } catch (e) {
      console.warn('[proof-store] createMerkleAnchor failed:', e.message);
    }
  }

  return { ...anchor, anchored: proofs.length };
}

/**
 * Get proofs not yet included in a Merkle anchor.
 */
async function getUnanchoredProofs() {
  if (isConfigured) {
    try {
      const { data } = await supabaseAdmin
        .from('payment_proofs')
        .select('*')
        .is('merkle_anchor_id', null)
        .order('created_at', { ascending: true })
        .limit(256); // Max leaves per tree
      return data || [];
    } catch (_) {}
  }
  return memChain.filter(p => !p.merkleAnchorId);
}

/**
 * Get Merkle inclusion proof for a specific transaction.
 */
async function getMerkleProof(transactionId) {
  if (!isConfigured) return null;
  try {
    // Find the proof and its anchor
    const { data: proof } = await supabaseAdmin
      .from('payment_proofs')
      .select('*, merkle_anchor_id')
      .eq('transaction_id', transactionId)
      .single();

    if (!proof || !proof.merkle_anchor_id) {
      return { included: false, reason: 'not_yet_anchored' };
    }

    // Get all proofs in the same anchor batch
    const { data: batch } = await supabaseAdmin
      .from('payment_proofs')
      .select('tx_hash, transaction_id')
      .eq('merkle_anchor_id', proof.merkle_anchor_id)
      .order('created_at', { ascending: true });

    const hashes = batch.map(b => b.tx_hash);
    const targetIdx = hashes.indexOf(proof.tx_hash);
    const mp = zt.merkleProof(hashes, targetIdx);

    // Get anchor info
    const { data: anchor } = await supabaseAdmin
      .from('merkle_anchors')
      .select('*')
      .eq('id', proof.merkle_anchor_id)
      .single();

    return {
      included: true,
      transactionId,
      txHash: proof.tx_hash,
      merkleRoot: mp.root,
      proof: mp.proof,
      anchoredOnChain: anchor?.anchored_on_chain || false,
      chainTxHash: anchor?.chain_tx_hash || null,
    };
  } catch (e) {
    return { included: false, error: e.message };
  }
}

// ── Revenue summary (verified) ───────────────────────────────────────────────

/**
 * Compute revenue metrics from the proof chain (not from cached values).
 * Every number is derived from verified payment proofs.
 */
async function getVerifiedRevenue() {
  try {
    const proofs = await getAllProofs(10000);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    let totalAll = 0;
    let totalMtd = 0;
    const byCurrency = {};
    const bySource = {};

    for (const p of proofs) {
      const amt = parseFloat(p.amount) || 0;
      const cur = p.currency || 'ZAR';
      const src = p.source || 'unknown';
      const ts = p.created_at || p.timestamp;

      totalAll += amt;
      if (ts >= monthStart) totalMtd += amt;

      byCurrency[cur] = (byCurrency[cur] || 0) + amt;
      bySource[src] = (bySource[src] || 0) + amt;
    }

    return {
      ok: true,
      totalRevenue: +totalAll.toFixed(2),
      revenueMtd: +totalMtd.toFixed(2),
      transactionCount: proofs.length,
      byCurrency,
      bySource,
      chainIntegrity: await verifyChain(),
      computedAt: now.toISOString(),
      source: 'payment_proof_chain',
    };
  } catch (e) {
    console.warn('[proof-store] getVerifiedRevenue error:', e.message);
    return {
      ok: false,
      error: e.message,
      totalRevenue: 0,
      revenueMtd: 0,
      transactionCount: 0,
      chainIntegrity: { valid: false, error: e.message },
      computedAt: new Date().toISOString(),
      source: 'payment_proof_chain',
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatProofResponse(row) {
  return {
    transactionId: row.transaction_id,
    amount: parseFloat(row.amount),
    currency: row.currency,
    source: row.source,
    txHash: row.tx_hash,
    previousHash: row.previous_hash,
    proofSignature: row.proof_signature,
    webhookId: row.webhook_id,
    timestamp: row.created_at,
    verificationMethod: 'HMAC-SHA256 hash chain',
    verifyEndpoint: `/api/verify/payment/${row.transaction_id}`,
  };
}

// ── SQL for required tables ──────────────────────────────────────────────────
const MIGRATION_SQL = `
-- Payment proofs: append-only hash chain
CREATE TABLE IF NOT EXISTS payment_proofs (
  transaction_id TEXT PRIMARY KEY,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  source TEXT NOT NULL,
  tx_hash TEXT NOT NULL UNIQUE,
  previous_hash TEXT NOT NULL,
  proof_signature TEXT NOT NULL,
  webhook_id TEXT,
  webhook_signature JSONB,
  raw_meta JSONB,
  merkle_anchor_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proofs_created ON payment_proofs(created_at);
CREATE INDEX IF NOT EXISTS idx_proofs_source ON payment_proofs(source);
CREATE INDEX IF NOT EXISTS idx_proofs_anchor ON payment_proofs(merkle_anchor_id);

-- Merkle anchors: batched roots for on-chain submission
CREATE TABLE IF NOT EXISTS merkle_anchors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  merkle_root TEXT NOT NULL,
  leaf_count INTEGER NOT NULL,
  depth INTEGER NOT NULL,
  first_tx TEXT NOT NULL,
  last_tx TEXT NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL,
  anchored_on_chain BOOLEAN DEFAULT FALSE,
  chain_tx_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
`;

module.exports = {
  recordPayment,
  getProof,
  getAllProofs,
  getChainTip,
  verifyChain,
  createMerkleAnchor,
  getMerkleProof,
  getVerifiedRevenue,
  MIGRATION_SQL,
};
