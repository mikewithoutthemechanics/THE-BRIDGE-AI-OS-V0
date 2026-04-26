// =============================================================================
// BRIDGE AI OS — ULOE Billing Engine
//
// Charges, refunds, credits, and invoice generation.
// Amounts are always in integer cents to avoid floating point errors.
// =============================================================================
'use strict';

const { supabase }   = require('../../lib/supabase');
const history        = require('./history');
const { ok, fail, EVENTS, uuid } = require('./schemas');

const OP = {
  CHARGE:          'billing.charge',
  REFUND:          'billing.refund',
  CREDIT:          'billing.credit',
  INVOICE_CREATE:  'billing.invoice_create',
  INVOICE_PAY:     'billing.invoice_pay',
};

// ── Invoice number generator ──────────────────────────────────────────────────
async function nextInvoiceNumber() {
  const year = new Date().getFullYear();
  const { count } = await supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true });
  const seq = String((count || 0) + 1).padStart(6, '0');
  return `INV-${year}-${seq}`;
}

// ── Record a charge ───────────────────────────────────────────────────────────
async function charge(userId, {
  amountCents,
  currency       = 'USD',
  description    = '',
  paymentMethod  = 'card',
  subscriptionId = null,
  providerRef    = null,
  correlationId  = null,
  metadata       = {},
}) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return fail(OP.CHARGE, userId, 'amountCents must be a positive integer');
  }

  const tx = {
    id:              uuid(),
    user_id:         userId,
    subscription_id: subscriptionId,
    type:            'charge',
    status:          'completed',
    amount_cents:    amountCents,
    currency,
    description,
    payment_method:  paymentMethod,
    provider_ref:    providerRef,
    metadata,
    created_at:      new Date().toISOString(),
    completed_at:    new Date().toISOString(),
  };

  const { error } = await supabase.from('billing_transactions').insert(tx);
  if (error) return fail(OP.CHARGE, userId, error.message);

  const eventLogged = await history.append({
    userId,
    category:      'billing',
    action:        EVENTS.BILLING.CHARGED,
    details:       { amount_cents: amountCents, currency, description, payment_method: paymentMethod },
    correlationId,
  });

  return ok(OP.CHARGE, userId, {
    affected_files: ['billing.json'],
    state_changes:  { 'billing.json': { last_charge: { amount_cents: amountCents, at: tx.created_at } } },
    event_logged:   eventLogged,
    next_actions:   ['billing.generate_invoice'],
    meta:           { transaction_id: tx.id },
  });
}

// ── Record a refund ───────────────────────────────────────────────────────────
async function refund(userId, { amountCents, description = '', correlationId, metadata = {} }) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return fail(OP.REFUND, userId, 'amountCents must be a positive integer');
  }

  const tx = {
    id:           uuid(),
    user_id:      userId,
    type:         'refund',
    status:       'completed',
    amount_cents: -amountCents,  // negative = money back
    currency:     'USD',
    description,
    metadata,
    created_at:   new Date().toISOString(),
    completed_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('billing_transactions').insert(tx);
  if (error) return fail(OP.REFUND, userId, error.message);

  const eventLogged = await history.append({
    userId,
    category:      'billing',
    action:        EVENTS.BILLING.REFUNDED,
    details:       { amount_cents: amountCents, description },
    correlationId,
  });

  return ok(OP.REFUND, userId, {
    affected_files: ['billing.json'],
    state_changes:  { 'billing.json': { last_refund: { amount_cents: amountCents, at: tx.created_at } } },
    event_logged:   eventLogged,
    next_actions:   ['wallet.credit_main'],
    meta:           { transaction_id: tx.id },
  });
}

