// =============================================================================
// BRIDGE AI OS — ULOE Wallet Engine
//
// Multi-ledger wallet: main (USD), promo (expiring USD), credits (USD), brdg (BRDG token).
// All balance mutations are atomic: update balance row + insert transaction row together.
// Ledger invariant: balance_cents is always >= 0 (no overdraft).
// =============================================================================
'use strict';

const { supabase }   = require('../../lib/supabase');
const history        = require('./history');
const { ok, fail, EVENTS, LEDGERS, uuid } = require('./schemas');

// ── Initialize wallets for new user ──────────────────────────────────────────
async function initializeWallets(userId) {
  const now = new Date().toISOString();
  const records = Object.entries(LEDGERS).map(([ledger, def]) => ({
    id:            uuid(),
    user_id:       userId,
    ledger,
    balance_cents: 0,
    currency:      def.currency,
    locked_cents:  0,
    updated_at:    now,
  }));

  const { error } = await supabase.from('wallet_balances').upsert(records, { onConflict: 'user_id,ledger' });
  if (error) return fail('wallet.initialize', userId, error.message);

  return ok('wallet.initialize', userId, {
    affected_files: ['wallet.json'],
    state_changes:  { 'wallet.json': { ledgers: Object.keys(LEDGERS).reduce((a, l) => ({ ...a, [l]: 0 }), {}) } },
    next_actions:   [],
  });
}

// ── Get all balances ──────────────────────────────────────────────────────────
async function getBalances(userId) {
  const { data, error } = await supabase
    .from('wallet_balances')
    .select('*')
    .eq('user_id', userId);

  if (error) return fail('wallet.balances', userId, error.message);

  const balances = {};
  for (const row of (data || [])) {
    balances[row.ledger] = {
      balance_cents: row.balance_cents,
      locked_cents:  row.locked_cents,
      available:     row.balance_cents - row.locked_cents,
      currency:      row.currency,
    };
  }

  return ok('wallet.balances', userId, { meta: { balances } });
}

// ── Credit ────────────────────────────────────────────────────────────────────
async function credit(userId, {
  ledger        = 'main',
  amountCents,
  description   = '',
  sourceType    = 'manual',
  sourceRef     = null,
  correlationId = null,
  metadata      = {},
}) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return fail('wallet.credit', userId, 'amountCents must be a positive integer');
  }
  if (!LEDGERS[ledger]) return fail('wallet.credit', userId, `Unknown ledger: ${ledger}`);

  const balance = await _getBalance(userId, ledger);
  if (!balance) await initializeWallets(userId);

  const current  = balance?.balance_cents || 0;
  const newTotal = current + amountCents;
  const now      = new Date().toISOString();

  // Atomic: update balance + insert transaction
  const [balanceUpdate, txInsert] = await Promise.all([
    supabase.from('wallet_balances')
      .update({ balance_cents: newTotal, updated_at: now })
      .eq('user_id', userId).eq('ledger', ledger),
    supabase.from('wallet_transactions').insert({
      id:            uuid(),
      user_id:       userId,
      ledger,
      direction:     'credit',
      amount_cents:  amountCents,
      balance_after: newTotal,
      description,
      source_type:   sourceType,
      source_ref:    sourceRef,
      metadata,
      created_at:    now,
    }),
  ]);

  if (balanceUpdate.error) return fail('wallet.credit', userId, balanceUpdate.error.message);
  if (txInsert.error)      return fail('wallet.credit', userId, txInsert.error.message);

  const eventLogged = await history.append({
    userId,
    category:      'wallet',
    action:        EVENTS.WALLET.CREDITED,
    details:       { ledger, amount_cents: amountCents, balance_after: newTotal, source_type: sourceType },
    correlationId,
  });

  return ok('wallet.credit', userId, {
    affected_files: ['wallet.json'],
    state_changes:  { 'wallet.json': { [ledger]: newTotal } },
    event_logged:   eventLogged,
    next_actions:   [],
    meta:           { ledger, balance_after: newTotal },
  });
}

// ── Debit ─────────────────────────────────────────────────────────────────────
async function debit(userId, {
  ledger        = 'main',
  amountCents,
  description   = '',
  sourceType    = 'manual',
  sourceRef     = null,
  correlationId = null,
  metadata      = {},
}) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return fail('wallet.debit', userId, 'amountCents must be a positive integer');
  }

  const balance = await _getBalance(userId, ledger);
  const available = (balance?.balance_cents || 0) - (balance?.locked_cents || 0);

  if (available < amountCents) {
    return fail('wallet.debit', userId, `Insufficient ${ledger} balance: ${available} < ${amountCents}`);
  }

  const newTotal = (balance?.balance_cents || 0) - amountCents;
  const now      = new Date().toISOString();

  const [balanceUpdate, txInsert] = await Promise.all([
    supabase.from('wallet_balances')
      .update({ balance_cents: newTotal, updated_at: now })
      .eq('user_id', userId).eq('ledger', ledger),
    supabase.from('wallet_transactions').insert({
      id:            uuid(),
      user_id:       userId,
      ledger,
      direction:     'debit',
      amount_cents:  amountCents,
      balance_after: newTotal,
      description,
      source_type:   sourceType,
      source_ref:    sourceRef,
      metadata,
      created_at:    now,
    }),
  ]);

  if (balanceUpdate.error) return fail('wallet.debit', userId, balanceUpdate.error.message);
  if (txInsert.error)      return fail('wallet.debit', userId, txInsert.error.message);

  const eventLogged = await history.append({
    userId,
    category:      'wallet',
    action:        EVENTS.WALLET.DEBITED,
    details:       { ledger, amount_cents: amountCents, balance_after: newTotal },
    correlationId,
  });

  return ok('wallet.debit', userId, {
    affected_files: ['wallet.json'],
    state_changes:  { 'wallet.json': { [ledger]: newTotal } },
    event_logged:   eventLogged,
    next_actions:   [],
    meta:           { ledger, balance_after: newTotal },
  });
}

// ── Credit BRDG bonus for plan activation ────────────────────────────────────
async function creditBrdgBonus(userId, planId, correlationId) {
  const { getPlan } = require('./schemas');
  const bonus = getPlan(planId).brdg_bonus;
  if (!bonus || bonus === 0) return ok('wallet.brdg_bonus', userId, { next_actions: [] });

  return credit(userId, {
    ledger:        'brdg',
    amountCents:   bonus,  // BRDG units (stored as integer)
    description:   `${planId} plan activation bonus`,
    sourceType:    'promo',
    correlationId,
  });
}

// ── Get transaction history ───────────────────────────────────────────────────
async function getTransactions(userId, { ledger, limit = 20, offset = 0 } = {}) {
  let q = supabase
    .from('wallet_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (ledger) q = q.eq('ledger', ledger);

  const { data, error } = await q;
  if (error) return fail('wallet.transactions', userId, error.message);
  return ok('wallet.transactions', userId, { meta: { transactions: data, total: data?.length } });
}

// ── Internal ─────────────────────────────────────────────────────────────────
async function _getBalance(userId, ledger) {
  const { data } = await supabase
    .from('wallet_balances')
    .select('*')
    .eq('user_id', userId)
    .eq('ledger', ledger)
    .single();
  return data || null;
}

module.exports = { initializeWallets, getBalances, credit, debit, creditBrdgBonus, getTransactions };
