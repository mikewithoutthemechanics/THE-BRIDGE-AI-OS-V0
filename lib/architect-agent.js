// =============================================================================
// BRIDGE AI OS — Architect Agent
// Goal decomposition and task planning for orchestration system
// =============================================================================
'use strict';

const llmClient = require('./llm-client');

class ArchitectAgent {
  constructor() {
    this.name = 'Architect';
    this.title = 'Chief Architect';
    this.role = 'goal_planner';
    this.skills = ['goal_decomposition', 'task_planning', 'priority_assignment', 'dependency_mapping'];
  }

  // Plan tasks for a goal
  async plan(prompt) {
    try {
      console.log('[ARCHITECT] Planning tasks for goal...');

      const systemPrompt = `You are the Chief Architect of Bridge AI OS, responsible for breaking down complex goals into executable tasks.

Your expertise includes:
- Goal decomposition and task planning
- Priority assignment based on impact and urgency
- Dependency mapping for sequential execution
- Resource allocation and skill matching
- Risk assessment and mitigation planning

When planning tasks:
1. Break goals into 3-7 specific, actionable tasks
2. Assign realistic priorities (1-10, where 10 is highest)
3. Include time estimates for each task
4. Map tasks to appropriate agent skills
5. Identify dependencies between tasks
6. Consider failure scenarios and recovery steps

Always provide structured, executable plans that agents can follow.`;

      const response = await llmClient.infer(prompt, {
        system: systemPrompt,
        max_tokens: 2000,
        temperature: 0.3, // Lower temperature for more structured planning
      });

      const plan = response.text || response.content || response;
      console.log('[ARCHITECT] Task planning completed');

      return plan;

    } catch (e) {
      console.error('[ARCHITECT] Planning failed:', e.message);

      // Fallback planning logic
      return this.fallbackPlanning(prompt);
    }
  }

  // Fallback planning when LLM is unavailable
  fallbackPlanning(prompt) {
    console.log('[ARCHITECT] Using fallback planning logic');

    // Extract goal from prompt
    const goalMatch = prompt.match(/GOAL:\s*(.+?)(?:\n|$)/);
    const goal = goalMatch ? goalMatch[1] : 'Execute goal';

    // Generate basic task structure
    const tasks = [
      {
        id: 'task_001',
        title: 'Analyze Requirements',
        description: `Analyze the requirements for: ${goal}. Identify key components, constraints, and success criteria.`,
        priority: 8,
        estimatedTime: '30min',
        skill: 'analysis',
        dependencies: []
      },
      {
        id: 'task_002',
        title: 'Design Solution',
        description: `Design a solution approach for: ${goal}. Consider architecture, tools, and methodologies.`,
        priority: 7,
        estimatedTime: '1h',
        skill: 'design',
        dependencies: ['task_001']
      },
      {
        id: 'task_003',
        title: 'Implement Solution',
        description: `Implement the designed solution for: ${goal}. Write code, configure systems, or execute tasks.`,
        priority: 6,
        estimatedTime: '2h',
        skill: 'implementation',
        dependencies: ['task_002']
      },
      {
        id: 'task_004',
        title: 'Test and Validate',
        description: `Test the implementation for: ${goal}. Verify functionality, performance, and quality.`,
        priority: 9,
        estimatedTime: '45min',
        skill: 'testing',
        dependencies: ['task_003']
      }
    ];

    return JSON.stringify(tasks, null, 2);
  }

  // Prioritize tasks based on goal context
  prioritizeTasks(tasks, goalContext) {
    // Adjust priorities based on goal context
    const priorityMultipliers = {
      urgent: 1.5,
      important: 1.2,
      maintenance: 0.8,
      experimental: 0.7,
    };

    const multiplier = priorityMultipliers[goalContext.priority] || 1.0;

    return tasks.map(task => ({
      ...task,
      priority: Math.min(10, Math.max(1, Math.round(task.priority * multiplier)))
    }));
  }

