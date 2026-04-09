/**
 * BRIDGE AI OS — Agent BRDG Ledger (Double-Entry, Supabase-backed)
 *
 * Persistent ledger for 24+ AI agent BRDG balances.
 * Uses Supabase (PostgreSQL) for persistent storage.
 *
 * Tables (in Supabase):
 *   agent_balances     — running balance + lifetime earned/spent per agent
 *   agent_transactions — immutable log of every financial event
 *
 * Auto-seeds agents on first access:
 *   prime: 50,000 | twin: 25,000 | bossbot: 5,000 | others: 1,000
 *
 * Transfer economics: 5% system fee + 1% burn (deflationary)
 *
 * Usage:
 *   const ledger = require('./lib/agent-ledger');
 *   await ledger.credit('twin', 500, 'task_reward', 'Completed nurture campaign');
 *   await ledger.transfer('twin', 'closer-ai', 100, 'task_42');
 *   await ledger.getBalance('twin');
 *   await ledger.getLeaderboard(10);
 */

'use strict';

const crypto = require('crypto');
const { supabase } = require('./supabase');

// ── Seed amounts by agent role (from brain-agents.js hierarchy) ─────────────

const SEED_AMOUNTS = {
  prime:          50000,
  prime_csuite:  100000,
  twin:           25000,
  bossbot:         5000,
  business:        2000,
  orchestrator:    1000,
  skill:           1000,
  ban_node:        1000,
  _default:        1000,
};

// Full agent roster for genesis seeding
const SEED_AGENTS = [
  ['prime-001',            'prime'],
  ['twin-empe-001',        'twin'],
  ['agent-1-gateway',      'orchestrator'],
  ['agent-2a-dashboard',   'orchestrator'],
  ['agent-3a-data',        'orchestrator'],
  ['agent-4a-auth',        'orchestrator'],
  ['agent-5a-testing',     'orchestrator'],
  ['agent-6a-governance',  'orchestrator'],
  ['agent-l2-verifier',    'orchestrator'],
  ['agent-l2-streamer',    'orchestrator'],
  ['agent-l3-minimax',     'orchestrator'],
  ['agent-svg-decision',   'skill'],
  ['agent-svg-economy',    'skill'],
  ['agent-svg-speech',     'skill'],
  ['agent-svg-swarm',      'skill'],
  ['agent-svg-treasury',   'skill'],
  ['agent-svg-twins',      'skill'],
  ['agent-svg-youtube',    'skill'],
  ['agent-svg-flow',       'skill'],
  ['agent-biz-sales',      'business'],
  ['agent-biz-support',    'business'],
  ['agent-biz-research',   'business'],
  ['agent-biz-marketing',  'business'],
  ['agent-biz-legal',      'business'],
  ['agent-biz-finance',    'business'],
  ['agent-biz-dev',        'business'],
  ['agent-biz-trading',    'business'],
  ['bossbot-alpha',        'bossbot'],
  ['bossbot-beta',         'bossbot'],
  ['bossbot-gamma',        'bossbot'],
  ['bossbot-delta',        'bossbot'],
  ['ban-ryan',             'ban_node'],
  ['ban-mike',             'ban_node'],
  ['ban-marvin',           'ban_node'],
  ['treasury',             'prime'],
  // Prime Agents (C-Suite Orchestrators) — 100,000 BRDG each
  ['prime-aurora',          'prime_csuite'],
  ['prime-atlas',           'prime_csuite'],
  ['prime-vega',            'prime_csuite'],
  ['prime-omega',           'prime_csuite'],
  ['prime-halo',            'prime_csuite'],
  ['prime-nexus',           'prime_csuite'],
  ['prime-sentinel',        'prime_csuite'],
];

/**
 * Determine seed balance for an agent based on its id.
 */
function getSeedAmount(agentId) {
  // Check explicit roster first
  const entry = SEED_AGENTS.find(([id]) => id === agentId);
  if (entry) return SEED_AMOUNTS[entry[1]] || SEED_AMOUNTS._default;

  // Fallback: pattern-match on name
  const lower = agentId.toLowerCase();
  if (lower === 'prime' || lower.startsWith('prime'))   return SEED_AMOUNTS.prime;
  if (lower === 'twin'  || lower.startsWith('twin'))    return SEED_AMOUNTS.twin;
  if (lower.includes('bossbot'))                        return SEED_AMOUNTS.bossbot;
  if (lower.includes('biz-'))                           return SEED_AMOUNTS.business;
  return SEED_AMOUNTS._default;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function txId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : 'tx_' + Date.now() + '_' + crypto.randomBytes(8).toString('hex');
}

