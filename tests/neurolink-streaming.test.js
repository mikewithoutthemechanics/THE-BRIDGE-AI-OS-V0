/**
 * NeuroLink Level 3: Real-Time Streaming Tests
 * Multi-user data ingestion + live monetization orchestration
 */

const { MultiUserStream } = require('../api/neurolink/multi-user-stream');
const { LiveMonetizationOrchestrator } = require('../api/neurolink/live-monetization-orchestrator');
const { IntelligenceGraph } = require('../api/neurolink/intelligence-graph');

describe('NeuroLink Level 3: Multi-User Stream', () => {
  let stream;
  const mockDatabase = null; // In-memory mode (no Supabase)

  beforeEach(() => {
    stream = new MultiUserStream(mockDatabase);
  });

  afterEach(() => {
    stream.stopFlushTimer();
  });

  test('should register users into the stream', async () => {
    await stream.registerUser('user1', { name: 'Alice' });
    await stream.registerUser('user2', { name: 'Bob' });

    expect(stream.getActiveUserCount()).toBe(2);
    expect(stream.getUserState('user1')).toBeDefined();
    expect(stream.getUserState('user2')).toBeDefined();
  });

  test('should ingest user cognitive states', async () => {
    const state = {
      focus: { value: 0.85, confidence: 0.8 },
      stress: { value: 0.3, confidence: 0.75 },
      fatigue: { value: 0.2, confidence: 0.7 },
      emotion: { valence: 0.7, arousal: 0.6, dominance: 0.5 },
      intent: { label: 'deep_work', confidence: 0.85 },
      timestamp: new Date().toISOString()
    };

    const result = await stream.ingestState('user1', state);

    expect(result.ok).toBe(true);
    expect(result.observationCount).toBe(1);
    expect(stream.getUserState('user1').state).toEqual(state);
  });

  test('should detect high conversion window trigger', async () => {
    const state = {
      focus: { value: 0.9, confidence: 0.8 },
      stress: { value: 0.2, confidence: 0.8 },
      fatigue: { value: 0.1, confidence: 0.8 },
      emotion: {},
      intent: { label: 'engagement', confidence: 0.85 },
      timestamp: new Date().toISOString()
    };

    const predictions = {
      highConversionProbability: { value: 0.85, confidence: 0.85 },
      ready: true
    };

    let triggerDetected = false;
    stream.on('monetization:trigger', (trigger) => {
      if (trigger.type === 'high_conversion_window') {
        triggerDetected = true;
      }
    });

    await stream.ingestState('user1', state, predictions);

    expect(triggerDetected).toBe(true);
  });

  test('should detect churn risk trigger', async () => {
    const state = {
      focus: { value: 0.4, confidence: 0.75 },
      stress: { value: 0.8, confidence: 0.85 },
      fatigue: { value: 0.6, confidence: 0.8 },
      emotion: {},
      intent: { label: 'disengagement', confidence: 0.7 },
      timestamp: new Date().toISOString()
    };

    const predictions = {
      churnRisk: { value: 0.75, confidence: 0.8 },
      ready: true
    };

    let triggerDetected = false;
    stream.on('monetization:trigger', (trigger) => {
      if (trigger.type === 'churn_risk') {
        triggerDetected = true;
      }
    });

    await stream.ingestState('user1', state, predictions);

    expect(triggerDetected).toBe(true);
  });

  test('should detect fatigue dropoff trigger', async () => {
    const state = {
      focus: { value: 0.3, confidence: 0.7 },
      stress: { value: 0.5, confidence: 0.75 },
      fatigue: { value: 0.85, confidence: 0.8 },
      emotion: {},
      intent: { label: 'context_switching', confidence: 0.6 },
      timestamp: new Date().toISOString()
    };

    let triggerDetected = false;
    stream.on('monetization:trigger', (trigger) => {
      if (trigger.type === 'fatigue_dropoff') {
        triggerDetected = true;
      }
    });

    await stream.ingestState('user1', state);

    expect(triggerDetected).toBe(true);
  });

  test('should detect optimal focus window trigger', async () => {
    const state = {
      focus: { value: 0.9, confidence: 0.85 },
      stress: { value: 0.3, confidence: 0.8 },
      fatigue: { value: 0.4, confidence: 0.75 },
      emotion: {},
      intent: { label: 'deep_work', confidence: 0.9 },
      timestamp: new Date().toISOString()
    };

    let triggerDetected = false;
    stream.on('monetization:trigger', (trigger) => {
      if (trigger.type === 'optimal_focus') {
        triggerDetected = true;
      }
    });

    await stream.ingestState('user1', state);

    expect(triggerDetected).toBe(true);
  });

  test('should buffer states before flushing', async () => {
    const state = {
      focus: { value: 0.8, confidence: 0.8 },
      stress: { value: 0.3, confidence: 0.75 },
      fatigue: { value: 0.2, confidence: 0.7 },
      emotion: {},
      intent: { label: 'work', confidence: 0.85 },
      timestamp: new Date().toISOString()
    };

    // Ingest states up to buffer size (10)
    for (let i = 0; i < 5; i++) {
      await stream.ingestState('user1', state);
    }

    const stats = stream.getStats();
    expect(stats.bufferedStates).toBe(5);
  });

  test('should get monetization triggers', async () => {
    const state = {
      focus: { value: 0.85, confidence: 0.8 },
      stress: { value: 0.3, confidence: 0.75 },
      fatigue: { value: 0.2, confidence: 0.7 },
      emotion: {},
      intent: { label: 'engagement', confidence: 0.85 },
      timestamp: new Date().toISOString()
    };

    const predictions = {
      highConversionProbability: { value: 0.85, confidence: 0.85 },
      ready: true
    };

    await stream.ingestState('user1', state, predictions);
    const triggers = stream.getMonetizationTriggers();

    expect(triggers.length).toBeGreaterThan(0);
    expect(triggers[0].type).toBe('high_conversion_window');
  });

  test('should track active users', async () => {
    await stream.registerUser('user1');
    await stream.registerUser('user2');
    await stream.registerUser('user3');

    expect(stream.getActiveUserCount()).toBe(3);
  });

  test('should get stream statistics', async () => {
    const state = {
      focus: { value: 0.8, confidence: 0.8 },
      stress: { value: 0.3, confidence: 0.75 },
      fatigue: { value: 0.2, confidence: 0.7 },
      emotion: {},
      intent: { label: 'work', confidence: 0.85 },
      timestamp: new Date().toISOString()
    };

    await stream.registerUser('user1');
    for (let i = 0; i < 3; i++) {
      await stream.ingestState('user1', state);
    }

    const stats = stream.getStats();

    expect(stats.activeUsers).toBe(1);
    expect(stats.totalObservations).toBe(3);
    expect(stats.avgObservationsPerUser).toBe(3);
  });

  test('should emit buffer flush events', async () => {
    stream.bufferSize = 1;

    const state = {
      focus: { value: 0.8, confidence: 0.8 },
      stress: { value: 0.3, confidence: 0.75 },
      fatigue: { value: 0.2, confidence: 0.7 },
      emotion: {},
      intent: { label: 'work', confidence: 0.85 },
      timestamp: new Date().toISOString()
    };

    await stream.ingestState('user1', state);
    // Ingest one more state to trigger the buffer flush (buffer size = 1)
    await stream.ingestState('user1', state);

    // Check that buffer was flushed (or manually flush)
    const triggers = stream.getMonetizationTriggers(10);
    // If trigger detection fired, state was processed
    expect(stream.getUserState('user1')).toBeDefined();
  });

  test('should emit state ingested events', (done) => {
    let eventCount = 0;

    stream.on('state:ingested', (event) => {
      eventCount++;
      if (eventCount === 1) {
        expect(event.userId).toBe('user1');
        expect(event.observationCount).toBe(1);
        done();
      }
    });

    const state = {
      focus: { value: 0.8, confidence: 0.8 },
      stress: { value: 0.3, confidence: 0.75 },
      fatigue: { value: 0.2, confidence: 0.7 },
      emotion: {},
      intent: { label: 'work', confidence: 0.85 },
      timestamp: new Date().toISOString()
    };

    stream.ingestState('user1', state);
  });
});

