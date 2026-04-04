/**
 * Infra Feedback — Action → Outcome learning loop.
 *
 * Every approved infra action captures system state BEFORE and AFTER execution.
 * Outcomes are scored with heuristics and stored in system_state.
 * The Infra AI agent reads this history to improve recommendations over time.
 */

const { getState, setState } = require('./db');

const MAX_HISTORY = 100; // cap history length to prevent state bloat

// ── Outcome evaluation ────────────────────────────────────────────────────────

/**
 * Score a before/after snapshot pair. Returns 0–1 (1 = ideal outcome).
 * Heuristics: lower load, lower memory, lower CPU = better.
 */
function evaluateOutcome(before, after) {
  if (!before || !after) return null;

  const scores = [];

  // Load average improvement
  const bLoad = before.load1 || before.load || 0;
  const aLoad = after.load1  || after.load  || 0;
  if (bLoad > 0) scores.push(aLoad < bLoad ? 1 : 0);

  // CPU improvement
  const bCpu = before.cpu_pct || 0;
  const aCpu = after.cpu_pct  || 0;
  if (bCpu > 0) scores.push(aCpu < bCpu ? 1 : 0);

  // Memory improvement
  const bMem = before.mem_pct || 0;
  const aMem = after.mem_pct  || 0;
  if (bMem > 0) scores.push(aMem < bMem ? 1 : 0);

  // Service came back up
  if (before.service_status === 'stopped' && after.service_status === 'running') scores.push(1);
  if (before.service_status === 'running' && after.service_status === 'stopped') scores.push(0);

  // If before === after snapshots (failure case), all metrics identical → score 0
  if (!scores.length) {
    const bStr = JSON.stringify(before);
    const aStr = JSON.stringify(after);
    if (bStr === aStr && bStr !== '{}') return 0;
    return null; // genuinely no data
  }
  return +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2);
}

/**
 * Extract a lightweight metrics summary from a DA system snapshot
 * suitable for before/after comparison.
 */
function extractMetrics(snapshot) {
  if (!snapshot || !snapshot.system) return {};
  const sys = snapshot.system;
  const metrics = {};

  if (sys.load) {
    metrics.load1 = parseFloat(sys.load.load1 || sys.load['1min'] || 0);
  }
  if (sys.cpu) {
    metrics.cpu_pct = parseFloat(sys.cpu.used || 0);
  }
  if (sys.memory && sys.memory.ram) {
    const ram = sys.memory.ram;
    metrics.mem_pct = ram.total > 0 ? +((ram.used / ram.total) * 100).toFixed(1) : 0;
  }
  if (sys.fs && Array.isArray(sys.fs)) {
    const root = sys.fs.find(f => f.mount === '/' || f.mount === '/home') || sys.fs[0];
    if (root) metrics.disk_pct = root.use_pct || +(((root.used || 0) / (root.size || 1)) * 100).toFixed(1);
  }

  return metrics;
}

// ── Core feedback functions ───────────────────────────────────────────────────

/**
 * Log a completed action with before/after metrics.
 * Called by directadmin.approveAction after execution.
 */
async function logInfraOutcome(action, beforeSnapshot, afterSnapshot) {
  const history = (await getState('infra_outcomes')) || [];

  const before  = extractMetrics(beforeSnapshot);
  const after   = extractMetrics(afterSnapshot);
  const score   = evaluateOutcome(before, after);

  const entry = {
    action_id:    action.id,
    action_type:  action.type,
    action_params: action.params,
    requested_by: action.requestedBy,
    before,
    after,
    score,
    success:      score !== null ? score >= 0.5 : null,
    time:         new Date().toISOString(),
  };

  history.unshift(entry); // newest first
  if (history.length > MAX_HISTORY) history.splice(MAX_HISTORY);

  await setState('infra_outcomes', history);

  // Update aggregate success rate per action type
  await updateActionStats(action.type, score);

  console.log(JSON.stringify({ type: 'infra_outcome', action_type: action.type, score, time: entry.time }));
  return entry;
}

/**
 * Maintain per-action-type success stats for smarter recommendations.
 */
async function updateActionStats(actionType, score) {
  if (score === null) return;
  const stats = (await getState('infra_action_stats')) || {};
  if (!stats[actionType]) stats[actionType] = { runs: 0, total_score: 0, success_rate: 0 };
  stats[actionType].runs++;
  stats[actionType].total_score += score;
  stats[actionType].success_rate = +(stats[actionType].total_score / stats[actionType].runs).toFixed(2);
  await setState('infra_action_stats', stats);
}

/**
 * Get recent outcomes + action stats for Infra AI context.
 * Returns a compact summary (not raw snapshots — too large for prompt).
 */
async function getOutcomeContext(limit = 10) {
  const history = (await getState('infra_outcomes')) || [];
  const stats   = (await getState('infra_action_stats')) || {};

  return {
    recent_outcomes: history.slice(0, limit).map(e => ({
      type:    e.action_type,
      params:  e.action_params,
      score:   e.score,
      success: e.success,
      time:    e.time,
    })),
    action_stats: stats,
  };
}

// ── Safety locks ─────────────────────────────────────────────────────────────

const HARD_DENY_TYPES = ['destroy', 'wipe', 'drop', 'delete-all', 'format'];
const DAILY_ACTION_CAP = parseInt(process.env.DAILY_ACTION_CAP || '20');

function isHardDenied(actionType) {
  return HARD_DENY_TYPES.some(d => actionType.toLowerCase().includes(d));
}

async function isDailyCapExceeded() {
  const today = new Date().toISOString().slice(0, 10);
  const history = (await getState('infra_outcomes')) || [];
  const pending = (await getState('da_pending_actions')) || {};
  const todayActions = history.filter(e => e.time && e.time.startsWith(today)).length
    + Object.values(pending).filter(a => a.queued_at && a.queued_at.startsWith(today)).length;
  return { exceeded: todayActions >= DAILY_ACTION_CAP, count: todayActions, cap: DAILY_ACTION_CAP };
}

// ── Auto-approval whitelist ───────────────────────────────────────────────────

// Actions that can execute without human approval (low-risk, high-success-rate)
const AUTO_APPROVE_TYPES = (process.env.AUTO_APPROVE_TYPES || 'restart-service:nginx,restart-service:exim')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

/**
 * Check if an action qualifies for auto-approval.
 * Criteria: in whitelist AND action-type success rate >= 0.7 (proven safe).
 */
async function qualifiesForAutoApprove(actionType, params) {
  const key = params && params.service ? `${actionType}:${params.service}` : actionType;
  if (!AUTO_APPROVE_TYPES.includes(key) && !AUTO_APPROVE_TYPES.includes(actionType)) return false;

  // Check historical success rate
  const stats = (await getState('infra_action_stats')) || {};
  const stat  = stats[actionType];
  if (stat && stat.runs >= 3 && stat.success_rate < 0.7) return false; // proven unreliable

  return true;
}

module.exports = {
  logInfraOutcome,
  getOutcomeContext,
  extractMetrics,
  isHardDenied,
  isDailyCapExceeded,
  qualifiesForAutoApprove,
  HARD_DENY_TYPES,
  DAILY_ACTION_CAP,
};
