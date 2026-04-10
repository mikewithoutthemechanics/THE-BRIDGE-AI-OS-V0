/**
 * NeuroLink API Routes + WebSocket Handler
 * Exposes cognitive state via REST + real-time WebSocket
 * Includes Level 2: Predictive Revenue Engine + User Cloning
 * Includes Level 3: Intelligence Graph + Autonomous Monetization
 */

const { AmbientAdapter } = require('./ambient');
const { inferState } = require('./inference');
const { NeuroHistory } = require('./history');
const { PredictiveEngine } = require('./predictive-engine');
const { UserClone } = require('./user-clone');
const { IntelligenceGraph } = require('./intelligence-graph');
const { AutonomousMonetization } = require('./autonomous-monetization');
const { MultiUserStream } = require('./multi-user-stream');
const { LiveMonetizationOrchestrator } = require('./live-monetization-orchestrator');

class NeuroLinkService {
  constructor(database = null) {
    this.adapter = new AmbientAdapter();
    this.history = new NeuroHistory();
    this.predictor = new PredictiveEngine(50); // 50-state sliding window
    this.userClone = new UserClone('default-user');

    // Level 3: Intelligence Graph + Autonomous Monetization
    this.intelligenceGraph = new IntelligenceGraph();
    this.autonomousMonetization = null; // Initialized after revenue hooks are wired

    // Level 3: Real-time Multi-User Streaming + Live Monetization
    this.multiUserStream = new MultiUserStream(database);
    this.liveOrchestrator = null; // Initialized after multiUserStream is ready

    this.currentState = null;
    this.currentStatus = null;
    this.lastPrediction = null;
    this.cache = { latestState: null, latestStatus: null };
    this.subscribers = new Set(); // WebSocket clients
    this.enabled = process.env.NEUROLINK_ENABLED !== 'false';
    this.device = process.env.NEUROLINK_DEVICE || 'ambient';
    this.interval = parseInt(process.env.NEUROLINK_INTERVAL, 10) || 100;
    this.loopInterval = null;
  }

  /**
   * Start the inference loop
   */
  start() {
    if (this.loopInterval) return; // Already running

    console.log(`[NeuroLink] Starting with device=${this.device}, interval=${this.interval}ms`);

    // Start multi-user stream flushing
    this.multiUserStream.startFlushTimer();

    // Initialize and start live orchestrator
    if (!this.liveOrchestrator) {
      this.liveOrchestrator = new LiveMonetizationOrchestrator(this.multiUserStream, this.intelligenceGraph, this.multiUserStream.db);
      this.liveOrchestrator.startProcessing(1000); // Process triggers every 1 second
      console.log('[NeuroLink] Live monetization orchestrator started');
    }

    this.loopInterval = setInterval(async () => {
      try {
        await this.tick();
      } catch (err) {
        console.error('[NeuroLink] Tick error:', err.message);
      }
    }, this.interval);
  }

  /**
   * Stop the inference loop
   */
  stop() {
    if (this.loopInterval) {
      clearInterval(this.loopInterval);
      this.loopInterval = null;
    }

    // Stop real-time systems
    this.multiUserStream.stopFlushTimer();
    if (this.liveOrchestrator) {
      this.liveOrchestrator.stopProcessing();
    }

    console.log('[NeuroLink] Stopped');
  }

