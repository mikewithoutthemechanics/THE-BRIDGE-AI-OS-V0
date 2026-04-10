/**
 * NeuroLink Level 3: Multi-User Data Stream
 * Real-time user data ingestion + persistence for live intelligence graph
 * Aggregates cognitive states across users to power cross-user monetization
 */

const EventEmitter = require('events');

class MultiUserStream extends EventEmitter {
  constructor(database) {
    super();
    this.db = database; // Supabase or similar
    this.activeUsers = new Map(); // userId -> { state, lastUpdate, metadata }
    this.userBuffer = new Map(); // userId -> [states] (for batch processing)
    this.bufferSize = 10; // States per user before batch insert
    this.flushInterval = 5000; // 5 seconds
    this.monetizationTriggers = []; // Triggered events
  }

  /**
   * Register a user into the real-time stream
   */
  async registerUser(userId, metadata = {}) {
    this.activeUsers.set(userId, {
      userId,
      metadata,
      state: null,
      lastUpdate: Date.now(),
      observationCount: 0
    });

    // Persist user registration
    if (this.db) {
      try {
        await this.db.from('users').upsert({
          user_id: userId,
          metadata: JSON.stringify(metadata),
          joined_at: new Date().toISOString()
        });
      } catch (err) {
        console.warn('[MultiUserStream] Failed to register user:', err.message);
      }
    }

    this.emit('user:registered', { userId, metadata });
  }

  /**
   * Ingest a user's cognitive state
   * Called on every inference tick from NeuroLinkService
   */
  async ingestState(userId, state, predictions = null) {
    if (!this.activeUsers.has(userId)) {
      await this.registerUser(userId);
    }

    const userRecord = this.activeUsers.get(userId);
    userRecord.state = state;
    userRecord.lastUpdate = Date.now();
    userRecord.observationCount++;

    // Buffer state for batch insert
    if (!this.userBuffer.has(userId)) {
      this.userBuffer.set(userId, []);
    }

    this.userBuffer.get(userId).push({
      state,
      predictions,
      timestamp: new Date().toISOString()
    });

    // Emit state event for real-time subscribers
    this.emit('state:ingested', {
      userId,
      state,
      predictions,
      observationCount: userRecord.observationCount
    });

    // Check monetization triggers
    this._checkMonetizationTriggers(userId, state, predictions);

    // Flush buffer if threshold reached
    if (this.userBuffer.get(userId).length >= this.bufferSize) {
      await this._flushUserBuffer(userId);
    }

    return {
      ok: true,
      observationCount: userRecord.observationCount,
      buffered: this.userBuffer.get(userId).length
    };
  }

  /**
   * Check if state change triggers monetization action
   */
  _checkMonetizationTriggers(userId, state, predictions) {
    const triggers = [];

    // Trigger 1: High-value moment detected
    if (predictions?.highConversionProbability?.value > 0.75 && predictions?.highConversionProbability?.confidence > 0.7) {
      triggers.push({
        type: 'high_conversion_window',
        userId,
        action: 'OFFER_PREMIUM',
        reason: 'High conversion probability detected',
        value: predictions.highConversionProbability.value
      });
    }

    // Trigger 2: Churn risk detected
    if (predictions?.churnRisk?.value > 0.65 && state.stress.value > 0.7) {
      triggers.push({
        type: 'churn_risk',
        userId,
        action: 'INTERVENE_SUPPORT',
        reason: 'User showing churn signals',
        value: predictions.churnRisk.value
      });
    }

    // Trigger 3: Fatigue dropoff imminent
    if (state.fatigue.value > 0.8 && state.focus.value < 0.4) {
      triggers.push({
        type: 'fatigue_dropoff',
        userId,
        action: 'ACTIVATE_AUTOPILOT',
        reason: 'User fatigue critical',
        value: state.fatigue.value
      });
    }

    // Trigger 4: Optimal focus window (for deep-work related offers)
    if (state.focus.value > 0.8 && state.stress.value < 0.4 && state.fatigue.value < 0.5) {
      triggers.push({
        type: 'optimal_focus',
        userId,
        action: 'OFFER_FOCUS_TOOLS',
        reason: 'Peak cognitive performance window',
        value: state.focus.value
      });
    }

    triggers.forEach(trigger => {
      this.monetizationTriggers.push(trigger);
      this.emit('monetization:trigger', trigger);
    });
  }

  /**
   * Flush buffered states to database
   */
  async _flushUserBuffer(userId) {
    const buffer = this.userBuffer.get(userId);
    if (!buffer || buffer.length === 0) return;

    try {
      if (this.db) {
        // Insert state observations
        const stateRecords = buffer.map(entry => ({
          user_id: userId,
          state: JSON.stringify(entry.state),
          predictions: entry.predictions ? JSON.stringify(entry.predictions) : null,
          recorded_at: entry.timestamp
        }));

        await this.db.from('user_states').insert(stateRecords);

        // Update user last_observation
        await this.db.from('users').update({
          last_observation_at: new Date().toISOString()
        }).eq('user_id', userId);

        this.emit('buffer:flushed', { userId, count: buffer.length });
      }

      // Clear buffer
      this.userBuffer.set(userId, []);
    } catch (err) {
      console.error('[MultiUserStream] Buffer flush error:', err.message);
      this.emit('error:flush', { userId, error: err.message });
    }
  }

  /**
   * Get monetization triggers for batch processing
   */
  getMonetizationTriggers(limit = 100) {
    const triggers = this.monetizationTriggers.slice(0, limit);
    this.monetizationTriggers = this.monetizationTriggers.slice(limit);
    return triggers;
  }

  /**
   * Get active user count
   */
  getActiveUserCount() {
    return this.activeUsers.size;
  }

  /**
   * Get user state snapshot
   */
  getUserState(userId) {
    return this.activeUsers.get(userId);
  }

  /**
   * Get all active user states (for cross-user analysis)
   */
  getAllUserStates() {
    return Array.from(this.activeUsers.values()).map(user => ({
      userId: user.userId,
      state: user.state,
      observationCount: user.observationCount,
      lastUpdate: user.lastUpdate
    }));
  }

  /**
   * Start periodic flushing of buffers
   * In serverless: disabled (external cron triggers flush via endpoint)
   * In local: uses setInterval for development
   */
  startFlushTimer() {
    // Serverless mode: flush is triggered by external cron jobs
    if (process.env.VERCEL === '1' || process.env.SERVERLESS === '1') {
      console.log('[MultiUserStream] Running in serverless mode — flush triggered by cron');
      return;
    }

    // Local mode: periodic flush via setInterval
    this.flushTimer = setInterval(() => {
      for (const userId of this.userBuffer.keys()) {
        if (this.userBuffer.get(userId).length > 0) {
          this._flushUserBuffer(userId).catch(err => {
            console.error('[MultiUserStream] Periodic flush error:', err.message);
          });
        }
      }
    }, this.flushInterval);
  }

  /**
   * Stop periodic flushing
   */
  stopFlushTimer() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Get stream statistics
   */
  getStats() {
    const activeUsers = this.activeUsers.size;
    const totalObservations = Array.from(this.activeUsers.values())
      .reduce((sum, user) => sum + user.observationCount, 0);
    const bufferedStates = Array.from(this.userBuffer.values())
      .reduce((sum, buffer) => sum + buffer.length, 0);
    const pendingTriggers = this.monetizationTriggers.length;

    return {
      activeUsers,
      totalObservations,
      bufferedStates,
      pendingTriggers,
      avgObservationsPerUser: activeUsers > 0 ? Math.round(totalObservations / activeUsers) : 0
    };
  }
}

module.exports = { MultiUserStream };
