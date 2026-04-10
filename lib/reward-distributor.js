/**
 * BRIDGE AI OS — Reward Distributor
 *
 * Processes unrewarded attribution events and distributes rewards.
 * Runs as a background job (cron-triggered or event-driven).
 *
 * Flow:
 * 1. Fetch unrewarded events (by type and time window)
 * 2. Calculate reward for each using scoring function
 * 3. Create treasury ledger entries (debit treasury, credit user)
 * 4. Mark events as rewarded
 * 5. (Future) Batch on-chain payout to user wallets
 *
 * Usage:
 *   const distributor = require('./lib/reward-distributor');
 *   await distributor.distributeRewards('neurolink_output', { hoursBack: 1 });
 */

'use strict';

const attributionEvents = require('./attribution-events');
const userIdentity = require('./user-identity');
const { supabase } = require('./supabase');
const crypto = require('crypto');

// ── Reward Calculation ─────────────────────────────────────────────────────────

/**
 * Calculate reward for an event based on quality and effort
 * @param {object} event - attribution_event row
 * @returns {number} reward amount (in token units)
 */
function calculateEventReward(event) {
  const metadata = event.metadata || {};

  // Base reward scaled by tokens used (e.g., 1 token = 0.1 points)
  const tokenReward = (event.tokens_used || 0) * 0.1;

  // Quality multiplier (0.0 - 1.0)
  const qualityMult = event.quality_score || 0.5;

  // Agent weight (some agents are more valuable)
  const agentWeight = {
    'intelligence': 1.5,
    'creative': 1.2,
    'closer': 1.8,
    'support': 0.8,
  }[metadata.agent] || 1.0;

  return Math.round(tokenReward * qualityMult * agentWeight * 100) / 100;
}

// ── Reward Distribution ────────────────────────────────────────────────────────

/**
 * Distribute rewards for unrewarded events
 * @param {string} eventType - Type of events to process ('neurolink_output', etc)
 * @param {object} options
 *   - hoursBack: number (default 24) - process events from last N hours
 *   - batchSize: number (default 100) - process in chunks to avoid timeout
 * @returns {object} {processed: number, skipped: number, totalReward: number}
 */
async function distributeRewards(eventType = 'neurolink_output', options = {}) {
  const hoursBack = options.hoursBack || 24;
  const batchSize = options.batchSize || 100;

  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

  let processed = 0;
  let skipped = 0;
  let totalReward = 0;

  console.log(`[Rewards] Processing ${eventType} events from last ${hoursBack}h...`);

  try {
    // Fetch unrewarded events
    const events = await attributionEvents.getUnrewardedEvents(eventType, since);

    if (events.length === 0) {
      console.log('[Rewards] No unrewarded events found');
      return { processed: 0, skipped: 0, totalReward: 0 };
    }

    // Process in batches
    for (let i = 0; i < events.length; i += batchSize) {
      const batch = events.slice(i, i + batchSize);

      for (const event of batch) {
        try {
          // Skip if no user (shouldn't happen but safety check)
          if (!event.user_id) {
            console.warn(`[Rewards] Event ${event.id} has no user_id, skipping`);
            skipped++;
            continue;
          }

          // Calculate reward
          const reward = calculateEventReward(event);

          // Create treasury ledger entry
          // Assumes treasury service handles: debit treasury → credit user
          const txGroupId = crypto.randomUUID();
          const ledgerResult = await createRewardLedgerEntry({
            user_id: event.user_id,
            event_id: event.id,
            amount: reward,
            event_type: eventType,
            tx_group: txGroupId,
          });

          if (!ledgerResult) {
            console.warn(`[Rewards] Failed to create ledger for event ${event.id}`);
            skipped++;
            continue;
          }

          // Mark event as rewarded
          const marked = await attributionEvents.markEventRewarded(event.id, reward);

          if (!marked) {
            console.warn(`[Rewards] Failed to mark event ${event.id} as rewarded`);
            skipped++;
            continue;
          }

          processed++;
          totalReward += reward;

          console.log(`[Rewards] Event ${event.id} → user ${event.user_id} earned ${reward} tokens`);
        } catch (err) {
          console.error(`[Rewards] Error processing event ${event.id}:`, err.message);
          skipped++;
        }
      }
    }

    console.log(`[Rewards] Complete: ${processed} rewarded, ${skipped} skipped, ${totalReward} tokens distributed`);
    return { processed, skipped, totalReward };
  } catch (err) {
    console.error('[Rewards] Distribution failed:', err.message);
    throw err;
  }
}

/**
 * Create a treasury ledger entry for reward payout
 * Assumes ledger table exists with: user_id, amount, source, metadata
 * @param {object} params
 * @returns {object} ledger row or null
 */
async function createRewardLedgerEntry(params) {
  const {
    user_id,
    event_id,
    amount,
    event_type,
    tx_group,
  } = params;

  try {
    const { data, error } = await supabase
      .from('ledger')
      .insert({
        user_id,
        amount,
        source: 'reward',
        reference_type: 'attribution_event',
        reference_id: event_id,
        metadata: {
          event_type,
          tx_group,
        },
      })
      .select()
      .single();

    if (error) {
      console.warn('[Rewards] createRewardLedgerEntry failed:', error.message);
      return null;
    }

    return data;
  } catch (err) {
    console.warn('[Rewards] Exception in createRewardLedgerEntry:', err.message);
    return null;
  }
}

/**
 * Get summary stats of reward distribution
 * @param {string} eventType - Type of events
 * @param {object} options
 *   - since: ISO timestamp
 * @returns {object} stats
 */
async function getRewardStats(eventType, options = {}) {
  const { data, error } = await supabase
    .from('attribution_events')
    .select('count,sum(reward_amount)::numeric')
    .eq('event_type', eventType)
    .not('rewarded_at', 'is', null);

  if (error) {
    console.warn('[Rewards] getRewardStats failed:', error.message);
    return null;
  }

  return {
    total_rewarded: data?.[0]?.count || 0,
    total_distributed: parseFloat(data?.[0]?.sum) || 0,
  };
}

// ── Exports ────────────────────────────────────────────────────────────────────

module.exports = {
  calculateEventReward,
  distributeRewards,
  createRewardLedgerEntry,
  getRewardStats,
};