function now() {
  return new Date().toISOString();
}

function round8(n) {
  return +(n.toFixed(8));
}

/**
 * Ensure an agent_balances row exists. If first access, seed it atomically.
 */
async function ensureAgent(agentId) {
  const { data: row, error: getErr } = await supabase
    .from('agent_balances')
    .select('*')
    .eq('agent_id', agentId)
    .single();

  if (row) return row;

  const seed = getSeedAmount(agentId);
  const ts = now();
  const id = txId();

  // Upsert the balance row (handles race conditions)
  const { error: upsertErr } = await supabase
    .from('agent_balances')
    .upsert({
      agent_id: agentId,
      balance: seed,
      earned_total: seed,
      spent_total: 0,
      escrowed: 0,
      last_tx: ts,
      fiat_revenue: 0,
      ap2_revenue: 0,
      affiliate_revenue: 0,
      fiat_cost: 0,
    }, { onConflict: 'agent_id' });

  if (upsertErr) throw new Error('ensureAgent upsert failed: ' + upsertErr.message);

  // Insert seed transaction
  const { error: txErr } = await supabase
    .from('agent_transactions')
    .insert({
      id,
      from_agent: 'genesis',
      to_agent: agentId,
      amount: seed,
      fee: 0,
      burn: 0,
      type: 'seed',
      task_id: null,
      memo: 'Initial seed: ' + seed + ' BRDG',
      ts,
    });

  if (txErr) throw new Error('ensureAgent seed tx failed: ' + txErr.message);

  const { data: newRow, error: refetchErr } = await supabase
    .from('agent_balances')
    .select('*')
    .eq('agent_id', agentId)
    .single();

  if (refetchErr) throw new Error('ensureAgent refetch failed: ' + refetchErr.message);
  return newRow;
}

// ── Core Financial Operations ──────────────────────────────────────────────

/**
 * Credit BRDG to an agent (earning / reward / refund).
 * @param {string} agentId
 * @param {number} amount  — must be > 0
 * @param {string} type    — e.g. 'task_reward', 'refund', 'credit'
 * @param {string} memo
 * @returns {{ tx_id, agent_id, amount, new_balance }}
 */
async function credit(agentId, amount, type, memo) {
  if (!type) type = 'credit';
  if (!memo) memo = '';
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Credit amount must be a positive finite number');

  const ts = now();
  const id = txId();

  const agent = await ensureAgent(agentId);
  const newBal    = round8(agent.balance + amount);
  const newEarned = round8(agent.earned_total + amount);

  const { error: updErr } = await supabase
    .from('agent_balances')
    .update({
      balance: newBal,
      earned_total: newEarned,
      last_tx: ts,
    })
    .eq('agent_id', agentId);

  if (updErr) throw new Error('credit update failed: ' + updErr.message);

  const { error: txErr } = await supabase
    .from('agent_transactions')
    .insert({
      id, from_agent: 'system', to_agent: agentId,
      amount, fee: 0, burn: 0, type, task_id: null, memo, ts,
    });

  if (txErr) throw new Error('credit tx insert failed: ' + txErr.message);

  return { tx_id: id, agent_id: agentId, amount, new_balance: newBal };
}

/**
 * Debit BRDG from an agent (spending / penalty / cost).
 * Throws if insufficient available balance.
 */
async function debit(agentId, amount, type, memo) {
  if (!type) type = 'debit';
  if (!memo) memo = '';
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Debit amount must be a positive finite number');

  const ts = now();
  const id = txId();

  const agent = await ensureAgent(agentId);
  const available = agent.balance - agent.escrowed;
  if (available < amount) {
    throw new Error(
      'Insufficient balance: ' + agentId + ' has ' + available +
      ' BRDG available (' + agent.escrowed + ' escrowed), tried to debit ' + amount
    );
  }

  const newBal   = round8(agent.balance - amount);
  const newSpent = round8(agent.spent_total + amount);

  const { error: updErr } = await supabase
    .from('agent_balances')
    .update({
      balance: newBal,
      spent_total: newSpent,
      last_tx: ts,
    })
    .eq('agent_id', agentId);

  if (updErr) throw new Error('debit update failed: ' + updErr.message);

  const { error: txErr } = await supabase
    .from('agent_transactions')
    .insert({
      id, from_agent: agentId, to_agent: 'system',
      amount, fee: 0, burn: 0, type, task_id: null, memo, ts,
    });

  if (txErr) throw new Error('debit tx insert failed: ' + txErr.message);

  return { tx_id: id, agent_id: agentId, amount, new_balance: newBal };
}

