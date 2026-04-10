'use strict';
/**
 * lib/zero-trust.js — Cryptographic Integrity Layer for Bridge AI OS
 *
 * Every API response is signed with HMAC-SHA256. Clients verify signatures
 * against a published verification key. No metric is trusted without a
 * cryptographic proof chain back to its authoritative source.
 *
 * Sources of truth:
 *   - on-chain:  Linea L2 contract reads (BRDG token, TreasuryVault)
 *   - webhook:   Payment processor callbacks (PayFast IPN, Paystack)
 *   - signed:    HMAC-signed internal attestations
 *   - derived:   Computed from other verified sources
 */
const crypto = require('crypto');

// ── Secret management ────────────────────────────────────────────────────────
// Master secret MUST come from environment — never hardcoded
function getMasterSecret() {
  const s = process.env.BRIDGE_VERIFY_SECRET || process.env.BRIDGE_INTERNAL_SECRET;
  if (!s) throw new Error('[zero-trust] BRIDGE_VERIFY_SECRET env var required');
  return s;
}

// Derive a purpose-specific key from the master secret
function deriveKey(purpose) {
  return crypto.createHmac('sha256', getMasterSecret())
    .update(`bridge-zero-trust:${purpose}`).digest();
}

// ── Response signing ─────────────────────────────────────────────────────────

/**
 * Sign an API response payload.
 * Returns { payload, signature, timestamp, keyId } where:
 *   - payload is the canonical JSON string
 *   - signature is hex HMAC-SHA256 over `${timestamp}.${payload}`
 *   - keyId identifies which derived key was used
 */
function signResponse(data, purpose = 'api-response') {
  const timestamp = Date.now();
  const payload = canonicalize(data);
  const key = deriveKey(purpose);
  const message = `${timestamp}.${payload}`;
  const signature = crypto.createHmac('sha256', key)
    .update(message).digest('hex');

  return {
    data,
    _proof: {
      signature,
      timestamp,
      keyId: crypto.createHash('sha256').update(key).digest('hex').slice(0, 16),
      algorithm: 'HMAC-SHA256',
      purpose,
    },
  };
}

/**
 * Verify a signed response. Returns true if signature matches.
 * Used by auditors who have the verification secret.
 */
function verifyResponse(envelope, purpose = 'api-response') {
  if (!envelope || !envelope._proof) return false;
  const { signature, timestamp } = envelope._proof;
  const key = deriveKey(purpose);
  const payload = canonicalize(envelope.data);
  const message = `${timestamp}.${payload}`;
  const expected = crypto.createHmac('sha256', key)
    .update(message).digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expected, 'hex')
  );
}

// ── Transaction hashing ──────────────────────────────────────────────────────

/**
 * Hash a payment transaction into a tamper-evident record.
 * Includes previous hash to form an append-only chain.
 */
function hashTransaction(tx, previousHash = '0'.repeat(64)) {
  const canonical = [
    tx.id || tx.idempotency_key,
    tx.amount,
    tx.currency || 'ZAR',
    tx.source || 'unknown',
    tx.timestamp || tx.created_at,
    previousHash,
  ].join('|');
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Create a signed receipt for a payment.
 * This is what /verify/payment/:id returns.
 */
function createPaymentProof(tx, previousHash) {
  const txHash = hashTransaction(tx, previousHash);
  const key = deriveKey('payment-proof');
  const proofSignature = crypto.createHmac('sha256', key)
    .update(txHash).digest('hex');

  return {
    transactionId: tx.id || tx.idempotency_key,
    amount: tx.amount,
    currency: tx.currency || 'ZAR',
    source: tx.source,
    timestamp: tx.timestamp || tx.created_at,
    txHash,
    previousHash: previousHash || '0'.repeat(64),
    proofSignature,
    verificationMethod: 'HMAC-SHA256 hash chain',
  };
}

// ── Merkle tree for batch anchoring ──────────────────────────────────────────

function merkleRoot(hashes) {
  if (hashes.length === 0) return '0'.repeat(64);
  if (hashes.length === 1) return hashes[0];

  const next = [];
  for (let i = 0; i < hashes.length; i += 2) {
    const left = hashes[i];
    const right = i + 1 < hashes.length ? hashes[i + 1] : left;
    next.push(
      crypto.createHash('sha256').update(left + right).digest('hex')
    );
  }
  return merkleRoot(next);
}

/**
 * Build a Merkle tree from transaction hashes.
 * Returns { root, leaves, depth } for on-chain anchoring.
 */
function buildMerkleTree(txHashes) {
  const root = merkleRoot(txHashes);
  return {
    root,
    leaves: txHashes.length,
    depth: Math.ceil(Math.log2(Math.max(txHashes.length, 1))),
    computedAt: Date.now(),
  };
}

/**
 * Generate a Merkle proof (inclusion proof) for a specific leaf.
 */
function merkleProof(hashes, targetIndex) {
  if (targetIndex < 0 || targetIndex >= hashes.length) return null;
  const proof = [];
  let level = [...hashes];
  let idx = targetIndex;

  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : left;
      next.push(crypto.createHash('sha256').update(left + right).digest('hex'));

      if (i === idx || i + 1 === idx) {
        proof.push({
          hash: i === idx ? right : left,
          position: i === idx ? 'right' : 'left',
        });
      }
    }
    idx = Math.floor(idx / 2);
    level = next;
  }

  return { leaf: hashes[targetIndex], proof, root: level[0] };
}

