// =============================================================================
// BRIDGE AI OS — Revenue Engine
// Real usage → invoice generation. No simulation, no Math.random().
// Reads actual agent task completions + user actions from Supabase.
// =============================================================================
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const PORT = parseInt(process.env.REVENUE_ENGINE_PORT, 10) || 6070;
const BILLING_INTERVAL = parseInt(process.env.BILLING_INTERVAL, 10) || 60000;
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

const isConfigured = !!(
  SUPABASE_URL &&
  SUPABASE_SERVICE_KEY &&
  SUPABASE_URL.startsWith('https://') &&
  !SUPABASE_URL.includes('your-project') &&
  SUPABASE_SERVICE_KEY.length > 20
);

let supabase = null;
if (isConfigured) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const app = express();
app.use(express.json());

// ── Stats ───────────────────────────────────────────────────────────────────
let stats = {
  cycles: 0,
  invoices_generated: 0,
  total_revenue_usd: 0,
  last_cycle_at: null,
  started_at: new Date().toISOString(),
  errors: 0,
};

// ── Pricing tiers (per action) ──────────────────────────────────────────────
const PRICING = {
  task_completion: 0.02,    // $0.02 per task settled
  llm_inference:  0.005,    // $0.005 per LLM call
  api_call:       0.001,    // $0.001 per API hit
  svg_render:     0.01,     // $0.01 per SVG skill execution
  agent_spawn:    0.05,     // $0.05 per new agent activation
};

// ── Revenue cycle ───────────────────────────────────────────────────────────
async function processRevenueCycle() {
  if (!isConfigured || !supabase) {
    return;
  }

  try {
    const cutoff = new Date(Date.now() - BILLING_INTERVAL).toISOString();

    // Count settled tasks since last cycle
    const { count: taskCount } = await supabase
      .from('tasks_market')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'SETTLED')
      .gte('settled_at', cutoff);

    // Count recent transactions (agent economy activity)
    const { count: txCount } = await supabase
      .from('agent_transactions')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', cutoff);

    const tasks = taskCount || 0;
    const txs = txCount || 0;

    if (tasks === 0 && txs === 0) {
      stats.cycles++;
      stats.last_cycle_at = new Date().toISOString();
      return;
    }

    const revenue = (tasks * PRICING.task_completion) + (txs * PRICING.api_call);

    // Write invoice record
    const { error } = await supabase.from('invoices').insert({
      cycle_id: `rev_${Date.now()}`,
      period_start: cutoff,
      period_end: new Date().toISOString(),
      tasks_settled: tasks,
      api_calls: txs,
      amount_usd: parseFloat(revenue.toFixed(4)),
      currency: 'USD',
      status: 'pending',
    });

    if (error) {
      // Table might not exist yet — log once, don't spam
      if (stats.errors === 0) {
        console.warn('[REVENUE] Invoice write failed (table may need creation):', error.message);
      }
      stats.errors++;
    } else {
      stats.invoices_generated++;
      stats.total_revenue_usd += revenue;
      console.log(`[REVENUE] Cycle #${stats.cycles + 1}: ${tasks} tasks, ${txs} API calls → $${revenue.toFixed(4)}`);
    }

    stats.cycles++;
    stats.last_cycle_at = new Date().toISOString();
  } catch (err) {
    if (stats.errors === 0) {
      console.warn('[REVENUE] Cycle error:', err.message);
    }
    stats.errors++;
  }
}

// ── Health + metrics endpoints ──────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'revenue-engine', supabase: isConfigured, stats });
});

app.get('/metrics', (_req, res) => {
  res.type('text/plain').send([
    `# HELP revenue_cycles_total Total revenue processing cycles`,
    `# TYPE revenue_cycles_total counter`,
    `revenue_cycles_total ${stats.cycles}`,
    `# HELP revenue_invoices_total Total invoices generated`,
    `# TYPE revenue_invoices_total counter`,
    `revenue_invoices_total ${stats.invoices_generated}`,
    `# HELP revenue_usd_total Total USD revenue tracked`,
    `# TYPE revenue_usd_total counter`,
    `revenue_usd_total ${stats.total_revenue_usd.toFixed(4)}`,
    `# HELP revenue_errors_total Total revenue cycle errors`,
    `# TYPE revenue_errors_total counter`,
    `revenue_errors_total ${stats.errors}`,
  ].join('\n') + '\n');
});

app.get('/stats', (_req, res) => res.json(stats));

app.get('/pricing', (_req, res) => res.json(PRICING));

// ── Start ───────────────────────────────────────────────────────────────────
let timer = null;

app.listen(PORT, () => {
  console.log(`[REVENUE] Engine running on http://localhost:${PORT}`);
  console.log(`[REVENUE] Supabase: ${isConfigured ? 'connected' : 'offline mode'}`);
  console.log(`[REVENUE] Billing interval: ${BILLING_INTERVAL / 1000}s`);

  if (isConfigured) {
    timer = setInterval(processRevenueCycle, BILLING_INTERVAL);
    // Run first cycle after 5s warmup
    setTimeout(processRevenueCycle, 5000);
  }
});

process.on('SIGTERM', () => {
  if (timer) clearInterval(timer);
  process.exit(0);
});
