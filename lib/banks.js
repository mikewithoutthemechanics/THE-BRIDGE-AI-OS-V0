/**
 * Bank system — multi-entity treasury layer.
 *
 * Each bank is an economic entity (ops, growth, reserve, founder, or a JV partner).
 * Every incoming payment is auto-split across banks by split_pct.
 * Banks compound on each cycle. Banks can trade with each other internally.
 *
 * Supabase tables required:
 *
 *   create table if not exists banks (
 *     id          text primary key,
 *     name        text,
 *     owner       text default 'system',
 *     balance     numeric default 0,
 *     compound_rate numeric default 0.01,
 *     split_pct   numeric default 0,
 *     type        text default 'internal',
 *     active      boolean default true,
 *     meta        jsonb,
 *     created_at  timestamptz default now(),
 *     updated_at  timestamptz default now()
 *   );
 *
 *   create table if not exists bank_transactions (
 *     id          uuid default gen_random_uuid() primary key,
 *     from_bank   text,
 *     to_bank     text,
 *     amount      numeric,
 *     type        text,
 *     note        text,
 *     meta        jsonb,
 *     created_at  timestamptz default now()
 *   );
 */

const { supabaseAdmin, isConfigured } = require('./supabase');
const { alertSystemEvent }            = require('./notify');

// ── Seed banks (used when DB not configured or first boot) ───────────────────
const SEED_BANKS = [
  { id: 'ops',     name: 'Operations Bank', owner: 'system', balance: 555683.20, compound_rate: 0.012, split_pct: 45, type: 'internal' },
  { id: 'growth',  name: 'Growth Bank',     owner: 'system', balance: 347302.00, compound_rate: 0.012, split_pct: 15, type: 'internal' },
  { id: 'reserve', name: 'Reserve Bank',    owner: 'system', balance: 277841.60, compound_rate: 0.005, split_pct: 15, type: 'internal' },
  { id: 'founder', name: 'Founder Bank',    owner: 'system', balance: 208381.20, compound_rate: 0.020, split_pct: 25, type: 'internal' },
];

// In-memory fallback
const memBanks = {};
SEED_BANKS.forEach(b => { memBanks[b.id] = { ...b }; });

// ── Helpers ──────────────────────────────────────────────────────────────────

function now() { return new Date().toISOString(); }

async function logBankTx({ fromBank, toBank, amount, type, note, meta }) {
  if (!isConfigured) return;
  try {
    await supabaseAdmin.from('bank_transactions').insert({
      from_bank: fromBank || null,
      to_bank:   toBank   || null,
      amount:    +amount.toFixed(2),
      type,
      note:      note || null,
      meta:      meta || {},
    });
  } catch (e) {
    console.warn('[BANKS] logBankTx failed:', e.message);
  }
}

// ── Core bank operations ─────────────────────────────────────────────────────

async function getAllBanks() {
  if (!isConfigured) return Object.values(memBanks);
  try {
    const { data, error } = await supabaseAdmin
      .from('banks')
      .select('*')
      .order('split_pct', { ascending: false });
    if (error || !data || data.length === 0) return Object.values(memBanks);
    // Mirror to mem cache
    data.forEach(b => { memBanks[b.id] = b; });
    return data;
  } catch (_) {
    return Object.values(memBanks);
  }
}

async function getBank(id) {
  if (!isConfigured) return memBanks[id] || null;
  try {
    const { data } = await supabaseAdmin.from('banks').select('*').eq('id', id).single();
    if (data) { memBanks[id] = data; return data; }
    return memBanks[id] || null;
  } catch (_) {
    return memBanks[id] || null;
  }
}

async function upsertBank(bank) {
  memBanks[bank.id] = { ...memBanks[bank.id], ...bank, updated_at: now() };
  if (!isConfigured) return memBanks[bank.id];
  try {
    const { data } = await supabaseAdmin
      .from('banks')
      .upsert({ ...bank, updated_at: now() }, { onConflict: 'id' })
      .select()
      .single();
    return data || memBanks[bank.id];
  } catch (e) {
    console.warn('[BANKS] upsertBank failed:', e.message);
    return memBanks[bank.id];
  }
}

async function creditBank(id, amount, type = 'credit', note = '', meta = {}) {
  const bank = await getBank(id);
  if (!bank) throw new Error(`Bank not found: ${id}`);
  const newBalance = +(parseFloat(bank.balance || 0) + amount).toFixed(2);
  await upsertBank({ id, balance: newBalance });
  await logBankTx({ toBank: id, amount, type, note, meta });
  return newBalance;
}

async function debitBank(id, amount, type = 'debit', note = '', meta = {}) {
  const bank = await getBank(id);
  if (!bank) throw new Error(`Bank not found: ${id}`);
  const current = parseFloat(bank.balance || 0);
  if (current < amount) throw new Error(`Insufficient balance in ${id}: R${current} < R${amount}`);
  const newBalance = +(current - amount).toFixed(2);
  await upsertBank({ id, balance: newBalance });
  await logBankTx({ fromBank: id, amount, type, note, meta });
  return newBalance;
}

// ── Payment splitting ────────────────────────────────────────────────────────

/**
 * Split an incoming payment across all active banks by their split_pct.
 * split_pct values don't have to sum to 100 — remaining goes to ops.
 * Returns array of { bankId, amount, newBalance }
 */