// ── Attestation for off-chain values ─────────────────────────────────────────

/**
 * Create a signed attestation for a value that can't be verified on-chain.
 * Used for fiat treasury balances, LLM costs, etc.
 * Includes the source system and a reconciliation reference.
 */
function createAttestation(metric, value, source, reconciliationRef) {
  const timestamp = Date.now();
  const key = deriveKey('attestation');
  const canonical = [metric, JSON.stringify(value), source, reconciliationRef || '', timestamp].join('|');
  const signature = crypto.createHmac('sha256', key)
    .update(canonical).digest('hex');

  return {
    metric,
    value,
    source,
    reconciliationRef: reconciliationRef || null,
    timestamp,
    signature,
    verifiable: source === 'on-chain',
    attestationType: source === 'on-chain' ? 'blockchain' :
      source.startsWith('webhook:') ? 'payment-processor' : 'signed-internal',
  };
}

/**
 * Verify an attestation.
 */
function verifyAttestation(att) {
  if (!att || !att.signature) return false;
  const key = deriveKey('attestation');
  const canonical = [att.metric, JSON.stringify(att.value), att.source, att.reconciliationRef || '', att.timestamp].join('|');
  const expected = crypto.createHmac('sha256', key)
    .update(canonical).digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(att.signature, 'hex'),
    Buffer.from(expected, 'hex')
  );
}

// ── Verification key info (public) ───────────────────────────────────────────

/**
 * Returns public verification metadata.
 * Auditors use this to confirm which key was used.
 * The actual secret is NOT exposed — only the key fingerprint.
 */
function getVerificationInfo() {
  const purposes = ['api-response', 'payment-proof', 'attestation'];
  const keys = {};
  for (const p of purposes) {
    const k = deriveKey(p);
    keys[p] = {
      keyId: crypto.createHash('sha256').update(k).digest('hex').slice(0, 16),
      algorithm: 'HMAC-SHA256',
      derivation: `HMAC-SHA256(master, "bridge-zero-trust:${p}")`,
    };
  }
  return {
    scheme: 'HMAC-SHA256 with purpose-derived keys',
    keys,
    verificationEndpoint: '/api/verify/info',
    howToVerify: [
      '1. Obtain BRIDGE_VERIFY_SECRET from system operator via secure channel',
      '2. Derive purpose key: HMAC-SHA256(secret, "bridge-zero-trust:<purpose>")',
      '3. For API responses: verify HMAC-SHA256(key, "<timestamp>.<canonical_json>") === signature',
      '4. For payment proofs: verify hash chain integrity, then HMAC over txHash',
      '5. For attestations: verify HMAC over canonical attestation payload',
    ],
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Deterministic JSON serialization.
 * Keys sorted alphabetically, no whitespace.
 */
function canonicalize(obj) {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

module.exports = {
  signResponse,
  verifyResponse,
  hashTransaction,
  createPaymentProof,
  buildMerkleTree,
  merkleProof,
  merkleRoot,
  createAttestation,
  verifyAttestation,
  getVerificationInfo,
  canonicalize,
  // Exposed for testing only
  _deriveKey: deriveKey,
};
