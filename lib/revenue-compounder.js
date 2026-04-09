/**
 * BRIDGE AI OS — Revenue Compounding Engine
 *
 * Runs every 5 minutes to compound system revenue:
 *   40% reinvest in agent economy (bonus to top performers)
 *   30% treasury reserve
 *   20% liquidity pool
 *   10% burn (deflationary)
 *
 * Tracks compounding cycles and growth rate over time.
 */

'use strict';

const ledger = require('./agent-ledger');

const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let compoundingTimer = null;
let stats = {
  cycles: 0,
  total_reinvested: 0,
  total_reserved: 0,
  total_liquidity: 0,
  total_burned: 0,
  total_revenue_processed: 0,
  growth_rate: 0,
  top_performers: [],
  last_cycle_at: null,
  started_at: null,
  history: [],   // last 50 cycles
};

// External hooks — injected by brain.js or other modules, with sensible defaults from agent-ledger
let _getNetRevenue = async () => {
  try {
    const pnl = await ledger.getSystemPnL();
    return pnl.total_net_profit || 0;
  } catch (_) { return 0; }
};
let _getAgentPerformance = async () => {
  try {
    // Return all agents with balance info, mapped to the shape runCycle expects
    const balances = await ledger.getAllBalances();
    return balances.map(a => ({
      agent_id: a.agent_id,
      tasks_completed: a.earned_total || 0,
      balance: a.balance,
    }));
  } catch (_) { return []; }
};
let _creditAgent = async (agentId, amount, reason) => {
  try { await ledger.credit(agentId, amount, 'compounding_bonus', reason || 'compounding_bonus'); } catch (_) {}
};
let _addToTreasury = async (amount) => {
  try { await ledger.credit('treasury', amount, 'treasury_reserve', 'Compounding cycle treasury reserve'); } catch (_) {}
};
let _burnTokens = async (amount) => {
  try { await ledger.debit('treasury', amount, 'burn', 'Compounding cycle burn'); } catch (_) {}
};

/**
 * Inject live data sources and action hooks.
 */
function setHooks({ getNetRevenue, getAgentPerformance, creditAgent, addToTreasury, burnTokens } = {}) {
  if (getNetRevenue) _getNetRevenue = getNetRevenue;
  if (getAgentPerformance) _getAgentPerformance = getAgentPerformance;
  if (creditAgent) _creditAgent = creditAgent;
  if (addToTreasury) _addToTreasury = addToTreasury;
  if (burnTokens) _burnTokens = burnTokens;
}

/**
 * Execute one compounding cycle.
 */
async function runCycle() {
  let netRevenue;
  try { netRevenue = await _getNetRevenue(); } catch (_) { netRevenue = 0; }

  if (netRevenue <= 0) {
    console.log('[COMPOUNDER] No net revenue to compound this cycle');
    stats.cycles++;
    stats.last_cycle_at = new Date().toISOString();
    return;
  }

  // Allocate
  const reinvest  = netRevenue * 0.40;
  const reserve   = netRevenue * 0.30;
  const liquidity = netRevenue * 0.20;
  const burn      = netRevenue * 0.10;

  // Credit top-performing agents proportionally
  let agents = [];
  try { agents = await _getAgentPerformance(); } catch (_) { agents = []; }

  const topPerformers = [];
  if (agents.length > 0 && reinvest > 0) {
    // Sort by task completion rate, take top 5
    const sorted = [...agents]
      .filter(a => a.tasks_completed > 0)
      .sort((a, b) => (b.tasks_completed || 0) - (a.tasks_completed || 0))
      .slice(0, 5);

    const totalTasks = sorted.reduce((sum, a) => sum + (a.tasks_completed || 0), 0);

    for (const agent of sorted) {
      const share = totalTasks > 0 ? (agent.tasks_completed / totalTasks) : (1 / sorted.length);
      const bonus = Math.round(reinvest * share * 100) / 100;
      if (bonus > 0) {
        try { await _creditAgent(agent.agent_id || agent.id, bonus, 'compounding_bonus'); } catch (_) {}
        topPerformers.push({
          agent_id: agent.agent_id || agent.id,
          bonus,
          tasks_completed: agent.tasks_completed || 0,
        });
      }
    }
  }

  // Treasury reserve
  try { await _addToTreasury(reserve); } catch (_) {}

  // Burn
  try { await _burnTokens(burn); } catch (_) {}

  // Update stats
  const prevTotal = stats.total_revenue_processed;
  stats.total_revenue_processed += netRevenue;
  stats.total_reinvested += reinvest;
  stats.total_reserved += reserve;
  stats.total_liquidity += liquidity;
  stats.total_burned += burn;
  stats.cycles++;
  stats.top_performers = topPerformers;
  stats.last_cycle_at = new Date().toISOString();

  // Growth rate: percentage increase in total processed revenue
  stats.growth_rate = prevTotal > 0
    ? Math.round(((stats.total_revenue_processed - prevTotal) / prevTotal) * 10000) / 100
    : 100;

  // Keep history (last 50 cycles)
  stats.history.push({
    cycle: stats.cycles,
    revenue: netRevenue,
    reinvested: reinvest,
    reserved: reserve,
    liquidity,
    burned: burn,
    performers: topPerformers.length,
    ts: stats.last_cycle_at,
  });
  if (stats.history.length > 50) stats.history.shift();

  console.log(`[COMPOUNDER] Cycle ${stats.cycles}: revenue=${netRevenue.toFixed(2)} reinvest=${reinvest.toFixed(2)} reserve=${reserve.toFixed(2)} burn=${burn.toFixed(2)} top_performers=${topPerformers.length}`);
}

/**
 * Start the compounding loop (every 5 minutes).
 */
function startCompounding() {
  if (compoundingTimer) {
    console.log('[COMPOUNDER] Already running');
    return;
  }
  stats.started_at = new Date().toISOString();
  compoundingTimer = setInterval(runCycle, INTERVAL_MS);
  console.log('[COMPOUNDER] Revenue compounding started (interval: 5min)');
}

/**
 * Stop the compounding loop.
 */
function stopCompounding() {
  if (compoundingTimer) {
    clearInterval(compoundingTimer);
    compoundingTimer = null;
    console.log('[COMPOUNDER] Revenue compounding stopped');
  }
}

/**
 * Return compounding stats.
 */
function getCompoundingStats() {
  return {
    cycles: stats.cycles,
    total_reinvested: stats.total_reinvested,
    total_reserved: stats.total_reserved,
    total_liquidity: stats.total_liquidity,
    total_burned: stats.total_burned,
    total_revenue_processed: stats.total_revenue_processed,
    growth_rate: stats.growth_rate,
    top_performers: stats.top_performers,
    last_cycle_at: stats.last_cycle_at,
    started_at: stats.started_at,
    active: compoundingTimer !== null,
    history: stats.history.slice(-10),
  };
}

module.exports = {
  startCompounding,
  stopCompounding,
  getCompoundingStats,
  setHooks,
  runCycle, // exposed for testing / manual trigger
};