  /**
   * Single inference tick
   * Includes Level 2: predictions and user cloning
   */
  async tick() {
    if (!this.enabled) return;

    const start = performance.now();

    try {
      // Collect inputs
      const raw = await this.adapter.collect();

      // Derive features from inputs
      const features = this.deriveFeatures(raw);

      // Infer state
      const recentHistory = await this.history.getRecentStates(10);
      const state = inferState(features, this.adapter.mode(), recentHistory);

      // Update cache
      this.cache.latestState = state;
      this.cache.latestStatus = {
        connected: true,
        mode: this.adapter.mode(),
        latency: Math.round(performance.now() - start),
        signalQuality: state.signalQuality,
        timestamp: new Date().toISOString()
      };

      this.currentState = state;
      this.currentStatus = this.cache.latestStatus;

      // Store in history
      await this.history.addPoint(state);

      // ─── LEVEL 2: PREDICTIVE ENGINE ───
      // Update predictor with new state
      this.predictor.update(state);

      // Generate predictions every 10 ticks (to reduce CPU overhead)
      if (this.tickCount === undefined) this.tickCount = 0;
      this.tickCount = (this.tickCount + 1) % 10;

      if (this.tickCount === 0) {
        this.lastPrediction = this.predictor.predict();
      }

      // ─── LEVEL 2: USER CLONING ───
      // Learn from this state observation
      this.userClone.learn(state, this.previousState);
      this.previousState = state;

      // ─── LEVEL 3: INTELLIGENCE GRAPH + AUTONOMOUS MONETIZATION ───
      // Register or update user in intelligence graph (every 50 ticks = ~5 seconds)
      if (this.tickCount === 0) {
        this.intelligenceGraph.registerUser('default-user', this.userClone);
      }

      // Generate cross-user recommendations (every 100 ticks = ~10 seconds)
      if (this.tickCount === 0 && this.intelligenceGraph.users.size > 1) {
        this.intelligenceGraph.generateCrossUserRecommendations();
      }

      // Execute autonomous decisions if monetization engine is initialized
      if (this.autonomousMonetization && this.lastPrediction?.ready) {
        const autonomousAction = this.autonomousMonetization.analyzeAndExecute(
          'default-user',
          state,
          this.lastPrediction
        );

        // Broadcast autonomous action to WebSocket subscribers
        this.broadcastEvent({
          event: 'NEUROLINK_AUTONOMOUS_ACTION',
          data: autonomousAction,
          timestamp: new Date().toISOString()
        });
      }

      // ─── LEVEL 3: REAL-TIME MULTI-USER STREAMING ───
      // Ingest current user state into multi-user stream
      if (this.multiUserStream) {
        try {
          await this.multiUserStream.ingestState('default-user', state, this.lastPrediction);
        } catch (err) {
          console.warn('[NeuroLink] Stream ingest error:', err.message);
        }
      }

      // Emit to WebSocket subscribers
      this.broadcastStateUpdate(state);

      // Check thresholds and emit events
      this.checkThresholds(state);

      // Emit predictions if available (every 10 ticks)
      if (this.tickCount === 0 && this.lastPrediction?.ready) {
        this.broadcastEvent({
          event: 'NEUROLINK_PREDICTION',
          data: this.lastPrediction,
          timestamp: new Date().toISOString()
        });
      }
    } catch (err) {
      console.error('[NeuroLink] Inference error:', err.message);
      this.cache.latestStatus = {
        connected: false,
        mode: 'AMBIENT',
        latency: 0,
        signalQuality: 0,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Derive features from raw ambient inputs
   */
  deriveFeatures(raw) {
    const cognitiveLoad = (raw.system.cpu + raw.input.inputDensity) / 2;
    const distractionIndex = raw.wifi.deviceCount / 10 + raw.input.errors * 0.5;
    const focusStability = 1 - raw.input.pauses;
    const fatigueProxy = raw.input.idleTime / 60000; // Normalize to 0–1 over 1 hour
    const stressProxy = raw.network.latency / 100 + raw.network.jitter / 50;
    const activityLevel = raw.input.inputDensity;

    return {
      cognitiveLoad: Math.min(1, cognitiveLoad),
      distractionIndex: Math.min(1, distractionIndex),
      focusStability: Math.max(0, Math.min(1, focusStability)),
      fatigueProxy: Math.min(1, fatigueProxy),
      stressProxy: Math.min(1, stressProxy),
      activityLevel: Math.min(1, activityLevel)
    };
  }

  /**
   * Check state thresholds and emit events
   */
  checkThresholds(state) {
    const thresholds = {
      FOCUS_HIGH: state.focus.value >= 0.8 && state.focus.confidence > 0.7,
      STRESS_HIGH: state.stress.value >= 0.7 && state.stress.confidence > 0.6,
      FATIGUE_HIGH: state.fatigue.value >= 0.8 && state.fatigue.confidence > 0.6
    };

    Object.entries(thresholds).forEach(([event, triggered]) => {
      if (triggered) {
        this.broadcastEvent({
          event,
          timestamp: state.timestamp,
          value: state[event.split('_')[0].toLowerCase()].value,
          eventId: `neurolink:${event}:${Date.now()}`
        });
      }
    });

    // Intent change event
    if (this.lastIntent && this.lastIntent !== state.intent.label) {
      this.broadcastEvent({
        event: 'NEUROLINK_INTENT_CHANGE',
        timestamp: state.timestamp,
        intent: state.intent.label,
        eventId: `neurolink:intent:${Date.now()}`
      });
    }
    this.lastIntent = state.intent.label;
  }

  /**
   * Broadcast state update to all WebSocket subscribers
   */
  broadcastStateUpdate(state) {
    const message = JSON.stringify({
      type: 'NEUROLINK_STATE_UPDATE',
      data: state
    });

    this.subscribers.forEach(ws => {
      try {
        ws.send(message);
      } catch (err) {
        console.warn('[NeuroLink] WebSocket send error:', err.message);
      }
    });
  }

  /**
   * Broadcast event to all WebSocket subscribers
   */
  broadcastEvent(event) {
    const message = JSON.stringify({
      type: 'NEUROLINK_EVENT',
      data: event
    });

    this.subscribers.forEach(ws => {
      try {
        ws.send(message);
      } catch (err) {
        console.warn('[NeuroLink] WebSocket send error:', err.message);
      }
    });
  }

  /**
   * Register WebSocket subscriber
   */
  subscribe(ws) {
    this.subscribers.add(ws);
    // Send initial state if available
    if (this.currentState) {
      ws.send(JSON.stringify({
        type: 'NEUROLINK_STATE_UPDATE',
        data: this.currentState
      }));
    }
  }

  /**
   * Unregister WebSocket subscriber
   */
  unsubscribe(ws) {
    this.subscribers.delete(ws);
  }

  /**
   * Record user input (for training ambient adapter)
   */
  recordInput(params) {
    this.adapter.recordInput(params);
  }

  /**
   * Record window switch
   */
  recordWindowSwitch() {
    this.adapter.recordWindowSwitch();
  }

  /**
   * Get current status
   */
  getStatus() {
    return this.cache.latestStatus || {
      connected: false,
      mode: 'AMBIENT',
      latency: 0,
      signalQuality: 0,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get current state
   */
  getState() {
    return this.cache.latestState || null;
  }

  /**
   * Get emotion (VAD) only
   */
  getEmotion() {
    if (!this.cache.latestState) return null;
    return this.cache.latestState.emotion;
  }

  /**
   * Set configuration
   */
  setConfig(config) {
    if (config.enabled !== undefined) this.enabled = config.enabled;
    if (config.mode !== undefined) this.device = config.mode;
    if (config.interval !== undefined) this.interval = config.interval;

    console.log(`[NeuroLink] Config updated:`, { enabled: this.enabled, device: this.device, interval: this.interval });

    return {
      ok: true,
      enabled: this.enabled,
      device: this.device,
      interval: this.interval
    };
  }

  /**
   * Get history summary
   */
  async getHistorySummary(days = 1) {
    const history = await this.history.getHistory(days);
    return history;
  }

  /**
   * Get today's summary
   */
  async getTodaySummary() {
    const today = new Date().toISOString().split('T')[0];
    const summary = await this.history.getDaySummary(today);
    return summary;
  }

  /**
   * Get latest predictions (Level 2)
   */
  getPredictions() {
    return this.lastPrediction || {
      ready: false,
      message: 'Gathering baseline data...',
      dataPoints: this.predictor.window.length
    };
  }

  /**
   * Get next likely action based on predictions (Level 2)
   */
  getNextAction() {
    if (!this.lastPrediction?.nextAction) {
      return { action: 'MONITOR', reason: 'No predictions available yet' };
    }
    return this.lastPrediction.nextAction;
  }

  /**
   * Get user behavior profile (Level 2)
   */
  getUserProfile() {
    return this.userClone.getSummary();
  }

  /**
   * Predict next intent based on current state (Level 2)
   */
  predictNextIntent(currentIntent) {
    return this.userClone.predictNextIntent(currentIntent);
  }

  /**
   * Predict optimal task type for current state (Level 2)
   */
  predictOptimalTaskType() {
    if (!this.currentState) return null;
    return this.userClone.predictOptimalTaskType(this.currentState);
  }

  /**
   * Get intelligence graph summary (Level 3)
   */
  getIntelligenceGraphSummary() {
    return this.intelligenceGraph.getSummary();
  }

  /**
   * Get cross-user patterns (Level 3)
   */
  getCrossUserPatterns() {
    const patterns = [];
    for (const [userId, user] of this.intelligenceGraph.users) {
      const extracted = this.intelligenceGraph.extractPatterns(userId);
      if (extracted) {
        patterns.push({
          userId,
          patternCount: extracted.patternCount,
          patterns: extracted.patterns
        });
      }
    }
    return patterns;
  }

  /**
   * Get user's behavioral segment (Level 3)
   */
  getUserSegment(userId) {
    const user = this.intelligenceGraph.users.get(userId);
    if (!user || user.segments.size === 0) return null;

    const segments = [];
    for (const segmentId of user.segments) {
      const profile = this.intelligenceGraph.getSegmentProfile(segmentId);
      if (profile) segments.push(profile);
    }

    return {
      userId,
      segmentCount: segments.length,
      segments
    };
  }

  /**
   * Get autonomous decision statistics (Level 3)
   */
  getAutonomousDecisionStats() {
    if (!this.autonomousMonetization) {
      return { error: 'Autonomous monetization not initialized' };
    }
    return this.autonomousMonetization.getDecisionStats();
  }

  /**
   * Get execution log (Level 3)
   */
  getExecutionLog(limit = 50) {
    if (!this.autonomousMonetization) {
      return [];
    }
    return this.autonomousMonetization.getExecutionLog(limit);
  }

  /**
   * Initialize autonomous monetization with revenue hooks
   * Called after revenue hooks are wired in index.js
   */
  initializeAutonomousMonetization(revenueHooks) {
    this.autonomousMonetization = new AutonomousMonetization(this.intelligenceGraph, revenueHooks);
    console.log('[NeuroLink] Autonomous monetization initialized');
  }

  /**
   * Get real-time stream statistics (Level 3)
   */
  getStreamStats() {
    return this.multiUserStream.getStats();
  }

  /**
   * Get live orchestrator status (Level 3)
   */
  getOrchestratorStatus() {
    if (!this.liveOrchestrator) {
      return { status: 'not_initialized' };
    }
    return this.liveOrchestrator.getExecutionStats();
  }

  /**
   * Get live orchestrator revenue summary (Level 3)
   */
  getOrchestratorRevenue() {
    if (!this.liveOrchestrator) {
      return { error: 'Orchestrator not initialized' };
    }
    return this.liveOrchestrator.getRevenueSummary();
  }

  /**
   * Get pending monetization triggers (Level 3)
   */
  getPendingTriggers(limit = 20) {
    return this.multiUserStream.getMonetizationTriggers(limit);
  }

  /**
   * Get recent orchestrator actions (Level 3)
   */
  getRecentOrchestratorActions(limit = 50) {
    if (!this.liveOrchestrator) {
      return [];
    }
    return this.liveOrchestrator.getRecentActions(limit);
  }

  /**
   * Register a new user in the multi-user stream (Level 3)
   */
  async registerStreamUser(userId, metadata = {}) {
    return this.multiUserStream.registerUser(userId, metadata);
  }

  /**
   * Get a specific user's current state from the stream (Level 3)
   */
  getUserStreamState(userId) {
    return this.multiUserStream.getUserState(userId);
  }

  /**
   * Get all active user states from the stream (Level 3)
   */
  getAllStreamUserStates() {
    return this.multiUserStream.getAllUserStates();
  }
}

// Singleton instance
let serviceInstance = null;

function getNeuroLinkService() {
  if (!serviceInstance) {
    serviceInstance = new NeuroLinkService();
  }
  return serviceInstance;
}

module.exports = {
  NeuroLinkService,
  getNeuroLinkService
};
