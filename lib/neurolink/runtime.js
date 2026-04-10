'use strict';
/**
 * lib/neurolink/runtime.js — NeuroLink Runtime Service
 *
 * The main service that:
 *   1. Connects to a device (real or simulated)
 *   2. Runs the DSP → Feature → Inference pipeline in real-time
 *   3. Maintains the latest cognitive state
 *   4. Exposes state to the API and Digital Twin
 *   5. Broadcasts updates via WebSocket
 *   6. Triggers adaptive system behaviors
 *
 * Usage:
 *   const neurolink = require('./lib/neurolink/runtime');
 *   await neurolink.start();
 *   const state = neurolink.getState();
 */
const { preprocess } = require('./dsp');
const { extractMultiChannelFeatures } = require('./features');
const { infer, getAdaptiveActions } = require('./inference');
const { createAdapter } = require('./adapters');

// ── Runtime state ────────────────────────────────────────────────────────────
let _adapter = null;
let _running = false;
let _state = createDefaultState();
let _listeners = [];
let _loopCount = 0;
let _latency = { acquisition: 0, processing: 0, inference: 0, total: 0 };

function createDefaultState() {
  return {
    connected: false,
    source: 'none',
    device: null,
    signalQuality: 0,
    focus: 0,
    stress: 0,
    fatigue: 0,
    calm: 0,
    engagement: 0,
    emotion: { valence: 0.5, arousal: 0.3, dominance: 0.5 },
    intent: 'idle',
    mood: 'neutral',
    confidence: 0,
    adaptiveActions: [],
    latency: { acquisition: 0, processing: 0, inference: 0, total: 0 },
    features: null,
    loopCount: 0,
    ts: Date.now(),
  };
}

// ── Main processing loop ─────────────────────────────────────────────────────

