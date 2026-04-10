/**
 * NeuroLink API Routes + WebSocket Handler
 * Exposes cognitive state via REST + real-time WebSocket
 */

const { AmbientAdapter } = require('./ambient');
const { inferState } = require('./inference');
const { NeuroHistory } = require('./history');

class NeuroLinkService {
  constructor() {
    this.adapter = new AmbientAdapter();
    this.history = new NeuroHistory();
    this.currentState = null;
    this.currentStatus = null;
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
      console.log('[NeuroLink] Stopped');
    }
  }

  /**
   * Single inference tick
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

      // Emit to WebSocket subscribers
      this.broadcastStateUpdate(state);

      // Check thresholds and emit events
      this.checkThresholds(state);
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
