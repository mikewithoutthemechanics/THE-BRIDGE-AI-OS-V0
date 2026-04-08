/**
 * BRIDGE AI OS — AP2 Protocol Routes
 *
 * Express router exposing the AP2 (Agent Payments Protocol) endpoints:
 *   POST /api/ap2/discover  — service catalog
 *   POST /api/ap2/offer     — submit an offer
 *   POST /api/ap2/accept    — accept/reject an offer
 *   POST /api/ap2/pay       — process payment
 *   POST /api/ap2/settle    — confirm external settlement
 *   GET  /api/ap2/status    — protocol status + stats
 */

'use strict';

const { getAllProfiles, verifyAgent, createAgentProfile } = require('./ap2-identity');
const { getServiceCatalog, getService } = require('./ap2-catalog');
const { createOffer, evaluateOffer, counterOffer, acceptOffer, rejectOffer, getOffer, getAllOffers, getStats: getNegotiationStats } = require('./ap2-negotiation');
const { processPayment, issueReceipt, settleExternal, getPaymentStats } = require('./ap2-payment');

const AP2_VERSION = 'ap2-v1';
const BOOT_TIME = new Date().toISOString();

/**
 * Register AP2 routes on the Express app.
 * @param {import('express').Application} app
 */
function registerAP2Routes(app) {

  // ── POST /api/ap2/discover — Return service catalog ─────────────────────
  app.post('/api/ap2/discover', (req, res) => {
    try {
      const { category, agent_id } = req.body || {};
      const catalog = getServiceCatalog();

      let services = catalog.services;
      if (category) {
        services = services.filter(s => s.category === category);
      }
      if (agent_id) {
        services = services.filter(s => s.agent_id === agent_id);
      }

      res.json({
        ok: true,
        protocol: AP2_VERSION,
        services,
        total: services.length,
        categories: catalog.categories,
        pricing_tiers: catalog.pricing_tiers,
        agents: getAllProfiles().length,
        ts: new Date().toISOString(),
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ── POST /api/ap2/offer — Receive and evaluate an offer ─────────────────
  app.post('/api/ap2/offer', (req, res) => {
    try {
      const { from_agent, to_agent, service_id, price_brdg, agent_profile } = req.body || {};

      // Verify external agent if profile is provided
      if (agent_profile) {
        const verification = verifyAgent(agent_profile);
        if (!verification.valid) {
          return res.status(400).json({ ok: false, error: 'Invalid agent profile', details: verification.errors });
        }
      }

      if (!from_agent || !to_agent || !service_id || !price_brdg) {
        return res.status(400).json({ ok: false, error: 'Missing required fields: from_agent, to_agent, service_id, price_brdg' });
      }

      // Verify service exists
      const service = getService(service_id);
      if (!service) {
        return res.status(404).json({ ok: false, error: 'Service not found: ' + service_id });
      }

      // Create offer
      const offer = createOffer(from_agent, to_agent, service_id, parseFloat(price_brdg));

      // Auto-evaluate
      const evaluation = evaluateOffer(offer);

      res.json({
        ok: true,
        protocol: AP2_VERSION,
        offer,
        evaluation,
        ts: new Date().toISOString(),
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ── POST /api/ap2/accept — Accept, counter, or reject an offer ──────────
  app.post('/api/ap2/accept', (req, res) => {
    try {
      const { offer_id, action, price_brdg, reason } = req.body || {};

      if (!offer_id) {
        return res.status(400).json({ ok: false, error: 'Missing offer_id' });
      }

      const existingOffer = getOffer(offer_id);
      if (!existingOffer) {
        return res.status(404).json({ ok: false, error: 'Offer not found: ' + offer_id });
      }

      let result;
      const resolvedAction = (action || 'accept').toLowerCase();

      switch (resolvedAction) {
        case 'accept':
          result = acceptOffer(offer_id);
          break;
        case 'counter':
          if (!price_brdg) {
            return res.status(400).json({ ok: false, error: 'price_brdg required for counter action' });
          }
          result = counterOffer(offer_id, parseFloat(price_brdg));
          break;
        case 'reject':
          result = rejectOffer(offer_id, reason);
          break;
        default:
          return res.status(400).json({ ok: false, error: 'Invalid action: ' + action + ' (use accept, counter, or reject)' });
      }

      res.json({
        ok: true,
        protocol: AP2_VERSION,
        action: resolvedAction,
        offer: result,
        ts: new Date().toISOString(),
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ── POST /api/ap2/pay — Process payment for an accepted offer ───────────
  app.post('/api/ap2/pay', (req, res) => {
    try {
      const { offer_id } = req.body || {};

      if (!offer_id) {
        return res.status(400).json({ ok: false, error: 'Missing offer_id' });
      }

      const offer = getOffer(offer_id);
      if (!offer) {
        return res.status(404).json({ ok: false, error: 'Offer not found: ' + offer_id });
      }

      if (offer.status !== 'ACCEPTED') {
        return res.status(400).json({ ok: false, error: 'Offer must be ACCEPTED before payment (current: ' + offer.status + ')' });
      }

      // Process the payment
      const payment = processPayment(offer);

      // Issue receipt
      const receipt = issueReceipt(payment);

      // Update offer with payment reference
      offer.payment_tx = payment.payment_id;

      res.json({
        ok: true,
        protocol: AP2_VERSION,
        payment,
        receipt,
        ts: new Date().toISOString(),
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ── POST /api/ap2/settle — Confirm external settlement ─────────────────
  app.post('/api/ap2/settle', (req, res) => {
    try {
      const { payment_id, external_ref } = req.body || {};

      if (!payment_id || !external_ref) {
        return res.status(400).json({ ok: false, error: 'Missing payment_id or external_ref' });
      }

      // Find payment
      const { getPayment } = require('./ap2-payment');
      const payment = getPayment(payment_id);
      if (!payment) {
        return res.status(404).json({ ok: false, error: 'Payment not found: ' + payment_id });
      }

      const settlement = settleExternal(payment, external_ref);

      res.json({
        ok: true,
        protocol: AP2_VERSION,
        settlement,
        payment,
        ts: new Date().toISOString(),
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ── GET /api/ap2/status — Protocol status and statistics ────────────────
  app.get('/api/ap2/status', (_req, res) => {
    try {
      const profiles = getAllProfiles();
      const catalog = getServiceCatalog();
      const negotiation = getNegotiationStats();
      const paymentStats = getPaymentStats();

      res.json({
        ok: true,
        protocol: AP2_VERSION,
        status: 'ACTIVE',
        boot_time: BOOT_TIME,
        uptime_ms: Date.now() - new Date(BOOT_TIME).getTime(),
        agents: {
          total: profiles.length,
          active: profiles.filter(p => p.status === 'active').length,
        },
        catalog: {
          total_services: catalog.total,
          categories: catalog.categories,
        },
        negotiation,
        payments: paymentStats,
        ts: new Date().toISOString(),
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });
}

module.exports = { registerAP2Routes };