/**
 * Transfer BRDG between agents with deflationary economics.
 *
 *   5% system fee  — removed from circulation
 *   1% burn        — permanently destroyed
 *   Net received   = amount * 0.94
 */
async function transfer(fromAgent, toAgent, amount, taskId) {
  if (!taskId) taskId = null;
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Transfer amount must be a positive finite number');
  if (fromAgent === toAgent) throw new Error('Cannot transfer to self');

  const fee  = round8(amount * 0.05);   // 5% system fee
  const burn = 0;                       // 0% burn — Config E: zero leakage
  const net  = round8(amount - fee);

  const ts = now();
  const id = txId();

  const sender = await ensureAgent(fromAgent);
  await ensureAgent(toAgent);

  const senderAvailable = sender.balance - sender.escrowed;
  if (senderAvailable < amount) {
    throw new Error(
      'Insufficient balance: ' + fromAgent + ' has ' + senderAvailable +
      ' BRDG available, transfer needs ' + amount
    );
  }

  // Debit sender (full gross)
  const senderNewBal = round8(sender.balance - amount);
  const { error: sndErr } = await supabase
    .from('agent_balances')
    .update({
      balance: senderNewBal,
      spent_total: round8(sender.spent_total + amount),
      last_tx: ts,
    })
    .eq('agent_id', fromAgent);

  if (sndErr) throw new Error('transfer sender update failed: ' + sndErr.message);

  // Credit receiver (net)
  const { data: receiver, error: rcvGetErr } = await supabase
    .from('agent_balances')
    .select('*')
    .eq('agent_id', toAgent)
    .single();

  if (rcvGetErr) throw new Error('transfer receiver fetch failed: ' + rcvGetErr.message);

  const receiverNewBal = round8(receiver.balance + net);
  const { error: rcvErr } = await supabase
    .from('agent_balances')
    .update({
      balance: receiverNewBal,
      earned_total: round8(receiver.earned_total + net),
      last_tx: ts,
    })
    .eq('agent_id', toAgent);

  if (rcvErr) throw new Error('transfer receiver update failed: ' + rcvErr.message);

  // Immutable tx record
  const { error: txErr } = await supabase
    .from('agent_transactions')
    .insert({
      id, from_agent: fromAgent, to_agent: toAgent,
      amount, fee, burn, type: 'transfer', task_id: taskId,
      memo: 'Transfer ' + amount + ' BRDG | fee=' + fee + ' burn=' + burn + ' net=' + net, ts,
    });

  if (txErr) throw new Error('transfer tx insert failed: ' + txErr.message);

  return {
    tx_id: id,
    from: fromAgent, to: toAgent,
    gross: amount, fee, burn, net,
    from_balance: senderNewBal,
    to_balance: receiverNewBal,
  };
}

// ── Escrow Operations ──────────────────────────────────────────────────────

/**
 * Lock funds in escrow (available balance decreases, total balance unchanged).
 */
async function escrowLock(agentId, amount, memo) {
  if (!memo) memo = 'escrow';
  if (amount <= 0) throw new Error('Amount must be positive');

  const ts = now();
  const id = txId();

  const agent = await ensureAgent(agentId);
  const available = agent.balance - agent.escrowed;
  if (available < amount) {
    throw new Error('Insufficient available balance: ' + agentId + ' has ' + available.toFixed(2) + ' available, needs ' + amount);
  }

  const { error: updErr } = await supabase
    .from('agent_balances')
    .update({
      escrowed: round8(agent.escrowed + amount),
      last_tx: ts,
    })
    .eq('agent_id', agentId);

  if (updErr) throw new Error('escrowLock update failed: ' + updErr.message);

  const { error: txErr } = await supabase
    .from('agent_transactions')
    .insert({
      id, from_agent: agentId, to_agent: 'escrow',
      amount, fee: 0, burn: 0, type: 'escrow_lock', task_id: null, memo, ts,
    });

  if (txErr) throw new Error('escrowLock tx insert failed: ' + txErr.message);

  return { tx_id: id, agent_id: agentId, escrowed: round8(agent.escrowed + amount) };
}