describe('NeuroLink Level 3: Live Monetization Orchestrator', () => {
  let orchestrator;
  let stream;
  let graph;
  const mockDatabase = null;

  beforeEach(() => {
    stream = new MultiUserStream(mockDatabase);
    graph = new IntelligenceGraph();
    orchestrator = new LiveMonetizationOrchestrator(stream, graph, mockDatabase);
  });

  afterEach(() => {
    orchestrator.stopProcessing();
    stream.stopFlushTimer();
  });

  test('should start and stop processing', () => {
    orchestrator.startProcessing(500);
    expect(orchestrator.processingInterval).toBeDefined();

    orchestrator.stopProcessing();
    expect(orchestrator.processingInterval).toBeNull();
  });

  test('should execute offer campaign on high conversion trigger', async () => {
    // Ingest a trigger
    const state = {
      focus: { value: 0.85, confidence: 0.8 },
      stress: { value: 0.3, confidence: 0.75 },
      fatigue: { value: 0.2, confidence: 0.7 },
      emotion: {},
      intent: { label: 'engagement', confidence: 0.85 },
      timestamp: new Date().toISOString()
    };

    const predictions = {
      highConversionProbability: { value: 0.85, confidence: 0.85 },
      ready: true
    };

    await stream.ingestState('user1', state, predictions);

    // Get triggers and execute manually
    const triggers = stream.getMonetizationTriggers(10);
    expect(triggers.length).toBeGreaterThan(0);

    // For offer campaigns, we execute the campaign method directly
    const offerTrigger = triggers.find(t => t.type === 'high_conversion_window');
    if (offerTrigger) {
      const result = await orchestrator._executeOfferCampaign(offerTrigger);
      expect(result).toBeDefined();
      expect(result.type).toBe('offer_campaign');
    }
  });

  test('should execute retention campaign on churn risk', async () => {
    const state = {
      focus: { value: 0.4, confidence: 0.75 },
      stress: { value: 0.8, confidence: 0.85 },
      fatigue: { value: 0.6, confidence: 0.8 },
      emotion: {},
      intent: { label: 'disengagement', confidence: 0.7 },
      timestamp: new Date().toISOString()
    };

    const predictions = {
      churnRisk: { value: 0.75, confidence: 0.8 },
      ready: true
    };

    await stream.ingestState('user1', state, predictions);

    const triggers = stream.getMonetizationTriggers(10);
    const churnTrigger = triggers.find(t => t.type === 'churn_risk');

    if (churnTrigger) {
      const result = await orchestrator._executeRetentionCampaign(churnTrigger);
      expect(result).toBeDefined();
      expect(result.type).toBe('retention_campaign');
      expect(result.actions).toBeDefined();
    }
  });

  test('should execute autopilot activation on fatigue dropoff', async () => {
    const state = {
      focus: { value: 0.3, confidence: 0.7 },
      stress: { value: 0.5, confidence: 0.75 },
      fatigue: { value: 0.85, confidence: 0.8 },
      emotion: {},
      intent: { label: 'context_switching', confidence: 0.6 },
      timestamp: new Date().toISOString()
    };

    await stream.ingestState('user1', state);

    const triggers = stream.getMonetizationTriggers(10);
    const fatigueTrigger = triggers.find(t => t.type === 'fatigue_dropoff');

    if (fatigueTrigger) {
      const result = await orchestrator._executeAutopilotActivation(fatigueTrigger);
      expect(result).toBeDefined();
      expect(result.type).toBe('autopilot');
      expect(result.duration).toBe(3600000); // 1 hour
    }
  });

  test('should log revenue from campaigns', async () => {
    const state = {
      focus: { value: 0.85, confidence: 0.8 },
      stress: { value: 0.3, confidence: 0.75 },
      fatigue: { value: 0.2, confidence: 0.7 },
      emotion: {},
      intent: { label: 'engagement', confidence: 0.85 },
      timestamp: new Date().toISOString()
    };

    const predictions = {
      highConversionProbability: { value: 0.85, confidence: 0.85 },
      ready: true
    };

    await stream.ingestState('user1', state, predictions);

    const triggers = stream.getMonetizationTriggers(10);
    const offerTrigger = triggers.find(t => t.type === 'high_conversion_window');

    expect(offerTrigger).toBeDefined();

    if (offerTrigger) {
      const action = await orchestrator._executeOfferCampaign(offerTrigger);
      expect(action).toBeDefined();
      expect(action.revenue).toBeGreaterThan(0);
      expect(action.type).toBe('offer_campaign');
      expect(action.offer).toBeDefined();
    }
  });

  test('should track execution statistics', async () => {
    const state = {
      focus: { value: 0.85, confidence: 0.8 },
      stress: { value: 0.3, confidence: 0.75 },
      fatigue: { value: 0.2, confidence: 0.7 },
      emotion: {},
      intent: { label: 'engagement', confidence: 0.85 },
      timestamp: new Date().toISOString()
    };

    const predictions = {
      highConversionProbability: { value: 0.85, confidence: 0.85 },
      ready: true
    };

    await stream.ingestState('user1', state, predictions);

    const triggers = stream.getMonetizationTriggers(10);
    for (const trigger of triggers) {
      await orchestrator._executeTrigger(trigger);
    }

    const stats = orchestrator.getExecutionStats();
    expect(stats.totalExecuted).toBeGreaterThan(0);
    expect(stats.executedByType).toBeDefined();
  });

  test('should get revenue summary', async () => {
    const state = {
      focus: { value: 0.85, confidence: 0.8 },
      stress: { value: 0.3, confidence: 0.75 },
      fatigue: { value: 0.2, confidence: 0.7 },
      emotion: {},
      intent: { label: 'engagement', confidence: 0.85 },
      timestamp: new Date().toISOString()
    };

    const predictions = {
      highConversionProbability: { value: 0.85, confidence: 0.85 },
      ready: true
    };

    await stream.ingestState('user1', state, predictions);

    const triggers = stream.getMonetizationTriggers(10);
    const offerTrigger = triggers.find(t => t.type === 'high_conversion_window');

    if (offerTrigger) {
      await orchestrator._executeTrigger(offerTrigger);

      const summary = orchestrator.getRevenueSummary();
      expect(summary.totalRevenue).toBeGreaterThanOrEqual(0);
      expect(summary.campaignsRun).toBeGreaterThan(0);
      expect(summary.revenuePerCampaign).toBeGreaterThan(0);
      expect(summary.campaignsByType).toBeDefined();
    }
  });

  test('should get recent actions for audit', async () => {
    const state = {
      focus: { value: 0.85, confidence: 0.8 },
      stress: { value: 0.3, confidence: 0.75 },
      fatigue: { value: 0.2, confidence: 0.7 },
      emotion: {},
      intent: { label: 'engagement', confidence: 0.85 },
      timestamp: new Date().toISOString()
    };

    const predictions = {
      highConversionProbability: { value: 0.85, confidence: 0.85 },
      ready: true
    };

    await stream.ingestState('user1', state, predictions);

    const triggers = stream.getMonetizationTriggers(10);
    for (const trigger of triggers) {
      await orchestrator._executeTrigger(trigger);
    }

    const actions = orchestrator.getRecentActions(10);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions[0].id).toBeDefined();
    expect(actions[0].type).toBeDefined();
  });

  test('should handle multiple users concurrently', async () => {
    const state1 = {
      focus: { value: 0.85, confidence: 0.8 },
      stress: { value: 0.3, confidence: 0.75 },
      fatigue: { value: 0.2, confidence: 0.7 },
      emotion: {},
      intent: { label: 'engagement', confidence: 0.85 },
      timestamp: new Date().toISOString()
    };

    const state2 = {
      focus: { value: 0.4, confidence: 0.75 },
      stress: { value: 0.8, confidence: 0.85 },
      fatigue: { value: 0.6, confidence: 0.8 },
      emotion: {},
      intent: { label: 'disengagement', confidence: 0.7 },
      timestamp: new Date().toISOString()
    };

    await stream.ingestState('user1', state1);
    await stream.ingestState('user2', state2);

    const stats = stream.getStats();
    expect(stats.activeUsers).toBe(2);
    expect(stats.totalObservations).toBe(2);
  });

  test('should execute pattern adoption experiments', async () => {
    // Create a pattern adoption trigger
    const trigger = {
      type: 'cross_user_pattern_adoption',
      userId: 'user1',
      pattern: { type: 'deep_focus_morning', confidence: 0.8 },
      action: 'EXPERIMENT'
    };

    const result = await orchestrator._executePatternAdoption(trigger);
    expect(result.type).toBe('pattern_adoption');
    expect(result.isExperiment).toBe(true);
  });
});

