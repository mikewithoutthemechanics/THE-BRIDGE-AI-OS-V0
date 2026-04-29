// =============================================================================
// BRIDGE AI OS — Event Bus
// Redis Pub/Sub-based event system for task completion and state synchronization
// =============================================================================
'use strict';

const IORedis = require('ioredis');

// Event bus channels
const CHANNELS = {
  TASK_COMPLETED: 'task.completed',
  TASK_FAILED: 'task.failed',
  GOAL_UPDATED: 'goal.updated',
  WORKER_STATUS: 'worker.status',
  SYSTEM_HEALTH: 'system.health',
};

// Event bus class
class EventBus {
  constructor() {
    this.redisAvailable = false;
    this.publisher = null;
    this.subscriber = null;
    this.listeners = new Map(); // channel -> [listeners]
    this.initialized = false;
  }

  // Initialize Redis connections
  async initialize() {
    if (this.initialized) return;

    try {
      const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

      // Publisher connection
      this.publisher = new IORedis(REDIS_URL, {
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 100,
        enableReadyCheck: false,
        lazyConnect: true
      });

      // Subscriber connection (separate for pub/sub pattern)
      this.subscriber = new IORedis(REDIS_URL, {
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 100,
        enableReadyCheck: false,
        lazyConnect: true
      });

      // Set up subscriber event handlers
      this.subscriber.on('message', (channel, message) => {
        this.handleMessage(channel, message);
      });

      // Subscribe to channels
      await this.subscriber.subscribe(...Object.values(CHANNELS));

      this.redisAvailable = true;
      this.initialized = true;

      console.log('[EVENTBUS] Redis event bus initialized');

    } catch (e) {
      console.warn('[EVENTBUS] Redis not available for event bus:', e.message);
      // Fallback to in-memory event system
      this.redisAvailable = false;
      this.initialized = true;
    }
  }

  // Publish event to channel
  async publish(channel, data) {
    if (!this.initialized) await this.initialize();

    const message = JSON.stringify({
      timestamp: new Date().toISOString(),
      data,
    });

    if (this.redisAvailable && this.publisher) {
      try {
        await this.publisher.publish(channel, message);
        console.log(`[EVENTBUS] Published to ${channel}`);
      } catch (e) {
        console.error(`[EVENTBUS] Failed to publish to ${channel}:`, e.message);
      }
    } else {
      // In-memory fallback: directly call listeners
      this.handleMessage(channel, message);
    }
  }

  // Subscribe to channel with listener function
  on(channel, listener) {
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, []);
    }
    this.listeners.get(channel).push(listener);
  }

  // Handle incoming messages
  handleMessage(channel, message) {
    try {
      const parsed = JSON.parse(message);
      const listeners = this.listeners.get(channel) || [];

      listeners.forEach(listener => {
        try {
          listener(parsed.data, parsed.timestamp);
        } catch (e) {
          console.error(`[EVENTBUS] Listener error for ${channel}:`, e.message);
        }
      });
    } catch (e) {
      console.error(`[EVENTBUS] Failed to parse message on ${channel}:`, e.message);
    }
  }

  // Convenience methods for specific events
  async taskCompleted(taskId, result) {
    await this.publish(CHANNELS.TASK_COMPLETED, { taskId, result });
  }

  async taskFailed(taskId, error) {
    await this.publish(CHANNELS.TASK_FAILED, { taskId, error });
  }

  async goalUpdated(goalId, status, progress) {
    await this.publish(CHANNELS.GOAL_UPDATED, { goalId, status, progress });
  }

  async workerStatus(workerId, status, stats) {
    await this.publish(CHANNELS.WORKER_STATUS, { workerId, status, stats });
  }

  async systemHealth(component, status, metrics) {
    await this.publish(CHANNELS.SYSTEM_HEALTH, { component, status, metrics });
  }

  // Get event bus status
  getStatus() {
    return {
      initialized: this.initialized,
      redis_available: this.redisAvailable,
      channels: Object.values(CHANNELS),
      listeners: Array.from(this.listeners.entries()).map(([channel, listeners]) => ({
        channel,
        count: listeners.length,
      })),
    };
  }

  // Close connections
  async close() {
    if (this.publisher) {
      try {
        await this.publisher.quit();
      } catch (e) {
        console.error('[EVENTBUS] Error closing publisher:', e.message);
      }
    }

    if (this.subscriber) {
      try {
        await this.subscriber.quit();
      } catch (e) {
        console.error('[EVENTBUS] Error closing subscriber:', e.message);
      }
    }

    console.log('[EVENTBUS] Event bus closed');
  }
}

// Singleton instance
const eventBus = new EventBus();

// Graceful shutdown
process.on('SIGTERM', () => eventBus.close());
process.on('SIGINT', () => eventBus.close());

module.exports = {
  eventBus,
  CHANNELS,
};