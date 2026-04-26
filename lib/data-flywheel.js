/**
 * BRIDGE AI OS -- Data Flywheel
 *
 * Captures agent activity signals, derives insights, and feeds back
 * into agent routing weights for continuous optimization.
 *
 * Supabase-backed via @supabase/supabase-js.
 */
'use strict';

const { supabase } = require('./supabase');
const crypto = require('crypto');

// -- Helpers ----------------------------------------------------------------
function genSignalId() {
  return 'sig_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
}

function now() {
  return new Date().toISOString();
}

// -- Core Functions ---------------------------------------------------------

/**
 * Capture an agent activity signal.
 * @param {string} type - signal type (e.g. 'task_complete', 'conversion', 'service_request')
 * @param {object} data - { agent_id, value, ...metadata }
 * @returns {Promise<object>} the stored signal
 */
async function captureSignal(type, data) {
  if (!type) throw new Error('Signal type required');
  var d = data || {};

  var record = {
    id: genSignalId(),
    signal_type: type,
    agent_id: d.agent_id || null,
    value: d.value || 0,
    metadata_json: d,  // jsonb column -- pass object directly
    ts: now(),
  };

  const { error } = await supabase
    .from('data_signals')
    .insert(record);

  if (error) throw new Error('Failed to capture signal: ' + error.message);
  return record;
}

/**
 * Get aggregate insights from collected signals.
 * @returns {Promise<object>} { most_requested_services, best_converting_agents, peak_activity_times, average_task_value, total_signals }
 */
async function getInsights() {
  // Most requested services
  const { data: topServices } = await supabase.rpc('flywheel_top_services') || { data: [] };

  // Best converting agents
  const { data: bestAgents } = await supabase.rpc('flywheel_best_agents') || { data: [] };

  // Peak hours
  const { data: peakTimes } = await supabase.rpc('flywheel_peak_hours') || { data: [] };

  // Average task value
  const { data: taskValueRows } = await supabase
    .from('data_signals')
    .select('value')
    .eq('signal_type', 'task_complete')
    .gt('value', 0);

  const taskValues = taskValueRows || [];
  const totalTasks = taskValues.length;
  const avgTaskValue = totalTasks > 0
    ? taskValues.reduce((sum, r) => sum + (r.value || 0), 0) / totalTasks
    : 0;

  // Total signal count
  const { count: totalSignals } = await supabase
    .from('data_signals')
    .select('*', { count: 'exact', head: true });

  return {
    most_requested_services: topServices || [],
    best_converting_agents: bestAgents || [],
    peak_activity_times: (peakTimes || []).map(function(p) {
      return {
        hour: p.hour,
        activity_count: p.activity_count,
        label: p.hour + ':00-' + p.hour + ':59',
      };
    }),
    average_task_value: avgTaskValue,
    total_tasks: totalTasks,
    total_signals: totalSignals || 0,
  };
}

/**
 * Feedback loop: recalculates agent routing weights based on performance.
 * Called periodically to optimize which agents get routed tasks.
 *
 * Weight formula: (completions * 0.4) + (avg_value * 0.3) + (conversion_rate * 100 * 0.3)
 * Normalized to 0-10 range.
 *
 * @returns {Promise<{ agents_updated, weights }>}
 */
async function feedbackLoop() {
  // Get agent performance data
  const { data: performance } = await supabase.rpc('flywheel_agent_performance') || { data: [] };

  const agents = performance || [];
  if (agents.length === 0) {
    return { agents_updated: 0, weights: [] };
  }

  var ts = now();
  var updated = 0;

  // Find max values for normalization
  var maxCompletions = 1;
  var maxValue = 1;
  for (var i = 0; i < agents.length; i++) {
    if ((agents[i].completions || 0) > maxCompletions) maxCompletions = agents[i].completions;
    if ((agents[i].avg_value || 0) > maxValue) maxValue = agents[i].avg_value;
  }

  // Upsert all agent weights
  for (var j = 0; j < agents.length; j++) {
    var agent = agents[j];
    var completions = agent.completions || 0;
    var avgVal = agent.avg_value || 0;
    var convRate = completions > 0 ? (agent.conversions || 0) / completions : 0;

    // Normalized weight: higher is better
    var weight = +(
      ((completions / maxCompletions) * 0.4 +
      (avgVal / maxValue) * 0.3 +
      (convRate * 0.3)) * 10
    ).toFixed(4);

    const { error } = await supabase
      .from('agent_routing_weights')
      .upsert({
        agent_id: agent.agent_id,
        weight: weight,
        tasks_completed: completions,
        avg_value: +(avgVal.toFixed(2)),
        conversion_rate: +(convRate.toFixed(4)),
        updated_at: ts,
      }, { onConflict: 'agent_id' });

    if (!error) updated++;
  }

  // Fetch updated weights
  const { data: weights } = await supabase
    .from('agent_routing_weights')
    .select('*')
    .order('weight', { ascending: false });

  return {
    agents_updated: updated,
    weights: weights || [],
  };
}

// -- Exports ----------------------------------------------------------------
module.exports = {
  captureSignal,
  getInsights,
  feedbackLoop,
};
