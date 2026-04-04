/**
 * Persistent state layer — wraps Supabase for key/value system state.
 * Falls back to in-memory if Supabase not configured (safe for cold starts).
 *
 * Tables required (run in Supabase SQL editor):
 *
 *   create table if not exists system_state (
 *     key text primary key,
 *     value jsonb,
 *     updated_at timestamptz default now()
 *   );
 *
 *   create table if not exists transactions (
 *     id uuid default gen_random_uuid() primary key,
 *     amount numeric,
 *     status text,
 *     source text,
 *     meta jsonb,
 *     created_at timestamptz default now()
 *   );
 *
 *   create table if not exists agent_runs (
 *     id uuid default gen_random_uuid() primary key,
 *     agent_name text,
 *     input text,
 *     output jsonb,
 *     created_at timestamptz default now()
 *   );
 */

const { supabaseAdmin, isConfigured } = require('./supabase');

// In-memory fallback for when Supabase isn't connected
const memStore = {};

// ── State: key/value ─────────────────────────────────────────────────────────

async function getState(key) {
  if (!isConfigured) return memStore[key] ?? null;
  try {
    const { data, error } = await supabaseAdmin
      .from('system_state')
      .select('value')
      .eq('key', key)
      .single();
    if (error) return memStore[key] ?? null;
    return data?.value ?? null;
  } catch (_) {
    return memStore[key] ?? null;
  }
}

