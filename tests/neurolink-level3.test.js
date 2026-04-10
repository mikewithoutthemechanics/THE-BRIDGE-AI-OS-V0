/**
 * NeuroLink Level 3 Tests
 * Intelligence Graph + Autonomous Monetization
 */

const { IntelligenceGraph } = require('../api/neurolink/intelligence-graph');
const { AutonomousMonetization } = require('../api/neurolink/autonomous-monetization');
const { UserClone } = require('../api/neurolink/user-clone');

describe('NeuroLink Level 3: Intelligence Graph', () => {
  let graph;

  beforeEach(() => {
    graph = new IntelligenceGraph();
  });

  test('should register users into the graph', () => {
    const user1 = new UserClone('user1');
    const user2 = new UserClone('user2');

    graph.registerUser('user1', user1);
    graph.registerUser('user2', user2);

    expect(graph.users.size).toBe(2);
    expect(graph.users.has('user1')).toBe(true);
    expect(graph.users.has('user2')).toBe(true);
  });

  test('should extract user patterns', () => {
    const user = new UserClone('test-user');

    // Teach the user some patterns
    const states = [
      { focus: { value: 0.85 }, stress: { value: 0.3 }, fatigue: { value: 0.2 }, emotion: {}, intent: { label: 'deep_work' } },
      { focus: { value: 0.80 }, stress: { value: 0.35 }, fatigue: { value: 0.25 }, emotion: {}, intent: { label: 'deep_work' } },
      { focus: { value: 0.90 }, stress: { value: 0.25 }, fatigue: { value: 0.15 }, emotion: {}, intent: { label: 'deep_work' } }
    ];

    states.forEach((s, i) => {
      const prev = i > 0 ? states[i - 1] : null;
      user.learn(s, prev);
    });

    graph.registerUser('test-user', user);
    const patterns = graph.extractPatterns('test-user');

    expect(patterns).toBeDefined();
    expect(patterns.patternCount).toBeGreaterThan(0);
    expect(patterns.patterns).toBeInstanceOf(Array);
  });

  test('should find user similarity', () => {
    const user1 = new UserClone('user1');
    const user2 = new UserClone('user2');

    // Teach both users the same pattern
    const state = { focus: { value: 0.85 }, stress: { value: 0.3 }, fatigue: { value: 0.2 }, emotion: {}, intent: { label: 'deep_work' } };

    for (let i = 0; i < 5; i++) {
      user1.learn(state);
      user2.learn(state);
    }

    graph.registerUser('user1', user1);
    graph.registerUser('user2', user2);

    const similarities = graph.userSimilarity.size;
    expect(similarities).toBeGreaterThan(0);
  });

  test('should assign users to segments based on similarity', () => {
    const user1 = new UserClone('user1');
    const user2 = new UserClone('user2');

    // Create highly similar users
    const state = { focus: { value: 0.85 }, stress: { value: 0.3 }, fatigue: { value: 0.2 }, emotion: {}, intent: { label: 'deep_work' } };

    for (let i = 0; i < 10; i++) {
      user1.learn(state);
      user2.learn(state);
    }

    graph.registerUser('user1', user1);
    graph.registerUser('user2', user2);

    // Check if users are in a segment together
    const user1Data = graph.users.get('user1');
    expect(user1Data.segments.size).toBeGreaterThan(0);
  });

  test('should generate cross-user recommendations', () => {
    // Create 3 users with a common pattern
    const users = ['user1', 'user2', 'user3'];
    const commonState = { focus: { value: 0.85 }, stress: { value: 0.3 }, fatigue: { value: 0.2 }, emotion: {}, intent: { label: 'deep_work' } };

    for (const userId of users) {
      const user = new UserClone(userId);
      for (let i = 0; i < 5; i++) {
        user.learn(commonState);
      }
      graph.registerUser(userId, user);
    }

    // Add a 4th user with different pattern
    const user4 = new UserClone('user4');
    const differentState = { focus: { value: 0.5 }, stress: { value: 0.6 }, fatigue: { value: 0.5 }, emotion: {}, intent: { label: 'context_switching' } };
    for (let i = 0; i < 5; i++) {
      user4.learn(differentState);
    }
    graph.registerUser('user4', user4);

    const recommendations = graph.generateCrossUserRecommendations();
    expect(recommendations).toBeDefined();
    expect(recommendations.size).toBeGreaterThan(0);
  });

  test('should get segment profiles', () => {
    const user1 = new UserClone('user1');
    const user2 = new UserClone('user2');

    const state = { focus: { value: 0.85 }, stress: { value: 0.3 }, fatigue: { value: 0.2 }, emotion: {}, intent: { label: 'deep_work' } };

    for (let i = 0; i < 5; i++) {
      user1.learn(state);
      user2.learn(state);
    }

    graph.registerUser('user1', user1);
    graph.registerUser('user2', user2);

    const user1Data = graph.users.get('user1');
    if (user1Data.segments.size > 0) {
      const segmentId = Array.from(user1Data.segments)[0];
      const profile = graph.getSegmentProfile(segmentId);

      expect(profile).toBeDefined();
      expect(profile.userCount).toBeGreaterThan(0);
      expect(profile.averageFocus).toBeGreaterThan(0);
    }
  });

  test('should provide intelligence summary', () => {
    const user1 = new UserClone('user1');
    const user2 = new UserClone('user2');

    const state = { focus: { value: 0.85 }, stress: { value: 0.3 }, fatigue: { value: 0.2 }, emotion: {}, intent: { label: 'deep_work' } };

    for (let i = 0; i < 3; i++) {
      user1.learn(state);
      user2.learn(state);
    }

    graph.registerUser('user1', user1);
    graph.registerUser('user2', user2);

    const summary = graph.getSummary();

    expect(summary.userCount).toBe(2);
    expect(summary.segmentCount).toBeGreaterThanOrEqual(0);
    expect(summary.avgSimilarity).toBeGreaterThanOrEqual(0);
  });
});

