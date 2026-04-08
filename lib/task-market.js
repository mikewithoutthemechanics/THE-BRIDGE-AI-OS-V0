// =============================================================================
// BRIDGE AI OS — Task Marketplace (v2)
// SQLite-backed task posting, claiming, escrow, and settlement pipeline.
// Lifecycle: POSTED → CLAIMED → EXECUTING → COMPLETED/FAILED → SETTLED
// =============================================================================
'use strict';

const crypto = require('crypto');
const path   = require('path');
const ledger = require('./agent-ledger');

// ── SQLite setup ───────────────────────────────────────────────────────────
let Database;
try {
  Database = require('better-sqlite3');
} catch (_) {
  Database = null;
}

const DB_PATH = path.join(__dirname, '..', 'task-market.db');
let _db = null;

function db() {
  if (_db) return _db;
  if (!Database) throw new Error('better-sqlite3 not installed — task marketplace requires it');
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.exec(`
    CREATE TABLE IF NOT EXISTS tasks_market (
      id              TEXT PRIMARY KEY,
      poster_agent    TEXT NOT NULL,
      claimer_agent   TEXT,
      title           TEXT NOT NULL,
      description     TEXT DEFAULT '',
      reward_brdg     REAL NOT NULL,
      escrow_amount   REAL NOT NULL DEFAULT 0,
      status          TEXT NOT NULL DEFAULT 'POSTED',
      result          TEXT,
      posted_at       TEXT NOT NULL DEFAULT (datetime('now')),
      claimed_at      TEXT,
      completed_at    TEXT,
      settled_at      TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks_market(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_poster ON tasks_market(poster_agent);
    CREATE INDEX IF NOT EXISTS idx_tasks_claimer ON tasks_market(claimer_agent);
  `);
  return _db;
}

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
const CLAIMER_PCT  = 0.94;  // 94% to the agent who did the work
const TREASURY_PCT = 0.05;  // 5% system fee to treasury
const BURN_PCT     = 0.01;  // 1% burned (deflationary)
const TREASURY_AGENT = 'treasury';

// =============================================================================
// CORE FUNCTIONS
// =============================================================================

/**
 * Post a new task to the marketplace.
 * Escrows the reward amount from the poster's balance.
 *
 * @param {string} posterAgent - ID of the agent posting the task
 * @param {string} title       - Short task title
 * @param {string} description - Detailed description
 * @param {number} rewardBrdg  - BRDG reward amount (will be escrowed)
 * @returns {object} The created task row
 */
function postTask(posterAgent, title, description, rewardBrdg) {
  if (!posterAgent) throw new Error('posterAgent is required');
  if (!title)       throw new Error('title is required');
  if (!rewardBrdg || rewardBrdg <= 0) throw new Error('rewardBrdg must be positive');

  // Ensure poster has funds and lock them in escrow
  ledger.ensureAgent(posterAgent);
  const available = ledger.getAvailable(posterAgent);
  if (available < rewardBrdg) {
    throw new Error(
      'Insufficient funds: ' + posterAgent + ' has ' + available.toFixed(2) +
      ' BRDG available, needs ' + rewardBrdg
    );
  }

  // Lock funds in escrow
  ledger.escrowLock(posterAgent, rewardBrdg, 'escrow:task_post:' + title);

  const id = genTaskId();
  const d = db();
  d.prepare(
    'INSERT INTO tasks_market (id, poster_agent, title, description, reward_brdg, escrow_amount, status, posted_at) ' +
    "VALUES (?, ?, ?, ?, ?, ?, 'POSTED', ?)"
  ).run(id, posterAgent, title, description || '', rewardBrdg, rewardBrdg, now());

  return d.prepare('SELECT * FROM tasks_market WHERE id = ?').get(id);
}

/**
 * Claim a posted task. Moves status to CLAIMED.
 *
 * @param {string} taskId       - ID of the task to claim
 * @param {string} claimerAgent - ID of the agent claiming the task
 * @returns {object} The updated task row
 */