/**
 * Release escrowed funds to a recipient.
 */
async function escrowRelease(agentId, amount, recipientId, memo) {
  if (!memo) memo = 'escrow_release';
  if (amount <= 0) throw new Error('Amount must be positive');

  const ts = now();
  const id = txId();

  const agent = await ensureAgent(agentId);
  await ensureAgent(recipientId);
  if (agent.escrowed < amount) {
    throw new Error('Not enough escrowed: ' + agentId + ' has ' + agent.escrowed.toFixed(2) + ' escrowed, releasing ' + amount);
  }

  // Decrease sender balance + escrow
  const { error: sndErr } = await supabase
    .from('agent_balances')
    .update({
      balance: round8(agent.balance - amount),
      spent_total: round8(agent.spent_total + amount),
      escrowed: round8(agent.escrowed - amount),
      last_tx: ts,
    })
    .eq('agent_id', agentId);

  if (sndErr) throw new Error('escrowRelease sender update failed: ' + sndErr.message);

  // Increase recipient
  const { data: recipient, error: rcpGetErr } = await supabase
    .from('agent_balances')
    .select('*')
    .eq('agent_id', recipientId)
    .single();

  if (rcpGetErr) throw new Error('escrowRelease recipient fetch failed: ' + rcpGetErr.message);

  const { error: rcpErr } = await supabase
    .from('agent_balances')
    .update({
      balance: round8(recipient.balance + amount),
      earned_total: round8(recipient.earned_total + amount),
      last_tx: ts,
    })
    .eq('agent_id', recipientId);

  if (rcpErr) throw new Error('escrowRelease recipient update failed: ' + rcpErr.message);

  const { error: txErr } = await supabase
    .from('agent_transactions')
    .insert({
      id, from_agent: agentId, to_agent: recipientId,
      amount, fee: 0, burn: 0, type: 'escrow_release', task_id: null, memo, ts,
    });

  if (txErr) throw new Error('escrowRelease tx insert failed: ' + txErr.message);

  return { tx_id: id, from: agentId, to: recipientId, amount };
}

/**
 * Return escrowed funds back to the agent (unlock without transfer).
 */
async function escrowReturn(agentId, amount, memo) {
  if (!memo) memo = 'escrow_return';
  if (amount <= 0) throw new Error('Amount must be positive');

  const ts = now();
  const id = txId();

  const agent = await ensureAgent(agentId);
  if (agent.escrowed < amount) {
    throw new Error('Not enough escrowed: ' + agentId + ' has ' + agent.escrowed.toFixed(2) + ' escrowed, returning ' + amount);
  }

  const { error: updErr } = await supabase
    .from('agent_balances')
    .update({
      escrowed: round8(agent.escrowed - amount),
      last_tx: ts,
    })
    .eq('agent_id', agentId);

  if (updErr) throw new Error('escrowReturn update failed: ' + updErr.message);

  const { error: txErr } = await supabase
    .from('agent_transactions')
    .insert({
      id, from_agent: 'escrow', to_agent: agentId,
      amount, fee: 0, burn: 0, type: 'escrow_return', task_id: null, memo, ts,
    });

  if (txErr) throw new Error('escrowReturn tx insert failed: ' + txErr.message);

  return { tx_id: id, agent_id: agentId, escrowed: round8(agent.escrowed - amount) };
}

/**
 * Burn escrowed funds (permanent removal from supply).
 */
async function escrowBurn(agentId, amount, memo) {
  if (!memo) memo = 'burn';
  if (amount <= 0) throw new Error('Amount must be positive');

  const ts = now();
  const id = txId();

  const agent = await ensureAgent(agentId);
  if (agent.escrowed < amount) {
    throw new Error('Not enough escrowed to burn');
  }

  const { error: updErr } = await supabase
    .from('agent_balances')
    .update({
      balance: round8(agent.balance - amount),
      spent_total: round8(agent.spent_total + amount),
      escrowed: round8(agent.escrowed - amount),
      last_tx: ts,
    })
    .eq('agent_id', agentId);

  if (updErr) throw new Error('escrowBurn update failed: ' + updErr.message);

  const { error: txErr } = await supabase
    .from('agent_transactions')
    .insert({
      id, from_agent: agentId, to_agent: 'burned',
      amount, fee: 0, burn: amount, type: 'burn', task_id: null, memo, ts,
    });

  if (txErr) throw new Error('escrowBurn tx insert failed: ' + txErr.message);

  return { tx_id: id, agent_id: agentId, burned: amount };
}