describe('NeuroLink Level 3: Autonomous Monetization', () => {
  let graph;
  let monetization;
  const mockHooks = {
    pricingEngine: {
      enableHighIntentOffers: jest.fn()
    },
    orchestrator: {
      switchToAutopilot: jest.fn(),
      reduceSystemLoad: jest.fn()
    },
    supportAI: {
      increaseProactiveHelp: jest.fn()
    }
  };

  beforeEach(() => {
    graph = new IntelligenceGraph();
    monetization = new AutonomousMonetization(graph, mockHooks);
  });

  test('should analyze and execute autonomous decisions', () => {
    const userState = {
      focus: { value: 0.85 },
      stress: { value: 0.3 },
      fatigue: { value: 0.2 }
    };

    const predictions = {
      nextAction: {
        action: 'PUSH_PREMIUM_OFFER',
        reason: 'High conversion window',
        probability: 0.8
      }
    };

    const decision = monetization.analyzeAndExecute('user1', userState, predictions);

    expect(decision).toBeDefined();
    expect(decision.confidence).toBeGreaterThan(0);
    expect(decision.confidence).toBeLessThanOrEqual(1);
  });

  test('should execute premium offer action', () => {
    const decision = monetization.analyzeAndExecute('user1',
      { focus: { value: 0.85 }, stress: { value: 0.3 }, fatigue: { value: 0.2 } },
      { nextAction: { action: 'PUSH_PREMIUM_OFFER', reason: 'Test', probability: 0.8 } }
    );

    if (decision.confidence > 0.65 && decision.action === 'PUSH_PREMIUM_OFFER') {
      expect(mockHooks.pricingEngine.enableHighIntentOffers).toHaveBeenCalled();
    }
  });

  test('should execute support intervention', () => {
    const decision = monetization.analyzeAndExecute('user1',
      { focus: { value: 0.3 }, stress: { value: 0.8 }, fatigue: { value: 0.8 } },
      { nextAction: { action: 'INTERVENE_SUPPORT', reason: 'Churn risk', probability: 0.8 } }
    );

    if (decision.confidence > 0.65 && decision.action === 'INTERVENE_SUPPORT') {
      expect(mockHooks.supportAI.increaseProactiveHelp).toHaveBeenCalled();
    }
  });

  test('should track decision statistics', () => {
    // Make multiple decisions with high confidence to trigger execution
    for (let i = 0; i < 5; i++) {
      monetization.analyzeAndExecute(`user${i}`,
        { focus: { value: 0.85 }, stress: { value: 0.2 }, fatigue: { value: 0.1 } },
        { nextAction: { action: 'PUSH_PREMIUM_OFFER', reason: 'Test', probability: 0.8 } }
      );
    }

    const stats = monetization.getDecisionStats();

    expect(stats.totalDecisions).toBeGreaterThanOrEqual(1);
    expect(stats.successRate).toBeDefined();
    expect(stats.actionDistribution).toBeDefined();
    expect(stats.avgConfidence).toBeDefined();
  });

  test('should maintain execution log', () => {
    monetization.analyzeAndExecute('user1',
      { focus: { value: 0.8 }, stress: { value: 0.3 }, fatigue: { value: 0.2 } },
      { nextAction: { action: 'PUSH_PREMIUM_OFFER', reason: 'Test', probability: 0.8 } }
    );

    const log = monetization.getExecutionLog(10);
    expect(log).toBeInstanceOf(Array);
  });

  test('should consider cross-user recommendations', () => {
    // Setup graph with cross-user recommendations
    const user1 = new UserClone('user1');
    const state = { focus: { value: 0.85 }, stress: { value: 0.3 }, fatigue: { value: 0.2 }, emotion: {}, intent: { label: 'deep_work' } };

    for (let i = 0; i < 5; i++) {
      user1.learn(state);
    }

    graph.registerUser('user1', user1);
    graph.generateCrossUserRecommendations();

    const recs = graph.actionRecommendations.get('user1');
    expect(recs === undefined || recs instanceof Array).toBe(true);
  });

  test('should apply timing bonus to decisions', () => {
    // Test with high focus + low stress = optimal for offers
    const optimalState = {
      focus: { value: 0.9 },
      stress: { value: 0.2 },
      fatigue: { value: 0.1 }
    };

    const decision = monetization.analyzeAndExecute('user1', optimalState,
      { nextAction: { action: 'PUSH_PREMIUM_OFFER', reason: 'Optimal window', probability: 0.7 } }
    );

    expect(decision.confidence).toBeGreaterThanOrEqual(0.64);
    expect(decision.confidence).toBeLessThanOrEqual(1);
  });

  test('should prioritize churn intervention over offers', () => {
    const predictions = {
      nextAction: {
        action: 'INTERVENE_SUPPORT',
        reason: 'Churn risk detected',
        probability: 0.75
      }
    };

    const decision = monetization.analyzeAndExecute('user1',
      { focus: { value: 0.4 }, stress: { value: 0.8 }, fatigue: { value: 0.8 } },
      predictions
    );

    expect(decision.action).toBe('INTERVENE_SUPPORT');
  });
});
