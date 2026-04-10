/**
 * NeuroLink Level 2 Tests
 * Predictive Engine + User Clone
 */

const { PredictiveEngine } = require('../api/neurolink/predictive-engine');
const { UserClone } = require('../api/neurolink/user-clone');

describe('NeuroLink Level 2: Predictive Engine', () => {
  let predictor;

  beforeEach(() => {
    predictor = new PredictiveEngine(50);
  });

  test('should predict high conversion probability', () => {
    // Build a state with high focus + low stress
    for (let i = 0; i < 10; i++) {
      const state = {
        focus: { value: 0.82 },
        stress: { value: 0.35 },
        fatigue: { value: 0.25 },
        emotion: { valence: { value: 0.7 }, arousal: { value: 0.6 }, dominance: { value: 0.5 } },
        intent: { label: 'deep_work' }
      };
      predictor.update(state);
    }

    const prediction = predictor.predict();

    expect(prediction.ready).toBe(true);
    expect(prediction.highConversionProbability.value).toBeGreaterThan(0.7);
    expect(prediction.highConversionProbability.confidence).toBeGreaterThan(0.6);
    expect(prediction.highConversionProbability.action).toBe('PUSH_PREMIUM_OFFER');
  });

  test('should predict churn risk', () => {
    // Build a state with high stress + high fatigue
    for (let i = 0; i < 10; i++) {
      const state = {
        focus: { value: 0.35 },
        stress: { value: 0.78 },
        fatigue: { value: 0.82 },
        emotion: { valence: { value: 0.2 }, arousal: { value: 0.7 }, dominance: { value: 0.4 } },
        intent: { label: 'idle' }
      };
      predictor.update(state);
    }

    const prediction = predictor.predict();

    expect(prediction.ready).toBe(true);
    expect(prediction.churnRisk.value).toBeGreaterThan(0.65);
    expect(prediction.churnRisk.action).toBe('INTERVENE_SUPPORT');
  });

  test('should predict fatigue dropoff', () => {
    // Build a state with very high fatigue
    for (let i = 0; i < 10; i++) {
      const state = {
        focus: { value: 0.3 },
        stress: { value: 0.5 },
        fatigue: { value: 0.85 },
        emotion: { valence: { value: 0.4 }, arousal: { value: 0.3 }, dominance: { value: 0.3 } },
        intent: { label: 'winding_down' }
      };
      predictor.update(state);
    }

    const prediction = predictor.predict();

    expect(prediction.ready).toBe(true);
    expect(prediction.fatigueDropOff.value).toBeGreaterThan(0.75);
    expect(prediction.fatigueDropOff.action).toBe('ACTIVATE_AUTOPILOT');
  });

  test('should identify optimal offer window', () => {
    // Build a state with optimal conditions
    for (let i = 0; i < 10; i++) {
      const state = {
        focus: { value: 0.80 },
        stress: { value: 0.40 },
        fatigue: { value: 0.45 },
        emotion: { valence: { value: 0.75 }, arousal: { value: 0.65 }, dominance: { value: 0.6 } },
        intent: { label: 'deep_work' }
      };
      predictor.update(state);
    }

    const prediction = predictor.predict();

    expect(prediction.ready).toBe(true);
    expect(prediction.optimalOfferWindow.value).toBeGreaterThan(0.70);
    expect(prediction.optimalOfferWindow.action).toBe('OFFER_NOW');
  });

  test('should provide confidence scores', () => {
    for (let i = 0; i < 10; i++) {
      const state = {
        focus: { value: 0.75 },
        stress: { value: 0.45 },
        fatigue: { value: 0.35 },
        emotion: { valence: { value: 0.65 }, arousal: { value: 0.6 }, dominance: { value: 0.55 } },
        intent: { label: 'deep_work' }
      };
      predictor.update(state);
    }

    const prediction = predictor.predict();

    expect(prediction.highConversionProbability.confidence).toBeGreaterThan(0);
    expect(prediction.highConversionProbability.confidence).toBeLessThanOrEqual(1);
    expect(prediction.churnRisk.confidence).toBeGreaterThan(0);
    expect(prediction.churnRisk.confidence).toBeLessThanOrEqual(1);
  });

  test('should select next action based on priority', () => {
    // Scenario: High churn risk should take priority over offer
    for (let i = 0; i < 10; i++) {
      const state = {
        focus: { value: 0.85 }, // High focus
        stress: { value: 0.78 }, // High stress
        fatigue: { value: 0.80 }, // High fatigue
        emotion: { valence: { value: 0.25 }, arousal: { value: 0.7 }, dominance: { value: 0.5 } },
        intent: { label: 'idle' }
      };
      predictor.update(state);
    }

    const prediction = predictor.predict();

    expect(prediction.nextAction.action).toBe('INTERVENE_SUPPORT');
    expect(prediction.nextAction.reason).toContain('Churn');
  });
});

