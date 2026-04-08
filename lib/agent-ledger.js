// =============================================================================
// BRIDGE AI OS — Agent Ledger
// In-memory agent balance tracking + transaction log
// =============================================================================

const crypto = require('crypto');

// In-memory stores (swap for DB later)
const balances = {};       // { agentId: number }
const escrowed = {};       // { agentId: number } — funds locked in escrow
const transactions = [];   // { id, from, to, amount, fee, type, memo, ts }

const FEE_RATE = 0.02;     // 2% transaction fee
let totalBurned = 0;
let totalFeesCollected = 0;

function ensureAgent(agentId) {
  if (balances[agentId] === undefined) balances[agentId] = 0;
  if (escrowed[agentId] === undefined) escrowed[agentId] = 0;
}

function getBalance(agentId) {
  ensureAgent(agentId);
  return balances[agentId];
}

function getAvailable(agentId) {
  ensureAgent(agentId);
  return balances[agentId] - escrowed[agentId];
}

function getEscrowed(agentId) {
  ensureAgent(agentId);
  return escrowed[agentId];
}

function getAllBalances() {
  return Object.entries(balances)
    .map(([agentId, balance]) => ({ agentId, balance }))
    .sort((a, b) => b.balance - a.balance);
}

function getHistory(agentId, limit = 20) {
  return transactions
    .filter(tx => tx.from === agentId || tx.to === agentId)
    .slice(-limit);
}

function transfer(from, to, amount, memo = '') {
  if (amount <= 0) throw new Error('Amount must be positive');
  ensureAgent(from);
  ensureAgent(to);
  if (balances[from] < amount) throw new Error(`Insufficient balance: ${from} has ${balances[from]}, needs ${amount}`);

  const fee = Math.floor(amount * FEE_RATE * 100) / 100;
  const burned = Math.floor(fee / 2 * 100) / 100;
  const net = amount - fee;

  balances[from] -= amount;
  balances[to] += net;
  totalFeesCollected += fee;
  totalBurned += burned;

  const tx = {
    id: `tx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    from,
    to,
    amount,
    fee,
    burned,
    net,
    type: 'transfer',
    memo,
    ts: Date.now()
  };
  transactions.push(tx);
  return tx;
}

function credit(agentId, amount, memo = '', type = 'credit') {
  if (amount <= 0) throw new Error('Amount must be positive');
  ensureAgent(agentId);
  balances[agentId] += amount;

  const tx = {
    id: `tx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    from: 'system',
    to: agentId,
    amount,
    fee: 0,
    burned: 0,
    net: amount,
    type,
    memo,
    ts: Date.now()
  };
  transactions.push(tx);
  return tx;
}

function debit(agentId, amount, memo = '') {
  if (amount <= 0) throw new Error('Amount must be positive');
  ensureAgent(agentId);
  if (balances[agentId] < amount) throw new Error(`Insufficient balance: ${agentId} has ${balances[agentId]}, needs ${amount}`);
  balances[agentId] -= amount;

  const tx = {
    id: `tx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    from: agentId,
    to: 'system',
    amount,
    fee: 0,
    burned: 0,
    net: amount,
    type: 'debit',
    memo,
    ts: Date.now()
  };
  transactions.push(tx);
  return tx;
}

// ── Escrow operations ──────────────────────────────────────────────────────

function escrowLock(agentId, amount, memo = 'escrow') {
  if (amount <= 0) throw new Error('Amount must be positive');
  ensureAgent(agentId);
  const available = balances[agentId] - escrowed[agentId];
  if (available < amount) throw new Error(`Insufficient available balance: ${agentId} has ${available.toFixed(2)} available, needs ${amount}`);
  escrowed[agentId] += amount;

  const tx = {
    id: `tx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    from: agentId,
    to: 'escrow',
    amount,
    fee: 0,
    burned: 0,
    net: amount,
    type: 'escrow_lock',
    memo,
    ts: Date.now()
  };
  transactions.push(tx);
  return tx;
}

