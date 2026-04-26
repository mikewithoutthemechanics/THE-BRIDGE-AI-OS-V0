/**
 * BRIDGE AI OS — Attribution Events
 *
 * Tracks all significant user actions (NeuroLink outputs, ideas, model inferences)
 * and logs them as attributed events. This creates an auditable trail for:
 *
 * - User contribution tracking
 * - Economic trigger points (rewards, payouts)
 * - System auditability
 * - Leaderboards and analytics
 *
 * Tables:
 *   attribution_events — immutable log of actions with user attribution
 *
 * Usage:
 *   const events = require('./lib/attribution-events');
 *   await events.logEvent(userId, 'neurolink_output', outputId, {
 *     tokens: 1542,
 *     quality_score: 0.87,
 *     agent: 'intelligence'
 *   });
 */

'use strict';

const { supabase } = require('./supabase');
const crypto = require('crypto');

// ── Event Logging ──────────────────────────────────────────────────────────────

/**
 * Log an attributed event (action by user)
 * @param {string} userId - User ID (can be null for anonymous events)
 * @param {string} eventType - Event category ('neurolink_output', 'idea_submitted', etc)
 * @param {string} referenceId - ID of the thing being created (output ID, idea ID, etc)
 * @param {object} metadata - Event metadata (tokens, quality, etc)
 * @param {string} idempotencyKey - Optional: prevent duplicate logs of same event
 * @returns {object} inserted attribution_event row or null if duplicate
 */
async function logEvent(userId, eventType, referenceId, metadata = {}, idempotencyKey = null) {
  if (!eventType) throw new Error('[Attribution] eventType required');

  // Extract high-volume fields for indexed queries
  const tokensUsed = metadata.tokens || null;
  const qualityScore = metadata.quality_score || null;

  const payload = {
    user_id: userId || null,
    event_type: eventType,
    reference_id: referenceId || null,
    tokens_used: tokensUsed,
    quality_score: qualityScore,
    metadata: metadata || {},
    idempotency_key: idempotencyKey,
  };

  const { data, error } = await supabase
    .from('attribution_events')
    .insert(payload)
    .select()
    .single();

  // Unique constraint on idempotency_key → duplicate insert, return null (not an error)
  if (error && error.code === '23505') {
    console.log('[Attribution] Duplicate event (idempotency_key exists), skipping');
    return null;
  }

  if (error) {
    console.warn('[Attribution] logEvent failed:', error.message);
    return null;
  }

  return data;
}

/**
 * Get all attributed events for a user with optional filtering
 * @param {string} userId - User ID
 * @param {object} options - Filter/sort options
 *   - eventType: string (filter by event type)
 *   - since: ISO timestamp (events since this time)
 *   - limit: number (default 100)
 * @returns {array} attribution_event rows
 */
async function getEventsByUser(userId, options = {}) {
  let query = supabase
    .from('attribution_events')
    .select('*')
    .eq('user_id', userId);

  if (options.eventType) {
    query = query.eq('event_type', options.eventType);
  }

  if (options.since) {
    query = query.gte('created_at', options.since);
  }

  query = query.order('created_at', { ascending: false });

  if (options.limit) {
    query = query.limit(options.limit);
  } else {
    query = query.limit(100);
  }

  const { data, error } = await query;

  if (error) {
    console.warn('[Attribution] getEventsByUser failed:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Get all unrewarded events (for reward processing loop)
 * @param {string} eventType - Optional: filter by event type
 * @param {string} since - Optional: ISO timestamp cutoff
 * @returns {array} unrewarded attribution_event rows
 */
async function getUnrewardedEvents(eventType = null, since = null) {
  const args = {};
  if (eventType) args.p_event_type = eventType;
  if (since) args.p_since = since;

  const { data, error } = await supabase.rpc('get_unrewarded_events', args);

  if (error) {
    console.warn('[Attribution] getUnrewardedEvents failed:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Get aggregated stats for a user (total tokens, avg quality, event count)
 * @param {string} userId - User ID
 * @returns {object} {total_events, total_tokens, avg_quality, unrewarded_count, last_event_at}
 */
async function getUserEventStats(userId) {
  const { data, error } = await supabase.rpc('get_user_event_stats', { p_user_id: userId });

  if (error) {
    console.warn('[Attribution] getUserEventStats failed:', error.message);
    return null;
  }

  return data?.[0] || null;
}

/**
 * Mark an event as rewarded (called after payout is processed)
 * @param {string} eventId - Attribution event ID
 * @param {number} rewardAmount - Amount paid out
 * @returns {boolean} success
 */
async function markEventRewarded(eventId, rewardAmount = null) {
  const { error } = await supabase
    .from('attribution_events')
    .update({
      rewarded_at: new Date().toISOString(),
      reward_amount: rewardAmount,
    })
    .eq('id', eventId);

  if (error) {
    console.warn('[Attribution] markEventRewarded failed:', error.message);
    return false;
  }

  return true;
}

/**
 * Get events by type across all users (for leaderboards, analytics)
 * @param {string} eventType - Event type to query
 * @param {object} options
 *   - limit: number (default 100)
 *   - unrewardedOnly: boolean
 *   - since: ISO timestamp
 * @returns {array} attribution_event rows
 */
async function getEventsByType(eventType, options = {}) {
  let query = supabase
    .from('attribution_events')
    .select('*')
    .eq('event_type', eventType);

  if (options.unrewardedOnly) {
    query = query.is('rewarded_at', null);
  }

  if (options.since) {
    query = query.gte('created_at', options.since);
  }

  query = query.order('created_at', { ascending: false });

  if (options.limit) {
    query = query.limit(options.limit);
  } else {
    query = query.limit(100);
  }

  const { data, error } = await query;

  if (error) {
    console.warn('[Attribution] getEventsByType failed:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Generate deterministic idempotency key from event details
 * Useful for ensuring same logical event isn't logged twice
 * @param {string} userId - User ID
 * @param {string} eventType - Event type
 * @param {string} referenceId - Reference ID
 * @returns {string} idempotency key (SHA-256 hex)
 */
function generateIdempotencyKey(userId, eventType, referenceId) {
  const input = `${userId}:${eventType}:${referenceId}`;
  return crypto.createHash('sha256').update(input).digest('hex');
}

// ── Exports ────────────────────────────────────────────────────────────────────

module.exports = {
  logEvent,
  getEventsByUser,
  getUnrewardedEvents,
  getUserEventStats,
  markEventRewarded,
  getEventsByType,
  generateIdempotencyKey,
};
