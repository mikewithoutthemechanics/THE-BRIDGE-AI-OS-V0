/**
 * BRIDGE AI OS — Agent BRDG Ledger (Double-Entry, SQLite-backed)
 *
 * Persistent ledger for 24+ AI agent BRDG balances.
 * Uses better-sqlite3 for atomic transactions on the VPS at /opt/ai-os.
 *
 * Tables:
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
 *   ledger.credit('twin', 500, 'task_reward', 'Completed nurture campaign');
 *   ledger.transfer('twin', 'closer-ai', 100, 'task_42');
 *   ledger.getBalance('twin');
 *   ledger.getLeaderboard(10);
 */

'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

// ── DB path ─────────────────────────────────────────────────────────────────
const DB_PATH = process.env.LEDGER_DB_PATH
  || path.join(__dirname, '..', 'data', 'agent-ledger.db');

// Ensure data/ directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ──────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS agent_balances (
    agent_id      TEXT PRIMARY KEY,
    balance       REAL NOT NULL DEFAULT 0,
    earned_total  REAL NOT NULL DEFAULT 0,
    spent_total   REAL NOT NULL DEFAULT 0,
    escrowed      REAL NOT NULL DEFAULT 0,
    last_tx       TEXT
  );

  CREATE TABLE IF NOT EXISTS agent_transactions (
    id          TEXT PRIMARY KEY,
    from_agent  TEXT,
    to_agent    TEXT,
    amount      REAL NOT NULL,
    fee         REAL NOT NULL DEFAULT 0,
    burn        REAL NOT NULL DEFAULT 0,
    type        TEXT NOT NULL,
    task_id     TEXT,
    memo        TEXT,
    ts          TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_tx_from   ON agent_transactions(from_agent);
  CREATE INDEX IF NOT EXISTS idx_tx_to     ON agent_transactions(to_agent);
  CREATE INDEX IF NOT EXISTS idx_tx_ts     ON agent_transactions(ts);
  CREATE INDEX IF NOT EXISTS idx_tx_task   ON agent_transactions(task_id);
`);

// ── Seed amounts by agent role (from brain-agents.js hierarchy) ─────────────

const SEED_AMOUNTS = {
  prime:        50000,
  twin:         25000,
  bossbot:       5000,
  business:      2000,
  orchestrator:  1000,
  skill:         1000,
  ban_node:      1000,
  _default:      1000,
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

// ── Prepared statements ─────────────────────────────────────────────────────

const stmts = {
  getAgent:     db.prepare('SELECT * FROM agent_balances WHERE agent_id = ?'),
  upsertBal:    db.prepare(`
    INSERT INTO agent_balances (agent_id, balance, earned_total, spent_total, escrowed, last_tx)
    VALUES (@agent_id, @balance, @earned_total, @spent_total, @escrowed, @last_tx)
    ON CONFLICT(agent_id) DO UPDATE SET
      balance      = @balance,
      earned_total = @earned_total,
      spent_total  = @spent_total,
      escrowed     = @escrowed,
      last_tx      = @last_tx
  `),
  insertTx:     db.prepare(`
    INSERT INTO agent_transactions (id, from_agent, to_agent, amount, fee, burn, type, task_id, memo, ts)
    VALUES (@id, @from_agent, @to_agent, @amount, @fee, @burn, @type, @task_id, @memo, @ts)
  `),
  historyFor:   db.prepare(`
    SELECT * FROM agent_transactions
    WHERE from_agent = @agent OR to_agent = @agent
    ORDER BY ts DESC LIMIT @lim
  `),
  leaderboard:  db.prepare('SELECT * FROM agent_balances ORDER BY balance DESC LIMIT ?'),
  totalSupply:  db.prepare('SELECT SUM(balance) AS total FROM agent_balances'),
  totalBurned:  db.prepare('SELECT SUM(burn) AS total FROM agent_transactions'),
  totalFees:    db.prepare('SELECT SUM(fee) AS total FROM agent_transactions'),
  agentCount:   db.prepare('SELECT COUNT(*) AS cnt FROM agent_balances'),
  txCount:      db.prepare('SELECT COUNT(*) AS cnt FROM agent_transactions'),
  allBalances:  db.prepare('SELECT * FROM agent_balances ORDER BY balance DESC'),
  recentTx:     db.prepare('SELECT * FROM agent_transactions ORDER BY ts DESC LIMIT ?'),
};

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
function ensureAgent(agentId) {
  let row = stmts.getAgent.get(agentId);
  if (row) return row;

  const seed = getSeedAmount(agentId);
  const ts = now();
  const id = txId();

  const seedTx = db.transaction(() => {
    stmts.upsertBal.run({
      agent_id: agentId,
      balance: seed,
      earned_total: seed,
      spent_total: 0,
      escrowed: 0,
      last_tx: ts,
    });
    stmts.insertTx.run({
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
  });
  seedTx();

  return stmts.getAgent.get(agentId);
}

// ── Core Financial Operations (all atomic) ──────────────────────────────────

/**
 * Credit BRDG to an agent (earning / reward / refund).
 * @param {string} agentId
 * @param {number} amount  — must be > 0
 * @param {string} type    — e.g. 'task_reward', 'refund', 'credit'
 * @param {string} memo
 * @returns {{ tx_id, agent_id, amount, new_balance }}
 */
function credit(agentId, amount, type, memo) {
  if (!type) type = 'credit';
  if (!memo) memo = '';
  if (amount <= 0) throw new Error('Credit amount must be positive');

  const ts = now();
  const id = txId();

  const run = db.transaction(() => {
    const agent = ensureAgent(agentId);
    const newBal    = round8(agent.balance + amount);
    const newEarned = round8(agent.earned_total + amount);

    stmts.upsertBal.run({
      agent_id: agentId, balance: newBal, earned_total: newEarned,
      spent_total: agent.spent_total, escrowed: agent.escrowed, last_tx: ts,
    });

    stmts.insertTx.run({
      id, from_agent: 'system', to_agent: agentId,
      amount, fee: 0, burn: 0, type, task_id: null, memo, ts,
    });

    return { tx_id: id, agent_id: agentId, amount, new_balance: newBal };
  });

  return run();
}

/**
 * Debit BRDG from an agent (spending / penalty / cost).
 * Throws if insufficient available balance.
 * @param {string} agentId
 * @param {number} amount  — must be > 0
 * @param {string} type    — e.g. 'api_cost', 'penalty', 'debit'
 * @param {string} memo
 * @returns {{ tx_id, agent_id, amount, new_balance }}
 */
function debit(agentId, amount, type, memo) {
  if (!type) type = 'debit';
  if (!memo) memo = '';
  if (amount <= 0) throw new Error('Debit amount must be positive');

  const ts = now();
  const id = txId();

  const run = db.transaction(() => {
    const agent = ensureAgent(agentId);
    const available = agent.balance - agent.escrowed;
    if (available < amount) {
      throw new Error(
        'Insufficient balance: ' + agentId + ' has ' + available +
        ' BRDG available (' + agent.escrowed + ' escrowed), tried to debit ' + amount
      );
    }

    const newBal   = round8(agent.balance - amount);
    const newSpent = round8(agent.spent_total + amount);

    stmts.upsertBal.run({
      agent_id: agentId, balance: newBal, earned_total: agent.earned_total,
      spent_total: newSpent, escrowed: agent.escrowed, last_tx: ts,
    });

    stmts.insertTx.run({
      id, from_agent: agentId, to_agent: 'system',
      amount, fee: 0, burn: 0, type, task_id: null, memo, ts,
    });

    return { tx_id: id, agent_id: agentId, amount, new_balance: newBal };
  });

  return run();
}

/**
 * Transfer BRDG between agents with deflationary economics.
 *
 *   5% system fee  — removed from circulation
 *   1% burn        — permanently destroyed
 *   Net received   = amount * 0.94
 *
 * @param {string} fromAgent
 * @param {string} toAgent
 * @param {number} amount   — gross amount debited from sender
 * @param {string} taskId   — optional task reference
 * @returns {{ tx_id, from, to, gross, fee, burn, net, from_balance, to_balance }}
 */
function transfer(fromAgent, toAgent, amount, taskId) {
  if (!taskId) taskId = null;
  if (amount <= 0) throw new Error('Transfer amount must be positive');
  if (fromAgent === toAgent) throw new Error('Cannot transfer to self');

  const fee  = round8(amount * 0.05);   // 5% system fee
  const burn = round8(amount * 0.01);   // 1% burn
  const net  = round8(amount - fee - burn);

  const ts = now();
  const id = txId();

  const run = db.transaction(() => {
    const sender = ensureAgent(fromAgent);
    ensureAgent(toAgent);

    const senderAvailable = sender.balance - sender.escrowed;
    if (senderAvailable < amount) {
      throw new Error(
        'Insufficient balance: ' + fromAgent + ' has ' + senderAvailable +
        ' BRDG available, transfer needs ' + amount
      );
    }

    // Debit sender (full gross)
    const senderNewBal = round8(sender.balance - amount);
    stmts.upsertBal.run({
      agent_id: fromAgent, balance: senderNewBal, earned_total: sender.earned_total,
      spent_total: round8(sender.spent_total + amount), escrowed: sender.escrowed, last_tx: ts,
    });

    // Credit receiver (net)
    const receiver = stmts.getAgent.get(toAgent);
    const receiverNewBal = round8(receiver.balance + net);
    stmts.upsertBal.run({
      agent_id: toAgent, balance: receiverNewBal, earned_total: round8(receiver.earned_total + net),
      spent_total: receiver.spent_total, escrowed: receiver.escrowed, last_tx: ts,
    });

    // Immutable tx record
    stmts.insertTx.run({
      id, from_agent: fromAgent, to_agent: toAgent,
      amount, fee, burn, type: 'transfer', task_id: taskId,
      memo: 'Transfer ' + amount + ' BRDG | fee=' + fee + ' burn=' + burn + ' net=' + net, ts,
    });

    return {
      tx_id: id,
      from: fromAgent, to: toAgent,
      gross: amount, fee, burn, net,
      from_balance: senderNewBal,
      to_balance: receiverNewBal,
    };
  });

  return run();
}

// ── Escrow Operations (all atomic) ──────────────────────────────────────────

/**
 * Lock funds in escrow (available balance decreases, total balance unchanged).
 */
function escrowLock(agentId, amount, memo) {
  if (!memo) memo = 'escrow';
  if (amount <= 0) throw new Error('Amount must be positive');

  const ts = now();
  const id = txId();

  const run = db.transaction(() => {
    const agent = ensureAgent(agentId);
    const available = agent.balance - agent.escrowed;
    if (available < amount) {
      throw new Error('Insufficient available balance: ' + agentId + ' has ' + available.toFixed(2) + ' available, needs ' + amount);
    }

    stmts.upsertBal.run({
      agent_id: agentId, balance: agent.balance, earned_total: agent.earned_total,
      spent_total: agent.spent_total, escrowed: round8(agent.escrowed + amount), last_tx: ts,
    });

    stmts.insertTx.run({
      id, from_agent: agentId, to_agent: 'escrow',
      amount, fee: 0, burn: 0, type: 'escrow_lock', task_id: null, memo, ts,
    });

    return { tx_id: id, agent_id: agentId, escrowed: round8(agent.escrowed + amount) };
  });

  return run();
}

/**
 * Release escrowed funds to a recipient.
 */
function escrowRelease(agentId, amount, recipientId, memo) {
  if (!memo) memo = 'escrow_release';
  if (amount <= 0) throw new Error('Amount must be positive');

  const ts = now();
  const id = txId();

  const run = db.transaction(() => {
    const agent = ensureAgent(agentId);
    ensureAgent(recipientId);
    if (agent.escrowed < amount) {
      throw new Error('Not enough escrowed: ' + agentId + ' has ' + agent.escrowed.toFixed(2) + ' escrowed, releasing ' + amount);
    }

    // Decrease sender balance + escrow
    stmts.upsertBal.run({
      agent_id: agentId, balance: round8(agent.balance - amount), earned_total: agent.earned_total,
      spent_total: round8(agent.spent_total + amount), escrowed: round8(agent.escrowed - amount), last_tx: ts,
    });

    // Increase recipient
    const recipient = stmts.getAgent.get(recipientId);
    stmts.upsertBal.run({
      agent_id: recipientId, balance: round8(recipient.balance + amount),
      earned_total: round8(recipient.earned_total + amount), spent_total: recipient.spent_total,
      escrowed: recipient.escrowed, last_tx: ts,
    });

    stmts.insertTx.run({
      id, from_agent: agentId, to_agent: recipientId,
      amount, fee: 0, burn: 0, type: 'escrow_release', task_id: null, memo, ts,
    });

    return { tx_id: id, from: agentId, to: recipientId, amount };
  });

  return run();
}

/**
 * Return escrowed funds back to the agent (unlock without transfer).
 */
function escrowReturn(agentId, amount, memo) {
  if (!memo) memo = 'escrow_return';
  if (amount <= 0) throw new Error('Amount must be positive');

  const ts = now();
  const id = txId();

  const run = db.transaction(() => {
    const agent = ensureAgent(agentId);
    if (agent.escrowed < amount) {
      throw new Error('Not enough escrowed: ' + agentId + ' has ' + agent.escrowed.toFixed(2) + ' escrowed, returning ' + amount);
    }

    stmts.upsertBal.run({
      agent_id: agentId, balance: agent.balance, earned_total: agent.earned_total,
      spent_total: agent.spent_total, escrowed: round8(agent.escrowed - amount), last_tx: ts,
    });

    stmts.insertTx.run({
      id, from_agent: 'escrow', to_agent: agentId,
      amount, fee: 0, burn: 0, type: 'escrow_return', task_id: null, memo, ts,
    });

    return { tx_id: id, agent_id: agentId, escrowed: round8(agent.escrowed - amount) };
  });

  return run();
}

/**
 * Burn escrowed funds (permanent removal from supply).
 */
function escrowBurn(agentId, amount, memo) {
  if (!memo) memo = 'burn';
  if (amount <= 0) throw new Error('Amount must be positive');

  const ts = now();
  const id = txId();

  const run = db.transaction(() => {
    const agent = ensureAgent(agentId);
    if (agent.escrowed < amount) {
      throw new Error('Not enough escrowed to burn');
    }

    stmts.upsertBal.run({
      agent_id: agentId, balance: round8(agent.balance - amount), earned_total: agent.earned_total,
      spent_total: round8(agent.spent_total + amount), escrowed: round8(agent.escrowed - amount), last_tx: ts,
    });

    stmts.insertTx.run({
      id, from_agent: agentId, to_agent: 'burned',
      amount, fee: 0, burn: amount, type: 'burn', task_id: null, memo, ts,
    });

    return { tx_id: id, agent_id: agentId, burned: amount };
  });

  return run();
}

// ── Query Operations ────────────────────────────────────────────────────────

/**
 * Get current balance for an agent. Auto-seeds on first access.
 * @returns {{ agent_id, balance, earned_total, spent_total, escrowed, last_tx }}
 */
function getBalance(agentId) {
  return ensureAgent(agentId);
}

/**
 * Get available (non-escrowed) balance.
 */
function getAvailable(agentId) {
  const agent = ensureAgent(agentId);
  return round8(agent.balance - agent.escrowed);
}

/**
 * Get escrowed amount for an agent.
 */
function getEscrowed(agentId) {
  const agent = ensureAgent(agentId);
  return agent.escrowed;
}

/**
 * Get all balances sorted by balance descending.
 */
function getAllBalances() {
  return stmts.allBalances.all();
}

/**
 * Get transaction history for an agent (newest first).
 */
function getHistory(agentId, limit) {
  if (!limit) limit = 50;
  ensureAgent(agentId);
  return stmts.historyFor.all({ agent: agentId, lim: limit });
}

/**
 * Get agent leaderboard by balance (descending).
 */
function getLeaderboard(limit) {
  if (!limit) limit = 20;
  return stmts.leaderboard.all(limit);
}

/**
 * System-wide economy stats.
 */
function getStats() {
  const supply  = stmts.totalSupply.get();
  const burned  = stmts.totalBurned.get();
  const fees    = stmts.totalFees.get();
  const agents  = stmts.agentCount.get();
  const txs     = stmts.txCount.get();

  return {
    totalCirculating:   supply.total || 0,
    totalBurned:        burned.total || 0,
    totalFeesCollected: fees.total || 0,
    agent_count:        agents.cnt || 0,
    totalTransactions:  txs.cnt || 0,
    topEarners:         stmts.leaderboard.all(10),
  };
}

/**
 * Get recent transactions across all agents.
 */
function getRecentTransactions(limit) {
  if (!limit) limit = 50;
  return stmts.recentTx.all(limit);
}

/**
 * Close the database connection (for clean shutdown / tests).
 */
function close() {
  db.close();
}

// ── Genesis seed: pre-populate all known agents on first load ────────────────

function seedIfNeeded() {
  const count = stmts.agentCount.get();
  if (count.cnt >= SEED_AGENTS.length) return; // already seeded

  const batchSeed = db.transaction(() => {
    SEED_AGENTS.forEach(([agentId]) => {
      ensureAgent(agentId); // creates row + seed tx if missing
    });
  });
  batchSeed();
}
seedIfNeeded();

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

  // Lifecycle
  ensureAgent,
  seedIfNeeded,
  close,

  // Exposed for testing / advanced use
  db,
  SEED_AMOUNTS,
};