async function setState(key, value) {
  memStore[key] = value; // always update in-memory mirror
  if (!isConfigured) return;
  try {
    await supabaseAdmin.from('system_state').upsert(
      { key, value, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
  } catch (e) {
    console.warn('[DB] setState failed for', key, e.message);
  }
}

// ── Transactions ─────────────────────────────────────────────────────────────

async function logTransaction(tx) {
  if (!isConfigured) return { id: `mem_${Date.now()}`, ...tx };
  try {
    // Use idempotency_key (e.g. PayFast m_payment_id) to prevent duplicate credits
    const row = {
      amount: tx.amount,
      status: tx.status || 'success',
      source: tx.source || 'system',
      meta: tx.meta || {},
    };
    if (tx.idempotencyKey) row.idempotency_key = tx.idempotencyKey;

    const { data, error } = await supabaseAdmin
      .from('transactions')
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (e) {
    // Unique constraint on idempotency_key → duplicate, skip silently
    if (e.code === '23505') return { duplicate: true };
    console.warn('[DB] logTransaction failed:', e.message);
    return { id: `mem_${Date.now()}`, ...tx };
  }
}

async function isDuplicatePayment(idempotencyKey) {
  if (!isConfigured || !idempotencyKey) return false;
  try {
    const { data } = await supabaseAdmin
      .from('transactions')
      .select('id')
      .eq('idempotency_key', idempotencyKey)
      .limit(1)
      .single();
    return !!data;
  } catch (_) { return false; }
}

async function getTransactions(limit = 20) {
  if (!isConfigured) return [];
  try {
    const { data } = await supabaseAdmin
      .from('transactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    return data || [];
  } catch (_) {
    return [];
  }
}

// ── Agent runs ───────────────────────────────────────────────────────────────

async function logAgentRun(agentName, input, output) {
  if (!isConfigured) return;
  try {
    await supabaseAdmin.from('agent_runs').insert({
      agent_name: agentName,
      input: String(input ?? ''),
      output: typeof output === 'object' ? output : { result: output },
    });
  } catch (e) {
    console.warn('[DB] logAgentRun failed:', e.message);
  }
}

// ── Treasury helpers ─────────────────────────────────────────────────────────

const TREASURY_SEED = 1389208.00; // baseline pre-DB balance

async function getTreasuryBalance(fallback = TREASURY_SEED) {
  const stored = await getState('treasuryBalance');
  return stored !== null ? parseFloat(stored) : fallback;
}

async function addToTreasury(amount, source = 'payment') {
  const current = await getTreasuryBalance();
  const updated = +(current + amount).toFixed(2);
  await setState('treasuryBalance', updated);
  // Note: caller is responsible for calling logTransaction with idempotencyKey
  return updated;
}

/**
 * Reconcile: compare system_state.treasuryBalance against SUM(transactions.amount) + seed.
 * Returns { cached, computed, drift, driftPct, ok }
 * Automatically heals the cache if drift > threshold.
 */
async function reconcileTreasury() {
  if (!isConfigured) return { ok: true, reason: 'not_configured' };
  try {
    const { data, error } = await supabaseAdmin
      .from('transactions')
      .select('amount')
      .eq('status', 'success');

    if (error) throw error;

    const txTotal    = (data || []).reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);
    const computed   = +(TREASURY_SEED + txTotal).toFixed(2);
    const cached     = await getTreasuryBalance();
    const drift      = +(cached - computed).toFixed(2);
    const driftPct   = computed !== 0 ? +(Math.abs(drift) / computed * 100).toFixed(3) : 0;
    const ok         = Math.abs(drift) < 1; // < R1 tolerance

    if (!ok) {
      console.warn(`[DB] Treasury drift detected: cached=${cached} computed=${computed} drift=${drift}`);
      await setState('treasuryBalance', computed); // heal
      await setState('lastReconciliation', { cached, computed, drift, time: new Date().toISOString() });
    }

    return { cached, computed, drift, driftPct, ok, txCount: (data || []).length };
  } catch (e) {
    console.warn('[DB] reconcileTreasury failed:', e.message);
    return { ok: false, error: e.message };
  }
}

// ── AI spend tracking ────────────────────────────────────────────────────────

const AI_MONTHLY_BUDGET = parseFloat(process.env.AI_MONTHLY_BUDGET || '500'); // R500/mo default

async function trackAISpend(costRands) {
  const current = parseFloat(await getState('ai_spend_month') || 0);
  const updated = +(current + costRands).toFixed(4);
  await setState('ai_spend_month', updated);
  if (updated > AI_MONTHLY_BUDGET) {
    console.warn(`[DB] AI budget exceeded: R${updated} / R${AI_MONTHLY_BUDGET}`);
  }
  return { spend: updated, budget: AI_MONTHLY_BUDGET, exceeded: updated > AI_MONTHLY_BUDGET };
}

async function getAISpend() {
  return {
    spend:   parseFloat(await getState('ai_spend_month') || 0),
    budget:  AI_MONTHLY_BUDGET,
  };
}

// ── Neuro helpers ────────────────────────────────────────────────────────────

const DEFAULT_NEURO = { D: 0.007, S: 0.051, O: 0.485, E: 0.783 };

async function getNeuro() {
  const stored = await getState('neuro');
  return stored !== null ? stored : { ...DEFAULT_NEURO };
}

async function setNeuro(n) {
  await setState('neuro', n);
}

// ── Funnel helpers ───────────────────────────────────────────────────────────

const DEFAULT_FUNNEL = {
  osint_discovery: 100,
  lead_generated: 200,
  nurturing: 28,
  qualified: 0,
  proposal_sent: 0,
  closed_won: 436,
  customer: 129,
};

async function getFunnel() {
  const stored = await getState('funnel');
  return stored !== null ? stored : { ...DEFAULT_FUNNEL };
}

async function incrementFunnel(stage, delta = 1) {
  const f = await getFunnel();
  f[stage] = (f[stage] || 0) + delta;
  await setState('funnel', f);
  return f;
}

module.exports = {
  getState, setState,
  logTransaction, getTransactions, isDuplicatePayment,
  logAgentRun,
  getTreasuryBalance, addToTreasury, reconcileTreasury,
  trackAISpend, getAISpend,
  getNeuro, setNeuro,
  getFunnel, incrementFunnel,
};
