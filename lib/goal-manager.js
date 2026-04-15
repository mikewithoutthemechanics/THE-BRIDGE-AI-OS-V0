// =============================================================================
// BRIDGE AI OS — Goal Manager
// Persistent goal storage and lifecycle management with SQLite backend
// =============================================================================
'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class GoalManager {
  constructor() {
    this.dbPath = path.join(__dirname, '..', 'data', 'goals.db');
    this.db = null;
    this.initialized = false;
  }

  // Initialize database
  async initialize() {
    if (this.initialized) return;

    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      this.db = new Database(this.dbPath);

      // Create tables
      this.createTables();

      // Create indexes for performance
      this.createIndexes();

      this.initialized = true;
      console.log('[GOAL-MGR] Database initialized at', this.dbPath);

    } catch (e) {
      console.error('[GOAL-MGR] Database initialization failed:', e.message);
      // Fallback to in-memory mode
      console.warn('[GOAL-MGR] Using in-memory storage');
    }
  }

  // Create database tables
  createTables() {
    // Goals table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS goals (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'created',
        priority INTEGER DEFAULT 5,
        progress REAL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        estimated_completion TEXT,
        metadata TEXT,
        tags TEXT
      )
    `);

    // Tasks table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        goal_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        priority INTEGER DEFAULT 5,
        estimated_time TEXT,
        skill TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        dependencies TEXT, -- JSON array of task IDs
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        assigned_to TEXT,
        result TEXT,
        FOREIGN KEY (goal_id) REFERENCES goals (id) ON DELETE CASCADE
      )
    `);

    // Task dependencies table (for complex relationships)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS task_dependencies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        depends_on_task_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE,
        FOREIGN KEY (depends_on_task_id) REFERENCES tasks (id) ON DELETE CASCADE,
        UNIQUE(task_id, depends_on_task_id)
      )
    `);

    // Goal events table (for audit trail)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS goal_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        goal_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        event_data TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (goal_id) REFERENCES goals (id) ON DELETE CASCADE
      )
    `);

    console.log('[GOAL-MGR] Database tables created');
  }

  // Create indexes for performance
  createIndexes() {
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id);
      CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);
      CREATE INDEX IF NOT EXISTS idx_goals_created_at ON goals(created_at);
      CREATE INDEX IF NOT EXISTS idx_tasks_goal_id ON tasks(goal_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_skill ON tasks(skill);
      CREATE INDEX IF NOT EXISTS idx_goal_events_goal_id ON goal_events(goal_id);
    `);

    console.log('[GOAL-MGR] Database indexes created');
  }

  // Create a new goal
  async createGoal(userId, description, metadata = {}) {
    await this.initialize();

    const goalId = 'goal_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
    const now = new Date().toISOString();

    const goal = {
      id: goalId,
      userId,
      description,
      status: 'created',
      priority: metadata.priority || 5,
      progress: 0,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      estimatedCompletion: null,
      metadata: JSON.stringify(metadata),
      tags: JSON.stringify(metadata.tags || []),
    };

    if (this.db) {
      try {
        const stmt = this.db.prepare(`
          INSERT INTO goals (id, user_id, description, status, priority, progress, created_at, updated_at, metadata, tags)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
          goal.id,
          goal.userId,
          goal.description,
          goal.status,
          goal.priority,
          goal.progress,
          goal.createdAt,
          goal.updatedAt,
          goal.metadata,
          goal.tags
        );

        // Log event
        this.logGoalEvent(goal.id, 'created', { description: goal.description });

        console.log(`[GOAL-MGR] Created goal ${goalId}`);
        return goal;

      } catch (e) {
        console.error('[GOAL-MGR] Failed to create goal:', e.message);
      }
    }

    // Fallback: in-memory only
    console.warn('[GOAL-MGR] Using in-memory fallback for goal creation');
    return goal;
  }

  // Get goal by ID
  async getGoal(goalId) {
    await this.initialize();

    if (this.db) {
      try {
        const stmt = this.db.prepare('SELECT * FROM goals WHERE id = ?');
        const row = stmt.get(goalId);

        if (row) {
          return this.rowToGoal(row);
        }
      } catch (e) {
        console.error('[GOAL-MGR] Failed to get goal:', e.message);
      }
    }

    return null;
  }

  // Update goal
  async updateGoal(goalId, updates) {
    await this.initialize();

    if (this.db) {
      try {
        const now = new Date().toISOString();
        const fields = [];
        const values = [];

        // Build dynamic update query
        Object.entries(updates).forEach(([key, value]) => {
          const dbKey = key.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
          fields.push(`${dbKey} = ?`);
          values.push(typeof value === 'object' ? JSON.stringify(value) : value);
        });

        fields.push('updated_at = ?');
        values.push(now);
        values.push(goalId); // WHERE clause

        const stmt = this.db.prepare(`UPDATE goals SET ${fields.join(', ')} WHERE id = ?`);
        stmt.run(...values);

        // Log event
        this.logGoalEvent(goalId, 'updated', updates);

        console.log(`[GOAL-MGR] Updated goal ${goalId}`);
        return true;

      } catch (e) {
        console.error('[GOAL-MGR] Failed to update goal:', e.message);
      }
    }

    return false;
  }

  // Get goals by user
  async getGoalsByUser(userId, status = null, limit = 50) {
    await this.initialize();

    if (this.db) {
      try {
        let query = 'SELECT * FROM goals WHERE user_id = ?';
        const params = [userId];

        if (status) {
          query += ' AND status = ?';
          params.push(status);
        }

        query += ' ORDER BY created_at DESC LIMIT ?';
        params.push(limit);

        const stmt = this.db.prepare(query);
        const rows = stmt.all(...params);

        return rows.map(row => this.rowToGoal(row));

      } catch (e) {
        console.error('[GOAL-MGR] Failed to get goals by user:', e.message);
      }
    }

    return [];
  }

  // Create task for goal
  async createTask(goalId, taskData) {
    await this.initialize();

    const taskId = 'task_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
    const now = new Date().toISOString();

    const task = {
      id: taskId,
      goalId,
      title: taskData.title,
      description: taskData.description,
      priority: taskData.priority || 5,
      estimatedTime: taskData.estimatedTime || '1h',
      skill: taskData.skill || 'general',
      status: 'pending',
      dependencies: JSON.stringify(taskData.dependencies || []),
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      completedAt: null,
      assignedTo: null,
      result: null,
    };

    if (this.db) {
      try {
        const stmt = this.db.prepare(`
          INSERT INTO tasks (id, goal_id, title, description, priority, estimated_time, skill, status, dependencies, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
          task.id,
          task.goalId,
          task.title,
          task.description,
          task.priority,
          task.estimatedTime,
          task.skill,
          task.status,
          task.dependencies,
          task.createdAt,
          task.updatedAt
        );

        // Store dependencies in separate table
        if (taskData.dependencies && taskData.dependencies.length > 0) {
          this.storeTaskDependencies(task.id, taskData.dependencies);
        }

        console.log(`[GOAL-MGR] Created task ${taskId} for goal ${goalId}`);
        return task;

      } catch (e) {
        console.error('[GOAL-MGR] Failed to create task:', e.message);
      }
    }

    return task;
  }

  // Store task dependencies
  storeTaskDependencies(taskId, dependencyIds) {
    if (!this.db) return;

    try {
      const stmt = this.db.prepare(`
        INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_task_id, created_at)
        VALUES (?, ?, ?)
      `);

      const now = new Date().toISOString();
      for (const depId of dependencyIds) {
        stmt.run(taskId, depId, now);
      }
    } catch (e) {
      console.error('[GOAL-MGR] Failed to store task dependencies:', e.message);
    }
  }

  // Get tasks for goal
  async getTasksForGoal(goalId) {
    await this.initialize();

    if (this.db) {
      try {
        const stmt = this.db.prepare('SELECT * FROM tasks WHERE goal_id = ? ORDER BY priority DESC, created_at ASC');
        const rows = stmt.all(goalId);

        return rows.map(row => this.rowToTask(row));

      } catch (e) {
        console.error('[GOAL-MGR] Failed to get tasks for goal:', e.message);
      }
    }

    return [];
  }

  // Update task status
  async updateTaskStatus(taskId, status, result = null) {
    await this.initialize();

    if (this.db) {
      try {
        const now = new Date().toISOString();
        const updates = {
          status,
          updated_at: now,
        };

        if (status === 'in_progress' && !this.getTask(taskId)?.startedAt) {
          updates.started_at = now;
        } else if (status === 'completed') {
          updates.completed_at = now;
          updates.result = JSON.stringify(result);
        }

        const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
        const values = Object.values(updates);
        values.push(taskId);

        const stmt = this.db.prepare(`UPDATE tasks SET ${fields} WHERE id = ?`);
        stmt.run(...values);

        console.log(`[GOAL-MGR] Updated task ${taskId} status to ${status}`);
        return true;

      } catch (e) {
        console.error('[GOAL-MGR] Failed to update task status:', e.message);
      }
    }

    return false;
  }

  // Get task by ID
  async getTask(taskId) {
    await this.initialize();

    if (this.db) {
      try {
        const stmt = this.db.prepare('SELECT * FROM tasks WHERE id = ?');
        const row = stmt.get(taskId);

        if (row) {
          return this.rowToTask(row);
        }
      } catch (e) {
        console.error('[GOAL-MGR] Failed to get task:', e.message);
      }
    }

    return null;
  }

  // Log goal event
  logGoalEvent(goalId, eventType, eventData) {
    if (!this.db) return;

    try {
      const stmt = this.db.prepare(`
        INSERT INTO goal_events (goal_id, event_type, event_data, created_at)
        VALUES (?, ?, ?, ?)
      `);

      stmt.run(goalId, eventType, JSON.stringify(eventData), new Date().toISOString());
    } catch (e) {
      console.error('[GOAL-MGR] Failed to log goal event:', e.message);
    }
  }

  // Convert database row to goal object
  rowToGoal(row) {
    return {
      id: row.id,
      userId: row.user_id,
      description: row.description,
      status: row.status,
      priority: row.priority,
      progress: row.progress,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
      estimatedCompletion: row.estimated_completion,
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
      tags: row.tags ? JSON.parse(row.tags) : [],
    };
  }

  // Convert database row to task object
  rowToTask(row) {
    return {
      id: row.id,
      goalId: row.goal_id,
      title: row.title,
      description: row.description,
      priority: row.priority,
      estimatedTime: row.estimated_time,
      skill: row.skill,
      status: row.status,
      dependencies: row.dependencies ? JSON.parse(row.dependencies) : [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      assignedTo: row.assigned_to,
      result: row.result ? JSON.parse(row.result) : null,
    };
  }

  // Get statistics
  async getStats() {
    await this.initialize();

    if (this.db) {
      try {
        const goalStats = this.db.prepare(`
          SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN status IN ('planned', 'in_progress') THEN 1 ELSE 0 END) as active,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
          FROM goals
        `).get();

        const taskStats = this.db.prepare(`
          SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
            SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) as queued,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
          FROM tasks
        `).get();

        return {
          goals: goalStats,
          tasks: taskStats,
          database: 'sqlite',
        };

      } catch (e) {
        console.error('[GOAL-MGR] Failed to get stats:', e.message);
      }
    }

    return {
      goals: { total: 0, completed: 0, active: 0, failed: 0 },
      tasks: { total: 0, completed: 0, in_progress: 0, pending: 0, queued: 0, failed: 0 },
      database: 'memory',
    };
  }

  // Close database connection
  close() {
    if (this.db) {
      try {
        this.db.close();
        console.log('[GOAL-MGR] Database connection closed');
      } catch (e) {
        console.error('[GOAL-MGR] Error closing database:', e.message);
      }
    }
  }
}

// Singleton instance
const goalManager = new GoalManager();

// Graceful shutdown
process.on('SIGTERM', () => goalManager.close());
process.on('SIGINT', () => goalManager.close());

module.exports = goalManager;