// ── Apply credit ──────────────────────────────────────────────────────────────
async function applyCredit(userId, { amountCents, description = '', correlationId, metadata = {} }) {
  const tx = {
    id:           uuid(),
    user_id:      userId,
    type:         'credit',
    status:       'completed',
    amount_cents: -amountCents,
    currency:     'USD',
    description,
    metadata,
    created_at:   new Date().toISOString(),
    completed_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('billing_transactions').insert(tx);
  if (error) return fail(OP.CREDIT, userId, error.message);

  const eventLogged = await history.append({
    userId,
    category:      'billing',
    action:        EVENTS.BILLING.CREDITED,
    details:       { amount_cents: amountCents, description },
    correlationId,
  });

  return ok(OP.CREDIT, userId, {
    affected_files: ['billing.json'],
    event_logged:   eventLogged,
    next_actions:   [],
    meta:           { transaction_id: tx.id },
  });
}

// ── Generate invoice ─────────────────────────────────────────────────────────
async function generateInvoice(userId, {
  subscriptionId = null,
  lineItems      = [],
  dueDate        = null,
  correlationId  = null,
} = {}) {
  if (lineItems.length === 0) return fail(OP.INVOICE_CREATE, userId, 'lineItems required');

  const subtotal = lineItems.reduce((sum, li) => sum + (li.total_cents || 0), 0);
  const taxCents = Math.round(subtotal * 0);  // 0% tax by default — extend per jurisdiction
  const total    = subtotal + taxCents;

  const invoiceNumber = await nextInvoiceNumber();
  const due           = dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const invoice = {
    id:              uuid(),
    user_id:         userId,
    subscription_id: subscriptionId,
    invoice_number:  invoiceNumber,
    status:          'issued',
    amount_cents:    subtotal,
    tax_cents:       taxCents,
    total_cents:     total,
    currency:        'USD',
    due_date:        due,
    line_items:      lineItems,
    created_at:      new Date().toISOString(),
    updated_at:      new Date().toISOString(),
  };

  const { error } = await supabase.from('invoices').insert(invoice);
  if (error) return fail(OP.INVOICE_CREATE, userId, error.message);

  const eventLogged = await history.append({
    userId,
    category:      'billing',
    action:        EVENTS.BILLING.INVOICED,
    details:       { invoice_number: invoiceNumber, total_cents: total },
    correlationId,
  });

  return ok(OP.INVOICE_CREATE, userId, {
    affected_files: [`invoices/${invoiceNumber}.json`],
    state_changes:  { [`invoices/${invoiceNumber}.json`]: { status: 'issued', total_cents: total } },
    event_logged:   eventLogged,
    next_actions:   ['email.send_invoice'],
    meta:           { invoice_id: invoice.id, invoice_number: invoiceNumber, total_cents: total },
  });
}

// ── Mark invoice paid ─────────────────────────────────────────────────────────
async function markInvoicePaid(userId, invoiceId, { correlationId } = {}) {
  const now = new Date().toISOString();
  const { data: invoice, error: fetchErr } = await supabase
    .from('invoices').select('*').eq('id', invoiceId).eq('user_id', userId).single();

  if (fetchErr || !invoice) return fail(OP.INVOICE_PAY, userId, 'Invoice not found');
  if (invoice.status === 'paid') return fail(OP.INVOICE_PAY, userId, 'Invoice already paid');

  const { error } = await supabase.from('invoices').update({ status: 'paid', paid_at: now, updated_at: now }).eq('id', invoiceId);
  if (error) return fail(OP.INVOICE_PAY, userId, error.message);

  const eventLogged = await history.append({
    userId,
    category:      'billing',
    action:        EVENTS.BILLING.PAID,
    details:       { invoice_id: invoiceId, invoice_number: invoice.invoice_number, total_cents: invoice.total_cents },
    correlationId,
  });

  return ok(OP.INVOICE_PAY, userId, {
    affected_files: [`invoices/${invoice.invoice_number}.json`],
    state_changes:  { [`invoices/${invoice.invoice_number}.json`]: { status: 'paid', paid_at: now } },
    event_logged:   eventLogged,
    next_actions:   ['subscription.renew', 'email.send_receipt'],
    meta:           { invoice_id: invoiceId },
  });
}

// ── Get billing history ───────────────────────────────────────────────────────
async function getBillingHistory(userId, { limit = 20, offset = 0 } = {}) {
  const { data, error } = await supabase
    .from('billing_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return fail('billing.history', userId, error.message);
  return ok('billing.history', userId, { meta: { transactions: data, total: data.length } });
}

async function getInvoices(userId, { limit = 20, offset = 0 } = {}) {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return fail('billing.invoices', userId, error.message);
  return ok('billing.invoices', userId, { meta: { invoices: data, total: data.length } });
}

module.exports = { charge, refund, applyCredit, generateInvoice, markInvoicePaid, getBillingHistory, getInvoices };
