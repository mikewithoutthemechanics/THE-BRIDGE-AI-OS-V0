/**
 * BRIDGE AI OS — AP2 Payment Bridge
 *
 * Bridges AP2 payment flows to agent-ledger.js for settlement.
 * Handles escrow release, receipts, and external settlement recording.
 */

'use strict';

const crypto = require('crypto');

// Graceful require for ledger
let ledger;
try { ledger = require('../agent-ledger'); } catch (_) { ledger = null; }

// In-memory payment + receipt store
const payments = new Map();
const receipts = new Map();

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
    settled_at: new Date().toISOString(),
    protocol_version: 'ap2-v1',
  };

  payments.set(id, payment);
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
  const receipt = {
    receipt_id: id,
    payment_id: payment.payment_id,
    offer_id: payment.offer_id,
    from_agent: payment.from_agent,
    to_agent: payment.to_agent,
    amount_brdg: payment.amount_brdg,
    service_id: payment.service_id,
    status: payment.status,
    issued_at: new Date().toISOString(),
    protocol_version: 'ap2-v1',
    hash: crypto.createHash('sha256')
      .update(JSON.stringify({
        payment_id: payment.payment_id,
        from: payment.from_agent,
        to: payment.to_agent,
        amount: payment.amount_brdg,
        ts: payment.settled_at,
      }))
      .digest('hex'),
  };

  receipts.set(id, receipt);
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

  payment.external_ref = externalRef;
  payment.settlement_type = 'external';
  payments.set(payment.payment_id, payment);

  return settlement;
}

/**
 * Get a payment by ID.
 */
function getPayment(id) {
  return payments.get(id) || null;
}

/**
 * Get a receipt by ID.
 */
function getReceipt(id) {
  return receipts.get(id) || null;
}

/**
 * Get payment stats.
 */
function getPaymentStats() {
  const all = [...payments.values()];
  return {
    total_payments: all.length,
    total_volume_brdg: all.reduce((s, p) => s + (p.amount_brdg || 0), 0),
    completed: all.filter(p => p.status === 'COMPLETED').length,
    external_settlements: all.filter(p => p.settlement_type === 'external').length,
    total_receipts: receipts.size,
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
