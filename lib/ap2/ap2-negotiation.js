/**
 * BRIDGE AI OS — AP2 Negotiation Engine
 *
 * Manages the offer lifecycle for agent-to-agent service deals:
 *   PROPOSED -> COUNTERED -> ACCEPTED -> REJECTED
 *
 * Accepted offers create escrow via agent-ledger.
 * Backed by Supabase.
 */

'use strict';

const crypto = require('crypto');
const { getService, PRICING } = require('./ap2-catalog');
const { supabase } = require('../supabase');

// Graceful require for ledger
let ledger;
try { ledger = require('../agent-ledger'); } catch (_) { ledger = null; }

function rowToOffer(row) {
  if (!row) return null;
  return {
    offer_id: row.offer_id,
    from_agent: row.from_agent,
    to_agent: row.to_agent,
    service_id: row.service_id,
    service_name: row.service_name,
    price_brdg: row.price_brdg,
    market_rate: row.market_rate,
    status: row.status,
    history: typeof row.history === 'string' ? JSON.parse(row.history || '[]') : (row.history || []),
    escrow_tx: row.escrow_tx,
    payment_tx: row.payment_tx,
    rejection_reason: row.rejection_reason || undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// Trust scores — default 0.8 for known agents, 0.5 for external
const trustScores = new Map();

function getTrustScore(agentId) {
  if (trustScores.has(agentId)) return trustScores.get(agentId);
  if (agentId.startsWith('agent-') || agentId.startsWith('bossbot-') ||
      agentId.startsWith('ban-') || agentId.startsWith('prime') ||
      agentId.startsWith('twin') || agentId === 'treasury') {
    return 0.8;
  }
  return 0.5;
}

function offerId() {
  return 'offer_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
}

/**
 * Create a new offer from one agent to another for a service.
 */
async function createOffer(fromAgent, toAgent, serviceId, priceBrdg) {
  if (!fromAgent || !toAgent) throw new Error('fromAgent and toAgent are required');
  if (!serviceId) throw new Error('serviceId is required');
  if (!priceBrdg || priceBrdg <= 0) throw new Error('priceBrdg must be positive');

  const service = getService(serviceId);
  const now = new Date().toISOString();
  const id = offerId();
  const history = [{ status: 'PROPOSED', price: priceBrdg, ts: now }];
  const marketRate = service ? service.price_brdg : priceBrdg;

  const offer = {
    offer_id: id,
    from_agent: fromAgent,
    to_agent: toAgent,
    service_id: serviceId,
    service_name: service ? service.name : serviceId,
    price_brdg: priceBrdg,
    market_rate: marketRate,
    status: 'PROPOSED',
    history: JSON.stringify(history),
    escrow_tx: null,
    payment_tx: null,
    rejection_reason: null,
    created_at: now,
    updated_at: now,
  };

  if (supabase) {
    await supabase.from('ap2_offers').insert(offer);
  }

  return {
    ...offer,
    history: history,
  };
}

/**
 * Evaluate an offer — score it based on price vs market rate and trust.
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
 */
async function counterOffer(id, newPrice) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data: row } = await supabase.from('ap2_offers').select('*').eq('offer_id', id).single();
  const offer = rowToOffer(row);
  if (!offer) throw new Error('Offer not found: ' + id);
  if (offer.status !== 'PROPOSED' && offer.status !== 'COUNTERED') {
    throw new Error('Cannot counter offer in status: ' + offer.status);
  }
  if (!newPrice || newPrice <= 0) throw new Error('newPrice must be positive');

  const now = new Date().toISOString();
  offer.status = 'COUNTERED';
  offer.price_brdg = newPrice;
  offer.updated_at = now;
  offer.history.push({ status: 'COUNTERED', price: newPrice, ts: now });

  await supabase.from('ap2_offers').update({
    price_brdg: offer.price_brdg,
    status: offer.status,
    history: JSON.stringify(offer.history),
    updated_at: offer.updated_at,
  }).eq('offer_id', id);

  return offer;
}