async function processLoop() {
  if (!_adapter || !_running) return;

  try {
    for await (const channels of _adapter.stream()) {
      if (!_running) break;

      const t0 = Date.now();

      // 1. Preprocess each channel (bandpass + notch + artifact removal)
      const t1 = Date.now();
      const cleaned = channels.map(ch => preprocess(ch, _adapter.metadata().sampleRate || 256));
      const tProcess = Date.now() - t1;

      // 2. Extract features (band powers, engagement index, etc.)
      const t2 = Date.now();
      const features = extractMultiChannelFeatures(cleaned, _adapter.metadata().sampleRate || 256);
      const tFeatures = Date.now() - t2;

      // 3. Run inference (cognitive state, emotion, intent)
      const t3 = Date.now();
      const cogState = infer(features);
      const tInference = Date.now() - t3;

      // 4. Get adaptive actions
      const actions = getAdaptiveActions(cogState);

      // 5. Update latency measurements
      const totalLatency = Date.now() - t0;
      _latency = {
        acquisition: t1 - t0,
        processing: tProcess,
        inference: tInference,
        total: totalLatency,
      };

      // 6. Update global state
      _loopCount++;
      const meta = _adapter.metadata();
      _state = {
        connected: meta.connected,
        source: meta.deviceType === 'simulated' ? 'simulated' : 'live',
        device: {
          name: meta.device,
          type: meta.deviceType,
          channels: meta.channels,
          sampleRate: meta.sampleRate,
          interface: meta.interface,
        },
        signalQuality: features.signalQuality || 0,
        focus: cogState.focus,
        stress: cogState.stress,
        fatigue: cogState.fatigue,
        calm: cogState.calm,
        engagement: cogState.engagement,
        emotion: cogState.emotion,
        intent: cogState.intent,
        mood: cogState.mood,
        confidence: cogState.confidence,
        adaptiveActions: actions,
        latency: _latency,
        features: {
          delta: +features.delta.toFixed(4),
          theta: +features.theta.toFixed(4),
          alpha: +features.alpha.toFixed(4),
          beta:  +features.beta.toFixed(4),
          gamma: +features.gamma.toFixed(4),
          engagementIndex: +features.engagementIndex.toFixed(4),
          relaxationIndex: +features.relaxationIndex.toFixed(4),
          fatigueIndex:    +features.fatigueIndex.toFixed(4),
        },
        loopCount: _loopCount,
        ts: Date.now(),
      };

      // 7. Notify listeners (WebSocket clients, Digital Twin, etc.)
      for (const cb of _listeners) {
        try { cb(_state); } catch (_) {}
      }
    }
  } catch (e) {
    console.warn('[NEUROLINK] Stream error:', e.message);
    _state.connected = false;
    _state.source = 'error';
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Start the NeuroLink pipeline.
 * @param {string} adapterType - 'simulated', 'brainflow', 'muse', 'emotiv', or null (auto-detect)
 */
async function start(adapterType) {
  if (_running) {
    console.log('[NEUROLINK] Already running');
    return;
  }

  const type = adapterType || process.env.NEUROLINK_DEVICE || 'simulated';
  _adapter = createAdapter(type);

  try {
    await _adapter.connect();
    _running = true;
    const meta = _adapter.metadata();
    console.log(`[NEUROLINK] Connected to ${meta.device} (${meta.channels}ch, ${meta.sampleRate}Hz, ${meta.interface})`);

    // Start processing loop (non-blocking)
    processLoop().catch(e => {
      console.warn('[NEUROLINK] Loop exited:', e.message);
      _running = false;
    });

    return meta;
  } catch (e) {
    console.warn('[NEUROLINK] Connect failed:', e.message, '— falling back to simulated');
    _adapter = createAdapter('simulated');
    await _adapter.connect();
    _running = true;
    processLoop().catch(() => { _running = false; });
    return _adapter.metadata();
  }
}

/**
 * Stop the NeuroLink pipeline.
 */
async function stop() {
  _running = false;
  if (_adapter) {
    await _adapter.disconnect();
  }
  _state = createDefaultState();
  console.log('[NEUROLINK] Stopped');
}

/**
 * Get the current cognitive state.
 * This is what /api/neurolink/status returns.
 */
function getState() {
  return { ..._state };
}

/**
 * Get the Digital Twin emotion update.
 * Maps directly to the twin's valence/arousal/dominance model.
 */
function getTwinEmotionUpdate() {
  return {
    valence:   _state.emotion.valence,
    arousal:   _state.emotion.arousal,
    dominance: _state.emotion.dominance,
    mood:      _state.mood,
    focus:     _state.focus,
    stress:    _state.stress,
    fatigue:   _state.fatigue,
    source:    _state.source,
    confidence: _state.confidence,
    ts:        _state.ts,
  };
}

/**
 * Subscribe to state updates.
 * Callback receives the full state object on each inference cycle.
 */
function onUpdate(callback) {
  _listeners.push(callback);
  return function unsubscribe() {
    _listeners = _listeners.filter(cb => cb !== callback);
  };
}

/**
 * Check if the service is running.
 */
function isRunning() { return _running; }

/**
 * Get latency metrics.
 */
function getLatency() { return { ..._latency }; }

/**
 * Full status report for the API.
 */
function getFullStatus() {
  const state = getState();
  const meta = _adapter ? _adapter.metadata() : {};
  return {
    ok: true,
    connected: state.connected,
    source: state.source,
    device: state.device || meta,
    protocols: ['EEG', 'fNIRS', 'EMG', 'EOG'],
    interface: meta.interface || 'none',
    channels: meta.channels || 0,
    sampleRate: meta.sampleRate || 0,
    signalQuality: state.signalQuality,
    state: {
      focus: state.focus,
      stress: state.stress,
      fatigue: state.fatigue,
      calm: state.calm,
      engagement: state.engagement,
    },
    emotion: state.emotion,
    intent: state.intent,
    mood: state.mood,
    confidence: state.confidence,
    features: state.features,
    adaptiveActions: state.adaptiveActions,
    latency: state.latency,
    loopCount: state.loopCount,
    ts: state.ts,
  };
}

module.exports = {
  start,
  stop,
  getState,
  getFullStatus,
  getTwinEmotionUpdate,
  onUpdate,
  isRunning,
  getLatency,
};
