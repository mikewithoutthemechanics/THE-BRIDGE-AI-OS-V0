/**
 * NeuroLink Service Tests
 */

const { NeuroLinkService, getNeuroLinkService } = require('../api/neurolink/routes');
const { inferState } = require('../api/neurolink/inference');
const { AmbientAdapter } = require('../api/neurolink/ambient');
const { NeuroHistory } = require('../api/neurolink/history');

describe('NeuroLink Service', () => {
  let service;

  beforeEach(() => {
    service = new NeuroLinkService();
  });

  describe('Feature Extraction', () => {
    test('should derive features from ambient inputs', () => {
      const raw = {
        system: { cpu: 0.5, memory: 0.4, thermal: 0.3 },
        input: { inputDensity: 0.7, pauses: 0.2, errors: 0.05, idleTime: 5000 },
        network: { latency: 50, jitter: 10 },
        wifi: { deviceCount: 3, signalNoise: 0.1 },
        bluetooth: { proximity: 0.2, movement: 0.1 },
        time: Date.now()
      };

      const features = service.deriveFeatures(raw);

      expect(features.cognitiveLoad).toBeGreaterThanOrEqual(0);
      expect(features.cognitiveLoad).toBeLessThanOrEqual(1);
      expect(features.focusStability).toBeGreaterThanOrEqual(0);
      expect(features.focusStability).toBeLessThanOrEqual(1);
      expect(features.activityLevel).toBeGreaterThanOrEqual(0);
      expect(features.activityLevel).toBeLessThanOrEqual(1);
    });

    test('should normalize all feature values', () => {
      const raw = {
        system: { cpu: 2, memory: 10, thermal: 5 },
        input: { inputDensity: 100, pauses: 100, errors: 100, idleTime: 999999 },
        network: { latency: 10000, jitter: 5000 },
        wifi: { deviceCount: 100, signalNoise: 10 },
        bluetooth: { proximity: 10, movement: 10 },
        time: Date.now()
      };

      const features = service.deriveFeatures(raw);

      Object.values(features).forEach(value => {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('Inference Engine', () => {
    test('should infer state from features', () => {
      const features = {
        cognitiveLoad: 0.6,
        distractionIndex: 0.2,
        focusStability: 0.8,
        fatigueProxy: 0.3,
        stressProxy: 0.4,
        activityLevel: 0.7
      };

      const state = inferState(features, 'AMBIENT', []);

      expect(state).toHaveProperty('focus');
      expect(state).toHaveProperty('stress');
      expect(state).toHaveProperty('fatigue');
      expect(state).toHaveProperty('calm');
      expect(state).toHaveProperty('emotion');
      expect(state).toHaveProperty('intent');
      expect(state).toHaveProperty('source');
      expect(state).toHaveProperty('signalQuality');
      expect(state).toHaveProperty('timestamp');

      expect(state.source).toBe('AMBIENT');
    });

    test('should detect deep work intent correctly', () => {
      const features = {
        cognitiveLoad: 0.5,
        distractionIndex: 0.2,
        focusStability: 0.9,
        fatigueProxy: 0.1,
        stressProxy: 0.3,
        activityLevel: 0.8
      };

      const state = inferState(features, 'AMBIENT', []);

      expect(state.intent.label).toBe('deep_work');
      expect(state.intent.confidence).toBeGreaterThan(0.5);
    });

    test('should detect high fatigue correctly', () => {
      const features = {
        cognitiveLoad: 0.3,
        distractionIndex: 0.5,
        focusStability: 0.4,
        fatigueProxy: 0.95,
        stressProxy: 0.6,
        activityLevel: 0.05
      };

      const state = inferState(features, 'AMBIENT', []);

      expect(state.fatigue.value).toBeGreaterThan(0.70);
    });

    test('should have confidence scores', () => {
      const features = {
        cognitiveLoad: 0.5,
        distractionIndex: 0.3,
        focusStability: 0.7,
        fatigueProxy: 0.2,
        stressProxy: 0.4,
        activityLevel: 0.6
      };

      const state = inferState(features, 'AMBIENT', []);

      expect(state.focus.confidence).toBeGreaterThan(0);
      expect(state.focus.confidence).toBeLessThanOrEqual(1);
      expect(state.stress.confidence).toBeGreaterThan(0);
      expect(state.stress.confidence).toBeLessThanOrEqual(1);
    });

    test('should provide explanation for metrics', () => {
      const features = {
        cognitiveLoad: 0.5,
        distractionIndex: 0.3,
        focusStability: 0.7,
        fatigueProxy: 0.2,
        stressProxy: 0.4,
        activityLevel: 0.6
      };

      const state = inferState(features, 'AMBIENT', []);

      expect(state.focus.why).toBeDefined();
      expect(Array.isArray(state.focus.why)).toBe(true);
      expect(state.focus.why.length).toBeGreaterThan(0);
      expect(state.stress.why).toBeDefined();
      expect(state.fatigue.why).toBeDefined();
    });

    test('should derive from signal sources', () => {
      const features = {
        cognitiveLoad: 0.5,
        distractionIndex: 0.3,
        focusStability: 0.7,
        fatigueProxy: 0.2,
        stressProxy: 0.4,
        activityLevel: 0.6
      };

      const state = inferState(features, 'AMBIENT', []);

      expect(state.focus.derivedFrom).toBeDefined();
      expect(Array.isArray(state.focus.derivedFrom)).toBe(true);
      expect(state.focus.derivedFrom.length).toBeGreaterThan(0);
    });
  });

  describe('Ambient Adapter', () => {
    test('should collect ambient inputs', async () => {
      const adapter = new AmbientAdapter();
      const inputs = await adapter.collect();

      expect(inputs).toHaveProperty('system');
      expect(inputs).toHaveProperty('input');
      expect(inputs).toHaveProperty('network');
      expect(inputs).toHaveProperty('wifi');
      expect(inputs).toHaveProperty('bluetooth');
      expect(inputs).toHaveProperty('time');

      expect(inputs.system.cpu).toBeGreaterThanOrEqual(0);
      expect(inputs.system.cpu).toBeLessThanOrEqual(1);
    });

    test('should record input activity', async () => {
      const adapter = new AmbientAdapter();
      adapter.recordInput({ typingSpeed: 5 });

      expect(adapter.inputCount).toBeGreaterThan(0);
    });

    test('should track errors', async () => {
      const adapter = new AmbientAdapter();
      adapter.recordInput({ isError: true });

      expect(adapter.errorCount).toBeGreaterThan(0);
    });

    test('should report health status', async () => {
      const adapter = new AmbientAdapter();
      const health = await adapter.health();

      expect(health).toHaveProperty('ok');
      expect(health).toHaveProperty('signalQuality');
      expect(health.ok).toBe(true);
    });
  });

  describe('Service Integration', () => {
    test('should maintain state cache', async () => {
      service.start();

      await new Promise(resolve => setTimeout(resolve, 200));

      const status = service.getStatus();
      expect(status).toHaveProperty('connected');
      expect(status).toHaveProperty('mode');
      expect(status).toHaveProperty('latency');

      service.stop();
    });

    test('should get current state', async () => {
      service.start();

      await new Promise(resolve => setTimeout(resolve, 200));

      const state = service.getState();
      if (state) {
        expect(state).toHaveProperty('focus');
        expect(state).toHaveProperty('emotion');
      }

      service.stop();
    });

    test('should get emotion (VAD)', async () => {
      service.start();

      await new Promise(resolve => setTimeout(resolve, 200));

      const emotion = service.getEmotion();
      if (emotion) {
        expect(emotion).toHaveProperty('valence');
        expect(emotion).toHaveProperty('arousal');
        expect(emotion).toHaveProperty('dominance');
      }

      service.stop();
    });

    test('should apply configuration', () => {
      const result = service.setConfig({
        enabled: true,
        mode: 'AMBIENT',
        interval: 100
      });

      expect(result.ok).toBe(true);
      expect(result.enabled).toBe(true);
      expect(result.device).toBe('AMBIENT');
      expect(result.interval).toBe(100);
    });
  });

  describe('History Storage', () => {
    test('should get date key', () => {
      const history = new NeuroHistory();
      const dateKey = history.getDateKey(new Date('2026-04-10'));

      expect(dateKey).toBe('2026-04-10');
    });

    test('should create empty day', () => {
      const history = new NeuroHistory();
      const day = history.createEmptyDay('2026-04-10');

      expect(day.date).toBe('2026-04-10');
      expect(Array.isArray(day.points)).toBe(true);
      expect(day.points.length).toBe(0);
      expect(Array.isArray(day.anomalies)).toBe(true);
    });
  });

  describe('Singleton Service', () => {
    test('should return same instance', () => {
      const s1 = getNeuroLinkService();
      const s2 = getNeuroLinkService();

      expect(s1).toBe(s2);
    });
  });
});
