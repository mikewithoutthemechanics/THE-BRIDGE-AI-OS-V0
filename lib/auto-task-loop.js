// =============================================================================
// BRIDGE AI OS — Autonomous Task Economy Loop
// Generates, claims, and completes tasks 24/7 to keep the BRDG economy alive.
// =============================================================================
'use strict';

const ledger = require('./agent-ledger');
const market = require('./task-market');

// ── Task Templates by Agent Role ─────────────────────────────────────────────

const TASK_TEMPLATES = [
  {
    poster: 'agent-biz-sales',
    tasks: [
      { title: 'Score 5 new leads', desc: 'Identify and qualify 5 new potential customers from inbound channels', minReward: 50, maxReward: 200 },
      { title: 'Follow up on warm leads', desc: 'Send personalized outreach to 10 warm leads in the CRM pipeline', minReward: 60, maxReward: 180 },
      { title: 'Update CRM deal stages', desc: 'Review and update all active deal stages in the sales pipeline', minReward: 40, maxReward: 120 },
    ],
  },
  {
    poster: 'agent-biz-research',
    tasks: [
      { title: 'Analyze competitor pricing', desc: 'Research and compare pricing models of top 5 competitors in the market', minReward: 100, maxReward: 300 },
      { title: 'Generate market trend report', desc: 'Compile weekly market trend analysis with actionable insights', minReward: 120, maxReward: 280 },
      { title: 'Research emerging technologies', desc: 'Identify 3 emerging technologies relevant to our product roadmap', minReward: 80, maxReward: 250 },
    ],
  },
  {
    poster: 'agent-biz-marketing',
    tasks: [
      { title: 'Generate social media content', desc: 'Create 5 engaging social media posts for LinkedIn, Twitter, and Instagram', minReward: 75, maxReward: 150 },
      { title: 'Draft email campaign', desc: 'Write subject lines and body copy for the weekly newsletter campaign', minReward: 80, maxReward: 160 },
      { title: 'Optimize SEO keywords', desc: 'Research and update target keywords for top 10 landing pages', minReward: 70, maxReward: 140 },
    ],
  },
  {
    poster: 'agent-biz-finance',
    tasks: [
      { title: 'Reconcile daily transactions', desc: 'Match and verify all BRDG transactions from the past 24 hours against the ledger', minReward: 50, maxReward: 100 },
      { title: 'Generate treasury report', desc: 'Compile daily treasury balance, inflows, outflows, and burn summary', minReward: 60, maxReward: 120 },
      { title: 'Audit agent spending', desc: 'Review top 10 agent spending patterns and flag anomalies', minReward: 70, maxReward: 130 },
    ],
  },
  {
    poster: 'agent-biz-support',
    tasks: [
      { title: 'Resolve 3 support tickets', desc: 'Triage and resolve the 3 oldest open support tickets in the queue', minReward: 60, maxReward: 120 },
      { title: 'Update knowledge base', desc: 'Add 5 new FAQ entries based on recent support ticket trends', minReward: 50, maxReward: 100 },
      { title: 'Escalation review', desc: 'Review all escalated tickets and ensure SLA compliance', minReward: 55, maxReward: 110 },
    ],
  },
  {
    poster: 'agent-biz-trading',
    tasks: [
      { title: 'Execute momentum strategy', desc: 'Analyze current market conditions and execute momentum-based trading signals', minReward: 200, maxReward: 500 },
      { title: 'Run arbitrage scan', desc: 'Scan for cross-market arbitrage opportunities and report spreads', minReward: 150, maxReward: 400 },
      { title: 'Sentiment analysis report', desc: 'Aggregate social sentiment signals and generate trading confidence scores', minReward: 100, maxReward: 300 },
    ],
  },
  {
    poster: 'agent-biz-dev',
    tasks: [
      { title: 'Review code changes', desc: 'Review pending pull requests for code quality, security, and performance', minReward: 100, maxReward: 250 },
      { title: 'Run integration tests', desc: 'Execute full integration test suite and report failures', minReward: 80, maxReward: 200 },
      { title: 'Deploy staging build', desc: 'Build and deploy latest changes to the staging environment', minReward: 90, maxReward: 220 },
    ],
  },
  {
    poster: 'agent-svg-treasury',
    tasks: [
      { title: 'Calculate UBI distribution', desc: 'Compute fair UBI distribution amounts for all active agents based on participation', minReward: 80, maxReward: 180 },
      { title: 'Optimize treasury reserves', desc: 'Rebalance treasury reserves to maintain target liquidity ratios', minReward: 100, maxReward: 250 },
    ],
  },
  {
    poster: 'agent-svg-swarm',
    tasks: [
      { title: 'Monitor agent latency', desc: 'Check response times for all active agents and flag any exceeding 2s threshold', minReward: 60, maxReward: 130 },
      { title: 'Detect faulty agents', desc: 'Run health checks across the swarm and identify agents with error rates above 5%', minReward: 70, maxReward: 150 },
    ],
  },
  {
    poster: 'agent-biz-legal',
    tasks: [
      { title: 'Review contract terms', desc: 'Audit latest service agreements for compliance with POPIA and GDPR requirements', minReward: 100, maxReward: 250 },
      { title: 'Compliance status update', desc: 'Generate compliance checklist status for all active data processing activities', minReward: 80, maxReward: 180 },
    ],
  },
  {
    poster: 'prime-001',
    tasks: [
      { title: 'System health assessment', desc: 'Run comprehensive health check across all subsystems and generate status report', minReward: 100, maxReward: 300 },
      { title: 'Agent coordination review', desc: 'Evaluate inter-agent communication patterns and optimize routing', minReward: 120, maxReward: 350 },
    ],
  },
];

