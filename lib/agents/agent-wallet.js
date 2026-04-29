'use strict';

/**
 * AGENT WALLET SYSTEM
 * =================
 * Agents earn/spend credits automatically
 * Real-time balance tracking
 */

const DB = require('./db/connection');
const EventEmitter = require('events');

class AgentWallet extends EventEmitter {
  constructor() {
    super();
    this.cache = new Map();
  }

  // Get agent's current balance
  async getBalance(agentId) {
    if (this.cache.has(agentId)) {
      return this.cache.get(agentId);
    }
    
    const db = await DB.getPool();
    const [row] = await db.query(
      'SELECT balance FROM agent_wallets WHERE agent_id = ?',
      [agentId]
    );
    
    const balance = row?.balance || 0;
    this.cache.set(agentId, balance);
    return balance;
  }

  // Add earnings to agent wallet
  async credit(agentId, amount, source, metadata = {}) {
    const db = await DB.getPool();
    
    await db.query(
      `INSERT INTO agent_wallet_transactions (agent_id, amount, type, source, metadata, created_at)
       VALUES (?, ?, 'credit', ?, ?, NOW())`,
      [agentId, amount, source, JSON.stringify(metadata)]
    );

    await db.query(
      `INSERT INTO agent_wallets (agent_id, balance) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE balance = balance + ?`,
      [agentId, amount, amount]
    );

    // Update cache
    const newBalance = await this.getBalance(agentId);
    this.cache.set(agentId, newBalance);

    // Emit event for real-time updates
    this.emit('credit', { agentId, amount, balance: newBalance, source });

    return { success: true, balance: newBalance };
  }

  // Spend from agent wallet
  async debit(agentId, amount, reason, metadata = {}) {
    const balance = await this.getBalance(agentId);
    
    if (balance < amount) {
      return { success: false, error: 'Insufficient funds' };
    }

    const db = await DB.getPool();
    
    await db.query(
      `INSERT INTO agent_wallet_transactions (agent_id, amount, type, reason, metadata, created_at)
       VALUES (?, ?, 'debit', ?, ?, NOW())`,
      [agentId, amount, reason, JSON.stringify(metadata)]
    );

    await db.query(
      `UPDATE agent_wallets SET balance = balance - ? WHERE agent_id = ?`,
      [amount, agentId]
    );

    const newBalance = balance - amount;
    this.cache.set(agentId, newBalance);

    this.emit('debit', { agentId, amount, balance: newBalance, reason });

    return { success: true, balance: newBalance };
  }

  // Get transaction history
  async getTransactions(agentId, limit = 50) {
    const db = await DB.getPool();
    const [rows] = await db.query(
      `SELECT * FROM agent_wallet_transactions 
       WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?`,
      [agentId, limit]
    );
    return rows;
  }

  // Clear cache (call on startup)
  clearCache() {
    this.cache.clear();
  }
}

module.exports = new AgentWallet();