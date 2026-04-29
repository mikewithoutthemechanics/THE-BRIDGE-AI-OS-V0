'use strict';

/**
 * REVENUE TRIGGERS
 * ==============
 * Auto-charge users when agents work
 * Real-time billing integration
 */

const DB = require('./db/connection');
const realtime = require('./realtime-sync');
const agentWallet = require('./agent-wallet');

class RevenueTriggers {
  constructor() {
    this.rules = new Map();
  }

  // Define a revenue trigger rule
  async createRule(trigger) {
    const db = await DB.getPool();
    
    const [result] = await db.query(
      `INSERT INTO revenue_triggers (name, event_type, agent_id, rate_per_event, target_user_id, description, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, true, NOW())`,
      [trigger.name, trigger.eventType, trigger.agentId, trigger.rate, trigger.targetUserId, trigger.description]
    );

    this.rules.set(result.insertId, { ...trigger, ruleId: result.insertId });
    return { success: true, ruleId: result.insertId };
  }

  // Fire a trigger when event occurs
  async fire(eventType, context) {
    const db = await DB.getPool();
    
    // Find matching rules
    const [rules] = await db.query(
      `SELECT * FROM revenue_triggers WHERE event_type = ? AND is_active = true`,
      [eventType]
    );

    for (const rule of rules) {
      await this.executeRule(rule, context);
    }
  }

  async executeRule(rule, context) {
    const amount = rule.rate_per_event;
    const userId = rule.target_user_id;

    // Get user credits
    const db = await DB.getPool();
    const [user] = await db.query(`SELECT credits FROM users WHERE id = ?`, [userId]);

    if (!user || user[0].credits < amount) {
      // Notify user of insufficient funds
      if (realtime.broadcast) {
        realtime.broadcast('revenue.insufficient_funds', { userId, ruleId: rule.id, amount });
      }
      return { success: false, error: 'Insufficient credits' };
    }

    // Deduct from user
    await db.query(`UPDATE users SET credits = credits - ? WHERE id = ?`, [amount, userId]);

    // Credit the agent
    await agentWallet.credit(rule.agent_id, amount, `trigger_${rule.event_type}`, context);

    // Record transaction
    await db.query(
      `INSERT INTO revenue_transactions (trigger_id, user_id, agent_id, amount, event_context, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [rule.id, userId, rule.agent_id, amount, JSON.stringify(context)]
    );

    // Broadcast
    if (realtime.broadcast) {
      realtime.broadcastRevenue(userId, amount, rule.name);
    }

    return { success: true, amount };
  }

  // Get revenue stats
  async getStats() {
    const db = await DB.getPool();
    
    const [today] = await db.query(
      `SELECT SUM(amount) as total FROM revenue_transactions WHERE created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)`
    );
    
    const [allTime] = await db.query(`SELECT SUM(amount) as total FROM revenue_transactions`);
    
    const [byTrigger] = await db.query(
      `SELECT r.name, SUM(t.amount) as total, COUNT(*) as events 
       FROM revenue_transactions t
       JOIN revenue_triggers r ON t.trigger_id = r.id
       WHERE t.created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
       GROUP BY r.name`
    );

    return {
      todayRevenue: today[0].total || 0,
      allTimeRevenue: allTime[0].total || 0,
      byTrigger
    };
  }

  async listRules() {
    const db = await DB.getPool();
    const [rows] = await db.query(`SELECT * FROM revenue_triggers ORDER BY created_at DESC`);
    return rows;
  }
}

module.exports = new RevenueTriggers();