/**
 * Accept an offer — creates escrow via agent-ledger.
 */
async function acceptOffer(id) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data: row } = await supabase.from('ap2_offers').select('*').eq('offer_id', id).single();
  const offer = rowToOffer(row);
  if (!offer) throw new Error('Offer not found: ' + id);
  if (offer.status !== 'PROPOSED' && offer.status !== 'COUNTERED') {
    throw new Error('Cannot accept offer in status: ' + offer.status);
  }

  let escrowResult = null;
  if (ledger) {
    try {
      escrowResult = await ledger.escrowLock(offer.from_agent, offer.price_brdg, 'AP2 escrow for offer ' + offer.offer_id);
    } catch (e) {
      throw new Error('Escrow failed: ' + e.message);
    }
  }

  const now = new Date().toISOString();
  offer.status = 'ACCEPTED';
  offer.escrow_tx = escrowResult ? escrowResult.tx_id : null;
  offer.updated_at = now;
  offer.history.push({ status: 'ACCEPTED', price: offer.price_brdg, escrow_tx: offer.escrow_tx, ts: now });

  await supabase.from('ap2_offers').update({
    price_brdg: offer.price_brdg,
    status: offer.status,
    history: JSON.stringify(offer.history),
    escrow_tx: offer.escrow_tx,
    updated_at: offer.updated_at,
  }).eq('offer_id', id);

  return offer;
}

/**
 * Reject an offer with a reason.
 */
async function rejectOffer(id, reason) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data: row } = await supabase.from('ap2_offers').select('*').eq('offer_id', id).single();
  const offer = rowToOffer(row);
  if (!offer) throw new Error('Offer not found: ' + id);
  if (offer.status === 'ACCEPTED') {
    throw new Error('Cannot reject an already accepted offer');
  }

  const now = new Date().toISOString();
  offer.status = 'REJECTED';
  offer.rejection_reason = reason || 'No reason provided';
  offer.updated_at = now;
  offer.history.push({ status: 'REJECTED', reason: offer.rejection_reason, ts: now });

  await supabase.from('ap2_offers').update({
    status: offer.status,
    history: JSON.stringify(offer.history),
    rejection_reason: offer.rejection_reason,
    updated_at: offer.updated_at,
  }).eq('offer_id', id);

  return offer;
}

/**
 * Get an offer by ID.
 */
async function getOffer(id) {
  if (!supabase) return null;
  const { data } = await supabase.from('ap2_offers').select('*').eq('offer_id', id).single();
  return rowToOffer(data);
}

/**
 * Get all offers with optional status filter.
 */
async function getAllOffers(statusFilter) {
  if (!supabase) return [];
  let query = supabase.from('ap2_offers').select('*');
  if (statusFilter) query = query.eq('status', statusFilter);
  const { data } = await query;
  return (data || []).map(rowToOffer);
}

/**
 * Get negotiation stats.
 */
async function getStats() {
  if (!supabase) return { total: 0, proposed: 0, countered: 0, accepted: 0, rejected: 0, total_escrowed: 0 };

  const { count: total } = await supabase.from('ap2_offers').select('*', { count: 'exact', head: true });
  const byStat = {};
  for (const s of ['PROPOSED', 'COUNTERED', 'ACCEPTED', 'REJECTED']) {
    const { count } = await supabase.from('ap2_offers').select('*', { count: 'exact', head: true }).eq('status', s);
    byStat[s] = count || 0;
  }
  const { data: acceptedRows } = await supabase.from('ap2_offers').select('price_brdg').eq('status', 'ACCEPTED');
  const totalEscrowed = (acceptedRows || []).reduce((s, r) => s + (r.price_brdg || 0), 0);

  return {
    total: total || 0,
    proposed: byStat['PROPOSED'] || 0,
    countered: byStat['COUNTERED'] || 0,
    accepted: byStat['ACCEPTED'] || 0,
    rejected: byStat['REJECTED'] || 0,
    total_escrowed: totalEscrowed,
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
