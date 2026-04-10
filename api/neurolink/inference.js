/**
 * NeuroLink Inference Engine
 * Maps features → state with confidence + explanation
 */

function sigmoid(x) {
  return 1 / (1 + Math.exp(-Math.max(-100, Math.min(100, x))));
}

function normalize(x) {
  return Math.max(0, Math.min(1, x));
}

function predictIntent(f, history = []) {
  // Check historical intent for stability
  const recentIntents = history.slice(0, 5).map(p => p.intent?.label);
  const stableIntent = recentIntents[0] === recentIntents[1] ? recentIntents[0] : null;

  // Rule-based intent prediction
  if (f.activityLevel > 0.7 && f.focusStability > 0.6 && f.distractionIndex < 0.4) {
    return {
      label: "deep_work",
      confidence: normalize((f.activityLevel + f.focusStability) / 2 - f.distractionIndex),
      why: ["Stable keystroke intervals", "Low context switching", "High interaction density"]
    };
  }

  if (f.activityLevel > 0.5 && f.distractionIndex > 0.6) {
    return {
      label: "context_switching",
      confidence: f.distractionIndex,
      why: ["Frequent window switches", "High error rate", "Inconsistent pacing"]
    };
  }

  if (f.fatigueProxy > 0.7 && f.activityLevel < 0.3) {
    return {
      label: "winding_down",
      confidence: normalize(f.fatigueProxy - f.activityLevel),
      why: ["Extended continuous usage", "Late-night hours", "Increased idle time"]
    };
  }

  if (f.activityLevel < 0.2) {
    return {
      label: "idle",
      confidence: 1 - f.activityLevel,
      why: ["Minimal input activity", "Extended idle periods"]
    };
  }

  return {
    label: "general",
    confidence: 0.5,
    why: ["No clear intent pattern detected"]
  };
}

function emotionLabel(valence, arousal) {
  // Simple VAD → label mapping
  const val = valence > 0.5 ? 'positive' : 'negative';
  const aro = arousal > 0.5 ? 'activated' : 'deactivated';

  const labels = {
    'positive_activated': 'engaged',
    'positive_deactivated': 'calm',
    'negative_activated': 'stressed',
    'negative_deactivated': 'fatigued'
  };

  return labels[`${val}_${aro}`] || 'neutral';
}

/**
 * Infer cognitive + emotional state from features
 * @param {NeuroFeatures} f
 * @param {string} source - SIMULATED, AMBIENT, or EEG
 * @param {Array} history - Previous states for trend detection
 * @returns {NeuroState}
 */
function inferState(f, source = 'AMBIENT', history = []) {
  // Compute state dimensions with confidence
  const focus = sigmoid(1 / (f.focusStability + 1e-6) + f.activityLevel - f.distractionIndex);
  const stress = sigmoid(f.stressProxy + f.cognitiveLoad - f.focusStability);
  const fatigue = sigmoid(f.fatigueProxy - f.activityLevel);
  const calm = sigmoid(1 / (f.distractionIndex + 1e-6) - f.stressProxy);

  // Emotion (VAD)
  const valence = normalize(1 - f.stressProxy - f.fatigueProxy * 0.5);
  const arousal = normalize(f.activityLevel);
  const dominance = normalize(f.cognitiveLoad);

  // Confidence scoring (higher when signals are clear)
  const focusConfidence = normalize(f.focusStability + (1 - f.distractionIndex));
  const stressConfidence = normalize((f.stressProxy + f.cognitiveLoad) / 2);
  const fatigueConfidence = f.fatigueProxy > 0.6 ? 0.8 : 0.6;

  // Intent prediction
  const intent = predictIntent(f, history);

  // Overall signal quality (how much valid data we have)
  const signalQuality = normalize((focusConfidence + stressConfidence + fatigueConfidence) / 3);

  return {
    focus: {
      value: focus,
      confidence: focusConfidence,
      derivedFrom: ['focusStability', 'activityLevel', 'distractionIndex'],
      why: [
        f.focusStability > 0.7 ? 'Stable interaction patterns' : 'Variable interaction patterns',
        f.distractionIndex < 0.4 ? 'Low distraction signals' : 'High distraction detected',
        f.activityLevel > 0.6 ? 'Active engagement' : 'Reduced activity level'
      ]
    },
    stress: {
      value: stress,
      confidence: stressConfidence,
      derivedFrom: ['stressProxy', 'cognitiveLoad'],
      why: [
        f.stressProxy > 0.6 ? 'High-stress environmental signals' : 'Low-stress environment',
        f.cognitiveLoad > 0.7 ? 'High cognitive demand' : 'Moderate cognitive load',
        f.focusStability < 0.5 ? 'Unstable focus detected' : 'Stable focus patterns'
      ]
    },
    fatigue: {
      value: fatigue,
      confidence: fatigueConfidence,
      derivedFrom: ['fatigueProxy', 'activityLevel'],
      why: [
        f.fatigueProxy > 0.6 ? 'Fatigue signals present' : 'Low fatigue indicators',
        f.activityLevel < 0.3 ? 'Reduced activity level' : 'Maintained activity',
        history.length > 0 && history[0].fatigue?.value > 0.6 ? 'Sustained fatigue pattern' : 'No persistent fatigue'
      ]
    },
    calm: {
      value: calm,
      confidence: (1 - stressConfidence + focusConfidence) / 2,
      derivedFrom: ['distractionIndex', 'stressProxy'],
      why: [
        f.distractionIndex < 0.4 ? 'Low distraction index' : 'Distractions present',
        f.stressProxy < 0.5 ? 'Calm environment detected' : 'Stressful signals'
      ]
    },
    emotion: {
      valence: {
        value: valence,
        confidence: 0.7,
        derivedFrom: ['stressProxy', 'fatigueProxy'],
        why: ['Derived from stress and fatigue indicators']
      },
      arousal: {
        value: arousal,
        confidence: 0.8,
        derivedFrom: ['activityLevel'],
        why: ['Based on interaction intensity']
      },
      dominance: {
        value: dominance,
        confidence: 0.6,
        derivedFrom: ['cognitiveLoad'],
        why: ['Based on cognitive demand']
      },
      label: emotionLabel(valence, arousal)
    },
    intent,
    source,
    signalQuality,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  sigmoid,
  normalize,
  predictIntent,
  emotionLabel,
  inferState
};
