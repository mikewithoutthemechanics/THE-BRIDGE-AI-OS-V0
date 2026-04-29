/**
 * NeuroLink Attribution Integration
 *
 * Hooks NeuroLink events into the attribution system.
 * This creates an auditable trail of all cognitive state changes,
 * inferences, and monetization triggers attributed to users.
 *
 * Wires into:
 * - MultiUserStream (state ingestion)
 * - LiveMonetizationOrchestrator (trigger execution)
 * - NeuroLinkService (inference completions)
 *
 * Usage:
 *   const integration = require('./lib/neurolink-attribution-integration');
 *   integration.setupNeuroLinkAttribution(neuroLinkService, attributionEvents);
 */

'use strict';

const attributionEvents = require('./attribution-events');

/**
 * Set up attribution logging for NeuroLink events
 * Call this once after NeuroLink service is initialized
 * @param {object} neuroLinkService - NeuroLinkService instance
 * @param {object} attributionEventsModule - attribution-events module (optional, defaults to require)
 */
function setupNeuroLinkAttribution(neuroLinkService, attributionEventsModule = null) {
  const events = attributionEventsModule || require('./attribution-events');

  console.log('[NeuroLink Attribution] Setting up event hooks...');

  const stream = neuroLinkService.multiUserStream;
  const orchestrator = neuroLinkService.liveOrchestrator;

  // ── Hook 1: State Ingestion ─────────────────────────────────────────────────
  // Log every cognitive state inference
  if (stream) {
    stream.on('state:ingested', async (data) => {
      const { userId, state, predictions, observationCount } = data;

      const idempotencyKey = events.generateIdempotencyKey(
        userId,
        'neurolink_state_inference',
        `${userId}_obs_${observationCount}`
      );

      await events.logEvent(
        userId,
        'neurolink_state_inference',
        null,
        {
          observation_count: observationCount,
          state_v: state?.v || null,
          state_a: state?.a || null,
          state_d: state?.d || null,
          has_predictions: !!predictions,
          timestamp: new Date().toISOString(),
        },
        idempotencyKey
      ).catch(err => {
        console.warn('[NeuroLink Attribution] Failed to log state inference:', err.message);
      });
    });

    // Hook 2: User Registration
    stream.on('user:registered', async (data) => {
      const { userId, metadata } = data;

      await events.logEvent(
        userId,
        'neurolink_user_registered',
        userId,
        {
          metadata: metadata || {},
          timestamp: new Date().toISOString(),
        }
      ).catch(err => {
        console.warn('[NeuroLink Attribution] Failed to log user registration:', err.message);
      });
    });
  }

  // ── Hook 2: Monetization Trigger Execution ──────────────────────────────────
  // Log when a trigger fires (high conversion, churn risk, fatigue, etc)
  if (orchestrator) {
    orchestrator.on?.('trigger:executed', async (data) => {
      const { trigger, userId, action, result } = data;

      const idempotencyKey = events.generateIdempotencyKey(
        userId,
        `monetization_${trigger.type}`,
        action?.id
      );

      await events.logEvent(
        userId,
        `monetization_trigger_${trigger.type}`,
        action?.id,
        {
          trigger_type: trigger.type,
          action_type: action?.type,
          success: result?.success,
          revenue: result?.revenue || null,
          metadata: trigger.metadata || {},
          timestamp: new Date().toISOString(),
        },
        idempotencyKey
      ).catch(err => {
        console.warn('[NeuroLink Attribution] Failed to log trigger execution:', err.message);
      });
    });
  }

  console.log('[NeuroLink Attribution] Hooks initialized');
}

/**
 * Log a NeuroLink inference completion (higher-level action)
 * Call this when an inference produces meaningful output
 * @param {string} userId - User ID
 * @param {string} inferenceId - Unique ID for this inference
 * @param {object} result - Inference result/output
 * @param {object} metadata - Additional metadata
 */
async function logNeuroLinkOutput(userId, inferenceId, result = {}, metadata = {}) {
  const idempotencyKey = attributionEvents.generateIdempotencyKey(
    userId,
    'neurolink_output',
    inferenceId
  );

  return attributionEvents.logEvent(
    userId,
    'neurolink_output',
    inferenceId,
    {
      tokens_used: result.tokens || 0,
      quality_score: result.quality_score || null,
      model: result.model || 'neurolink-default',
      latency_ms: result.latency_ms || null,
      ...metadata,
      timestamp: new Date().toISOString(),
    },
    idempotencyKey
  );
}

/**
 * Log a monetization action completion
 * @param {string} userId - User ID
 * @param {string} actionType - Type of action ('offer_campaign', 'retention', 'autopilot', etc)
 * @param {string} actionId - Unique ID for this action
 * @param {object} result - Action result
 */
async function logMonetizationAction(userId, actionType, actionId, result = {}) {
  const idempotencyKey = attributionEvents.generateIdempotencyKey(
    userId,
    `action_${actionType}`,
    actionId
  );

  return attributionEvents.logEvent(
    userId,
    `monetization_action_${actionType}`,
    actionId,
    {
      action_type: actionType,
      success: result.success || false,
      revenue: result.revenue || null,
      users_affected: result.users_affected || 1,
      metadata: result.metadata || {},
      timestamp: new Date().toISOString(),
    },
    idempotencyKey
  );
}

/**
 * Get NeuroLink attribution stats for a user
 * Summarizes their cognitive activity and monetization history
 * @param {string} userId - User ID
 * @returns {object} stats
 */
async function getNeuroLinkStats(userId) {
  const stats = await attributionEvents.getUserEventStats(userId);

  // Get breakdown by event type
  const inferences = await attributionEvents.getEventsByUser(userId, {
    eventType: 'neurolink_state_inference',
    limit: 1000,
  });

  const outputs = await attributionEvents.getEventsByUser(userId, {
    eventType: 'neurolink_output',
    limit: 100,
  });

  const triggers = await attributionEvents.getEventsByType('monetization_trigger_*', {
    limit: 100,
  });

  return {
    overall: stats,
    inference_count: inferences.length,
    output_count: outputs.length,
    triggered_count: triggers.filter(t => t.user_id === userId).length,
    latest_inference: inferences?.[0]?.created_at,
    latest_output: outputs?.[0]?.created_at,
  };
}

// ── Exports ────────────────────────────────────────────────────────────────────

module.exports = {
  setupNeuroLinkAttribution,
  logNeuroLinkOutput,
  logMonetizationAction,
  getNeuroLinkStats,
};
