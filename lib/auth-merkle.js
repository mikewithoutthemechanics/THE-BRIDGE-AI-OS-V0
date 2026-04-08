'use strict';
/**
 * lib/auth-merkle.js — Merkle-backed tamper-evident auth audit log.
 */

const { MerkleTree, sha256 } = require('./merkle');

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_audit (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      leaf_hash  TEXT    NOT NULL,
      leaf_data  TEXT    NOT NULL,
      user_id    INTEGER,
      action     TEXT    NOT NULL,
      ip         TEXT    DEFAULT 'unknown',
      metadata   TEXT    DEFAULT '{}',
      ts         DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_audit_user   ON auth_audit(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_action ON auth_audit(action);
    CREATE TABLE IF NOT EXISTS auth_merkle_root (
      id          INTEGER PRIMARY KEY CHECK (id = 1),
      root_hash   TEXT    NOT NULL,
      leaf_count  INTEGER DEFAULT 0,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

class AuthMerkleLog {
  constructor(db) {
    this.db = db;
    initSchema(db);
    this.tree = this._loadTree();
    const check = this.verifyIntegrity();
    if (!check.integrity) {
      console.error('[auth-merkle] INTEGRITY MISMATCH on startup');
    }
  }

  _loadTree() {
    const rows = this.db.prepare('SELECT leaf_hash FROM auth_audit ORDER BY id ASC').all();
    return MerkleTree.fromHashes(rows.map(r => r.leaf_hash));
  }

  _persistRoot() {
    const root = this.tree.getRoot();
    this.db.prepare(`
      INSERT INTO auth_merkle_root (id, root_hash, leaf_count, updated_at)
      VALUES (1, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE
        SET root_hash=excluded.root_hash, leaf_count=excluded.leaf_count, updated_at=excluded.updated_at
    `).run(root, this.tree.leafCount);
    return root;
  }

  log(userId, action, ip, metadata) {
    ip = ip || 'unknown';
    metadata = metadata || {};
    const leafData = (userId || 'anon') + ':' + action + ':' + Date.now() + ':' + ip;
    const leafHash = sha256(leafData);
    this.db.prepare(`
      INSERT INTO auth_audit (leaf_hash, leaf_data, user_id, action, ip, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(leafHash, leafData, userId || null, action, ip, JSON.stringify(metadata));
    this.tree.insertHash(leafHash);
    const root = this._persistRoot();
    return { leafHash, leafData, root };
  }

  getRoot() { return this.tree.getRoot(); }

  getState() {
    const persisted = this.db.prepare('SELECT * FROM auth_merkle_root WHERE id = 1').get();
    return { root: this.tree.getRoot(), leaf_count: this.tree.leafCount, depth: this.tree.depth, persisted: persisted || null };
  }

  verifyIntegrity() {
    const rows = this.db.prepare('SELECT leaf_hash FROM auth_audit ORDER BY id ASC').all();
    const freshTree = MerkleTree.fromHashes(rows.map(r => r.leaf_hash));
    const dbRoot = freshTree.getRoot();
    const memRoot = this.tree.getRoot();
    return { integrity: dbRoot === memRoot, db_root: dbRoot, memory_root: memRoot, leaf_count: rows.length };
  }

  getProofByHash(leafHash) {
    const idx = this.tree.leaves.indexOf(leafHash);
    if (idx === -1) return null;
    const proof = [];
    let i = idx;
    for (let layer = 0; layer < this.tree._layers.length - 1; layer++) {
      const cur = this.tree._layers[layer];
      const isLeft = i % 2 === 0;
      const sibIdx = isLeft ? i + 1 : i - 1;
      const sibling = sibIdx < cur.length ? cur[sibIdx] : cur[i];
      proof.push({ hash: sibling, position: isLeft ? 'right' : 'left' });
      i = Math.floor(i / 2);
    }
    return proof;
  }

  getRecentEvents(limit) {
    limit = limit || 30;
    return this.db.prepare('SELECT id, user_id, action, ip, leaf_hash, ts FROM auth_audit ORDER BY id DESC LIMIT ?').all(limit);
  }

  getEventsByUser(userId, limit) {
    limit = limit || 20;
    return this.db.prepare('SELECT id, action, ip, leaf_hash, ts FROM auth_audit WHERE user_id = ? ORDER BY id DESC LIMIT ?').all(userId, limit);
  }
}

module.exports = { AuthMerkleLog };