async function splitPayment(totalAmount, paymentId = '', source = '') {
  const banks  = await getAllBanks();
  const active = banks.filter(b => b.active !== false);

  // Normalise pcts to exactly 100
  const totalPct = active.reduce((s, b) => s + parseFloat(b.split_pct || 0), 0);
  const results  = [];
  let   allocated = 0;

  for (let i = 0; i < active.length; i++) {
    const b    = active[i];
    const pct  = parseFloat(b.split_pct || 0);
    const norm = totalPct > 0 ? pct / totalPct : (i === 0 ? 1 : 0);

    // Last bank gets any rounding remainder
    const share = i === active.length - 1
      ? +Math.max(0, totalAmount - allocated).toFixed(2)
      : +(totalAmount * norm).toFixed(2);

    allocated += share;

    const newBalance = await creditBank(b.id, share, 'split', `Payment split from ${source}`, { payment_id: paymentId });
    results.push({ bankId: b.id, bankName: b.name, amount: share, newBalance });
  }

  console.log(JSON.stringify({ type: 'payment_split', total: totalAmount, splits: results, time: now() }));
  return results;
}

// ── Compounding ──────────────────────────────────────────────────────────────

/**
 * Apply compound_rate to all banks. Returns { banks: [...], totalGain, cycleTime }
 * Safe to call on a schedule (e.g. /api/banks/compound via cron).
 */
async function compoundAll() {
  const banks = await getAllBanks();
  const active = banks.filter(b => b.active !== false && parseFloat(b.compound_rate || 0) > 0);
  let totalGain = 0;
  const results = [];

  for (const b of active) {
    const balance = parseFloat(b.balance || 0);
    const rate    = parseFloat(b.compound_rate || 0);
    const gain    = +(balance * rate).toFixed(2);

    // Compound gain is internal (no external payment source)
    const newBalance = await creditBank(b.id, gain, 'compound', `Cycle compound @ ${(rate * 100).toFixed(1)}%`);
    totalGain += gain;
    results.push({ bankId: b.id, bankName: b.name, rate, gain, newBalance });
  }

  console.log(JSON.stringify({ type: 'compound_cycle', totalGain, banks: results.length, time: now() }));
  alertSystemEvent(`Compound cycle complete. Total gain: R${totalGain.toFixed(2)} across ${results.length} banks.`).catch(() => {});

  return { banks: results, totalGain: +totalGain.toFixed(2), cycleTime: now() };
}

// ── Internal trading ─────────────────────────────────────────────────────────

/**
 * Transfer funds between two banks (internal trade/rebalance).
 * e.g. ops buys leads from growth, growth funds ops when ops is low.
 */
async function tradeBetweenBanks(fromId, toId, amount, reason = '') {
  if (fromId === toId) throw new Error('Cannot trade with self');
  if (amount <= 0)     throw new Error('Trade amount must be positive');

  const fromBalance = await debitBank(fromId, amount, 'trade', `Trade → ${toId}: ${reason}`);
  const toBalance   = await creditBank(toId, amount, 'trade', `Trade ← ${fromId}: ${reason}`);

  await logBankTx({ fromBank: fromId, toBank: toId, amount, type: 'trade', note: reason });
  console.log(JSON.stringify({ type: 'bank_trade', from: fromId, to: toId, amount, reason, time: now() }));

  return { from: { id: fromId, newBalance: fromBalance }, to: { id: toId, newBalance: toBalance }, amount };
}

// ── Partner bank registration ─────────────────────────────────────────────────

/**
 * Register a JV partner bank.
 * splitPct is taken from existing banks proportionally (no free pct here — must rebalance).
 */
async function registerPartnerBank({ id, name, owner, splitPct = 0, compoundRate = 0.008, meta = {} }) {
  if (!id || !name || !owner) throw new Error('id, name, owner required');

  const existing = await getBank(id);
  if (existing) throw new Error(`Bank ${id} already exists`);

  const bank = {
    id, name, owner,
    balance:       0,
    compound_rate: compoundRate,
    split_pct:     splitPct,
    type:          'partner',
    active:        true,
    meta,
  };

  await upsertBank(bank);
  alertSystemEvent(`New partner bank registered: ${name} (${id}) — split: ${splitPct}%`).catch(() => {});
  return bank;
}

// ── Bank history ─────────────────────────────────────────────────────────────

async function getBankHistory(bankId, limit = 20) {
  if (!isConfigured) return [];
  try {
    const query = supabaseAdmin
      .from('bank_transactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (bankId) {
      query.or(`from_bank.eq.${bankId},to_bank.eq.${bankId}`);
    }

    const { data } = await query;
    return data || [];
  } catch (_) { return []; }
}

// ── Seed to DB ───────────────────────────────────────────────────────────────

async function seedBanksIfEmpty() {
  if (!isConfigured) return;
  try {
    const { data } = await supabaseAdmin.from('banks').select('id').limit(1);
    if (data && data.length > 0) return; // already seeded
    for (const b of SEED_BANKS) {
      await supabaseAdmin.from('banks').upsert(b, { onConflict: 'id' });
    }
    console.log('[BANKS] Seeded 4 system banks to Supabase');
  } catch (e) {
    console.warn('[BANKS] Seed failed:', e.message);
  }
}

module.exports = {
  getAllBanks, getBank, upsertBank,
  creditBank, debitBank,
  splitPayment, compoundAll,
  tradeBetweenBanks,
  registerPartnerBank,
  getBankHistory,
  seedBanksIfEmpty,
  SEED_BANKS,
};
