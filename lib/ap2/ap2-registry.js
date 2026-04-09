/**
 * BRIDGE AI OS — External Agent Registry (AP2 Protocol)
 *
 * Manages registration, routing, and revenue tracking for external AI agents
 * that participate in the Bridge economy via the AP2 protocol.
 *
 * Backed by Supabase table: external_agents
 * Default commission: 15% on all external agent transactions
 */

'use strict';

const crypto = require('crypto');
const { supabase } = require('../supabase');

// ── Functions ───────────────────────────────────────────────────────────────

/**
 * Register an external AP2 agent with its service catalog.
 * Default 15% commission rate.
 */
async function registerExternalAgent(name, url, catalog, commissionRate = 0.15) {
  const id = 'ext_' + crypto.randomBytes(8).toString('hex');
  const catalogJson = typeof catalog === 'string' ? catalog : JSON.stringify(catalog || []);

  if (supabase) {
    await supabase.from('external_agents').insert({
      id,
      agent_name: name,
      agent_url: url,
      service_catalog_json: catalogJson,
      commission_rate: commissionRate,
      total_transactions: 0,
      total_revenue: 0,
      status: 'active',
      registered_at: new Date().toISOString(),
      last_active: new Date().toISOString(),
    });
  }

  console.log('[AP2] Registered external agent: ' + name + ' (' + id + ') at ' + url);
  return { id, agent_name: name, agent_url: url, commission_rate: commissionRate };
}

/**
 * List registered external agents, optionally filtered by status.
 */
async function getExternalAgents(status) {
  if (!supabase) return [];
  let query = supabase.from('external_agents').select('*').order('total_revenue', { ascending: false });
  if (status) query = query.eq('status', status);
  const { data } = await query;
  return (data || []).map(r => ({
    ...r,
    service_catalog: JSON.parse(r.service_catalog_json || '[]'),
  }));
}

/**
 * Find the best external agent for a given task type.
 * Searches service catalogs and returns the highest-revenue active agent that offers the service.
 */
async function routeToExternal(taskType) {
  const agents = await getExternalAgents('active');
  const taskLower = (taskType || '').toLowerCase();

  let bestAgent = null;
  let bestRevenue = -1;

  for (const agent of agents) {
    let catalog = [];
    try { catalog = Array.isArray(agent.service_catalog) ? agent.service_catalog : JSON.parse(agent.service_catalog_json || '[]'); } catch (_) {}

    const offers = Array.isArray(catalog)
      ? catalog.some(function(s) {
          return (s.type || s.name || s || '').toString().toLowerCase().indexOf(taskLower) >= 0;
        })
      : false;

    if (offers && agent.total_revenue > bestRevenue) {
      bestAgent = agent;
      bestRevenue = agent.total_revenue;
    }
  }

  return bestAgent || null;
}

/**
 * Record a transaction from an external agent, tracking revenue.
 */
async function recordExternalTransaction(agentId, amount) {
  if (!supabase) throw new Error('Supabase not configured');

  const { data: agent } = await supabase.from('external_agents').select('*').eq('id', agentId).single();
  if (!agent) throw new Error('External agent ' + agentId + ' not found');

  const commission = amount * agent.commission_rate;
  await supabase.from('external_agents').update({
    total_transactions: (agent.total_transactions || 0) + 1,
    total_revenue: (agent.total_revenue || 0) + commission,
    last_active: new Date().toISOString(),
  }).eq('id', agentId);

  console.log('[AP2] Transaction recorded: agent=' + agentId + ' amount=' + amount + ' commission=' + commission.toFixed(2));
  return {
    agent_id: agentId,
    amount,
    commission,
    commission_rate: agent.commission_rate,
  };
}

/**
 * Aggregate stats on the external agent economy.
 */
async function getExternalStats() {
  if (!supabase) return { total_agents: 0, active_agents: 0, total_transactions: 0, total_revenue: 0, avg_commission: 0.15 };

  const { data } = await supabase.from('external_agents').select('status, total_transactions, total_revenue, commission_rate');
  const rows = data || [];

  return {
    total_agents: rows.length,
    active_agents: rows.filter(r => r.status === 'active').length,
    total_transactions: rows.reduce((s, r) => s + (r.total_transactions || 0), 0),
    total_revenue: rows.reduce((s, r) => s + (r.total_revenue || 0), 0),
    avg_commission: rows.length ? rows.reduce((s, r) => s + (r.commission_rate || 0.15), 0) / rows.length : 0.15,
  };
}

module.exports = {
  registerExternalAgent,
  getExternalAgents,
  routeToExternal,
  recordExternalTransaction,
  getExternalStats,
};
