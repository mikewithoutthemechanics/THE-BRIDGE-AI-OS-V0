'use strict';
/**
 * lib/neurolink/inference.js — Cognitive State Inference Engine
 *
 * Maps EEG feature vectors to human-interpretable cognitive/emotional states.
 * Uses sigmoid-based classifiers (no ML model required — these are based on
 * established neuroscience literature for EEG band ratios).
 *
 * Output states:
 *   focus    (0–1) — sustained attention, deep work
 *   stress   (0–1) — physiological stress response
 *   fatigue  (0–1) — cognitive tiredness, error-prone state
 *   calm     (0–1) — relaxed, meditative state
 *   emotion  { valence, arousal, dominance } — VAD model for Digital Twin
 *   intent   — predicted next action (from engagement patterns)
 */

// ── Activation functions ─────────────────────────────────────────────────────

function sigmoid(x, center = 0, steepness = 1) {
  return 1 / (1 + Math.exp(-steepness * (x - center)));
}

function clamp(v, min = 0, max = 1) {
  return Math.max(min, Math.min(max, v));
}

// ── State classifiers ────────────────────────────────────────────────────────

/**
 * Infer cognitive states from EEG features.
 * @param {Object} f - feature vector from features.js
 * @returns {Object} cognitive state
 */
function infer(f) {
  // Focus: high beta relative to theta indicates sustained attention
  // engagement_index > 1.5 = high focus, < 0.5 = distracted
  const focus = clamp(sigmoid(f.engagementIndex, 1.0, 2.5));

  // Stress: elevated beta + gamma, suppressed alpha
  // High cognitive load with low relaxation = stress
  const stressRaw = f.relBeta * 0.4 + f.relGamma * 0.4 - f.relAlpha * 0.2;
  const stress = clamp(sigmoid(stressRaw, 0.15, 8));

  // Fatigue: theta dominance over alpha (fatigueIndex > 1 = tired)
  // Delta intrusion during wakefulness also indicates fatigue
  const fatigueRaw = f.fatigueIndex * 0.6 + f.relDelta * 0.4;
  const fatigue = clamp(sigmoid(fatigueRaw, 0.8, 3));

  // Calm: alpha dominance (relaxed awareness)
  const calm = clamp(sigmoid(f.relAlpha, 0.25, 6));

  // Engagement: cognitive load metric
  const engagement = clamp(sigmoid(f.cognitiveLoad, 1.0, 2));

  // Emotion mapping (Russell's VAD circumplex model)
  const emotion = mapEmotion(f, focus, stress, calm);

  // Intent prediction (simple rule-based)
  const intent = predictIntent(focus, stress, fatigue, calm, engagement);

  // Mood label (highest state wins)
  const mood = deriveMood(focus, stress, fatigue, calm);

  return {
    focus:      +focus.toFixed(3),
    stress:     +stress.toFixed(3),
    fatigue:    +fatigue.toFixed(3),
    calm:       +calm.toFixed(3),
    engagement: +engagement.toFixed(3),
    emotion,
    intent,
    mood,
    confidence: computeConfidence(f),
    ts: Date.now(),
  };
}

/**
 * Map EEG features to Valence-Arousal-Dominance (VAD) model.
 * This directly feeds the Digital Twin's emotional state.
 *
 * Valence   (negative–positive): alpha asymmetry + calm vs stress
 * Arousal   (low–high energy):   beta + gamma power
 * Dominance (submissive–dominant): engagement + focus
 */
function mapEmotion(f, focus, stress, calm) {
  // Valence: positive when relaxed + focused, negative when stressed + fatigued
  const valence = clamp(
    0.5 + (f.frontalAsymmetry || 0) * 0.3 + calm * 0.3 - stress * 0.3
  );

  // Arousal: high beta/gamma = high arousal
  const arousal = clamp(f.relBeta * 0.5 + f.relGamma * 0.5, 0, 1);

  // Dominance: feeling in control — high focus + low stress
  const dominance = clamp(focus * 0.6 + (1 - stress) * 0.4);

  return {
    valence:   +valence.toFixed(3),
    arousal:   +arousal.toFixed(3),
    dominance: +dominance.toFixed(3),
  };
}

/**
 * Predict the user's likely next action based on cognitive state.
 */
function predictIntent(focus, stress, fatigue, calm, engagement) {
  if (fatigue > 0.85) return 'needs_rest';
  if (stress > 0.7 && focus < 0.4) return 'overwhelmed';
  if (stress > 0.7) return 'high_pressure_work';
  if (focus > 0.8 && engagement > 0.7) return 'deep_work';
  if (focus > 0.6) return 'active_work';
  if (calm > 0.7 && focus < 0.3) return 'meditation';
  if (calm > 0.5) return 'relaxing';
  if (engagement < 0.3) return 'idle';
  return 'browsing';
}

/**
 * Derive a human-readable mood label.
 */
function deriveMood(focus, stress, fatigue, calm) {
  const states = [
    { label: 'focused',   score: focus },
    { label: 'stressed',  score: stress },
    { label: 'fatigued',  score: fatigue },
    { label: 'calm',      score: calm },
  ];
  states.sort((a, b) => b.score - a.score);

  if (states[0].score < 0.3) return 'neutral';
  return states[0].label;
}

/**
 * Confidence in the inference (based on signal quality + feature stability).
 */
function computeConfidence(f) {
  const sq = f.signalQuality || 0;
  const hasPower = f.totalPower > 0.01 ? 1 : 0;
  return clamp(sq / 100 * 0.7 + hasPower * 0.3);
}

// ── Adaptive system actions ──────────────────────────────────────────────────

/**
 * Determine what the system should do based on cognitive state.
 * Returns an array of recommended actions.
 */
function getAdaptiveActions(state) {
  const actions = [];

  if (state.focus > 0.8) {
    actions.push({ action: 'silence_notifications', reason: 'User in deep focus', priority: 'high' });
  }

  if (state.stress > 0.7) {
    actions.push({ action: 'reduce_load', reason: 'High stress detected', priority: 'high' });
    actions.push({ action: 'suggest_break', reason: 'Stress level ' + (state.stress * 100).toFixed(0) + '%', priority: 'medium' });
  }

  if (state.fatigue > 0.85) {
    actions.push({ action: 'delegate_tasks', reason: 'Cognitive fatigue — error risk elevated', priority: 'critical' });
    actions.push({ action: 'alert_operator', reason: 'Fatigue > 85% — consider rest', priority: 'high' });
  }

  if (state.fatigue > 0.6 && state.focus < 0.3) {
    actions.push({ action: 'suggest_break', reason: 'Low focus + rising fatigue', priority: 'medium' });
  }

  if (state.calm > 0.8 && state.engagement < 0.2) {
    actions.push({ action: 'enter_standby', reason: 'User appears to be resting', priority: 'low' });
  }

  return actions;
}

module.exports = {
  infer,
  mapEmotion,
  predictIntent,
  deriveMood,
  getAdaptiveActions,
};
