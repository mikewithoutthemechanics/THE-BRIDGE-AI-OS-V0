/**
 * NeuroLink Type Definitions
 * Cognitive State Inference Engine
 */

/**
 * @typedef {Object} NeuroMetric
 * @property {number} value - 0–1 normalized value
 * @property {number} confidence - 0–1 confidence score
 * @property {string[]} derivedFrom - Signal sources used
 * @property {string[]} why - Human-readable explanations
 */

/**
 * @typedef {Object} NeuroFeatures
 * @property {number} cognitiveLoad - 0–1
 * @property {number} distractionIndex - 0–1
 * @property {number} focusStability - 0–1
 * @property {number} fatigueProxy - 0–1
 * @property {number} stressProxy - 0–1
 * @property {number} activityLevel - 0–1
 */

/**
 * @typedef {Object} NeuroEmotion
 * @property {NeuroMetric} valence - Positive/negative
 * @property {NeuroMetric} arousal - Activated/deactivated
 * @property {NeuroMetric} dominance - Control/submission
 * @property {string} label - Human-readable emotion label
 */

/**
 * @typedef {Object} NeuroState
 * @property {NeuroMetric} focus - Focus level
 * @property {NeuroMetric} stress - Stress level
 * @property {NeuroMetric} fatigue - Fatigue level
 * @property {NeuroMetric} calm - Calmness (inverse stress/distraction)
 * @property {NeuroEmotion} emotion - VAD emotion model
 * @property {Object} intent - Predicted next action
 * @property {string} intent.label - e.g., "deep_work", "explore"
 * @property {number} intent.confidence - 0–1
 * @property {string[]} intent.why - Why this intent
 * @property {"SIMULATED"|"AMBIENT"|"EEG"} source - Current mode
 * @property {number} signalQuality - Overall signal quality 0–1
 * @property {string} timestamp - ISO string
 */

/**
 * @typedef {Object} NeuroStatus
 * @property {boolean} connected - Adapter health
 * @property {"SIMULATED"|"AMBIENT"|"EEG"} mode - Current operational mode
 * @property {number} latency - Last loop latency (ms)
 * @property {number} signalQuality - Signal quality 0–1
 * @property {string} timestamp - ISO string
 */

/**
 * @typedef {Object} AmbientInputs
 * @property {Object} system - CPU, memory, thermal
 * @property {Object} input - Typing, pauses, errors
 * @property {Object} network - Latency, jitter
 * @property {Object} wifi - Device count, noise
 * @property {Object} bluetooth - Proximity, movement
 * @property {number} time - Timestamp (ms)
 */

/**
 * @typedef {Object} NeuroHistoryPoint
 * @property {string} timestamp - ISO string
 * @property {number} focus - Focus value
 * @property {number} stress - Stress value
 * @property {number} fatigue - Fatigue value
 * @property {number} valence - Emotion valence
 * @property {number} arousal - Emotion arousal
 * @property {number} dominance - Emotion dominance
 * @property {string} mode - Mode used
 * @property {string} intent - Intent label
 */

/**
 * @typedef {Object} NeuroHistoryDay
 * @property {string} date - YYYY-MM-DD
 * @property {NeuroHistoryPoint[]} points - Data points for day
 * @property {string[]} anomalies - Detected anomalies
 * @property {Object} peakWindows - Peak performance windows
 * @property {Array<{start: string, end: string}>} peakWindows.focus - Focus peaks
 * @property {Array<{start: string, end: string}>} peakWindows.fatigue - Fatigue peaks
 */

module.exports = {
  // Type definitions are JSDoc only, exported for reference
  NeuroMetric: {},
  NeuroFeatures: {},
  NeuroEmotion: {},
  NeuroState: {},
  NeuroStatus: {},
  AmbientInputs: {},
  NeuroHistoryPoint: {},
  NeuroHistoryDay: {},
};
