/**
 * BRIDGE AI OS — AP2 Negotiation Engine
 *
 * Manages the offer lifecycle for agent-to-agent service deals:
 *   PROPOSED -> COUNTERED -> ACCEPTED -> REJECTED
 *
 * Accepted offers create escrow via agent-ledger.
 * Persisted to SQLite via better-sqlite3.
 */

'use strict';

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { getService, PRICING } = require('./ap2-catalog');

// Graceful require for ledger
let ledger;
try { ledger = require('../agent-ledger'); } catch (_) { ledger = null; }

// ── SQLite persistence ────────────────────────────────────────────────────
const DB_PATH = path.join(__dirname, '..', '..', 'data', 'ap2-offers.db');

let _db = null;
function db() {
  if (_db) return _db;
  const Database = require('better-sqlite3');
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.exec(`
    CREATE TABLE IF NOT EXISTS ap2_offers (
      offer_id     TEXT PRIMARY KEY,
      from_agent   TEXT NOT NULL,
      to_agent     TEXT NOT NULL,
      service_id   TEXT NOT NULL,
      service_name TEXT,
      price_brdg   REAL NOT NULL,
      market_rate  REAL,
      status       TEXT NOT NULL DEFAULT 'PROPOSED',
      history      TEXT DEFAULT '[]',
      escrow_tx    TEXT,
      payment_tx   TEXT,
      rejection_reason TEXT,
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_offers_status ON ap2_offers(status);
    CREATE INDEX IF NOT EXISTS idx_offers_from   ON ap2_offers(from_agent);
    CREATE INDEX IF NOT EXISTS idx_offers_to     ON ap2_offers(to_agent);
  `);
  return _db;
}

// Prepared statement cache
let _stmts = null;
function stmts() {
  if (_stmts) return _stmts;
  const d = db();
  _stmts = {
    insert: d.prepare(`INSERT INTO ap2_offers
      (offer_id, from_agent, to_agent, service_id, service_name, price_brdg, market_rate, status, history, escrow_tx, payment_tx, rejection_reason, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    get: d.prepare('SELECT * FROM ap2_offers WHERE offer_id = ?'),
    update: d.prepare(`UPDATE ap2_offers SET price_brdg = ?, status = ?, history = ?, escrow_tx = ?, payment_tx = ?, rejection_reason = ?, updated_at = ? WHERE offer_id = ?`),
    all: d.prepare('SELECT * FROM ap2_offers'),
    byStatus: d.prepare('SELECT * FROM ap2_offers WHERE status = ?'),
    countByStatus: d.prepare('SELECT status, COUNT(*) as c FROM ap2_offers GROUP BY status'),
    totalEscrowed: d.prepare("SELECT COALESCE(SUM(price_brdg), 0) as total FROM ap2_offers WHERE status = 'ACCEPTED'"),
    count: d.prepare('SELECT COUNT(*) as c FROM ap2_offers'),
  };
  return _stmts;
}

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
    history: JSON.parse(row.history || '[]'),
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
  const now = new Date().toISOString();
  const id = offerId();
  const history = [{ status: 'PROPOSED', price: priceBrdg, ts: now }];
  const marketRate = service ? service.price_brdg : priceBrdg;

  stmts().insert.run(
    id, fromAgent, toAgent, serviceId,
    service ? service.name : serviceId,
    priceBrdg, marketRate, 'PROPOSED',
    JSON.stringify(history), null, null, null, now, now
  );

  return {
    offer_id: id,
    from_agent: fromAgent,
    to_agent: toAgent,
    service_id: serviceId,
    service_name: service ? service.name : serviceId,
    price_brdg: priceBrdg,
    market_rate: marketRate,
    status: 'PROPOSED',
    history: history,
    created_at: now,
    updated_at: now,
    escrow_tx: null,
    payment_tx: null,
  };
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
  const offer = rowToOffer(stmts().get.get(id));
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

  stmts().update.run(offer.price_brdg, offer.status, JSON.stringify(offer.history), offer.escrow_tx || null, offer.payment_tx || null, offer.rejection_reason || null, offer.updated_at, id);

  return offer;
}

/**
 * Accept an offer — creates escrow via agent-ledger.
 * @param {string} id — offer ID
 * @returns {object} accepted offer with escrow transaction
 */
function acceptOffer(id) {
  const offer = rowToOffer(stmts().get.get(id));
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

  const now = new Date().toISOString();
  offer.status = 'ACCEPTED';
  offer.escrow_tx = escrowResult ? escrowResult.tx_id : null;
  offer.updated_at = now;
  offer.history.push({ status: 'ACCEPTED', price: offer.price_brdg, escrow_tx: offer.escrow_tx, ts: now });

  stmts().update.run(offer.price_brdg, offer.status, JSON.stringify(offer.history), offer.escrow_tx || null, offer.payment_tx || null, offer.rejection_reason || null, offer.updated_at, id);

  return offer;
}

/**
 * Reject an offer with a reason.
 * @param {string} id — offer ID
 * @param {string} reason — rejection reason
 * @returns {object} rejected offer
 */
function rejectOffer(id, reason) {
  const offer = rowToOffer(stmts().get.get(id));
  if (!offer) throw new Error('Offer not found: ' + id);
  if (offer.status === 'ACCEPTED') {
    throw new Error('Cannot reject an already accepted offer');
  }

  const now = new Date().toISOString();
  offer.status = 'REJECTED';
  offer.rejection_reason = reason || 'No reason provided';
  offer.updated_at = now;
  offer.history.push({ status: 'REJECTED', reason: offer.rejection_reason, ts: now });

  stmts().update.run(offer.price_brdg, offer.status, JSON.stringify(offer.history), offer.escrow_tx || null, offer.payment_tx || null, offer.rejection_reason, offer.updated_at, id);

  return offer;
}

/**
 * Get an offer by ID.
 */
function getOffer(id) {
  return rowToOffer(stmts().get.get(id));
}

/**
 * Get all offers with optional status filter.
 */
function getAllOffers(statusFilter) {
  if (statusFilter) {
    return stmts().byStatus.all(statusFilter).map(rowToOffer);
  }
  return stmts().all.all().map(rowToOffer);
}

/**
 * Get negotiation stats.
 */
function getStats() {
  const total = stmts().count.get().c;
  const rows = stmts().countByStatus.all();
  const byStat = {};
  rows.forEach(r => { byStat[r.status] = r.c; });
  const totalEscrowed = stmts().totalEscrowed.get().total;

  return {
    total,
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
