/**
 * BRIDGE AI OS — AP2 Payment Bridge
 *
 * Bridges AP2 payment flows to agent-ledger.js for settlement.
 * Handles escrow release, receipts, and external settlement recording.
 * Backed by Supabase.
 */

'use strict';

const crypto = require('crypto');
const { supabase } = require('../supabase');

// Graceful require for ledger
let ledger;
try { ledger = require('../agent-ledger'); } catch (_) { ledger = null; }

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
async function processPayment(offer) {
  if (!offer) throw new Error('Offer is required');
  if (offer.status !== 'ACCEPTED') throw new Error('Can only process payment for ACCEPTED offers');

  const id = paymentId();
  let transferResult = null;

  if (ledger) {
    try {
      if (offer.escrow_tx) {
        await ledger.escrowRelease(offer.from_agent, offer.price_brdg, offer.to_agent, 'AP2 payment: ' + offer.offer_id);
      } else {
        transferResult = await ledger.transfer(offer.from_agent, offer.to_agent, offer.price_brdg, offer.offer_id);
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
    created_at: now,
  };

  if (supabase) {
    await supabase.from('ap2_payments').insert(payment);
  }

  return payment;
}

/**
 * Issue an AP2-compatible payment receipt.
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
    created_at: now,
  };

  if (supabase) {
    supabase.from('ap2_receipts').insert(receipt).then(() => {}).catch(() => {});
  }

  return receipt;
}

/**
 * Record an external settlement (for cross-protocol payments).
 */
async function settleExternal(payment, externalRef) {
  if (!payment) throw new Error('Payment is required');
  if (!externalRef) throw new Error('External reference is required');

  const settlement = {
    payment_id: payment.payment_id,
    external_ref: externalRef,
    settlement_type: 'external',
    recorded_at: new Date().toISOString(),
    protocol_version: 'ap2-v1',
  };

  if (ledger) {
    try {
      await ledger.credit(payment.to_agent, 0.001, 'ap2_settlement_record',
        'External settlement ref: ' + externalRef + ' for payment ' + payment.payment_id);
    } catch (_) { /* non-critical */ }
  }

  if (supabase) {
    await supabase.from('ap2_payments').update({
      external_ref: externalRef,
      settlement_type: 'external',
    }).eq('payment_id', payment.payment_id);
  }

  payment.external_ref = externalRef;
  payment.settlement_type = 'external';

  return settlement;
}

/**
 * Get a payment by ID.
 */
async function getPayment(id) {
  if (!supabase) return null;
  const { data } = await supabase.from('ap2_payments').select('*').eq('payment_id', id).single();
  return data || null;
}

/**
 * Get a receipt by ID.
 */
async function getReceipt(id) {
  if (!supabase) return null;
  const { data } = await supabase.from('ap2_receipts').select('*').eq('receipt_id', id).single();
  return data || null;
}

/**
 * Get payment stats.
 */
async function getPaymentStats() {
  if (!supabase) return { total_payments: 0, total_volume_brdg: 0, completed: 0, external_settlements: 0, total_receipts: 0 };

  const { count: totalPayments } = await supabase.from('ap2_payments').select('*', { count: 'exact', head: true });
  const { data: volRow } = await supabase.from('ap2_payments').select('amount_brdg');
  const totalVolume = (volRow || []).reduce((s, r) => s + (r.amount_brdg || 0), 0);
  const { count: completed } = await supabase.from('ap2_payments').select('*', { count: 'exact', head: true }).eq('status', 'COMPLETED');
  const { count: external } = await supabase.from('ap2_payments').select('*', { count: 'exact', head: true }).eq('settlement_type', 'external');
  const { count: totalReceipts } = await supabase.from('ap2_receipts').select('*', { count: 'exact', head: true });

  return {
    total_payments: totalPayments || 0,
    total_volume_brdg: totalVolume,
    completed: completed || 0,
    external_settlements: external || 0,
    total_receipts: totalReceipts || 0,
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
