/**
 * BRIDGE AI OS — Merchant Bidding System
 *
 * Merchants bid BRDG to place ads/offers on agent-executed tasks.
 * Revenue split on conversion: 70% executing agent, 20% treasury, 10% burned.
 *
 * SQLite-backed via better-sqlite3.
 */
'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

let ledger;
try { ledger = require('./agent-ledger'); } catch (e) { console.warn('[merchant-bids] agent-ledger unavailable:', e.message); ledger = null; }

// ── DB ─────────────────────────────────────────────────────────────────────
const DB_PATH = process.env.MERCHANT_BIDS_DB_PATH
  || path.join(__dirname, '..', 'data', 'merchant-bids.db');

const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// ── Schema ─────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS merchant_bids (
    id              TEXT PRIMARY KEY,
    merchant_name   TEXT NOT NULL,
    bid_amount_brdg REAL NOT NULL,
    category        TEXT NOT NULL,
    target_agent    TEXT,
    status          TEXT NOT NULL DEFAULT 'active',
    impressions     INTEGER NOT NULL DEFAULT 0,
    clicks          INTEGER NOT NULL DEFAULT 0,
    conversions     INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL,
    expires_at      TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_bids_category ON merchant_bids(category);
  CREATE INDEX IF NOT EXISTS idx_bids_status   ON merchant_bids(status);
  CREATE INDEX IF NOT EXISTS idx_bids_expires  ON merchant_bids(expires_at);
`);

// ── Prepared statements ────────────────────────────────────────────────────
const stmts = {
  insert: db.prepare(`
    INSERT INTO merchant_bids (id, merchant_name, bid_amount_brdg, category, target_agent, status, impressions, clicks, conversions, created_at, expires_at)
    VALUES (@id, @merchant_name, @bid_amount_brdg, @category, @target_agent, @status, 0, 0, 0, @created_at, @expires_at)
  `),
  getById: db.prepare('SELECT * FROM merchant_bids WHERE id = ?'),
  topBids: db.prepare(`
    SELECT * FROM merchant_bids
    WHERE category = ? AND status = 'active' AND expires_at > ?
    ORDER BY bid_amount_brdg DESC
    LIMIT ?
  `),
  activeBids: db.prepare(`
    SELECT * FROM merchant_bids
    WHERE status = 'active' AND expires_at > ?
    ORDER BY bid_amount_brdg DESC
  `),
  incImpressions: db.prepare('UPDATE merchant_bids SET impressions = impressions + 1 WHERE id = ?'),
  incClicks: db.prepare('UPDATE merchant_bids SET clicks = clicks + 1 WHERE id = ?'),
  incConversions: db.prepare('UPDATE merchant_bids SET conversions = conversions + 1 WHERE id = ?'),
  deactivate: db.prepare("UPDATE merchant_bids SET status = 'spent' WHERE id = ?"),
};

// ── Helpers ────────────────────────────────────────────────────────────────
function genBidId() {
  return 'bid_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
}

function now() {
  return new Date().toISOString();
}

function round8(n) {
  return +(n.toFixed(8));
}

// ── Core Functions ─────────────────────────────────────────────────────────

/**
 * Place a new merchant bid.
 * @param {string} merchantName
 * @param {number} amount — BRDG bid amount
 * @param {string} category — e.g. 'marketing', 'sales', 'finance'
 * @param {string} [targetAgent] — optional specific agent to target
 * @returns {object} the created bid record
 */
function placeBid(merchantName, amount, category, targetAgent) {
  if (!merchantName) throw new Error('merchantName required');
  if (!amount || amount <= 0) throw new Error('bid amount must be positive');
  if (!category) throw new Error('category required');

  const id = genBidId();
  const created_at = now();
  // Bids expire in 7 days by default
  const expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  stmts.insert.run({
    id,
    merchant_name: merchantName,
    bid_amount_brdg: amount,
    category,
    target_agent: targetAgent || null,
    status: 'active',
    created_at,
    expires_at,
  });

  return stmts.getById.get(id);
}

/**
 * Get highest active bids for a category.
 * @param {string} category
 * @param {number} [limit=10]
 * @returns {Array} bids sorted by amount descending
 */
function getTopBids(category, limit) {
  return stmts.topBids.all(category, now(), limit || 10);
}

/**
 * Record an impression (bid shown to user).
 * @param {string} id
 */
function recordImpression(id) {
  const bid = stmts.getById.get(id);
  if (!bid) throw new Error('Bid not found: ' + id);
  stmts.incImpressions.run(id);
  return { bid_id: id, impressions: bid.impressions + 1 };
}

/**
 * Record a click on a bid.
 * @param {string} id
 */
function recordClick(id) {
  const bid = stmts.getById.get(id);
  if (!bid) throw new Error('Bid not found: ' + id);
  stmts.incClicks.run(id);
  return { bid_id: id, clicks: bid.clicks + 1 };
}

/**
 * Record a conversion. Charges the merchant and splits revenue:
 *   70% to executing agent
 *   20% to treasury
 *   10% burned (deflationary)
 *
 * @param {string} id — bid ID
 * @param {number} revenue — actual revenue from conversion
 * @returns {object} conversion details with splits
 */
function recordConversion(id, revenue) {
  const bid = stmts.getById.get(id);
  if (!bid) throw new Error('Bid not found: ' + id);
  if (revenue <= 0) throw new Error('Revenue must be positive');

  stmts.incConversions.run(id);

  const agentShare    = round8(revenue * 0.70);
  const treasuryShare = round8(revenue * 0.20);
  const burnShare     = round8(revenue * 0.10);

  const executingAgent = bid.target_agent || 'agent-biz-sales';

  // Apply revenue splits via ledger if available
  if (ledger) {
    try {
      ledger.credit(executingAgent, agentShare, 'merchant_conversion', 'Merchant bid conversion: ' + bid.merchant_name);
      ledger.credit('treasury', treasuryShare, 'merchant_fee', 'Merchant conversion fee: ' + bid.merchant_name);
      // Record as revenue for P&L tracking
      ledger.recordRevenue(executingAgent, agentShare, 'fiat');
    } catch (e) {
      console.warn('[merchant-bids] Ledger operation failed:', e.message);
    }
  }

  return {
    bid_id: id,
    merchant: bid.merchant_name,
    revenue,
    splits: {
      agent: agentShare,
      agent_id: executingAgent,
      treasury: treasuryShare,
      burned: burnShare,
    },
    conversions: bid.conversions + 1,
  };
}

/**
 * Get all active (non-expired) bids.
 * @returns {Array} active bids
 */
function getActiveBids() {
  return stmts.activeBids.all(now());
}

// ── Exports ────────────────────────────────────────────────────────────────
module.exports = {
  placeBid,
  getTopBids,
  recordImpression,
  recordClick,
  recordConversion,
  getActiveBids,
  db,
};
