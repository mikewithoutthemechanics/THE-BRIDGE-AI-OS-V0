'use strict';

/**
 * A2A MARKETPLACE
 * ===============
 * Agents sell services to each other
 * Real-time bidding and fulfillment
 */

const DB = require('./db/connection');
const agentWallet = require('./agent-wallet');
const realtime = require('./realtime-sync');

class A2AMarketplace {
  constructor() {
    this.services = new Map(); // serviceId -> service
  }

  // Register a service an agent offers
  async registerService(agentId, service) {
    const db = await DB.getPool();
    
    const [result] = await db.query(
      `INSERT INTO a2a_services (agent_id, name, description, price_per_unit, unit, category, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [agentId, service.name, service.description, service.price, service.unit, service.category]
    );

    const serviceId = result.insertId;
    this.services.set(serviceId, { ...service, agentId, serviceId });

    // Broadcast new service
    if (realtime.broadcast) {
      realtime.broadcast('a2a.new_service', { serviceId, ...service });
    }

    return { success: true, serviceId };
  }

  // List available services
  async listServices(filters = {}) {
    let query = `SELECT * FROM a2a_services WHERE status = 'active'`;
    const params = [];

    if (filters.category) {
      query += ` AND category = ?`;
      params.push(filters.category);
    }

    if (filters.agentId) {
      query += ` AND agent_id = ?`;
      params.push(filters.agentId);
    }

    query += ` ORDER BY created_at DESC`;

    if (filters.limit) {
      query += ` LIMIT ?`;
      params.push(filters.limit);
    }

    const db = await DB.getPool();
    const [rows] = await db.query(query, params);
    return rows;
  }

  // Purchase a service from an agent
  async purchase(serviceId, buyerAgentId, units = 1) {
    const db = await DB.getPool();
    
    // Get service details
    const [service] = await db.query(
      `SELECT * FROM a2a_services WHERE service_id = ? AND status = 'active'`,
      [serviceId]
    );

    if (!service) {
      return { success: false, error: 'Service not found' };
    }

    const totalCost = service.price_per_unit * units;
    
    // Check buyer has sufficient funds
    const buyerBalance = await agentWallet.getBalance(buyerAgentId);
    if (buyerBalance < totalCost) {
      return { success: false, error: 'Insufficient funds' };
    }

    // Process payment
    await agentWallet.debit(buyerAgentId, totalCost, 'a2a_purchase', {
      serviceId, sellerAgentId: service.agent_id, units
    });

    await agentWallet.credit(service.agent_id, totalCost, 'a2a_sale', {
      serviceId, buyerAgentId, units
    });

    // Record transaction
    await db.query(
      `INSERT INTO a2a_transactions (service_id, buyer_agent_id, seller_agent_id, units, total_price, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'completed', NOW())`,
      [serviceId, buyerAgentId, service.agent_id, units, totalCost]
    );

    // Broadcast
    if (realtime.broadcast) {
      realtime.broadcastEarnings(service.agent_id, totalCost, 'a2a_sale');
    }

    return { success: true, transactionId: result.insertId };
  }

  // Get marketplace stats
  async getStats() {
    const db = await DB.getPool();
    
    const [servicesCount] = await db.query(`SELECT COUNT(*) as c FROM a2a_services WHERE status = 'active'`);
    const [transactionsVolume] = await db.query(`SELECT SUM(total_price) as v FROM a2a_transactions WHERE status = 'completed'`);
    const [activeAgents] = await db.query(`SELECT COUNT(DISTINCT seller_agent_id) as c FROM a2a_transactions WHERE status = 'completed' AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)`);

    return {
      activeServices: servicesCount[0].c,
      totalVolume: transactionsVolume[0].v || 0,
      activeAgents: activeAgents[0].c
    };
  }
}

module.exports = new A2AMarketplace();