// =============================================================================
// BRIDGE AI OS — Worker Orchestration System
// Converts existing agents to queue-based workers for deterministic execution
// =============================================================================
'use strict';

const queueManager = require('./queue');
const taskManager = require('./task-manager');
const goalManager = require('./goal-manager');

// Worker registry - maps skills to agent handlers
const workerRegistry = new Map();

// Register a worker for a specific skill
function registerWorker(skill, handler) {
  workerRegistry.set(skill, handler);
  console.log(`[WORKERS] Registered worker for skill: ${skill}`);

  // Register with queue manager
  queueManager.registerWorker('agent', [skill], async (job) => {
    const { taskId, goalId, title, description } = job.data;

    console.log(`[WORKERS] Executing task ${taskId} (${skill}): ${title}`);

    try {
      // Update task status to in progress
      await goalManager.updateTaskStatus(taskId, 'in_progress');

      // Execute the task using the registered handler
      const result = await handler({
        taskId,
        goalId,
        title,
        description,
        data: job.data,
      });

      // Update task status to completed
      await goalManager.updateTaskStatus(taskId, 'completed', result);

      console.log(`[WORKERS] Completed task ${taskId}`);
      return result;

    } catch (e) {
      console.error(`[WORKERS] Task ${taskId} failed:`, e.message);

      // Update task status to failed
      await goalManager.updateTaskStatus(taskId, 'failed', { error: e.message });

      throw e;
    }
  });
}

// Initialize default workers for common skills
function initializeDefaultWorkers() {
  // Analysis worker
  registerWorker('analysis', async (task) => {
    console.log(`[ANALYSIS] Analyzing: ${task.description}`);

    // Simulate analysis work
    await new Promise(resolve => setTimeout(resolve, 1000));

    return {
      analysis: `Completed analysis of: ${task.title}`,
      findings: ['Key insight 1', 'Key insight 2'],
      recommendations: ['Action 1', 'Action 2'],
      confidence: 0.85,
    };
  });

  // Implementation worker
  registerWorker('implementation', async (task) => {
    console.log(`[IMPLEMENTATION] Implementing: ${task.description}`);

    // Simulate implementation work
    await new Promise(resolve => setTimeout(resolve, 2000));

    return {
      implementation: `Successfully implemented: ${task.title}`,
      components: ['Component A', 'Component B'],
      tests_passed: true,
      code_changes: 15,
    };
  });

  // Design worker
  registerWorker('design', async (task) => {
    console.log(`[DESIGN] Designing: ${task.description}`);

    // Simulate design work
    await new Promise(resolve => setTimeout(resolve, 1500));

    return {
      design: `Completed design for: ${task.title}`,
      architecture: 'Proposed architecture diagram',
      specifications: ['Spec 1', 'Spec 2', 'Spec 3'],
      mockups: ['Mockup 1', 'Mockup 2'],
    };
  });

  // Testing worker
  registerWorker('testing', async (task) => {
    console.log(`[TESTING] Testing: ${task.description}`);

    // Simulate testing work
    await new Promise(resolve => setTimeout(resolve, 800));

    return {
      testing: `Completed testing for: ${task.title}`,
      test_results: {
        passed: 8,
        failed: 0,
        skipped: 1,
        coverage: 0.92,
      },
      issues_found: [],
      recommendations: ['Minor optimization suggested'],
    };
  });

  // Research worker
  registerWorker('research', async (task) => {
    console.log(`[RESEARCH] Researching: ${task.description}`);

    // Simulate research work
    await new Promise(resolve => setTimeout(resolve, 1200));

    return {
      research: `Completed research for: ${task.title}`,
      sources: ['Source 1', 'Source 2', 'Source 3'],
      key_findings: ['Finding A', 'Finding B'],
      conclusions: 'Research conclusions here',
    };
  });

  // General purpose worker
  registerWorker('general', async (task) => {
    console.log(`[GENERAL] Executing: ${task.description}`);

    // Simulate general task execution
    await new Promise(resolve => setTimeout(resolve, 1000));

    return {
      execution: `Successfully completed: ${task.title}`,
      steps_taken: ['Step 1', 'Step 2', 'Step 3'],
      outcome: 'Task completed successfully',
      duration_ms: 1000,
    };
  });

  console.log(`[WORKERS] Initialized ${workerRegistry.size} default workers`);
}

// Start worker orchestration system
async function startWorkerOrchestration() {
  console.log('[WORKERS] Starting worker orchestration system...');

  // Initialize default workers
  initializeDefaultWorkers();

  // Start queue processing
  console.log('[WORKERS] Worker orchestration system ready');
}

// Get worker statistics
function getWorkerStats() {
  return {
    registered_workers: workerRegistry.size,
    skills: Array.from(workerRegistry.keys()),
    queue_status: queueManager.redisAvailable ? 'redis' : 'memory',
  };
}

// Export interface
module.exports = {
  registerWorker,
  startWorkerOrchestration,
  getWorkerStats,
  workerRegistry,
};