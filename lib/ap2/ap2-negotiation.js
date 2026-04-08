/**
 * BRIDGE AI OS — AP2 Negotiation Engine
 *
 * Manages the offer lifecycle for agent-to-agent service deals:
 *   PROPOSED -> COUNTERED -> ACCEPTED -> REJECTED
 *
 * Accepted offers create escrow via agent-ledger.
 */

'use strict';

const crypto = require('crypto');
const { getService, PRICING } = require('./ap2-catalog');

// Graceful require for ledger
let ledger;
try { ledger = require('../agent-ledger'); } catch (_) { ledger = null; }

// In-memory offer store (production: persist to DB)
const offers = new Map();

// Trust scores — default 0.8 for known agents, 0.5 for external
const trustScores = new Map();

function getTrustScore(agentId) {
  if (trustScores.has(agentId)) return trustScores.get(agentId);
  // Bridge agents get higher default trust
  if (agentId.startsWith('agent-') || agentId.startsWith('bossbot-') ||
      agentId.startsWith('ban-') || agentId.startsWith('prime') ||
      agentId.startsWith('twin') || agentId === 'treasury') {
    return 0.8;
  }
  return 0.5; // external agents
}

function offerId() {
  return 'offer_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
}

/**
 * Create a new offer from one agent to another for a service.
 * @param {string} fromAgent — buyer agent ID
 * @param {string} toAgent — seller agent ID
 * @param {string} serviceId — AP2 service ID from catalog
 * @param {number} priceBrdg — proposed price in BRDG
 * @returns {object} the offer
 */
function createOffer(fromAgent, toAgent, serviceId, priceBrdg) {
  if (!fromAgent || !toAgent) throw new Error('fromAgent and toAgent are required');
  if (!serviceId) throw new Error('serviceId is required');
  if (!priceBrdg || priceBrdg <= 0) throw new Error('priceBrdg must be positive');

  const service = getService(serviceId);

  const offer = {
    offer_id: offerId(),
    from_agent: fromAgent,
    to_agent: toAgent,
    service_id: serviceId,
    service_name: service ? service.name : serviceId,
    price_brdg: priceBrdg,
    market_rate: service ? service.price_brdg : priceBrdg,
    status: 'PROPOSED',
    history: [{ status: 'PROPOSED', price: priceBrdg, ts: new Date().toISOString() }],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    escrow_tx: null,
    payment_tx: null,
  };

  offers.set(offer.offer_id, offer);
  return offer;
}

/**
 * Evaluate an offer — score it based on price vs market rate and trust.
 * @param {object} offer — the offer to evaluate
 * @returns {{ score: number, recommendation: string, details: object }}
 */
function evaluateOffer(offer) {
  if (!offer) throw new Error('Offer is required');

  const marketRate = offer.market_rate || offer.price_brdg;
  const priceRatio = marketRate > 0 ? offer.price_brdg / marketRate : 1;
  const trust = getTrustScore(offer.from_agent);
  const value = priceRatio * trust;

  let recommendation;
  if (value >= 0.9) recommendation = 'ACCEPT';
  else if (value >= 0.6) recommendation = 'COUNTER';
  else recommendation = 'REJECT';

  return {
    score: Math.round(value * 100) / 100,
    recommendation,
    details: {
      price_ratio: Math.round(priceRatio * 100) / 100,
      trust_score: trust,
      market_rate: marketRate,
      offered_price: offer.price_brdg,
    },
  };
}

/**
 * Counter an existing offer with a new price.
 * @param {string} id — offer ID
 * @param {number} newPrice — counter price in BRDG
 * @returns {object} updated offer
 */
function counterOffer(id, newPrice) {
  const offer = offers.get(id);
  if (!offer) throw new Error('Offer not found: ' + id);
  if (offer.status !== 'PROPOSED' && offer.status !== 'COUNTERED') {
    throw new Error('Cannot counter offer in status: ' + offer.status);
  }
  if (!newPrice || newPrice <= 0) throw new Error('newPrice must be positive');

  offer.status = 'COUNTERED';
  offer.price_brdg = newPrice;
  offer.updated_at = new Date().toISOString();
  offer.history.push({ status: 'COUNTERED', price: newPrice, ts: offer.updated_at });

  return offer;
}

/**
 * Accept an offer — creates escrow via agent-ledger.
 * @param {string} id — offer ID
 * @returns {object} accepted offer with escrow transaction
 */
function acceptOffer(id) {
  const offer = offers.get(id);
  if (!offer) throw new Error('Offer not found: ' + id);
  if (offer.status !== 'PROPOSED' && offer.status !== 'COUNTERED') {
    throw new Error('Cannot accept offer in status: ' + offer.status);
  }

  // Lock funds in escrow via ledger
  let escrowResult = null;
  if (ledger) {
    try {
      escrowResult = ledger.escrowLock(offer.from_agent, offer.price_brdg, 'AP2 escrow for offer ' + offer.offer_id);
    } catch (e) {
      throw new Error('Escrow failed: ' + e.message);
    }
  }

  offer.status = 'ACCEPTED';
  offer.escrow_tx = escrowResult ? escrowResult.tx_id : null;
  offer.updated_at = new Date().toISOString();
  offer.history.push({ status: 'ACCEPTED', price: offer.price_brdg, escrow_tx: offer.escrow_tx, ts: offer.updated_at });

  return offer;
}

/**
 * Reject an offer with a reason.
 * @param {string} id — offer ID
 * @param {string} reason — rejection reason
 * @returns {object} rejected offer
 */
function rejectOffer(id, reason) {
  const offer = offers.get(id);
  if (!offer) throw new Error('Offer not found: ' + id);
  if (offer.status === 'ACCEPTED') {
    throw new Error('Cannot reject an already accepted offer');
  }

  offer.status = 'REJECTED';
  offer.rejection_reason = reason || 'No reason provided';
  offer.updated_at = new Date().toISOString();
  offer.history.push({ status: 'REJECTED', reason: offer.rejection_reason, ts: offer.updated_at });

  return offer;
}

/**
 * Get an offer by ID.
 */
function getOffer(id) {
  return offers.get(id) || null;
}

/**
 * Get all offers with optional status filter.
 */
function getAllOffers(statusFilter) {
  const all = [...offers.values()];
  if (statusFilter) return all.filter(o => o.status === statusFilter);
  return all;
}

/**
 * Get negotiation stats.
 */
function getStats() {
  const all = [...offers.values()];
  return {
    total: all.length,
    proposed: all.filter(o => o.status === 'PROPOSED').length,
    countered: all.filter(o => o.status === 'COUNTERED').length,
    accepted: all.filter(o => o.status === 'ACCEPTED').length,
    rejected: all.filter(o => o.status === 'REJECTED').length,
    total_escrowed: all.filter(o => o.status === 'ACCEPTED').reduce((s, o) => s + o.price_brdg, 0),
  };
}

module.exports = {
  createOffer,
  evaluateOffer,
  counterOffer,
  acceptOffer,
  rejectOffer,
  getOffer,
  getAllOffers,
  getStats,
  getTrustScore,
};
