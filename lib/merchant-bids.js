/**
 * BRIDGE AI OS -- Merchant Bidding System
 *
 * Merchants bid BRDG to place ads/offers on agent-executed tasks.
 * Revenue split on conversion: 70% executing agent, 20% treasury, 10% burned.
 *
 * Supabase-backed via @supabase/supabase-js.
 */
'use strict';

const { supabase } = require('./supabase');
const crypto = require('crypto');

let ledger;
try { ledger = require('./agent-ledger'); } catch (e) { console.warn('[merchant-bids] agent-ledger unavailable:', e.message); ledger = null; }

// -- Helpers ----------------------------------------------------------------
function genBidId() {
  return 'bid_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
}

function now() {
  return new Date().toISOString();
}

function round8(n) {
  return +(n.toFixed(8));
}

// -- Core Functions ---------------------------------------------------------

/**
 * Place a new merchant bid.
 * @param {string} merchantName
 * @param {number} amount - BRDG bid amount
 * @param {string} category - e.g. 'marketing', 'sales', 'finance'
 * @param {string} [targetAgent] - optional specific agent to target
 * @returns {Promise<object>} the created bid record
 */
async function placeBid(merchantName, amount, category, targetAgent) {
  if (!merchantName) throw new Error('merchantName required');
  if (!amount || amount <= 0) throw new Error('bid amount must be positive');
  if (!category) throw new Error('category required');

  const id = genBidId();
  const created_at = now();
  // Bids expire in 7 days by default
  const expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('merchant_bids')
    .insert({
      id,
      merchant_name: merchantName,
      bid_amount_brdg: amount,
      category,
      target_agent: targetAgent || null,
      status: 'active',
      impressions: 0,
      clicks: 0,
      conversions: 0,
      created_at,
      expires_at,
    })
    .select()
    .single();

  if (error) throw new Error('Failed to place bid: ' + error.message);
  return data;
}

/**
 * Get highest active bids for a category.
 * @param {string} category
 * @param {number} [limit=10]
 * @returns {Promise<Array>} bids sorted by amount descending
 */
async function getTopBids(category, limit) {
  const { data, error } = await supabase
    .from('merchant_bids')
    .select('*')
    .eq('category', category)
    .eq('status', 'active')
    .gt('expires_at', now())
    .order('bid_amount_brdg', { ascending: false })
    .limit(limit || 10);

  if (error) throw new Error('Failed to get top bids: ' + error.message);
  return data || [];
}

/**
 * Record an impression (bid shown to user).
 * @param {string} id
 * @returns {Promise<object>}
 */
async function recordImpression(id) {
  const { data: bid, error: fetchErr } = await supabase
    .from('merchant_bids')
    .select('impressions')
    .eq('id', id)
    .single();

  if (fetchErr || !bid) throw new Error('Bid not found: ' + id);

  const { error } = await supabase
    .from('merchant_bids')
    .update({ impressions: bid.impressions + 1 })
    .eq('id', id);

  if (error) throw new Error('Failed to record impression: ' + error.message);
  return { bid_id: id, impressions: bid.impressions + 1 };
}

/**
 * Record a click on a bid.
 * @param {string} id
 * @returns {Promise<object>}
 */
async function recordClick(id) {
  const { data: bid, error: fetchErr } = await supabase
    .from('merchant_bids')
    .select('clicks')
    .eq('id', id)
    .single();

  if (fetchErr || !bid) throw new Error('Bid not found: ' + id);

  const { error } = await supabase
    .from('merchant_bids')
    .update({ clicks: bid.clicks + 1 })
    .eq('id', id);

  if (error) throw new Error('Failed to record click: ' + error.message);
  return { bid_id: id, clicks: bid.clicks + 1 };
}

/**
 * Record a conversion. Charges the merchant and splits revenue:
 *   70% to executing agent
 *   20% to treasury
 *   10% burned (deflationary)
 *
 * @param {string} id - bid ID
 * @param {number} revenue - actual revenue from conversion
 * @returns {Promise<object>} conversion details with splits
 */
async function recordConversion(id, revenue) {
  const { data: bid, error: fetchErr } = await supabase
    .from('merchant_bids')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchErr || !bid) throw new Error('Bid not found: ' + id);
  if (revenue <= 0) throw new Error('Revenue must be positive');

  const { error } = await supabase
    .from('merchant_bids')
    .update({ conversions: bid.conversions + 1 })
    .eq('id', id);

  if (error) throw new Error('Failed to record conversion: ' + error.message);

  const agentShare    = round8(revenue * 0.70);
  const treasuryShare = round8(revenue * 0.20);
  const burnShare     = round8(revenue * 0.10);

  const executingAgent = bid.target_agent || 'agent-biz-sales';

  // Apply revenue splits via ledger if available
  if (ledger) {
    try {
      // Debit merchant first -- funds must come from somewhere
      ledger.debit(bid.merchant_agent || bid.merchant_name, bid.bid_amount_brdg, 'merchant_conversion', 'Merchant bid conversion: ' + id);
      // Credit agent and treasury shares
      ledger.credit(executingAgent, agentShare, 'merchant_conversion', 'Merchant bid conversion: ' + bid.merchant_name);
      ledger.credit('treasury', treasuryShare, 'merchant_fee', 'Merchant conversion fee: ' + bid.merchant_name);
      // Burn the burn share (deflationary)
      ledger.debit('treasury', burnShare, 'burn', 'Merchant bid burn: ' + id);
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
 * @returns {Promise<Array>} active bids
 */
async function getActiveBids() {
  const { data, error } = await supabase
    .from('merchant_bids')
    .select('*')
    .eq('status', 'active')
    .gt('expires_at', now())
    .order('bid_amount_brdg', { ascending: false });

  if (error) throw new Error('Failed to get active bids: ' + error.message);
  return data || [];
}

// -- Exports ----------------------------------------------------------------
module.exports = {
  placeBid,
  getTopBids,
  recordImpression,
  recordClick,
  recordConversion,
  getActiveBids,
};
