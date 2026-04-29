// =============================================================================
// BRIDGE AI OS — Queue Orchestration System
// BullMQ-based task queue with Redis backend for scalable agent orchestration
// =============================================================================
'use strict';

const { Queue, Worker } = require('bullmq');
const IORedis = require('ioredis');

// Redis configuration (fallback to in-memory for development)
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
let redisClient = null;

try {
  redisClient = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
    enableReadyCheck: false,
    lazyConnect: true
  });
} catch (e) {
  console.warn('[QUEUE] Redis not available, using in-memory mode:', e.message);
}

// Queue definitions — store the actual BullMQ queue names alongside the logical keys
const QUEUE_NAMES = {
  agent: 'agent-tasks',
  goal: 'goal-processing',
  architect: 'architect-planning',
};

const queues = {
  agent: new Queue(QUEUE_NAMES.agent, {
    connection: redisClient,
    defaultJobOptions: {
      removeOnComplete: 50,
      removeOnFail: 20,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    },
  }),

  goal: new Queue(QUEUE_NAMES.goal, {
    connection: redisClient,
    defaultJobOptions: {
      removeOnComplete: 10,
      removeOnFail: 5,
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    },
  }),

  architect: new Queue(QUEUE_NAMES.architect, {
    connection: redisClient,
    defaultJobOptions: {
      removeOnComplete: 20,
      removeOnFail: 10,
      attempts: 2,
      priority: 10, // High priority for planning
    },
  }),
};

// Queue operations
class QueueManager {
  constructor() {
    this.queues = queues;
    this.workers = new Map();
    this.redisAvailable = !!redisClient;
  }

  // Add job to queue
  async addJob(queueName, jobType, data, options = {}) {
    try {
      const queue = this.queues[queueName];
      if (!queue) throw new Error(`Queue ${queueName} not found`);

      const job = await queue.add(jobType, data, {
        priority: options.priority || 0,
        delay: options.delay || 0,
        ttl: options.ttl || 3600000, // 1 hour default
        ...options
      });

      console.log(`[QUEUE] Added job ${job.id} to ${queueName}: ${jobType}`);
      return job;
    } catch (e) {
      console.error(`[QUEUE] Failed to add job to ${queueName}:`, e.message);
      // Fallback: return mock job for development
      return { id: 'mock-' + Date.now(), data, status: 'queued' };
    }
  }

  // Register worker for queue
  registerWorker(queueName, jobTypes, processor) {
    try {
      const queue = this.queues[queueName];
      if (!queue) throw new Error(`Queue ${queueName} not found`);

      // Use the queue's actual name so the worker listens on the correct stream
      const actualQueueName = QUEUE_NAMES[queueName] || queueName;
      const worker = new Worker(actualQueueName, async (job) => {
        console.log(`[WORKER] Processing ${job.name} job ${job.id}`);
        try {
          const result = await processor(job);
          console.log(`[WORKER] Completed ${job.name} job ${job.id}`);
          return result;
        } catch (e) {
          console.error(`[WORKER] Failed ${job.name} job ${job.id}:`, e.message);
          throw e;
        }
      }, {
        connection: redisClient,
        concurrency: 5, // Process up to 5 jobs concurrently
      });

      worker.on('completed', (job) => {
        console.log(`[WORKER] Job ${job.id} completed successfully`);
      });

      worker.on('failed', (job, err) => {
        console.error(`[WORKER] Job ${job.id} failed:`, err.message);
      });

      this.workers.set(queueName, worker);
      console.log(`[QUEUE] Worker registered for ${queueName}`);

      return worker;
    } catch (e) {
      console.warn(`[QUEUE] Worker registration failed for ${queueName}:`, e.message);
      // Return mock worker for development
      return {
        on: () => {},
        close: () => Promise.resolve(),
      };
    }
  }

  // Get queue stats
  async getStats(queueName) {
    try {
      const queue = this.queues[queueName];
      if (!queue) throw new Error(`Queue ${queueName} not found`);

      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaiting(),
        queue.getActive(),
        queue.getCompleted(),
        queue.getFailed(),
        queue.getDelayed(),
      ]);

      return {
        queue: queueName,
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
        total: waiting.length + active.length + completed.length + failed.length + delayed.length,
      };
    } catch (e) {
      console.warn(`[QUEUE] Stats unavailable for ${queueName}:`, e.message);
      return { queue: queueName, error: 'stats unavailable' };
    }
  }

  // Get all queue stats
  async getAllStats() {
    const stats = {};
    for (const queueName of Object.keys(this.queues)) {
      stats[queueName] = await this.getStats(queueName);
    }
    return stats;
  }

  // Clean up old jobs
  async cleanQueues() {
    try {
      for (const [name, queue] of Object.entries(this.queues)) {
        await queue.clean(24 * 60 * 60 * 1000, 100); // Clean jobs older than 24h, keep last 100
        console.log(`[QUEUE] Cleaned ${name} queue`);
      }
    } catch (e) {
      console.warn('[QUEUE] Cleanup failed:', e.message);
    }
  }

  // Close all connections
  async close() {
    console.log('[QUEUE] Shutting down...');

    // Close workers
    for (const worker of this.workers.values()) {
      try {
        await worker.close();
      } catch (e) {
        console.warn('[QUEUE] Worker close error:', e.message);
      }
    }

    // Close queues
    for (const queue of Object.values(this.queues)) {
      try {
        await queue.close();
      } catch (e) {
        console.warn('[QUEUE] Queue close error:', e.message);
      }
    }

    // Close Redis
    if (redisClient) {
      try {
        await redisClient.quit();
      } catch (e) {
        console.warn('[QUEUE] Redis close error:', e.message);
      }
    }

    console.log('[QUEUE] Shutdown complete');
  }
}

// Singleton instance
const queueManager = new QueueManager();

// Graceful shutdown
process.on('SIGTERM', () => queueManager.close());
process.on('SIGINT', () => queueManager.close());

module.exports = queueManager;