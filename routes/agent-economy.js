'use strict';

/**
 * AGENT ECONOMY API
 * ================
 * REST API for agent earnings & A2A marketplace
 */

const express = require('express');
const router = express.Router();

const agentWallet = require('../lib/agents/agent-wallet');
const a2aMarketplace = require('../lib/agents/a2a-marketplace');
const revenueTriggers = require('../lib/agents/revenue-triggers');

// ==================
// WALLET endpoints
// ==================

// Get agent balance
router.get('/wallet/:agentId', async (req, res) => {
  try {
    const balance = await agentWallet.getBalance(req.params.agentId);
    res.json({ success: true, balance });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Get transaction history
router.get('/wallet/:agentId/transactions', async (req, res) => {
  try {
    const txs = await agentWallet.getTransactions(req.params.agentId, req.query.limit || 50);
    res.json({ success: true, transactions: txs });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ==================
// A2A Marketplace
// ==================

// List services
router.get('/marketplace/services', async (req, res) => {
  try {
    const services = await a2aMarketplace.listServices(req.query);
    res.json({ success: true, services });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Register service
router.post('/marketplace/services', async (req, res) => {
  try {
    const { agentId, name, description, price, unit, category } = req.body;
    const result = await a2aMarketplace.registerService(agentId, {
      name, description, price, unit, category
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Purchase service
router.post('/marketplace/purchase', async (req, res) => {
  try {
    const { serviceId, buyerAgentId, units } = req.body;
    const result = await a2aMarketplace.purchase(serviceId, buyerAgentId, units);
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Get marketplace stats
router.get('/marketplace/stats', async (req, res) => {
  try {
    const stats = await a2aMarketplace.getStats();
    res.json({ success: true, stats });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ==================
// Revenue Triggers
// ==================

// Create rule
router.post('/triggers', async (req, res) => {
  try {
    const result = await revenueTriggers.createRule(req.body);
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Fire trigger (internal)
router.post('/triggers/fire', async (req, res) => {
  try {
    const { eventType, context } = req.body;
    const result = await revenueTriggers.fire(eventType, context);
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Get stats
router.get('/triggers/stats', async (req, res) => {
  try {
    const stats = await revenueTriggers.getStats();
    res.json({ success: true, stats });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;