function claimTask(taskId, claimerAgent) {
  if (!taskId || !claimerAgent) throw new Error('taskId and claimerAgent are required');

  const d = db();
  const task = d.prepare('SELECT * FROM tasks_market WHERE id = ?').get(taskId);
  if (!task) throw new Error('Task not found');
  if (task.status !== 'POSTED') throw new Error('Cannot claim: task is ' + task.status);
  if (task.poster_agent === claimerAgent) throw new Error('Cannot claim your own task');

  d.prepare(
    "UPDATE tasks_market SET claimer_agent = ?, status = 'CLAIMED', claimed_at = ? WHERE id = ?"
  ).run(claimerAgent, now(), taskId);

  return d.prepare('SELECT * FROM tasks_market WHERE id = ?').get(taskId);
}

/**
 * Move a claimed task to EXECUTING status.
 *
 * @param {string} taskId - ID of the task
 * @returns {object} The updated task row
 */
function startTask(taskId) {
  const d = db();
  const task = d.prepare('SELECT * FROM tasks_market WHERE id = ?').get(taskId);
  if (!task) throw new Error('Task not found');
  if (task.status !== 'CLAIMED') throw new Error('Cannot start: task is ' + task.status);

  d.prepare("UPDATE tasks_market SET status = 'EXECUTING' WHERE id = ?").run(taskId);
  return d.prepare('SELECT * FROM tasks_market WHERE id = ?').get(taskId);
}

/**
 * Complete a task. Marks it COMPLETED then settles the payment:
 *   94% to claimer, 5% to treasury, 1% burned.
 *
 * @param {string} taskId - ID of the task
 * @param {string} result - Output / deliverable from the agent
 * @returns {object} { task, settlement }
 */
function completeTask(taskId, result) {
  const d = db();
  const task = d.prepare('SELECT * FROM tasks_market WHERE id = ?').get(taskId);
  if (!task) throw new Error('Task not found');
  if (task.status !== 'CLAIMED' && task.status !== 'EXECUTING') {
    throw new Error('Cannot complete: task is ' + task.status);
  }
  if (!task.claimer_agent) throw new Error('No claimer assigned');

  const completedAt = now();
  d.prepare(
    "UPDATE tasks_market SET status = 'COMPLETED', result = ?, completed_at = ? WHERE id = ?"
  ).run(result || '', completedAt, taskId);

  // ── Settle payment ─────────────────────────────────────────────────────
  const reward = task.escrow_amount;
  const claimerPay  = Math.round(reward * CLAIMER_PCT * 100) / 100;
  const treasuryFee = Math.round(reward * TREASURY_PCT * 100) / 100;
  const burnAmount  = Math.round(reward * BURN_PCT * 100) / 100;

  // Release escrow: pay claimer
  ledger.escrowRelease(
    task.poster_agent, claimerPay, task.claimer_agent,
    'task_payment:' + taskId
  );

  // Release escrow: pay treasury fee
  ledger.ensureAgent(TREASURY_AGENT);
  ledger.escrowRelease(
    task.poster_agent, treasuryFee, TREASURY_AGENT,
    'task_fee:' + taskId
  );

  // Release escrow: burn (recorded but not transferred)
  ledger.escrowBurn(task.poster_agent, burnAmount, 'task_burn:' + taskId);

  const settledAt = now();
  d.prepare(
    "UPDATE tasks_market SET status = 'SETTLED', settled_at = ? WHERE id = ?"
  ).run(settledAt, taskId);

  return {
    task: d.prepare('SELECT * FROM tasks_market WHERE id = ?').get(taskId),
    settlement: {
      reward: reward,
      claimer_paid: claimerPay,
      treasury_fee: treasuryFee,
      burned: burnAmount,
      claimer_agent: task.claimer_agent,
      poster_agent: task.poster_agent,
    },
  };
}

/**
 * Fail a task. Returns escrowed funds to the poster.
 *
 * @param {string} taskId - ID of the task
 * @param {string} reason - Why the task failed
 * @returns {object} The updated task row
 */
