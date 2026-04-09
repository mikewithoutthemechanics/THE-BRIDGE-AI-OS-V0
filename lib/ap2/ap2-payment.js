/**
 * BRIDGE AI OS — AP2 Payment Bridge
 *
 * Bridges AP2 payment flows to agent-ledger.js for settlement.
 * Handles escrow release, receipts, and external settlement recording.
 * Persisted to SQLite via better-sqlite3.
 */

'use strict';

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// Graceful require for ledger
let ledger;
try { ledger = require('../agent-ledger'); } catch (_) { ledger = null; }

// ── SQLite persistence (shares DB file with ap2-negotiation) ──────────────
const DB_PATH = path.join(__dirname, '..', '..', 'data', 'ap2-offers.db');

let _db = null;
function db() {
  if (_db) return _db;
  const Database = require('better-sqlite3');
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.exec(`
    CREATE TABLE IF NOT EXISTS ap2_payments (
      payment_id      TEXT PRIMARY KEY,
      offer_id        TEXT NOT NULL,
      from_agent      TEXT,
      to_agent        TEXT,
      amount_brdg     REAL NOT NULL,
      service_id      TEXT,
      transfer_tx     TEXT,
      escrow_tx       TEXT,
      status          TEXT NOT NULL DEFAULT 'COMPLETED',
      external_ref    TEXT,
      settlement_type TEXT,
      settled_at      TEXT,
      protocol_version TEXT DEFAULT 'ap2-v1',
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS ap2_receipts (
      receipt_id       TEXT PRIMARY KEY,
      payment_id       TEXT NOT NULL,
      offer_id         TEXT,
      from_agent       TEXT,
      to_agent         TEXT,
      amount_brdg      REAL,
      service_id       TEXT,
      status           TEXT,
      hash             TEXT,
      issued_at        TEXT,
      protocol_version TEXT DEFAULT 'ap2-v1',
      created_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_payments_offer ON ap2_payments(offer_id);
    CREATE INDEX IF NOT EXISTS idx_receipts_payment ON ap2_receipts(payment_id);
  `);
  return _db;
}

