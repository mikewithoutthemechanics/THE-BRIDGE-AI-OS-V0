/**
 * NeuroLink User Clone
 * Learns and models individual user behavior patterns
 * Predicts next likely action based on intent history and state patterns
 */

class UserClone {
  constructor(userId = 'default') {
    this.userId = userId;
    this.patterns = new Map(); // intent -> { count, avgFocus, avgStress, avgFatigue, transitions }
    this.transitionMatrix = new Map(); // intent -> { nextIntent -> count }
    this.statePatterns = new Map(); // state combo -> { frequency, actions, outcomes }
    this.totalObservations = 0;
  }

  /**
   * Learn from a state observation
   */
  learn(state, previousState = null) {
    this.totalObservations++;

    const intent = state.intent.label;
    const focus = state.focus.value;
    const stress = state.stress.value;
    const fatigue = state.fatigue.value;

    // Track intent patterns
    if (!this.patterns.has(intent)) {
      this.patterns.set(intent, {
        count: 0,
        avgFocus: 0,
        avgStress: 0,
        avgFatigue: 0,
        transitions: new Map()
      });
    }

    const pattern = this.patterns.get(intent);
    pattern.count++;

    // Running average
    pattern.avgFocus = (pattern.avgFocus * (pattern.count - 1) + focus) / pattern.count;
    pattern.avgStress = (pattern.avgStress * (pattern.count - 1) + stress) / pattern.count;
    pattern.avgFatigue = (pattern.avgFatigue * (pattern.count - 1) + fatigue) / pattern.count;

    // Track transitions (what intent follows current intent)
    if (previousState) {
      const prevIntent = previousState.intent.label;
      if (!pattern.transitions.has(prevIntent)) {
        pattern.transitions.set(prevIntent, 0);
      }
      pattern.transitions.set(prevIntent, pattern.transitions.get(prevIntent) + 1);
    }

    // Track state combinations
    const stateKey = this._encodeState(focus, stress, fatigue);
    if (!this.statePatterns.has(stateKey)) {
      this.statePatterns.set(stateKey, {
        frequency: 0,
        actions: new Map(),
        outcomes: []
      });
    }

    const statePattern = this.statePatterns.get(stateKey);
    statePattern.frequency++;

    if (!statePattern.actions.has(intent)) {
      statePattern.actions.set(intent, 0);
    }
    statePattern.actions.set(intent, statePattern.actions.get(intent) + 1);
  }

  /**
   * Encode state as a rough bucket (to group similar states)
   */
  _encodeState(focus, stress, fatigue) {
    const f = Math.floor(focus * 4); // 0-4
    const s = Math.floor(stress * 4);
    const fa = Math.floor(fatigue * 4);
    return `f${f}s${s}fa${fa}`;
  }

  /**
   * Predict next likely action given current intent
   * Returns ranked list of probable next intents
   */
  predictNextIntent(currentIntent) {
    if (!this.patterns.has(currentIntent)) {
      return {
        probable: 'general',
        alternatives: [],
        confidence: 0.3,
        why: ['No historical data for this intent yet']
      };
    }

    const pattern = this.patterns.get(currentIntent);

    if (pattern.transitions.size === 0) {
      return {
        probable: currentIntent, // Stay in same intent
        alternatives: [],
        confidence: 0.5,
        why: ['User tends to continue current activity']
      };
    }

    // Rank transitions by frequency
    const sorted = Array.from(pattern.transitions.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([intent, count]) => ({
        intent,
        probability: count / pattern.transitions.size
      }));

    const probable = sorted[0];
    const alternatives = sorted.slice(1, 3);

    const confidence = probable.probability;

    const why = [
      `When user is in "${currentIntent}" state`,
      `Most likely next intent: "${probable.intent}" (${(probable.probability * 100).toFixed(0)}% of time)`,
      pattern.count > 20 ? `Pattern learned from ${pattern.count} observations` : `Pattern emerging (${pattern.count} observations)`
    ];

    return { probable: probable.intent, alternatives, confidence, why };
  }