function failTask(taskId, reason) {
  const d = db();
  const task = d.prepare('SELECT * FROM tasks_market WHERE id = ?').get(taskId);
  if (!task) throw new Error('Task not found');
  if (task.status === 'SETTLED' || task.status === 'FAILED') {
    throw new Error('Cannot fail: task is already ' + task.status);
  }

  // Return escrow to poster
  ledger.escrowReturn(
    task.poster_agent, task.escrow_amount,
    'task_refund:' + taskId + ':' + (reason || 'failed')
  );

  d.prepare(
    "UPDATE tasks_market SET status = 'FAILED', result = ?, completed_at = ? WHERE id = ?"
  ).run(reason || 'Task failed', now(), taskId);

  return d.prepare('SELECT * FROM tasks_market WHERE id = ?').get(taskId);
}

/**
 * List tasks, optionally filtered by status.
 *
 * @param {string} [status] - Filter by status (POSTED, CLAIMED, EXECUTING, etc.)
 * @param {number} [limit=50] - Max results
 * @returns {Array} Task rows
 */
function listTasks(status, limit) {
  const lim = limit || 50;
  const d = db();
  if (status && typeof status === 'string') {
    return d.prepare(
      'SELECT * FROM tasks_market WHERE status = ? ORDER BY posted_at DESC LIMIT ?'
    ).all(status.toUpperCase(), lim);
  }
  return d.prepare(
    'SELECT * FROM tasks_market ORDER BY posted_at DESC LIMIT ?'
  ).all(lim);
}

/**
 * Get all tasks an agent has posted or claimed.
 *
 * @param {string} agentId - Agent ID
 * @returns {Array} Task rows
 */
function getAgentTasks(agentId) {
  return db().prepare(
    'SELECT * FROM tasks_market WHERE poster_agent = ? OR claimer_agent = ? ORDER BY posted_at DESC'
  ).all(agentId, agentId);
}

/**
 * Get a single task by ID.
 *
 * @param {string} id - Task ID
 * @returns {object|null}
 */
function getTask(id) {
  return db().prepare('SELECT * FROM tasks_market WHERE id = ?').get(id) || null;
}

// =============================================================================
// AUTO-MATCH: finds unmatched tasks and assigns the best available agent
// =============================================================================

/**
 * Score how well an agent's skills match a task's title + description.
 * Returns a number 0..N where N = number of skill keyword hits.
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
 * Skips agents that already have an active (CLAIMED/EXECUTING) task.
 *
 * @returns {object} { matched, total, results }
 */
function autoMatchTasks() {
  const d = db();
  const posted = d.prepare("SELECT * FROM tasks_market WHERE status = 'POSTED'").all();
  if (posted.length === 0) return { matched: 0, total: 0, results: [] };

  var activeAgents = AGENT_REGISTRY.filter(function (a) { return a.status === 'active'; });
  var results = [];

  // Track which agents are already busy (have CLAIMED or EXECUTING tasks)
  var busySet = {};
  var busyRows = d.prepare(
    "SELECT claimer_agent FROM tasks_market WHERE status IN ('CLAIMED', 'EXECUTING') AND claimer_agent IS NOT NULL"
  ).all();
  for (var b = 0; b < busyRows.length; b++) {
    busySet[busyRows[b].claimer_agent] = true;
  }

  for (var t = 0; t < posted.length; t++) {
    var task = posted[t];
    var bestAgent = null;
    var bestScore = 0;

    // Find best agent by skill match, excluding poster and busy agents
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

    // Fallback: if no skill match, pick any available agent
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
        claimTask(task.id, bestAgent.id);
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

function getMarketStats() {
  var d = db();
  var total = d.prepare('SELECT COUNT(*) as c FROM tasks_market').get().c;
  var byStatus = {};
  var statusRows = d.prepare('SELECT status, COUNT(*) as c FROM tasks_market GROUP BY status').all();
  for (var i = 0; i < statusRows.length; i++) {
    byStatus[statusRows[i].status] = statusRows[i].c;
  }
  var totalReward = d.prepare('SELECT COALESCE(SUM(reward_brdg), 0) as s FROM tasks_market').get().s;
  var totalSettled = d.prepare("SELECT COALESCE(SUM(reward_brdg), 0) as s FROM tasks_market WHERE status = 'SETTLED'").get().s;
  var totalEscrowed = d.prepare(
    "SELECT COALESCE(SUM(escrow_amount), 0) as s FROM tasks_market WHERE status IN ('POSTED', 'CLAIMED', 'EXECUTING')"
  ).get().s;

  return {
    total_tasks: total,
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
};
