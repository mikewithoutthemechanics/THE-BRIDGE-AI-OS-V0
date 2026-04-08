/**
 * BRIDGE AI OS — Data Flywheel
 *
 * Captures agent activity signals, derives insights, and feeds back
 * into agent routing weights for continuous optimization.
 *
 * SQLite-backed via better-sqlite3.
 */
'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

// ── DB ─────────────────────────────────────────────────────────────────────
const DB_PATH = process.env.FLYWHEEL_DB_PATH
  || path.join(__dirname, '..', 'data', 'data-flywheel.db');

const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// ── Schema ─────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS data_signals (
    id             TEXT PRIMARY KEY,
    signal_type    TEXT NOT NULL,
    agent_id       TEXT,
    value          REAL,
    metadata_json  TEXT,
    ts             TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_signals_type  ON data_signals(signal_type);
  CREATE INDEX IF NOT EXISTS idx_signals_agent ON data_signals(agent_id);
  CREATE INDEX IF NOT EXISTS idx_signals_ts    ON data_signals(ts);
`);

// ── Routing weights table (updated by feedbackLoop) ────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS agent_routing_weights (
    agent_id       TEXT PRIMARY KEY,
    weight         REAL NOT NULL DEFAULT 1.0,
    tasks_completed INTEGER NOT NULL DEFAULT 0,
    avg_value      REAL NOT NULL DEFAULT 0,
    conversion_rate REAL NOT NULL DEFAULT 0,
    updated_at     TEXT
  );
`);

// ── Prepared statements ────────────────────────────────────────────────────
const stmts = {
  insertSignal: db.prepare(`
    INSERT INTO data_signals (id, signal_type, agent_id, value, metadata_json, ts)
    VALUES (@id, @signal_type, @agent_id, @value, @metadata_json, @ts)
  `),
  topServices: db.prepare(`
    SELECT signal_type, COUNT(*) AS request_count, AVG(value) AS avg_value
    FROM data_signals
    WHERE signal_type LIKE 'service_%'
    GROUP BY signal_type
    ORDER BY request_count DESC
    LIMIT 10
  `),
  bestAgents: db.prepare(`
    SELECT agent_id, COUNT(*) AS completions, AVG(value) AS avg_value,
           SUM(CASE WHEN signal_type = 'conversion' THEN 1 ELSE 0 END) AS conversions
    FROM data_signals
    WHERE agent_id IS NOT NULL
    GROUP BY agent_id
    ORDER BY completions DESC
    LIMIT 10
  `),
  peakHours: db.prepare(`
    SELECT CAST(strftime('%H', ts) AS INTEGER) AS hour, COUNT(*) AS activity_count
    FROM data_signals
    GROUP BY hour
    ORDER BY activity_count DESC
    LIMIT 5
  `),
  avgTaskValue: db.prepare(`
    SELECT AVG(value) AS avg_value, COUNT(*) AS total_tasks
    FROM data_signals
    WHERE signal_type = 'task_complete' AND value > 0
  `),
  signalCount: db.prepare('SELECT COUNT(*) AS cnt FROM data_signals'),
  agentPerformance: db.prepare(`
    SELECT agent_id,
           COUNT(*) AS total_signals,
           SUM(CASE WHEN signal_type = 'task_complete' THEN 1 ELSE 0 END) AS completions,
           SUM(CASE WHEN signal_type = 'conversion' THEN 1 ELSE 0 END) AS conversions,
           AVG(CASE WHEN value > 0 THEN value ELSE NULL END) AS avg_value
    FROM data_signals
    WHERE agent_id IS NOT NULL
    GROUP BY agent_id
  `),
  upsertWeight: db.prepare(`
    INSERT INTO agent_routing_weights (agent_id, weight, tasks_completed, avg_value, conversion_rate, updated_at)
    VALUES (@agent_id, @weight, @tasks_completed, @avg_value, @conversion_rate, @updated_at)
    ON CONFLICT(agent_id) DO UPDATE SET
      weight = @weight,
      tasks_completed = @tasks_completed,
      avg_value = @avg_value,
      conversion_rate = @conversion_rate,
      updated_at = @updated_at
  `),
  getWeights: db.prepare('SELECT * FROM agent_routing_weights ORDER BY weight DESC'),
};

