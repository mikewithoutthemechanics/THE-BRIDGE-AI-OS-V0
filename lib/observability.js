// =============================================================================
// BRIDGE AI OS — Observability Setup
// Bull Board dashboard and system monitoring for orchestration
// =============================================================================
'use strict';

const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { ExpressAdapter } = require('@bull-board/express');
const queueManager = require('./queue');
const { eventBus } = require('./event-bus');

// Setup Bull Board for queue monitoring
function setupBullBoard(app) {
  if (!app) return;

  try {
    // Create adapters for all queues
    const adapters = [];
    Object.entries(queueManager.queues).forEach(([name, queue]) => {
      try {
        adapters.push(new BullMQAdapter(queue));
      } catch (e) {
        console.warn(`[OBSERVABILITY] Failed to create adapter for queue ${name}:`, e.message);
      }
    });

    if (adapters.length > 0) {
      const serverAdapter = new ExpressAdapter();
      serverAdapter.setBasePath('/admin/queues');

      createBullBoard({ queues: adapters, serverAdapter });

      // Mount Bull Board at /admin/queues
      app.use('/admin/queues', serverAdapter.getRouter());

      console.log('[OBSERVABILITY] Bull Board mounted at /admin/queues');
    } else {
      console.warn('[OBSERVABILITY] No queue adapters created - Bull Board not available');
    }

  } catch (e) {
    console.warn('[OBSERVABILITY] Bull Board setup failed:', e.message);
  }
}

// System health monitoring
class SystemMonitor {
  constructor() {
    this.metrics = {
      uptime: 0,
      memory: {},
      queues: {},
      tasks: {},
      goals: {},
      events: {},
    };
    this.monitoringInterval = null;
  }

  // Start monitoring
  start() {
    console.log('[MONITOR] Starting system monitoring...');

    // Initial metrics collection
    this.collectMetrics();

    // Set up periodic monitoring
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
    }, 30000); // Every 30 seconds

    // Set up event listeners
    this.setupEventListeners();

    console.log('[MONITOR] System monitoring active');
  }

  // Stop monitoring
  stop() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    console.log('[MONITOR] System monitoring stopped');
  }

  // Collect system metrics
  async collectMetrics() {
    try {
      // System metrics
      this.metrics.uptime = process.uptime();
      this.metrics.memory = process.memoryUsage();

      // Queue metrics
      this.metrics.queues = await queueManager.getAllStats();

      // Task and goal metrics
      const taskManager = require('./task-manager');
      const goalManager = require('./goal-manager');

      this.metrics.tasks = taskManager.getStats();
      this.metrics.goals = await goalManager.getStats();

      // Emit system health event
      await eventBus.systemHealth('orchestrator', 'healthy', this.metrics);

    } catch (e) {
      console.error('[MONITOR] Failed to collect metrics:', e.message);
    }
  }

  // Set up event listeners for real-time monitoring
  setupEventListeners() {
    // Task events
    eventBus.on('task.completed', (data) => {
      this.metrics.events.tasks_completed = (this.metrics.events.tasks_completed || 0) + 1;
    });

    eventBus.on('task.failed', (data) => {
      this.metrics.events.tasks_failed = (this.metrics.events.tasks_failed || 0) + 1;
    });

    // Goal events
    eventBus.on('goal.updated', (data) => {
      this.metrics.events.goals_updated = (this.metrics.events.goals_updated || 0) + 1;
    });

    console.log('[MONITOR] Event listeners configured');
  }

  // Get current metrics
  getMetrics() {
    return {
      ...this.metrics,
      timestamp: new Date().toISOString(),
    };
  }

  // Health check
  healthCheck() {
    const issues = [];

    // Check queue health
    if (this.metrics.queues && typeof this.metrics.queues === 'object') {
      Object.entries(this.metrics.queues).forEach(([queueName, stats]) => {
        if (stats.error) {
          issues.push(`Queue ${queueName}: ${stats.error}`);
        }
      });
    }

    // Check memory usage
    const memUsageMB = this.metrics.memory.heapUsed / 1024 / 1024;
    if (memUsageMB > 500) { // 500MB threshold
      issues.push(`High memory usage: ${memUsageMB.toFixed(1)}MB`);
    }

    return {
      status: issues.length === 0 ? 'healthy' : 'degraded',
      issues,
      metrics: this.getMetrics(),
    };
  }
}

// Singleton monitor instance
const systemMonitor = new SystemMonitor();

// Graceful shutdown
process.on('SIGTERM', () => systemMonitor.stop());
process.on('SIGINT', () => systemMonitor.stop());

module.exports = {
  setupBullBoard,
  systemMonitor,
};