  // Validate task plan
  validateTaskPlan(tasks) {
    const errors = [];

    // Check for required fields
    tasks.forEach((task, index) => {
      if (!task.id) errors.push(`Task ${index + 1}: missing id`);
      if (!task.title) errors.push(`Task ${index + 1}: missing title`);
      if (!task.description) errors.push(`Task ${index + 1}: missing description`);
      if (!task.skill) errors.push(`Task ${index + 1}: missing skill`);

      // Validate priority range
      if (task.priority < 1 || task.priority > 10) {
        errors.push(`Task ${task.id || index + 1}: priority must be 1-10`);
      }
    });

    // Check for dependency cycles (basic check)
    const taskIds = new Set(tasks.map(t => t.id));
    tasks.forEach(task => {
      if (task.dependencies) {
        task.dependencies.forEach(dep => {
          if (!taskIds.has(dep)) {
            errors.push(`Task ${task.id}: dependency ${dep} not found`);
          }
        });
      }
    });

    return {
      valid: errors.length === 0,
      errors,
      warnings: this.generateWarnings(tasks)
    };
  }

  // Generate warnings for task plan
  generateWarnings(tasks) {
    const warnings = [];

    // Check for very high priority tasks
    const highPriorityTasks = tasks.filter(t => t.priority >= 9);
    if (highPriorityTasks.length > tasks.length * 0.3) {
      warnings.push('More than 30% of tasks have high priority (>8) - consider redistributing');
    }

    // Check for tasks with no dependencies that could run in parallel
    const noDepsTasks = tasks.filter(t => !t.dependencies || t.dependencies.length === 0);
    if (noDepsTasks.length === tasks.length && tasks.length > 1) {
      warnings.push('All tasks have no dependencies - consider if they can run in parallel');
    }

    // Check for overly long time estimates
    const longTasks = tasks.filter(t => this.parseTimeToMinutes(t.estimatedTime || '1h') > 480); // 8 hours
    if (longTasks.length > 0) {
      warnings.push(`${longTasks.length} tasks have estimated time > 8 hours - consider breaking down further`);
    }

    return warnings;
  }

  // Parse time string to minutes
  parseTimeToMinutes(timeStr) {
    if (!timeStr) return 60; // 1 hour default

    const match = timeStr.match(/^(\d+)(min|h|d)$/);
    if (!match) return 60;

    const [, num, unit] = match;
    const value = parseInt(num, 10);

    switch (unit) {
      case 'min': return value;
      case 'h': return value * 60;
      case 'd': return value * 60 * 24;
      default: return 60;
    }
  }

  // Optimize task execution order
  optimizeExecutionOrder(tasks) {
    // Simple topological sort for dependency ordering
    const result = [];
    const visited = new Set();
    const visiting = new Set();

    function visit(task) {
      if (visited.has(task.id)) return;
      if (visiting.has(task.id)) {
        throw new Error(`Circular dependency detected involving task ${task.id}`);
      }

      visiting.add(task.id);

      // Visit dependencies first
      if (task.dependencies) {
        task.dependencies.forEach(depId => {
          const depTask = tasks.find(t => t.id === depId);
          if (depTask) visit(depTask);
        });
      }

      visiting.delete(task.id);
      visited.add(task.id);
      result.push(task);
    }

    // Visit all tasks
    tasks.forEach(task => {
      if (!visited.has(task.id)) {
        visit(task);
      }
    });

    return result;
  }

  // Estimate total execution time
  estimateTotalTime(tasks) {
    // Simple estimation: sum of task times (assuming no parallel execution)
    const totalMinutes = tasks.reduce((sum, task) => {
      return sum + this.parseTimeToMinutes(task.estimatedTime || '1h');
    }, 0);

    // Format as human-readable string
    if (totalMinutes < 60) {
      return `${totalMinutes}min`;
    } else if (totalMinutes < 1440) { // 24 hours
      return `${Math.round(totalMinutes / 60 * 10) / 10}h`;
    } else {
      return `${Math.round(totalMinutes / 1440 * 10) / 10}d`;
    }
  }

  // Get planning statistics
  getPlanningStats(tasks) {
    const stats = {
      totalTasks: tasks.length,
      avgPriority: tasks.reduce((sum, t) => sum + (t.priority || 5), 0) / tasks.length,
      skillDistribution: {},
      dependencyCount: tasks.reduce((sum, t) => sum + (t.dependencies ? t.dependencies.length : 0), 0),
      estimatedTotalTime: this.estimateTotalTime(tasks),
    };

    // Skill distribution
    tasks.forEach(task => {
      const skill = task.skill || 'unknown';
      stats.skillDistribution[skill] = (stats.skillDistribution[skill] || 0) + 1;
    });

    return stats;
  }
}

// Singleton instance
const architectAgent = new ArchitectAgent();

module.exports = architectAgent;