// ── Query Operations ────────────────────────────────────────────────────────

/**
 * Get current balance for an agent. Auto-seeds on first access.
 */
async function getBalance(agentId) {
  return ensureAgent(agentId);
}

/**
 * Get available (non-escrowed) balance.
 */
async function getAvailable(agentId) {
  const agent = await ensureAgent(agentId);
  return round8(agent.balance - agent.escrowed);
}

/**
 * Get escrowed amount for an agent.
 */
async function getEscrowed(agentId) {
  const agent = await ensureAgent(agentId);
  return agent.escrowed;
}

/**
 * Get all balances sorted by balance descending.
 */
async function getAllBalances() {
  const { data, error } = await supabase
    .from('agent_balances')
    .select('*')
    .order('balance', { ascending: false });

  if (error) throw new Error('getAllBalances failed: ' + error.message);
  return data || [];
}

/**
 * Get transaction history for an agent (newest first).
 */
async function getHistory(agentId, limit) {
  if (!limit) limit = 50;
  await ensureAgent(agentId);

  const { data, error } = await supabase
    .from('agent_transactions')
    .select('*')
    .or('from_agent.eq.' + agentId + ',to_agent.eq.' + agentId)
    .order('ts', { ascending: false })
    .limit(limit);

  if (error) throw new Error('getHistory failed: ' + error.message);
  return data || [];
}

/**
 * Get agent leaderboard by balance (descending).
 */
async function getLeaderboard(limit) {
  if (!limit) limit = 20;

  const { data, error } = await supabase
    .from('agent_balances')
    .select('*')
    .order('balance', { ascending: false })
    .limit(limit);

  if (error) throw new Error('getLeaderboard failed: ' + error.message);
  return data || [];
}

/**
 * System-wide economy stats.
 */
async function getStats() {
  // Total supply
  const { data: balRows } = await supabase
    .from('agent_balances')
    .select('balance');
  const totalCirculating = (balRows || []).reduce((sum, r) => sum + (r.balance || 0), 0);

  // Total burned
  const { data: burnRows } = await supabase
    .from('agent_transactions')
    .select('burn');
  const totalBurned = (burnRows || []).reduce((sum, r) => sum + (r.burn || 0), 0);

  // Total fees
  const { data: feeRows } = await supabase
    .from('agent_transactions')
    .select('fee');
  const totalFeesCollected = (feeRows || []).reduce((sum, r) => sum + (r.fee || 0), 0);

  // Counts
  const { count: agentCount } = await supabase
    .from('agent_balances')
    .select('*', { count: 'exact', head: true });

  const { count: txCount } = await supabase
    .from('agent_transactions')
    .select('*', { count: 'exact', head: true });

  // Top earners
  const { data: topEarners } = await supabase
    .from('agent_balances')
    .select('*')
    .order('balance', { ascending: false })
    .limit(10);

  return {
    totalCirculating,
    totalBurned,
    totalFeesCollected,
    agent_count: agentCount || 0,
    totalTransactions: txCount || 0,
    topEarners: topEarners || [],
  };
}

/**
 * Get recent transactions across all agents.
 */
async function getRecentTransactions(limit) {
  if (!limit) limit = 50;

  const { data, error } = await supabase
    .from('agent_transactions')
    .select('*')
    .order('ts', { ascending: false })
    .limit(limit);

  if (error) throw new Error('getRecentTransactions failed: ' + error.message);
  return data || [];
}

/**
 * Close — no-op for Supabase (no persistent connection to close).
 */
async function close() {
  // No-op: Supabase client doesn't require explicit close
}

// ── P&L Revenue Tracking ───────────────────────────────────────────────────

/**
 * Record revenue for an agent by type.
 */
