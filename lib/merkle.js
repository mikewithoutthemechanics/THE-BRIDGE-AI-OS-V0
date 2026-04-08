'use strict';
/**
 * lib/merkle.js — Pure Merkle Tree implementation
 * No external deps — uses Node.js built-in crypto (SHA-256).
 *
 * Usage:
 *   const { MerkleTree, sha256 } = require('./merkle');
 *   const tree = new MerkleTree(['event1', 'event2']);
 *   tree.insert('event3');
 *   const root  = tree.getRoot();
 *   const proof = tree.getProof('event1');
 *   const valid = tree.verify('event1', proof, root); // true
 */

const crypto = require('crypto');

// ── Hashing ───────────────────────────────────────────────────────────────────

function sha256(data) {
  return crypto.createHash('sha256').update(String(data)).digest('hex');
}

// ── MerkleTree ────────────────────────────────────────────────────────────────

class MerkleTree {
  /**
   * @param {string[]} leaves - raw data strings (will be SHA-256 hashed)
   */
  constructor(leaves = []) {
    this.leaves = leaves.map(sha256);
    this._layers = [];
    this._build();
  }

  /**
   * Rebuild the entire tree from current leaves.
   * Called automatically after every insert.
   */
  _build() {
    if (this.leaves.length === 0) {
      this._layers = [];
      this.root = sha256('__empty__');
      return;
    }

    let layer = [...this.leaves];
    this._layers = [layer];

    while (layer.length > 1) {
      const next = [];
      for (let i = 0; i < layer.length; i += 2) {
        const left  = layer[i];
        const right = i + 1 < layer.length ? layer[i + 1] : layer[i]; // dup last if odd
        next.push(sha256(left + right));
      }
      layer = next;
      this._layers.push(layer);
    }

    this.root = layer[0];
  }

  /**
   * Restore a tree from already-hashed leaf values (e.g. loaded from DB).
   * Skips the sha256 step for each leaf.
   */
  static fromHashes(hashes = []) {
    const tree = new MerkleTree();
    tree.leaves = [...hashes];
    tree._build();
    return tree;
  }

  /** Append a new raw data leaf and rebuild the tree. Returns new root. */
  insert(leafData) {
    this.leaves.push(sha256(leafData));
    this._build();
    return this.root;
  }

  getRoot() {
    return this.root;
  }

  get depth() {
    return this._layers.length;
  }

  get leafCount() {
    return this.leaves.length;
  }

  /**
   * Generate a Merkle proof for a raw data leaf.
   * Returns array of { hash, position } sibling nodes — or null if not found.
   */
  getProof(leafData) {
    const leafHash = sha256(leafData);
    let idx = this.leaves.indexOf(leafHash);
    if (idx === -1) return null;

    const proof = [];
    for (let i = 0; i < this._layers.length - 1; i++) {
      const layer   = this._layers[i];
      const isLeft  = idx % 2 === 0;
      const sibIdx  = isLeft ? idx + 1 : idx - 1;
      const sibling = sibIdx < layer.length ? layer[sibIdx] : layer[idx]; // dup edge

      proof.push({ hash: sibling, position: isLeft ? 'right' : 'left' });
      idx = Math.floor(idx / 2);
    }

    return proof;
  }

  /**
   * Verify a raw data leaf against a proof and an expected root.
   * Can verify without the full tree — O(log n).
   */
  verify(leafData, proof, expectedRoot) {
    if (!proof || !expectedRoot) return false;
    let hash = sha256(leafData);

    for (const step of proof) {
      hash = step.position === 'right'
        ? sha256(hash + step.hash)
        : sha256(step.hash + hash);
    }

    return hash === expectedRoot;
  }

  /**
   * Verify a pre-hashed leaf (for entries loaded directly from DB).
   */
  verifyHash(leafHash, proof, expectedRoot) {
    if (!proof || !expectedRoot) return false;
    let hash = leafHash;

    for (const step of proof) {
      hash = step.position === 'right'
        ? sha256(hash + step.hash)
        : sha256(step.hash + hash);
    }

    return hash === expectedRoot;
  }

  toJSON() {
    return {
      root:       this.root,
      leaf_count: this.leaves.length,
      depth:      this._layers.length,
    };
  }
}

module.exports = { MerkleTree, sha256 };