let _stmts = null;
function stmts() {
  if (_stmts) return _stmts;
  const d = db();
  _stmts = {
    insertPayment: d.prepare(`INSERT INTO ap2_payments
      (payment_id, offer_id, from_agent, to_agent, amount_brdg, service_id, transfer_tx, escrow_tx, status, external_ref, settlement_type, settled_at, protocol_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    getPayment: d.prepare('SELECT * FROM ap2_payments WHERE payment_id = ?'),
    updatePayment: d.prepare('UPDATE ap2_payments SET external_ref = ?, settlement_type = ?, status = ? WHERE payment_id = ?'),
    allPayments: d.prepare('SELECT * FROM ap2_payments'),
    insertReceipt: d.prepare(`INSERT INTO ap2_receipts
      (receipt_id, payment_id, offer_id, from_agent, to_agent, amount_brdg, service_id, status, hash, issued_at, protocol_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    getReceipt: d.prepare('SELECT * FROM ap2_receipts WHERE receipt_id = ?'),
    countPayments: d.prepare('SELECT COUNT(*) as c FROM ap2_payments'),
    sumVolume: d.prepare('SELECT COALESCE(SUM(amount_brdg), 0) as total FROM ap2_payments'),
    countCompleted: d.prepare("SELECT COUNT(*) as c FROM ap2_payments WHERE status = 'COMPLETED'"),
    countExternal: d.prepare("SELECT COUNT(*) as c FROM ap2_payments WHERE settlement_type = 'external'"),
    countReceipts: d.prepare('SELECT COUNT(*) as c FROM ap2_receipts'),
  };
  return _stmts;
}

function paymentId() {
  return 'pay_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
}

function receiptId() {
  return 'rcpt_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
}

/**
 * Process payment for an accepted AP2 offer.
 * Releases escrowed funds from buyer to seller via ledger.transfer().
 *
 * @param {object} offer — accepted offer from ap2-negotiation
 * @returns {object} payment record
 */
function processPayment(offer) {
  if (!offer) throw new Error('Offer is required');
  if (offer.status !== 'ACCEPTED') throw new Error('Can only process payment for ACCEPTED offers');

  const id = paymentId();
  let transferResult = null;

  if (ledger) {
    try {
      // Release escrow first if it was locked
      if (offer.escrow_tx) {
        ledger.escrowRelease(offer.from_agent, offer.price_brdg, offer.to_agent, 'AP2 payment: ' + offer.offer_id);
      } else {
        // Direct transfer if no escrow was created
        transferResult = ledger.transfer(offer.from_agent, offer.to_agent, offer.price_brdg, offer.offer_id);
      }
    } catch (e) {
      throw new Error('Payment failed: ' + e.message);
    }
  }

  const now = new Date().toISOString();
  const payment = {
    payment_id: id,
    offer_id: offer.offer_id,
    from_agent: offer.from_agent,
    to_agent: offer.to_agent,
    amount_brdg: offer.price_brdg,
    service_id: offer.service_id,
    transfer_tx: transferResult ? transferResult.tx_id : null,
    escrow_tx: offer.escrow_tx || null,
    status: 'COMPLETED',
    external_ref: null,
    settlement_type: null,
    settled_at: now,
    protocol_version: 'ap2-v1',
  };

  stmts().insertPayment.run(
    id, payment.offer_id, payment.from_agent, payment.to_agent,
    payment.amount_brdg, payment.service_id, payment.transfer_tx,
    payment.escrow_tx, payment.status, null, null, now, 'ap2-v1'
  );

  return payment;
}

/**
 * Issue an AP2-compatible payment receipt.
 * @param {object} payment — payment record from processPayment
 * @returns {object} AP2 receipt
 */
function issueReceipt(payment) {
  if (!payment) throw new Error('Payment is required');

  const id = receiptId();
  const now = new Date().toISOString();
  const hash = crypto.createHash('sha256')
    .update(JSON.stringify({
      payment_id: payment.payment_id,
      from: payment.from_agent,
      to: payment.to_agent,
      amount: payment.amount_brdg,
      ts: payment.settled_at,
    }))
    .digest('hex');

  const receipt = {
    receipt_id: id,
    payment_id: payment.payment_id,
    offer_id: payment.offer_id,
    from_agent: payment.from_agent,
    to_agent: payment.to_agent,
    amount_brdg: payment.amount_brdg,
    service_id: payment.service_id,
    status: payment.status,
    issued_at: now,
    protocol_version: 'ap2-v1',
    hash: hash,
  };

  stmts().insertReceipt.run(
    id, payment.payment_id, payment.offer_id, payment.from_agent,
    payment.to_agent, payment.amount_brdg, payment.service_id,
    payment.status, hash, now, 'ap2-v1'
  );

  return receipt;
}

/**
 * Record an external settlement (for cross-protocol payments).
 * @param {object} payment — payment record
 * @param {string} externalRef — external reference ID (e.g., blockchain tx hash)
 * @returns {object} settlement record
 */
function settleExternal(payment, externalRef) {
  if (!payment) throw new Error('Payment is required');
  if (!externalRef) throw new Error('External reference is required');

  const settlement = {
    payment_id: payment.payment_id,
    external_ref: externalRef,
    settlement_type: 'external',
    recorded_at: new Date().toISOString(),
    protocol_version: 'ap2-v1',
  };

  // Record in ledger as a memo if available
  if (ledger) {
    try {
      ledger.credit(payment.to_agent, 0.001, 'ap2_settlement_record',
        'External settlement ref: ' + externalRef + ' for payment ' + payment.payment_id);
    } catch (_) { /* non-critical */ }
  }

  stmts().updatePayment.run(externalRef, 'external', payment.status, payment.payment_id);

  // Update in-flight object too
  payment.external_ref = externalRef;
  payment.settlement_type = 'external';

  return settlement;
}

/**
 * Get a payment by ID.
 */
function getPayment(id) {
  return stmts().getPayment.get(id) || null;
}

/**
 * Get a receipt by ID.
 */
function getReceipt(id) {
  return stmts().getReceipt.get(id) || null;
}

/**
 * Get payment stats.
 */
function getPaymentStats() {
  return {
    total_payments: stmts().countPayments.get().c,
    total_volume_brdg: stmts().sumVolume.get().total,
    completed: stmts().countCompleted.get().c,
    external_settlements: stmts().countExternal.get().c,
    total_receipts: stmts().countReceipts.get().c,
  };
}

module.exports = {
  processPayment,
  issueReceipt,
  settleExternal,
  getPayment,
  getReceipt,
  getPaymentStats,
};