async function recordRevenue(agentId, amount, type) {
  if (amount <= 0) throw new Error('Revenue amount must be positive');
  if (!['fiat', 'ap2', 'affiliate'].includes(type)) {
    throw new Error('Revenue type must be fiat, ap2, or affiliate');
  }

  const colMap = { fiat: 'fiat_revenue', ap2: 'ap2_revenue', affiliate: 'affiliate_revenue' };
  const col = colMap[type];

  const agent = await ensureAgent(agentId);
  const newVal = round8((agent[col] || 0) + amount);

  const { error: updErr } = await supabase
    .from('agent_balances')
    .update({ [col]: newVal })
    .eq('agent_id', agentId);

  if (updErr) throw new Error('recordRevenue update failed: ' + updErr.message);

  // Also credit the BRDG balance
  await credit(agentId, amount, 'revenue_' + type, type + ' revenue: ' + amount);

  return { agent_id: agentId, type, amount, new_total: newVal };
}

/**
 * Record a fiat cost for an agent.
 */
async function recordCost(agentId, amount) {
  if (amount <= 0) throw new Error('Cost amount must be positive');

  const agent = await ensureAgent(agentId);
  const newVal = round8((agent.fiat_cost || 0) + amount);

  const { error: updErr } = await supabase
    .from('agent_balances')
    .update({ fiat_cost: newVal })
    .eq('agent_id', agentId);

  if (updErr) throw new Error('recordCost update failed: ' + updErr.message);

  return { agent_id: agentId, amount, new_total: newVal };
}

/**
 * Get P&L report for a single agent.
 */
async function getAgentPnL(agentId) {
  const agent = await ensureAgent(agentId);
  const fiat_revenue = agent.fiat_revenue || 0;
  const ap2_revenue = agent.ap2_revenue || 0;
  const affiliate_revenue = agent.affiliate_revenue || 0;
  const fiat_cost = agent.fiat_cost || 0;
  const net_profit = round8(fiat_revenue + ap2_revenue + affiliate_revenue - fiat_cost);

  return {
    agent_id: agentId,
    balance: agent.balance,
    fiat_revenue,
    ap2_revenue,
    affiliate_revenue,
    fiat_cost,
    net_profit,
  };
}

/**
 * Get system-wide P&L across all agents.
 */
async function getSystemPnL() {
  const { data: rows, error } = await supabase
    .from('agent_balances')
    .select('fiat_revenue, ap2_revenue, affiliate_revenue, fiat_cost');

  if (error) throw new Error('getSystemPnL failed: ' + error.message);

  const all = rows || [];
  const totals = all.reduce((acc, r) => {
    acc.fiat_revenue += r.fiat_revenue || 0;
    acc.ap2_revenue += r.ap2_revenue || 0;
    acc.affiliate_revenue += r.affiliate_revenue || 0;
    acc.fiat_cost += r.fiat_cost || 0;
    return acc;
  }, { fiat_revenue: 0, ap2_revenue: 0, affiliate_revenue: 0, fiat_cost: 0 });

  return {
    total_fiat_revenue: totals.fiat_revenue,
    total_ap2_revenue: totals.ap2_revenue,
    total_affiliate_revenue: totals.affiliate_revenue,
    total_fiat_cost: totals.fiat_cost,
    total_net_profit: round8(totals.fiat_revenue + totals.ap2_revenue + totals.affiliate_revenue - totals.fiat_cost),
    agent_count: all.length,
  };
}

// ── Genesis seed: pre-populate all known agents on first load ────────────────

async function seedIfNeeded() {
  const { count, error } = await supabase
    .from('agent_balances')
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.error('[agent-ledger] seedIfNeeded count failed:', error.message);
    return;
  }

  if ((count || 0) >= SEED_AGENTS.length) return; // already seeded

  for (const [agentId] of SEED_AGENTS) {
    try {
      await ensureAgent(agentId); // creates row + seed tx if missing
    } catch (e) {
      console.error('[agent-ledger] seed error for ' + agentId + ':', e.message);
    }
  }
}

// ── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  // Core financial operations
  credit,
  debit,
  transfer,

  // Escrow operations
  escrowLock,
  escrowRelease,
  escrowReturn,
  escrowBurn,

  // Query operations
  getBalance,
  getAvailable,
  getEscrowed,
  getAllBalances,
  getHistory,
  getLeaderboard,
  getStats,
  getRecentTransactions,

  // P&L operations
  recordRevenue,
  recordCost,
  getAgentPnL,
  getSystemPnL,

  // Lifecycle
  ensureAgent,
  seedIfNeeded,
  close,

  // Exposed for testing / advanced use
  SEED_AMOUNTS,
};
