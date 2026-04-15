// =============================================================================
// BRIDGE AI OS — Task Manager
// Priority-based task orchestration with goal decomposition and execution tracking
// =============================================================================
'use strict';

const queueManager = require('./queue');
const { eventBus } = require('./event-bus');
const crypto = require('crypto');

class TaskManager {
  constructor() {
    this.activeGoals = new Map(); // goalId -> goal data
    this.taskGraph = new Map(); // taskId -> task dependencies
    this.executionHistory = new Map(); // taskId -> execution results
  }

  // Create and store a goal
  async createGoal(userId, description, metadata = {}) {
    const goalId = 'goal_' + crypto.randomBytes(8).toString('hex');

    const goal = {
      id: goalId,
      userId,
      description,
      status: 'created',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      priority: metadata.priority || 5,
      tags: metadata.tags || [],
      metadata,
      tasks: [],
      progress: 0,
      estimatedCompletion: null,
    };

    this.activeGoals.set(goalId, goal);

    console.log(`[TASK-MGR] Created goal ${goalId}: ${description}`);
    return goal;
  }

  // Decompose goal into prioritized tasks
  async decomposeGoal(goalId, architectAgent) {
    const goal = this.activeGoals.get(goalId);
    if (!goal) throw new Error(`Goal ${goalId} not found`);

    try {
      // Use architect agent to plan tasks
      const planningPrompt = this.buildPlanningPrompt(goal);
      const plan = await architectAgent.plan(planningPrompt);

      // Parse plan into structured tasks
      const tasks = this.parseTaskPlan(plan, goalId);

      // Store task graph
      tasks.forEach(task => {
        this.taskGraph.set(task.id, {
          ...task,
          dependencies: task.dependencies || [],
          dependents: [],
        });
      });

      // Build dependency relationships
      this.buildDependencyGraph(tasks);

      // Update goal
      goal.tasks = tasks.map(t => t.id);
      goal.status = 'planned';
      goal.updatedAt = new Date().toISOString();

      console.log(`[TASK-MGR] Decomposed goal ${goalId} into ${tasks.length} tasks`);
      return tasks;

    } catch (e) {
      console.error(`[TASK-MGR] Failed to decompose goal ${goalId}:`, e.message);
      goal.status = 'failed';
      throw e;
    }
  }

  // Build planning prompt for architect
  buildPlanningPrompt(goal) {
    return `You are the Chief Architect of Bridge AI OS. Decompose this goal into executable tasks.

GOAL: ${goal.description}

CONTEXT:
- User ID: ${goal.userId}
- Priority: ${goal.priority}/10
- Tags: ${goal.tags.join(', ')}
- Metadata: ${JSON.stringify(goal.metadata)}

INSTRUCTIONS:
1. Break down the goal into 3-7 specific, actionable tasks
2. Each task should be executable by an AI agent
3. Include task dependencies where relevant
4. Assign priority (1-10) to each task
5. Estimate time required for each task
6. Specify which agent skill is best suited

OUTPUT FORMAT:
[
  {
    "id": "task_001",
    "title": "Task title",
    "description": "Detailed description",
    "priority": 8,
    "estimatedTime": "30min",
    "skill": "agent.skill.type",
    "dependencies": ["task_000"]
  }
]

Provide only the JSON array, no additional text.`;
  }

  // Parse task plan from architect response
  parseTaskPlan(planText, goalId) {
    try {
      // Clean and parse JSON
      const cleanText = planText.trim();
      const tasks = JSON.parse(cleanText);

      // Validate and enrich tasks
      return tasks.map((task, index) => ({
        id: task.id || `task_${goalId}_${index + 1}`,
        goalId,
        title: task.title,
        description: task.description,
        priority: task.priority || 5,
        estimatedTime: task.estimatedTime || '1h',
        skill: task.skill || 'general',
        dependencies: task.dependencies || [],
        status: 'pending',
        createdAt: new Date().toISOString(),
        assignedTo: null,
        startedAt: null,
        completedAt: null,
      }));
    } catch (e) {
      console.error('[TASK-MGR] Failed to parse task plan:', e.message);
      // Return a single fallback task
      return [{
        id: `task_${goalId}_fallback`,
        goalId,
        title: 'Execute Goal',
        description: planText || 'Fallback task for goal execution',
        priority: 5,
        estimatedTime: '2h',
        skill: 'general',
        dependencies: [],
        status: 'pending',
        createdAt: new Date().toISOString(),
      }];
    }
  }

  // Build dependency graph
  buildDependencyGraph(tasks) {
    tasks.forEach(task => {
      task.dependencies.forEach(depId => {
        const depTask = Array.from(this.taskGraph.values()).find(t => t.id === depId);
        if (depTask) {
          depTask.dependents = depTask.dependents || [];
          depTask.dependents.push(task.id);
        }
      });
    });
  }

