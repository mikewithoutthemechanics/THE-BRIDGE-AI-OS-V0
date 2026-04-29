// =============================================================================
// BRIDGE AI OS — Task Marketplace (v2, Supabase-backed)
// Supabase-backed task posting, claiming, escrow, and settlement pipeline.
// Lifecycle: POSTED -> CLAIMED -> EXECUTING -> COMPLETED/FAILED -> SETTLED
// =============================================================================
'use strict';

const crypto = require('crypto');
const ledger = require('./agent-ledger');
const { supabase, isConfigured } = require('./supabase');

// ── Agent registry reference (for autoMatch) ───────────────────────────────
const AGENT_REGISTRY = [
  { id: 'agent-1-gateway', skills: ['routing', 'load_balancing', 'health_monitoring'], status: 'active' },
  { id: 'agent-2a-dashboard', skills: ['ui_rendering', 'data_aggregation', 'event_streaming'], status: 'active' },
  { id: 'agent-3a-data', skills: ['etl', 'indexing', 'caching', 'rag'], status: 'active' },
  { id: 'agent-4a-auth', skills: ['jwt', 'keyforge', 'mfa', 'oauth'], status: 'active' },
  { id: 'agent-5a-testing', skills: ['integration_testing', 'load_testing', 'security_scanning'], status: 'active' },
  { id: 'agent-6a-governance', skills: ['policy_enforcement', 'audit', 'sdg_tracking'], status: 'active' },
  { id: 'agent-l2-verifier', skills: ['contract_verification', 'conflict_detection', 'consensus'], status: 'active' },
  { id: 'agent-l2-streamer', skills: ['event_streaming', 'replication', 'sync'], status: 'active' },
  { id: 'agent-l3-minimax', skills: ['minimax', 'game_theory', 'resource_optimization'], status: 'active' },
  { id: 'agent-svg-decision', skills: ['ethical_filter', 'confidence_scoring', 'action_routing'], status: 'active' },
  { id: 'agent-svg-economy', skills: ['circuit_breaker', 'exposure_tracking', 'treasury_flow'], status: 'active' },
  { id: 'agent-svg-speech', skills: ['tts', 'stt', 'lip_sync', 'emotion_voice'], status: 'active' },
  { id: 'agent-svg-swarm', skills: ['latency_monitor', 'utilization_tracking', 'fault_detection'], status: 'active' },
  { id: 'agent-svg-treasury', skills: ['revenue_tracking', 'ubi_distribution', 'cost_optimization'], status: 'active' },
  { id: 'agent-svg-twins', skills: ['evolution', 'competition', 'teaching', 'leaderboard'], status: 'active' },
  { id: 'agent-svg-youtube', skills: ['video_discovery', 'transcript_extraction', 'skill_learning'], status: 'active' },
  { id: 'agent-svg-flow', skills: ['workflow_execution', 'step_routing', 'error_handling'], status: 'active' },
  { id: 'agent-biz-sales', skills: ['lead_gen', 'outreach', 'deal_closing', 'crm'], status: 'active' },
  { id: 'agent-biz-support', skills: ['ticket_handling', 'knowledge_base', 'escalation'], status: 'active' },
  { id: 'agent-biz-research', skills: ['market_analysis', 'competitor_intel', 'trend_detection'], status: 'active' },
  { id: 'agent-biz-marketing', skills: ['campaign_management', 'seo', 'social_media', 'email'], status: 'active' },
  { id: 'agent-biz-legal', skills: ['contract_review', 'compliance', 'popia', 'gdpr'], status: 'active' },
  { id: 'agent-biz-finance', skills: ['invoicing', 'debt_collection', 'payroll', 'reporting'], status: 'active' },
  { id: 'agent-biz-dev', skills: ['coding', 'deployment', 'testing', 'ci_cd'], status: 'active' },
  { id: 'agent-biz-trading', skills: ['momentum', 'arbitrage', 'sentiment', 'risk_management'], status: 'active' },
  { id: 'ban-ryan', skills: ['task_execution', 'high_trust'], status: 'active' },
  { id: 'ban-mike', skills: ['task_execution', 'medium_trust'], status: 'active' },
  { id: 'ban-marvin', skills: ['task_execution', 'learning'], status: 'active' },
  { id: 'prime-001', skills: ['reason', 'plan', 'execute', 'trade', 'teach', 'communicate', 'deploy', 'heal'], status: 'active' },
  { id: 'twin-empe-001', skills: ['reasoning', 'coding', 'trading', 'communication', 'teaching'], status: 'active' },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function genTaskId() {
  return 'task_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
}

function now() {
  return new Date().toISOString();
}

// Fee split constants
const CLAIMER_PCT  = 0.95;  // 95% to the agent who did the work
const TREASURY_PCT = 0.05;  // 5% system fee to treasury
const BURN_PCT     = 0.00;  // 0% burn — Config E: zero leakage
const TREASURY_AGENT = 'treasury';

// =============================================================================
// CORE FUNCTIONS
// =============================================================================

/**
 * Post a new task to the marketplace.
 * Escrows the reward amount from the poster's balance.
 */
async function postTask(posterAgent, title, description, rewardBrdg, opts) {
  if (!isConfigured || !supabase) return { id: genTaskId(), status: 'OFFLINE', _offline: true };
  if (!posterAgent) throw new Error('posterAgent is required');
  if (!title)       throw new Error('title is required');
  if (!rewardBrdg || rewardBrdg <= 0) throw new Error('rewardBrdg must be positive');

  // Ensure poster has funds and lock them in escrow
  await ledger.ensureAgent(posterAgent);
  const available = await ledger.getAvailable(posterAgent);
  if (available < rewardBrdg) {
    throw new Error(
      'Insufficient funds: ' + posterAgent + ' has ' + available.toFixed(2) +
      ' BRDG available, needs ' + rewardBrdg
    );
  }

  // Lock funds in escrow
  await ledger.escrowLock(posterAgent, rewardBrdg, 'escrow:task_post:' + title);

  // Determine task source
  var source = (opts && opts.source === 'external') ? 'external' : 'internal';

  const id = genTaskId();
  const ts = now();

  const { data: task, error } = await supabase
    .from('tasks_market')
    .insert({
      id,
      poster_agent: posterAgent,
      title,
      description: description || '',
      reward_brdg: rewardBrdg,
      escrow_amount: rewardBrdg,
      status: 'POSTED',
      source,
      posted_at: ts,
    })
    .select()
    .single();

  if (error) throw new Error('postTask insert failed: ' + error.message);
  return task;
}

/**
 * Claim a posted task. Moves status to CLAIMED.
 */
async function claimTask(taskId, claimerAgent) {
  if (!isConfigured || !supabase) return { id: taskId, status: 'OFFLINE', _offline: true };
  if (!taskId || !claimerAgent) throw new Error('taskId and claimerAgent are required');

  const { data: task, error: getErr } = await supabase
    .from('tasks_market')
    .select('*')
    .eq('id', taskId)
    .single();

  if (getErr || !task) throw new Error('Task not found');
  if (task.status !== 'POSTED') throw new Error('Cannot claim: task is ' + task.status);
  if (task.poster_agent === claimerAgent) throw new Error('Cannot claim your own task');

  const { data: updated, error: updErr } = await supabase
    .from('tasks_market')
    .update({
      claimer_agent: claimerAgent,
      status: 'CLAIMED',
      claimed_at: now(),
    })
    .eq('id', taskId)
    .select()
    .single();

  if (updErr) throw new Error('claimTask update failed: ' + updErr.message);
  return updated;
}

/**
 * Move a claimed task to EXECUTING status.
 */
async function startTask(taskId) {
  if (!isConfigured || !supabase) return { id: taskId, status: 'OFFLINE', _offline: true };
  const { data: task, error: getErr } = await supabase
    .from('tasks_market')
    .select('*')
    .eq('id', taskId)
    .single();

  if (getErr || !task) throw new Error('Task not found');
  if (task.status !== 'CLAIMED') throw new Error('Cannot start: task is ' + task.status);

  const { data: updated, error: updErr } = await supabase
    .from('tasks_market')
    .update({ status: 'EXECUTING' })
    .eq('id', taskId)
    .select()
    .single();

  if (updErr) throw new Error('startTask update failed: ' + updErr.message);
  return updated;
}

/**
 * Complete a task. Marks it COMPLETED then settles the payment:
 *   94% to claimer, 5% to treasury, 1% burned.
 */
async function completeTask(taskId, result) {
  if (!isConfigured || !supabase) return { id: taskId, status: 'OFFLINE', _offline: true };
  const { data: task, error: getErr } = await supabase
    .from('tasks_market')
    .select('*')
    .eq('id', taskId)
    .single();

  if (getErr || !task) throw new Error('Task not found');
  if (task.status === 'COMPLETED' || task.status === 'SETTLED') {
    return { id: taskId, status: task.status, reward_brdg: task.escrow_amount || 0, claimer: task.claimer_agent, _idempotent: true };
  }
  if (task.status !== 'CLAIMED' && task.status !== 'EXECUTING') {
    throw new Error('Cannot complete: task is ' + task.status);
  }
  if (!task.claimer_agent) throw new Error('No claimer assigned');

  const completedAt = now();
  await supabase
    .from('tasks_market')
    .update({ status: 'COMPLETED', result: result || '', completed_at: completedAt })
    .eq('id', taskId);

  // ── Settle payment ─────────────────────────────────────────────────────
  const reward = task.escrow_amount || 0;
  if (reward <= 0) {
    // Task has zero reward — mark settled without payment
    await supabase.from('tasks_market').update({ status: 'SETTLED', settled_at: now() }).eq('id', taskId).catch(() => {});
    return { task: { id: taskId, status: 'SETTLED' }, settlement: { reward: 0, claimer_paid: 0, treasury_fee: 0, burned: 0, claimer_agent: task.claimer_agent, poster_agent: task.poster_agent } };
  }
  const claimerPay  = Math.round(reward * CLAIMER_PCT * 100) / 100;
  const treasuryFee = Math.round(reward * TREASURY_PCT * 100) / 100;
  const burnAmount  = Math.round(reward * BURN_PCT * 100) / 100;

  // Release escrow: pay claimer (guard against zero after rounding)
  if (claimerPay > 0) {
    await ledger.escrowRelease(
      task.poster_agent, claimerPay, task.claimer_agent,
      'task_payment:' + taskId
    );
  }

  // Release escrow: pay treasury fee
  if (treasuryFee > 0) {
    await ledger.ensureAgent(TREASURY_AGENT);
    await ledger.escrowRelease(
      task.poster_agent, treasuryFee, TREASURY_AGENT,
      'task_fee:' + taskId
    );
  }

  // Release escrow: burn (guard against zero after rounding)
  if (burnAmount > 0) {
    await ledger.escrowBurn(task.poster_agent, burnAmount, 'task_burn:' + taskId);
  }

  const settledAt = now();
  const { data: settled, error: settleErr } = await supabase
    .from('tasks_market')
    .update({ status: 'SETTLED', settled_at: settledAt })
    .eq('id', taskId)
    .select()
    .single();

  if (settleErr) {
    console.warn('[TASK-MARKET] settle update warning:', settleErr.message);
    // Return a safe structure even if DB update failed
    settled = settled || { id: taskId, status: 'SETTLED', claimer_agent: task.claimer_agent };
  }

  // ── Record fee revenue to proof chain + system treasury ────────────────
  if (treasuryFee > 0) {
    try {
      const proofStore = require('./proof-store');
      const db = require('./db');
      await proofStore.recordPayment({
        id: 'task_fee:' + taskId,
        amount: treasuryFee,
        currency: 'BRDG',
        source: 'task-marketplace',
        webhookId: taskId,
        webhookSignature: { method: 'task_settlement', verified: true },
        timestamp: settledAt,
        meta: { taskId, poster: task.poster_agent, claimer: task.claimer_agent, reward },
      });
      await db.addToTreasury(treasuryFee, 'task_fee:' + taskId);
    } catch (_) {}
  }

  return {
    task: settled || { id: taskId, status: 'SETTLED' },
    settlement: {
      reward: reward || 0,
      claimer_paid: claimerPay || 0,
      treasury_fee: treasuryFee,
      burned: burnAmount,
      claimer_agent: task.claimer_agent,
      poster_agent: task.poster_agent,
    },
  };
}

/**
 * Fail a task. Returns escrowed funds to the poster.
 */
async function failTask(taskId, reason) {
  if (!isConfigured || !supabase) return { id: taskId, status: 'OFFLINE', _offline: true };
  const { data: task, error: getErr } = await supabase
    .from('tasks_market')
    .select('*')
    .eq('id', taskId)
    .single();

  if (getErr || !task) throw new Error('Task not found');
  if (task.status === 'SETTLED' || task.status === 'FAILED') {
    throw new Error('Cannot fail: task is already ' + task.status);
  }

  // Return escrow to poster
  await ledger.escrowReturn(
    task.poster_agent, task.escrow_amount,
    'task_refund:' + taskId + ':' + (reason || 'failed')
  );

  const { data: updated, error: updErr } = await supabase
    .from('tasks_market')
    .update({
      status: 'FAILED',
      result: reason || 'Task failed',
      completed_at: now(),
    })
    .eq('id', taskId)
    .select()
    .single();

  if (updErr) throw new Error('failTask update failed: ' + updErr.message);
  return updated;
}

/**
 * List tasks, optionally filtered by status.
 */
async function listTasks(status, limit) {
  if (!isConfigured || !supabase) return [];
  const lim = limit || 50;
  let query = supabase
    .from('tasks_market')
    .select('*')
    .order('posted_at', { ascending: false })
    .limit(lim);

  if (status && typeof status === 'string') {
    query = query.eq('status', status.toUpperCase());
  }

  const { data, error } = await query;
  if (error) throw new Error('listTasks failed: ' + error.message);
  return data || [];
}

/**
 * Get all tasks an agent has posted or claimed.
 */
async function getAgentTasks(agentId) {
  if (!isConfigured || !supabase) return [];
  const { data, error } = await supabase
    .from('tasks_market')
    .select('*')
    .or('poster_agent.eq.' + agentId + ',claimer_agent.eq.' + agentId)
    .order('posted_at', { ascending: false });

  if (error) throw new Error('getAgentTasks failed: ' + error.message);
  return data || [];
}

/**
 * Get a single task by ID.
 */
async function getTask(id) {
  if (!isConfigured || !supabase) return null;
  const { data, error } = await supabase
    .from('tasks_market')
    .select('*')
    .eq('id', id)
    .single();

  if (error && error.code !== 'PGRST116') throw new Error('getTask failed: ' + error.message);
  return data || null;
}

// =============================================================================
// AUTO-MATCH: finds unmatched tasks and assigns the best available agent
// =============================================================================

/**
 * Score how well an agent's skills match a task's title + description.
 */
function skillScore(agent, task) {
  const text = (task.title + ' ' + task.description).toLowerCase();
  var score = 0;
  for (var i = 0; i < agent.skills.length; i++) {
    var keywords = agent.skills[i].toLowerCase().split('_');
    for (var j = 0; j < keywords.length; j++) {
      if (keywords[j].length >= 3 && text.indexOf(keywords[j]) !== -1) {
        score += 1;
      }
    }
  }
  return score;
}

/**
 * Auto-match all POSTED tasks to the best available agent based on skills.
 */
async function autoMatchTasks() {
  if (!isConfigured || !supabase) return { matched: 0, total: 0, results: [] };
  const { data: posted, error: postErr } = await supabase
    .from('tasks_market')
    .select('*')
    .eq('status', 'POSTED');

  if (postErr || !posted || posted.length === 0) {
    return { matched: 0, total: 0, results: [] };
  }

  var activeAgents = AGENT_REGISTRY.filter(function (a) { return a.status === 'active'; });
  var results = [];

  // Track which agents are already busy
  const { data: busyRows } = await supabase
    .from('tasks_market')
    .select('claimer_agent')
    .in('status', ['CLAIMED', 'EXECUTING'])
    .not('claimer_agent', 'is', null);

  var busySet = {};
  (busyRows || []).forEach(function(r) {
    busySet[r.claimer_agent] = true;
  });

  for (var t = 0; t < posted.length; t++) {
    var task = posted[t];
    var bestAgent = null;
    var bestScore = 0;

    for (var a = 0; a < activeAgents.length; a++) {
      var agent = activeAgents[a];
      if (agent.id === task.poster_agent) continue;
      if (busySet[agent.id]) continue;

      var s = skillScore(agent, task);
      if (s > bestScore) {
        bestScore = s;
        bestAgent = agent;
      }
    }

    // Fallback: pick any available agent
    if (!bestAgent) {
      for (var f = 0; f < activeAgents.length; f++) {
        if (activeAgents[f].id !== task.poster_agent && !busySet[activeAgents[f].id]) {
          bestAgent = activeAgents[f];
          bestScore = 0;
          break;
        }
      }
    }

    if (bestAgent) {
      try {
        await claimTask(task.id, bestAgent.id);
        busySet[bestAgent.id] = true;
        results.push({
          taskId: task.id,
          title: task.title,
          claimerAgent: bestAgent.id,
          score: bestScore,
        });
      } catch (e) {
        results.push({
          taskId: task.id,
          title: task.title,
          error: e.message,
        });
      }
    }
  }

  return {
    matched: results.filter(function (r) { return !r.error; }).length,
    total: posted.length,
    results: results,
  };
}

// =============================================================================
// MARKETPLACE STATS
// =============================================================================

async function getMarketStats() {
  if (!isConfigured || !supabase) return { total: 0, byStatus: {}, totalReward: 0, totalSettled: 0, totalEscrowed: 0, _offline: true };

  // Aggregated in Postgres — see supabase/migrations/20260417000000_tasks_market_perf.sql
  const { data: rows, error } = await supabase.rpc('market_stats');
  if (error) throw new Error('getMarketStats rpc failed: ' + error.message);

  var byStatus = {};
  var totalTasks = 0;
  var totalReward = 0;
  var totalSettled = 0;
  var totalEscrowed = 0;

  (rows || []).forEach(function(r) {
    var n = Number(r.n) || 0;
    byStatus[r.status] = n;
    totalTasks += n;
    totalReward += r.total_reward || 0;
    totalEscrowed += r.escrowed || 0;
    if (r.status === 'SETTLED') totalSettled += r.total_reward || 0;
  });

  return {
    total_tasks: totalTasks,
    by_status: byStatus,
    total_reward_brdg: totalReward,
    total_settled_brdg: totalSettled,
    total_escrowed_brdg: totalEscrowed,
    fee_structure: {
      claimer_pct: (CLAIMER_PCT * 100) + '%',
      treasury_pct: (TREASURY_PCT * 100) + '%',
      burn_pct: (BURN_PCT * 100) + '%',
    },
  };
}

// =============================================================================
// GENESIS SEED — populate marketplace with starter tasks on first boot
// Idempotent: skips if tasks already exist.
// =============================================================================

var STARTER_TASKS = [
  { poster: 'prime-aurora',   title: 'Generate lead nurture email sequence',          desc: 'Write a 5-email nurture sequence for SaaS trial signups targeting SMB market',    reward: 500,  skills: ['marketing', 'email', 'copywriting'] },
  { poster: 'prime-atlas',    title: 'Analyse competitor pricing landscape',           desc: 'Research 10 AI-OS competitors, extract pricing models, identify gaps',              reward: 750,  skills: ['research', 'analysis', 'market_intelligence'] },
  { poster: 'prime-vega',     title: 'Build CRM contact deduplication pipeline',      desc: 'Detect and merge duplicate contacts in Supabase using fuzzy name + email match',   reward: 1000, skills: ['coding', 'data', 'crm'] },
  { poster: 'prime-omega',    title: 'Draft POPIA compliance checklist',               desc: 'Create a POPIA compliance checklist for a SaaS platform handling SA user data',    reward: 600,  skills: ['legal', 'compliance', 'popia'] },
  { poster: 'prime-halo',     title: 'Design onboarding A/B test variants',           desc: 'Create 2 alternative onboarding flows for A/B testing: wizard vs. direct checkout', reward: 800,  skills: ['ux', 'product', 'experimentation'] },
  { poster: 'prime-nexus',    title: 'Write API integration guide for developers',    desc: 'Write clear docs for the Bridge AI OS REST API: auth, endpoints, rate limits',     reward: 550,  skills: ['technical_writing', 'api', 'docs'] },
  { poster: 'prime-sentinel', title: 'Audit gateway security headers',                desc: 'Review all HTTP security headers, CSP, CORS policies on the production gateway',   reward: 900,  skills: ['security', 'audit', 'infra'] },
  { poster: 'agent-biz-sales', title: 'Identify 50 high-value enterprise leads',     desc: 'Find 50 enterprise prospects in fintech, healthcare, logistics matching ICP',       reward: 1200, skills: ['lead_gen', 'research', 'crm'] },
  { poster: 'agent-biz-marketing', title: 'Design Q2 content calendar',              desc: 'Plan 30 pieces of content for LinkedIn, blog and email for April–June 2026',       reward: 700,  skills: ['content', 'social_media', 'planning'] },
  { poster: 'agent-biz-finance',  title: 'Reconcile payment provider transactions',  desc: 'Match PayFast webhook events to Supabase payment records, flag mismatches',        reward: 850,  skills: ['finance', 'reconciliation', 'data'] },
  { poster: 'bossbot-alpha',  title: 'Monitor API latency SLA breaches',             desc: 'Alert when any endpoint exceeds 500ms p95 over a 5-minute rolling window',         reward: 400,  skills: ['monitoring', 'infra', 'alerting'] },
  { poster: 'bossbot-beta',   title: 'Auto-retry failed LLM inference jobs',         desc: 'Implement exponential backoff retry for LLM calls that return 429 or 503',         reward: 650,  skills: ['coding', 'llm', 'reliability'] },
];

async function seedStarterTasks() {
  if (!isConfigured || !supabase) return;
  // Check if marketplace already has tasks
  const { count, error: countErr } = await supabase
    .from('tasks_market')
    .select('*', { count: 'exact', head: true });

  if (countErr) {
    console.warn('[task-market] seedStarterTasks count failed:', countErr.message);
    return;
  }

  if ((count || 0) > 0) return; // already has tasks

  var ts = now();
  var rows = STARTER_TASKS.map(function(t, i) {
    return {
      id:           'genesis_task_' + (i + 1).toString().padStart(3, '0'),
      poster_agent: t.poster,
      title:        t.title,
      description:  t.desc,
      reward_brdg:  t.reward,
      escrow_amount: 0,  // genesis tasks: no escrow lock needed
      status:       'POSTED',
      source:       'internal',
      posted_at:    ts,
    };
  });

  const { error: insErr } = await supabase
    .from('tasks_market')
    .upsert(rows, { onConflict: 'id', ignoreDuplicates: true });

  if (insErr) {
    console.error('[task-market] seedStarterTasks insert failed:', insErr.message);
  } else {
    console.log('[task-market] Seeded ' + rows.length + ' starter tasks into marketplace');
  }
}

module.exports = {
  postTask: postTask,
  claimTask: claimTask,
  startTask: startTask,
  completeTask: completeTask,
  failTask: failTask,
  listTasks: listTasks,
  getAgentTasks: getAgentTasks,
  getTask: getTask,
  autoMatchTasks: autoMatchTasks,
  getMarketStats: getMarketStats,
  seedStarterTasks: seedStarterTasks,
};
