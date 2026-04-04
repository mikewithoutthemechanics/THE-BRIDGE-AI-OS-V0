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
    const { data, error } = await supabaseAdmin
      .from('transactions')
      .insert({
        amount: tx.amount,
        status: tx.status || 'success',
        source: tx.source || 'system',
        meta: tx.meta || {},
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (e) {
    console.warn('[DB] logTransaction failed:', e.message);
    return { id: `mem_${Date.now()}`, ...tx };
  }
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

async function getTreasuryBalance(fallback = 1389208.00) {
  const stored = await getState('treasuryBalance');
  return stored !== null ? parseFloat(stored) : fallback;
}

async function addToTreasury(amount, source = 'payment') {
  const current = await getTreasuryBalance();
  const updated = current + amount;
  await setState('treasuryBalance', updated);
  await logTransaction({ amount, status: 'success', source });
  return updated;
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
  logTransaction, getTransactions,
  logAgentRun,
  getTreasuryBalance, addToTreasury,
  getNeuro, setNeuro,
  getFunnel, incrementFunnel,
};