function escrowRelease(agentId, amount, recipientId, memo = 'escrow_release') {
  if (amount <= 0) throw new Error('Amount must be positive');
  ensureAgent(agentId);
  ensureAgent(recipientId);
  if (escrowed[agentId] < amount) throw new Error(`Not enough escrowed: ${agentId} has ${escrowed[agentId].toFixed(2)} escrowed, releasing ${amount}`);

  escrowed[agentId] -= amount;
  balances[agentId] -= amount;
  balances[recipientId] += amount;

  const tx = {
    id: `tx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    from: agentId,
    to: recipientId,
    amount,
    fee: 0,
    burned: 0,
    net: amount,
    type: 'escrow_release',
    memo,
    ts: Date.now()
  };
  transactions.push(tx);
  return tx;
}

function escrowReturn(agentId, amount, memo = 'escrow_return') {
  if (amount <= 0) throw new Error('Amount must be positive');
  ensureAgent(agentId);
  if (escrowed[agentId] < amount) throw new Error(`Not enough escrowed: ${agentId} has ${escrowed[agentId].toFixed(2)} escrowed, returning ${amount}`);
  escrowed[agentId] -= amount;
  // Balance stays the same — funds just become available again

  const tx = {
    id: `tx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    from: 'escrow',
    to: agentId,
    amount,
    fee: 0,
    burned: 0,
    net: amount,
    type: 'escrow_return',
    memo,
    ts: Date.now()
  };
  transactions.push(tx);
  return tx;
}

function escrowBurn(agentId, amount, memo = 'burn') {
  if (amount <= 0) throw new Error('Amount must be positive');
  ensureAgent(agentId);
  if (escrowed[agentId] < amount) throw new Error(`Not enough escrowed to burn`);
  escrowed[agentId] -= amount;
  balances[agentId] -= amount;
  totalBurned += amount;

  const tx = {
    id: `tx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    from: agentId,
    to: 'burned',
    amount,
    fee: 0,
    burned: amount,
    net: 0,
    type: 'burn',
    memo,
    ts: Date.now()
  };
  transactions.push(tx);
  return tx;
}

function getStats() {
  const totalCirculating = Object.values(balances).reduce((s, b) => s + b, 0);
  const topEarners = getAllBalances().slice(0, 10);
  return {
    totalCirculating,
    totalTransactions: transactions.length,
    totalFeesCollected,
    totalBurned,
    topEarners
  };
}

function getRecentTransactions(limit = 50) {
  return transactions.slice(-limit).reverse();
}

// ── SEED INITIAL BALANCES (matches brain-agents.js agent types) ─────────────
const SEED_AMOUNTS = { prime: 50000, twin: 25000, bossbot: 5000, orchestrator: 1000, skill: 1000, business: 2000, ban_node: 1000 };
const SEED_AGENTS = [
  ['prime-001', 'prime'], ['twin-empe-001', 'twin'],
  ['agent-1-gateway', 'orchestrator'], ['agent-2a-dashboard', 'orchestrator'], ['agent-3a-data', 'orchestrator'],
  ['agent-4a-auth', 'orchestrator'], ['agent-5a-testing', 'orchestrator'], ['agent-6a-governance', 'orchestrator'],
  ['agent-l2-verifier', 'orchestrator'], ['agent-l2-streamer', 'orchestrator'], ['agent-l3-minimax', 'orchestrator'],
  ['agent-svg-decision', 'skill'], ['agent-svg-economy', 'skill'], ['agent-svg-speech', 'skill'],
  ['agent-svg-swarm', 'skill'], ['agent-svg-treasury', 'skill'], ['agent-svg-twins', 'skill'],
  ['agent-svg-youtube', 'skill'], ['agent-svg-flow', 'skill'],
  ['agent-biz-sales', 'business'], ['agent-biz-support', 'business'], ['agent-biz-research', 'business'],
  ['agent-biz-marketing', 'business'], ['agent-biz-legal', 'business'], ['agent-biz-finance', 'business'],
  ['agent-biz-dev', 'business'], ['agent-biz-trading', 'business'],
  ['bossbot-alpha', 'bossbot'], ['bossbot-beta', 'bossbot'], ['bossbot-gamma', 'bossbot'], ['bossbot-delta', 'bossbot'],
  ['ban-ryan', 'ban_node'], ['ban-mike', 'ban_node'], ['ban-marvin', 'ban_node'],
  ['treasury', 'prime'], // system treasury agent
];
let _seeded = false;
function seedIfNeeded() {
  if (_seeded) return;
  _seeded = true;
  SEED_AGENTS.forEach(([id, type]) => {
    ensureAgent(id);
    if (balances[id] === 0) {
      const amt = SEED_AMOUNTS[type] || 1000;
      balances[id] = amt;
      transactions.push({ id: crypto.randomUUID(), from: 'genesis', to: id, amount: amt, fee: 0, type: 'seed', memo: `Initial ${type} allocation`, ts: Date.now() });
    }
  });
}
seedIfNeeded();

module.exports = {
  getBalance,
  getAvailable,
  getEscrowed,
  getAllBalances,
  getHistory,
  transfer,
  credit,
  debit,
  escrowLock,
  escrowRelease,
  escrowReturn,
  escrowBurn,
  getStats,
  getRecentTransactions,
  ensureAgent,
  seedIfNeeded,
};