  // Get next executable tasks (no pending dependencies)
  getNextTasks(goalId) {
    const goal = this.activeGoals.get(goalId);
    if (!goal) return [];

    const goalTasks = goal.tasks.map(taskId => this.taskGraph.get(taskId)).filter(Boolean);

    return goalTasks
      .filter(task => task.status === 'pending')
      .filter(task => {
        // Check if all dependencies are completed
        return task.dependencies.every(depId => {
          const depTask = this.taskGraph.get(depId);
          return depTask && depTask.status === 'completed';
        });
      })
      .sort((a, b) => b.priority - a.priority); // Highest priority first
  }

  // Queue tasks for execution
  async queueTasks(goalId) {
    const nextTasks = this.getNextTasks(goalId);
    const queuedTasks = [];

    for (const task of nextTasks) {
      try {
        const job = await queueManager.addJob('agent', task.skill, {
          taskId: task.id,
          goalId,
          title: task.title,
          description: task.description,
          priority: task.priority,
        }, {
          priority: task.priority,
          ttl: this.parseTimeToMs(task.estimatedTime),
        });

        task.status = 'queued';
        task.queuedAt = new Date().toISOString();
        queuedTasks.push(task);

        console.log(`[TASK-MGR] Queued task ${task.id} for skill ${task.skill}`);
      } catch (e) {
        console.error(`[TASK-MGR] Failed to queue task ${task.id}:`, e.message);
      }
    }

    return queuedTasks;
  }

  // Update task status
  updateTaskStatus(taskId, status, result = null) {
    const task = this.taskGraph.get(taskId);
    if (!task) return false;

    task.status = status;
    task.updatedAt = new Date().toISOString();

    if (status === 'completed') {
      task.completedAt = new Date().toISOString();
      this.executionHistory.set(taskId, {
        result,
        completedAt: task.completedAt,
        duration: task.startedAt ? new Date(task.completedAt) - new Date(task.startedAt) : null,
      });

      // Emit task completion event
      eventBus.taskCompleted(taskId, result).catch(err => {
        console.warn(`[TASK-MGR] Failed to emit task completion event: ${err.message}`);
      });

    } else if (status === 'in_progress') {
      task.startedAt = new Date().toISOString();
    } else if (status === 'failed') {
      task.failedAt = new Date().toISOString();
      task.error = result?.error || 'Task failed';

      // Emit task failure event
      eventBus.taskFailed(taskId, result).catch(err => {
        console.warn(`[TASK-MGR] Failed to emit task failure event: ${err.message}`);
      });
    }

    // Update goal progress
    this.updateGoalProgress(task.goalId);

    console.log(`[TASK-MGR] Task ${taskId} status: ${status}`);
    return true;
  }

  // Update goal progress based on completed tasks
  updateGoalProgress(goalId) {
    const goal = this.activeGoals.get(goalId);
    if (!goal) return;

    const totalTasks = goal.tasks.length;
    const completedTasks = goal.tasks.filter(taskId => {
      const task = this.taskGraph.get(taskId);
      return task && task.status === 'completed';
    }).length;

    goal.progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

    if (goal.progress >= 100) {
      goal.status = 'completed';
      goal.completedAt = new Date().toISOString();
    }

    goal.updatedAt = new Date().toISOString();

    // Emit goal update event
    eventBus.goalUpdated(goal.id, goal.status, goal.progress).catch(err => {
      console.warn(`[TASK-MGR] Failed to emit goal update event: ${err.message}`);
    });
  }

  // Get goal status
  getGoalStatus(goalId) {
    const goal = this.activeGoals.get(goalId);
    if (!goal) return null;

    return {
      id: goal.id,
      description: goal.description,
      status: goal.status,
      progress: goal.progress,
      createdAt: goal.createdAt,
      tasks: goal.tasks.map(taskId => {
        const task = this.taskGraph.get(taskId);
        return task ? {
          id: task.id,
          title: task.title,
          status: task.status,
          priority: task.priority,
        } : null;
      }).filter(Boolean),
    };
  }

  // Parse time string to milliseconds
  parseTimeToMs(timeStr) {
    const match = timeStr.match(/^(\d+)(min|h|d)$/);
    if (!match) return 3600000; // 1 hour default

    const [, num, unit] = match;
    const value = parseInt(num, 10);

    switch (unit) {
      case 'min': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      default: return 3600000;
    }
  }

  // Get execution stats
  getStats() {
    const goals = Array.from(this.activeGoals.values());
    const tasks = Array.from(this.taskGraph.values());

    return {
      goals: {
        total: goals.length,
        active: goals.filter(g => g.status === 'planned' || g.status === 'in_progress').length,
        completed: goals.filter(g => g.status === 'completed').length,
        failed: goals.filter(g => g.status === 'failed').length,
      },
      tasks: {
        total: tasks.length,
        pending: tasks.filter(t => t.status === 'pending').length,
        queued: tasks.filter(t => t.status === 'queued').length,
        in_progress: tasks.filter(t => t.status === 'in_progress').length,
        completed: tasks.filter(t => t.status === 'completed').length,
        failed: tasks.filter(t => t.status === 'failed').length,
      },
    };
  }
}

// Singleton instance
const taskManager = new TaskManager();

module.exports = taskManager;