describe('NeuroLink Level 2: User Clone', () => {
  let userClone;

  beforeEach(() => {
    userClone = new UserClone('test-user');
  });

  test('should learn from state observations', () => {
    const state = {
      focus: { value: 0.85 },
      stress: { value: 0.3 },
      fatigue: { value: 0.2 },
      emotion: { valence: { value: 0.8 }, arousal: { value: 0.7 }, dominance: { value: 0.6 } },
      intent: { label: 'deep_work' }
    };

    userClone.learn(state);

    expect(userClone.patterns.has('deep_work')).toBe(true);
    expect(userClone.patterns.get('deep_work').count).toBe(1);
  });

  test('should track average metrics per intent', () => {
    const states = [
      { focus: { value: 0.80 }, stress: { value: 0.35 }, fatigue: { value: 0.25 }, emotion: {}, intent: { label: 'deep_work' } },
      { focus: { value: 0.85 }, stress: { value: 0.30 }, fatigue: { value: 0.20 }, emotion: {}, intent: { label: 'deep_work' } },
      { focus: { value: 0.90 }, stress: { value: 0.25 }, fatigue: { value: 0.15 }, emotion: {}, intent: { label: 'deep_work' } }
    ];

    states.forEach(s => userClone.learn(s));

    const profile = userClone.getIntentProfile('deep_work');

    expect(profile.frequency).toBe(3);
    expect(profile.typicalFocus).toBeCloseTo(0.85, 1);
    expect(profile.typicalStress).toBeCloseTo(0.30, 1);
  });

  test('should predict next intent based on transitions', () => {
    const states = [
      { focus: { value: 0.80 }, stress: { value: 0.35 }, fatigue: { value: 0.25 }, emotion: {}, intent: { label: 'deep_work' } },
      { focus: { value: 0.75 }, stress: { value: 0.4 }, fatigue: { value: 0.3 }, emotion: {}, intent: { label: 'context_switching' } },
      { focus: { value: 0.70 }, stress: { value: 0.5 }, fatigue: { value: 0.4 }, emotion: {}, intent: { label: 'deep_work' } }
    ];

    states.forEach((s, i) => {
      const prev = i > 0 ? states[i - 1] : null;
      userClone.learn(s, prev);
    });

    const prediction = userClone.predictNextIntent('context_switching');

    expect(prediction.probable).toBeDefined();
    expect(prediction.confidence).toBeGreaterThanOrEqual(0);
  });

  test('should predict optimal task type', () => {
    const state = {
      focus: { value: 0.82 },
      stress: { value: 0.38 },
      fatigue: { value: 0.25 }
    };

    const recommendation = userClone.predictOptimalTaskType(state);

    expect(recommendation.taskType).toBe('high_value_task');
    expect(recommendation.score).toBeGreaterThan(0.6);
    expect(recommendation.why).toBeInstanceOf(Array);
  });

  test('should identify low-intensity task when fatigued', () => {
    const state = {
      focus: { value: 0.30 },
      stress: { value: 0.75 },
      fatigue: { value: 0.85 }
    };

    const recommendation = userClone.predictOptimalTaskType(state);

    expect(recommendation.taskType).toBe('low_intensity_task');
  });

  test('should provide behavior summary', () => {
    const states = [
      { focus: { value: 0.85 }, stress: { value: 0.3 }, fatigue: { value: 0.2 }, emotion: {}, intent: { label: 'deep_work' } },
      { focus: { value: 0.75 }, stress: { value: 0.4 }, fatigue: { value: 0.3 }, emotion: {}, intent: { label: 'context_switching' } },
      { focus: { value: 0.70 }, stress: { value: 0.5 }, fatigue: { value: 0.4 }, emotion: {}, intent: { label: 'deep_work' } }
    ];

    states.forEach(s => userClone.learn(s));

    const summary = userClone.getSummary();

    expect(summary.userId).toBe('test-user');
    expect(summary.totalObservations).toBe(3);
    expect(summary.uniqueIntents).toBeGreaterThan(0);
    expect(summary.profiles).toBeInstanceOf(Array);
    expect(['HIGH', 'MEDIUM', 'LOW']).toContain(summary.readiness);
  });

  test('should serialize and deserialize', () => {
    const state = { focus: { value: 0.80 }, stress: { value: 0.35 }, fatigue: { value: 0.25 }, emotion: {}, intent: { label: 'deep_work' } };
    userClone.learn(state);

    const json = userClone.toJSON();
    const restored = UserClone.fromJSON(json);

    expect(restored.userId).toBe('test-user');
    expect(restored.totalObservations).toBe(1);
    expect(restored.patterns.has('deep_work')).toBe(true);
  });
});