  /**
   * Predict optimal task type based on current state metrics
   * Returns whether user should take high-value vs low-intensity tasks
   */
  predictOptimalTaskType(currentState) {
    const { focus, stress, fatigue } = currentState;

    // High focus + low stress + low fatigue = high-value tasks
    const highValueScore =
      focus.value * 0.5 +
      (1 - stress.value) * 0.3 +
      (1 - fatigue.value) * 0.2;

    // Low focus + high stress + high fatigue = low-intensity tasks
    const lowIntensityScore = 1 - highValueScore;

    const isHighValue = highValueScore > 0.6;

    const why = [
      focus.value > 0.7 ? `High focus (${(focus.value * 100).toFixed(0)}%)` : `Low focus (${(focus.value * 100).toFixed(0)}%)`,
      stress.value < 0.5 ? `Low stress (${(stress.value * 100).toFixed(0)}%)` : `High stress (${(stress.value * 100).toFixed(0)}%)`,
      fatigue.value < 0.5 ? `Low fatigue (${(fatigue.value * 100).toFixed(0)}%)` : `High fatigue (${(fatigue.value * 100).toFixed(0)}%)`
    ];

    return {
      taskType: isHighValue ? 'high_value_task' : 'low_intensity_task',
      score: isHighValue ? highValueScore : lowIntensityScore,
      why,
      recommendation: isHighValue
        ? 'User ready for premium/complex tasks'
        : 'User should focus on simple/automated tasks'
    };
  }

  /**
   * Get user's typical pattern for a specific intent
   */
  getIntentProfile(intent) {
    if (!this.patterns.has(intent)) {
      return null;
    }

    const pattern = this.patterns.get(intent);

    return {
      intent,
      frequency: pattern.count,
      typicalFocus: pattern.avgFocus,
      typicalStress: pattern.avgStress,
      typicalFatigue: pattern.avgFatigue,
      likelyFollowingIntents: Array.from(pattern.transitions.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([nextIntent, count]) => ({
          intent: nextIntent,
          frequency: count
        }))
    };
  }

  /**
   * Get overall user behavior summary
   */
  getSummary() {
    const profiles = Array.from(this.patterns.entries())
      .map(([intent, pattern]) => ({
        intent,
        frequency: pattern.count,
        averageFocus: (pattern.avgFocus * 100).toFixed(1),
        averageStress: (pattern.avgStress * 100).toFixed(1),
        averageFatigue: (pattern.avgFatigue * 100).toFixed(1)
      }))
      .sort((a, b) => b.frequency - a.frequency);

    const mostCommonIntent = profiles[0]?.intent || 'general';
    const averageFocus = profiles.length > 0
      ? (profiles.reduce((s, p) => s + parseFloat(p.averageFocus), 0) / profiles.length).toFixed(1)
      : '0.0';

    return {
      userId: this.userId,
      totalObservations: this.totalObservations,
      uniqueIntents: profiles.length,
      mostCommonIntent,
      averageFocus,
      profiles,
      readiness: this.totalObservations >= 20 ? 'HIGH' : this.totalObservations >= 10 ? 'MEDIUM' : 'LOW'
    };
  }

  /**
   * Serialize for storage
   */
  toJSON() {
    const patterns = {};
    this.patterns.forEach((value, key) => {
      patterns[key] = {
        count: value.count,
        avgFocus: value.avgFocus,
        avgStress: value.avgStress,
        avgFatigue: value.avgFatigue,
        transitions: Object.fromEntries(value.transitions)
      };
    });

    return {
      userId: this.userId,
      totalObservations: this.totalObservations,
      patterns
    };
  }

  /**
   * Deserialize from storage
   */
  static fromJSON(data) {
    const clone = new UserClone(data.userId);
    clone.totalObservations = data.totalObservations;

    Object.entries(data.patterns).forEach(([intent, pattern]) => {
      clone.patterns.set(intent, {
        count: pattern.count,
        avgFocus: pattern.avgFocus,
        avgStress: pattern.avgStress,
        avgFatigue: pattern.avgFatigue,
        transitions: new Map(Object.entries(pattern.transitions).map(([k, v]) => [k, v]))
      });
    });

    return clone;
  }
}

module.exports = { UserClone };