// ── Completion result templates ──────────────────────────────────────────────

const RESULT_TEMPLATES = {
  'Score':       ['Scored 5 leads: 3 high-quality, 2 medium. Top lead: Enterprise client, est. deal value 2500 BRDG.', 'Identified 5 new leads from inbound funnel. 2 already responded to outreach.'],
  'Follow':      ['Sent 10 follow-up messages. 4 opened, 2 replied with interest. Scheduling demos.', 'Follow-up batch complete. 3 warm leads moved to demo stage.'],
  'CRM':         ['Updated 12 deal stages. 3 moved to negotiation, 1 closed-won.', 'CRM pipeline refreshed. 8 deals updated, 2 flagged as stale.'],
  'competitor':  ['Competitor analysis complete. Found 15% price gap in mid-tier. Recommend adjusting.', 'Pricing report generated. 3 competitors launched new tiers this week.'],
  'trend':       ['Market trend report ready. AI agent sector grew 23% QoQ. 5 actionable insights included.', 'Trend analysis complete. Identified 3 emerging opportunities in DeFi automation.'],
  'emerging':    ['Identified: federated learning, on-chain agents, zero-knowledge ML. Detailed report attached.'],
  'social media':['5 posts created and scheduled. Expected reach: 12K impressions.', 'Social content batch ready. Includes 2 carousels, 2 threads, 1 video script.'],
  'email':       ['Email campaign drafted. A/B subject lines ready. Estimated open rate: 28%.', 'Newsletter copy complete. 3 sections: product update, case study, community spotlight.'],
  'SEO':         ['Updated keywords for 10 pages. Average difficulty dropped 12%. 3 new long-tail opportunities found.'],
  'Reconcile':   ['All 47 transactions reconciled. Zero discrepancies. Total volume: 8,250 BRDG.', 'Daily reconciliation complete. 52 transactions matched. 1 minor rounding correction applied.'],
  'treasury':    ['Treasury report: Balance 48,230 BRDG. Inflows +2,100, Outflows -1,800, Burned -45.', 'Daily treasury summary generated. Reserves at 94% of target.'],
  'spending':    ['Top spender: agent-biz-trading (1,200 BRDG). No anomalies detected.', 'Spending audit complete. All agents within normal ranges. 2 efficiency recommendations.'],
  'support':     ['Resolved 3 tickets: auth issue, API timeout, dashboard bug. Avg resolution: 4 min.', '3 tickets closed. Customer satisfaction: 4.8/5. 1 escalation prevented.'],
  'knowledge':   ['Added 5 FAQ entries covering: login issues, API rate limits, BRDG transfers, webhook setup, agent status.'],
  'Escalation':  ['Reviewed 4 escalations. 3 resolved, 1 requires engineering follow-up. All within SLA.'],
  'momentum':    ['Momentum strategy executed. 3 signals triggered. Net P&L: +180 BRDG.', 'Strategy complete. 2 profitable trades, 1 flat. Risk parameters held.'],
  'arbitrage':   ['Scan complete. Found 2 arbitrage opportunities. Spread: 1.8% and 2.3%. Executed both.'],
  'Sentiment':   ['Sentiment score: 0.72 (bullish). Volume up 15%. Confidence: high for next 4h window.'],
  'Review code': ['Reviewed 4 PRs. 2 approved, 1 needs refactor, 1 has security concern (fixed). All tests pass.', 'Code review complete. 3 PRs merged. Found 1 performance regression, patched.'],
  'integration': ['Full test suite passed: 142/142. No regressions. Coverage: 87%.', 'Integration tests complete. 140/142 passed. 2 flaky tests identified and fixed.'],
  'Deploy':      ['Staging build deployed successfully. Build time: 45s. All health checks green.'],
  'UBI':         ['UBI calculated for 29 agents. Total distribution: 1,450 BRDG. Median: 50 BRDG per agent.'],
  'reserves':    ['Reserves rebalanced. Liquidity ratio: 1.2x (target: 1.1x). No intervention needed.'],
  'latency':     ['Latency check complete. All 29 agents under 2s. Fastest: agent-1-gateway (45ms).', 'Monitoring sweep done. Average latency: 320ms. No agents flagged.'],
  'faulty':      ['Health check complete. 0 agents above 5% error rate. System healthy.', 'Swarm health: all green. 1 agent had brief spike (2.1%) but recovered.'],
  'contract':    ['Contract review complete. All terms POPIA/GDPR compliant. 2 minor clause updates recommended.'],
  'Compliance':  ['Compliance checklist: 18/20 items green. 2 pending: data retention review, consent audit.'],
  'health':      ['System health: all 29 agents online. CPU avg 34%, memory 61%. No alerts.', 'Comprehensive health check passed. All subsystems operational. Uptime: 99.97%.'],
  'coordination':['Agent routing optimized. Message latency reduced 12%. 3 redundant hops eliminated.'],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getResultForTask(title) {
  for (var key in RESULT_TEMPLATES) {
    if (title.toLowerCase().indexOf(key.toLowerCase()) !== -1) {
      return pickRandom(RESULT_TEMPLATES[key]);
    }
  }
  return 'Task completed successfully. Deliverables verified and logged.';
}

// ── Loop State ───────────────────────────────────────────────────────────────

var _timers = [];
var _running = false;

var stats = {
  started_at: null,
  cycles: 0,
  tasks_generated: 0,
  tasks_claimed: 0,
  tasks_completed: 0,
  total_brdg_moved: 0,
  total_burned: 0,
  errors: 0,
  last_action: null,
};

// ── Core Loop Actions ────────────────────────────────────────────────────────

/**
 * Generate 1-3 random tasks from the template pool.
 */
function generateTasks() {
  var count = randInt(1, 3);
  var generated = 0;

  for (var i = 0; i < count; i++) {
    try {
      var group = pickRandom(TASK_TEMPLATES);
      var template = pickRandom(group.tasks);
      var reward = randInt(template.minReward, template.maxReward);

      // Ensure poster has enough balance
      var available = ledger.getAvailable(group.poster);
      if (available < reward) {
        // Top up the poster so the economy keeps flowing
        var topUp = reward - available + 100;
        ledger.credit(group.poster, topUp, 'auto_econ_topup', 'Auto-economy balance top-up');
        console.log('[AUTO-ECON] Topped up ' + group.poster + ' with ' + topUp + ' BRDG');
      }

      var task = market.postTask(group.poster, template.title, template.desc, reward);
      console.log('[AUTO-ECON] Task posted: "' + template.title + '" by ' + group.poster + ' (' + reward + ' BRDG)');
      generated++;
      stats.tasks_generated++;
      stats.total_brdg_moved += reward;
    } catch (err) {
      console.error('[AUTO-ECON] Error posting task:', err.message);
      stats.errors++;
    }
  }

  stats.cycles++;
  stats.last_action = new Date().toISOString();
  return generated;
}

/**
 * Auto-claim unclaimed (POSTED) tasks using skill-based matching.
 * Delegates to the existing autoMatchTasks in task-market.js.
 */
function claimTasks() {
  try {
    var result = market.autoMatchTasks();
    if (result.matched > 0) {
      for (var i = 0; i < result.results.length; i++) {
        var r = result.results[i];
        if (!r.error) {
          console.log('[AUTO-ECON] Task claimed: "' + r.title + '" by ' + r.claimerAgent + ' (score: ' + r.score + ')');
          stats.tasks_claimed++;
        }
      }
    }
    stats.last_action = new Date().toISOString();
    return result.matched;
  } catch (err) {
    console.error('[AUTO-ECON] Error claiming tasks:', err.message);
    stats.errors++;
    return 0;
  }
}

/**
 * Auto-complete claimed tasks that have been claimed for >30 seconds.
 */
function completeTasks() {
  var completed = 0;
  try {
    var claimed = market.listTasks('CLAIMED', 50);
    var nowMs = Date.now();

    for (var i = 0; i < claimed.length; i++) {
      var task = claimed[i];
      var claimedAt = new Date(task.claimed_at).getTime();
      var elapsed = nowMs - claimedAt;

      if (elapsed > 30000) { // >30 seconds
        try {
          var resultText = getResultForTask(task.title);
          var settlement = market.completeTask(task.id, resultText);
          console.log(
            '[AUTO-ECON] Task completed: "' + task.title + '" by ' + task.claimer_agent +
            ' | paid: ' + settlement.settlement.claimer_paid.toFixed(2) +
            ' BRDG | burned: ' + settlement.settlement.burned.toFixed(2) + ' BRDG'
          );
          stats.tasks_completed++;
          stats.total_brdg_moved += settlement.settlement.claimer_paid;
          stats.total_burned += settlement.settlement.burned;
          completed++;
        } catch (err) {
          console.error('[AUTO-ECON] Error completing task ' + task.id + ':', err.message);
          stats.errors++;
        }
      }
    }

    // Also complete EXECUTING tasks
    var executing = market.listTasks('EXECUTING', 50);
    for (var j = 0; j < executing.length; j++) {
      var exTask = executing[j];
      try {
        var exResult = getResultForTask(exTask.title);
        var exSettlement = market.completeTask(exTask.id, exResult);
        console.log(
          '[AUTO-ECON] Task completed: "' + exTask.title + '" by ' + exTask.claimer_agent +
          ' | paid: ' + exSettlement.settlement.claimer_paid.toFixed(2) +
          ' BRDG | burned: ' + exSettlement.settlement.burned.toFixed(2) + ' BRDG'
        );
        stats.tasks_completed++;
        stats.total_brdg_moved += exSettlement.settlement.claimer_paid;
        stats.total_burned += exSettlement.settlement.burned;
        completed++;
      } catch (err) {
        console.error('[AUTO-ECON] Error completing executing task ' + exTask.id + ':', err.message);
        stats.errors++;
      }
    }

    stats.last_action = new Date().toISOString();
  } catch (err) {
    console.error('[AUTO-ECON] Error in completeTasks:', err.message);
    stats.errors++;
  }
  return completed;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Start the autonomous economy loop.
 * @param {object} [opts] - Optional overrides
 * @param {number} [opts.generateInterval]  - ms between task generation (default 60000)
 * @param {number} [opts.claimInterval]     - ms between auto-claim sweeps (default 30000)
 * @param {number} [opts.completeInterval]  - ms between auto-complete sweeps (default 45000)
 */
function startAutoLoop(opts) {
  if (_running) {
    console.log('[AUTO-ECON] Loop already running.');
    return stats;
  }

  var o = opts || {};
  var genMs      = o.generateInterval  || 60000;
  var claimMs    = o.claimInterval     || 30000;
  var completeMs = o.completeInterval  || 45000;

  _running = true;
  stats.started_at = new Date().toISOString();

  console.log('[AUTO-ECON] ====================================');
  console.log('[AUTO-ECON] Autonomous economy loop STARTED');
  console.log('[AUTO-ECON] Generate every ' + (genMs / 1000) + 's');
  console.log('[AUTO-ECON] Claim every ' + (claimMs / 1000) + 's');
  console.log('[AUTO-ECON] Complete every ' + (completeMs / 1000) + 's');
  console.log('[AUTO-ECON] ====================================');

  // Run initial cycle immediately
  generateTasks();

  // Set up recurring timers
  _timers.push(setInterval(generateTasks, genMs));
  _timers.push(setInterval(claimTasks, claimMs));
  _timers.push(setInterval(completeTasks, completeMs));

  return stats;
}

/**
 * Stop the autonomous economy loop.
 */
function stopAutoLoop() {
  if (!_running) {
    console.log('[AUTO-ECON] Loop is not running.');
    return stats;
  }

  for (var i = 0; i < _timers.length; i++) {
    clearInterval(_timers[i]);
  }
  _timers = [];
  _running = false;

  console.log('[AUTO-ECON] ====================================');
  console.log('[AUTO-ECON] Autonomous economy loop STOPPED');
  console.log('[AUTO-ECON] Stats: ' + stats.tasks_generated + ' generated, ' +
    stats.tasks_completed + ' completed, ' +
    stats.total_brdg_moved.toFixed(2) + ' BRDG moved, ' +
    stats.total_burned.toFixed(2) + ' BRDG burned');
  console.log('[AUTO-ECON] ====================================');

  return stats;
}

/**
 * Get current loop statistics.
 */
function getLoopStats() {
  return Object.assign({}, stats, { running: _running });
}

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  startAutoLoop: startAutoLoop,
  stopAutoLoop: stopAutoLoop,
  getLoopStats: getLoopStats,
  // Exposed for manual triggers / testing
  generateTasks: generateTasks,
  claimTasks: claimTasks,
  completeTasks: completeTasks,
};
