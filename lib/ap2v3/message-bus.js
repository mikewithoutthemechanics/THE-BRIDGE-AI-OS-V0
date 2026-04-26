/**
 * BRIDGE AI OS — AP2-v3 Message Bus
 *
 * In-memory pub/sub event bus for inter-agent communication.
 * All events are logged with timestamps for audit and debugging.
 *
 * Standard channels:
 *   agent.start    — agent begins processing
 *   agent.complete — agent finishes successfully
 *   agent.error    — agent encounters an error
 *   chain.step     — one step in a multi-agent chain completes
 *   chain.complete — full chain completes
 *   economy.score  — economic score event (revenue, cost, etc.)
 */

'use strict';

// ── Configuration ──────────────────────────────────────────────────────────
const MAX_EVENT_LOG = 1000; // keep last N events in memory

const STANDARD_CHANNELS = [
  'agent.start',
  'agent.complete',
  'agent.error',
  'chain.step',
  'chain.complete',
  'economy.score',
];

// ── State ──────────────────────────────────────────────────────────────────
// Map<channel, Set<handler>>
const subscribers = new Map();

// Circular buffer of logged events
const eventLog = [];

// ── Internal helpers ───────────────────────────────────────────────────────

function logEvent(channel, message) {
  const entry = {
    channel,
    message,
    ts: new Date().toISOString(),
  };

  eventLog.push(entry);

  // Trim to max size
  while (eventLog.length > MAX_EVENT_LOG) {
    eventLog.shift();
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Publish a message to a channel. All subscribers are invoked synchronously.
 * Errors in individual handlers are caught and logged, never propagated.
 *
 * @param {string} channel — channel name
 * @param {*} message      — payload (any serializable value)
 * @returns {{ channel: string, subscriberCount: number, ts: string }}
 */
function publish(channel, message) {
  if (!channel) throw new Error('AP2-v3 Bus: channel is required');

  // Log every event
  logEvent(channel, message);

  const handlers = subscribers.get(channel);
  let subscriberCount = 0;

  if (handlers && handlers.size > 0) {
    subscriberCount = handlers.size;
    for (const handler of handlers) {
      try {
        handler(message, channel);
      } catch (e) {
        console.error('[AP2-v3 Bus] Handler error on channel "' + channel + '":', e.message);
        // Log the error as a separate event
        logEvent('bus.handler_error', {
          original_channel: channel,
          error: e.message,
        });
      }
    }
  }

  return {
    channel,
    subscriberCount,
    ts: new Date().toISOString(),
  };
}

/**
 * Subscribe a handler to a channel.
 *
 * @param {string} channel      — channel name
 * @param {Function} handler    — callback(message, channel)
 * @returns {Function} unsubscribe function for convenience
 */
function subscribe(channel, handler) {
  if (!channel) throw new Error('AP2-v3 Bus: channel is required');
  if (typeof handler !== 'function') throw new Error('AP2-v3 Bus: handler must be a function');

  if (!subscribers.has(channel)) {
    subscribers.set(channel, new Set());
  }
  subscribers.get(channel).add(handler);

  // Return unsubscribe convenience function
  return function () {
    unsubscribe(channel, handler);
  };
}

/**
 * Unsubscribe a handler from a channel.
 *
 * @param {string} channel   — channel name
 * @param {Function} handler — the same function reference passed to subscribe
 * @returns {boolean} true if handler was found and removed
 */
function unsubscribe(channel, handler) {
  const handlers = subscribers.get(channel);
  if (!handlers) return false;
  const removed = handlers.delete(handler);
  if (handlers.size === 0) subscribers.delete(channel);
  return removed;
}

/**
 * Subscribe to a channel for a single event, then auto-unsubscribe.
 *
 * @param {string} channel   — channel name
 * @param {Function} handler — callback(message, channel)
 * @returns {Function} unsubscribe function
 */
function once(channel, handler) {
  if (typeof handler !== 'function') throw new Error('AP2-v3 Bus: handler must be a function');

  function wrapper(message, ch) {
    unsubscribe(channel, wrapper);
    handler(message, ch);
  }

  return subscribe(channel, wrapper);
}

/**
 * Get the last N events from the event log.
 *
 * @param {number} [limit=50] — number of events to return
 * @returns {Array<{ channel: string, message: *, ts: string }>}
 */
function getEventLog(limit = 50) {
  const count = Math.min(limit, eventLog.length);
  return eventLog.slice(-count);
}

/**
 * Get the count of subscribers on a given channel.
 *
 * @param {string} channel
 * @returns {number}
 */
function subscriberCount(channel) {
  const handlers = subscribers.get(channel);
  return handlers ? handlers.size : 0;
}

/**
 * List all channels that have at least one subscriber.
 *
 * @returns {string[]}
 */
function activeChannels() {
  return [...subscribers.keys()];
}

/**
 * Clear all subscribers and event log. Primarily for testing.
 */
function reset() {
  subscribers.clear();
  eventLog.length = 0;
}

module.exports = {
  publish,
  subscribe,
  unsubscribe,
  once,
  getEventLog,
  subscriberCount,
  activeChannels,
  reset,
  STANDARD_CHANNELS,
};