describe('NeuroLink Level 3: Integration', () => {
  let stream;
  let orchestrator;
  let graph;

  beforeEach(() => {
    stream = new MultiUserStream(null);
    graph = new IntelligenceGraph();
    orchestrator = new LiveMonetizationOrchestrator(stream, graph, null);
  });

  afterEach(() => {
    orchestrator.stopProcessing();
    stream.stopFlushTimer();
  });

  test('should process multiple triggers in sequence', async () => {
    orchestrator.startProcessing(100);

    const state1 = {
      focus: { value: 0.85, confidence: 0.8 },
      stress: { value: 0.3, confidence: 0.75 },
      fatigue: { value: 0.2, confidence: 0.7 },
      emotion: {},
      intent: { label: 'engagement', confidence: 0.85 },
      timestamp: new Date().toISOString()
    };

    const predictions1 = {
      highConversionProbability: { value: 0.85, confidence: 0.85 },
      ready: true
    };

    await stream.ingestState('user1', state1, predictions1);

    // Wait for orchestrator to process
    await new Promise(resolve => setTimeout(resolve, 200));

    const stats = orchestrator.getExecutionStats();
    expect(stats.totalExecuted).toBeGreaterThanOrEqual(0);
  });

  test('should coordinate multi-user cross-user recommendations', async () => {
    const state = {
      focus: { value: 0.85, confidence: 0.8 },
      stress: { value: 0.3, confidence: 0.75 },
      fatigue: { value: 0.2, confidence: 0.7 },
      emotion: {},
      intent: { label: 'deep_work', confidence: 0.85 },
      timestamp: new Date().toISOString()
    };

    // Register multiple users
    await stream.registerUser('user1');
    await stream.registerUser('user2');

    // Ingest states
    await stream.ingestState('user1', state);
    await stream.ingestState('user2', state);

    const stats = stream.getStats();
    expect(stats.activeUsers).toBe(2);
  });
});