// ── Helpers ────────────────────────────────────────────────────────────────
function genSignalId() {
  return 'sig_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
}

function now() {
  return new Date().toISOString();
}

// ── Core Functions ─────────────────────────────────────────────────────────

/**
 * Capture an agent activity signal.
 * @param {string} type — signal type (e.g. 'task_complete', 'conversion', 'service_request')
 * @param {object} data — { agent_id, value, ...metadata }
 * @returns {object} the stored signal
 */
function captureSignal(type, data) {
  if (!type) throw new Error('Signal type required');
  var d = data || {};

  var record = {
    id: genSignalId(),
    signal_type: type,
    agent_id: d.agent_id || null,
    value: d.value || 0,
    metadata_json: JSON.stringify(d),
    ts: now(),
  };

  stmts.insertSignal.run(record);
  return record;
}

/**
 * Get aggregate insights from collected signals.
 * @returns {object} { most_requested_services, best_converting_agents, peak_activity_times, average_task_value, total_signals }
 */
function getInsights() {
  var topServices = stmts.topServices.all();
  var bestAgents = stmts.bestAgents.all();
  var peakTimes = stmts.peakHours.all();
  var taskValue = stmts.avgTaskValue.get();
  var totalSignals = stmts.signalCount.get();

  return {
    most_requested_services: topServices,
    best_converting_agents: bestAgents,
    peak_activity_times: peakTimes.map(function(p) {
      return {
        hour: p.hour,
        activity_count: p.activity_count,
        label: p.hour + ':00-' + p.hour + ':59',
      };
    }),
    average_task_value: taskValue.avg_value || 0,
    total_tasks: taskValue.total_tasks || 0,
    total_signals: totalSignals.cnt || 0,
  };
}

/**
 * Feedback loop: recalculates agent routing weights based on performance.
 * Called periodically to optimize which agents get routed tasks.
 *
 * Weight formula: (completions * 0.4) + (avg_value * 0.3) + (conversion_rate * 100 * 0.3)
 * Normalized to 0-10 range.
 *
 * @returns {{ agents_updated, weights }}
 */
function feedbackLoop() {
  var performance = stmts.agentPerformance.all();
  var ts = now();
  var updated = 0;

  if (performance.length === 0) {
    return { agents_updated: 0, weights: [] };
  }

  // Find max values for normalization
  var maxCompletions = 1;
  var maxValue = 1;
  for (var i = 0; i < performance.length; i++) {
    if ((performance[i].completions || 0) > maxCompletions) maxCompletions = performance[i].completions;
    if ((performance[i].avg_value || 0) > maxValue) maxValue = performance[i].avg_value;
  }

  var updateAll = db.transaction(function() {
    for (var j = 0; j < performance.length; j++) {
      var agent = performance[j];
      var completions = agent.completions || 0;
      var avgVal = agent.avg_value || 0;
      var convRate = completions > 0 ? (agent.conversions || 0) / completions : 0;

      // Normalized weight: higher is better
      var weight = +(
        ((completions / maxCompletions) * 0.4 +
        (avgVal / maxValue) * 0.3 +
        (convRate * 0.3)) * 10
      ).toFixed(4);

      stmts.upsertWeight.run({
        agent_id: agent.agent_id,
        weight: weight,
        tasks_completed: completions,
        avg_value: +(avgVal.toFixed(2)),
        conversion_rate: +(convRate.toFixed(4)),
        updated_at: ts,
      });
      updated++;
    }
  });

  updateAll();

  return {
    agents_updated: updated,
    weights: stmts.getWeights.all(),
  };
}

// ── Exports ────────────────────────────────────────────────────────────────
module.exports = {
  captureSignal,
  getInsights,
  feedbackLoop,
  db,
};
