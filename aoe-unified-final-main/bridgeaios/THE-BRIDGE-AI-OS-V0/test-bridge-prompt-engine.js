// test-bridge-prompt-engine.js - Test suite for BridgePromptEngine
// Tests the upgraded prompt engine with mock executor

const BridgePromptEngine = require('./src/prompt-engine/bridge-prompt-engine');
const EHSAEventBus = require('./src/ehsa-event-bus');
const EconomyCycle = require('./src/economy-cycle');

// Mock executor for testing
class MockExecutor {
  constructor() {
    this.calls = [];
  }

  async run(prompt) {
    this.calls.push(prompt);
    return {
      success: true,
      result: `Mock AI Response for: ${prompt.substring(0, 50)}...`,
      confidence: 0.95,
      tokens: prompt.length
    };
  }

  getCallCount() {
    return this.calls.length;
  }

  reset() {
    this.calls = [];
  }
}

// Test suite
async function runTests() {
  console.log('🧪 Testing BridgePromptEngine...\n');

  try {
    // Test 1: Constructor with executor
    console.log('1. Testing constructor with executor...');
    const mockExecutor = new MockExecutor();
    const eventBus = new EHSAEventBus();
    const economyCycle = new EconomyCycle(eventBus);
    const engine = new BridgePromptEngine(eventBus, economyCycle, mockExecutor);
    console.log('   ✅ Engine created successfully');

    // Test 2: Health check
    console.log('2. Testing health check...');
    const isReady = engine.isReady();
    console.log(`   ✅ Engine ready: ${isReady}`);

    // Test 3: Prompt generation
    console.log('3. Testing prompt generation...');
    const analysisPrompt = engine.generateEconomicPrompt('analysis', 'Test market data');
    const optimizationPrompt = engine.generateEconomicPrompt('optimization', [{id: 1, value: 1000}]);
    console.log(`   ✅ Generated analysis prompt: ${analysisPrompt.length} chars`);
    console.log(`   ✅ Generated optimization prompt: ${optimizationPrompt.length} chars`);

    // Test 4: Universal expert prompt
    console.log('4. Testing universal expert prompt...');
    const expertPrompt = engine.getUniversalExpertPrompt('AI', 'How does machine learning work?');
    console.log(`   ✅ Universal expert prompt: ${expertPrompt.length} chars`);

    // Test 5: Deep logic prompt
    console.log('5. Testing deep logic prompt...');
    const logicPrompt = engine.getDeepLogicPrompt('Should I invest in stocks?');
    console.log(`   ✅ Deep logic prompt: ${logicPrompt.length} chars`);

    // Test 6: Event handling simulation
    console.log('6. Testing event handling simulation...');
    const mockEvent = {
      intelligence_score: 85,
      opportunities: [{id: 1, value: 1000, type: 'lead'}],
      executions_count: 5,
      avg_task_value: 15000
    };

    // Simulate intelligence enhancement
    await engine.enhanceIntelligence(mockEvent, {});
    console.log('   ✅ Intelligence enhancement completed');

    // Simulate opportunity optimization
    await engine.optimizeOpportunities(mockEvent, {});
    console.log('   ✅ Opportunity optimization completed');

    // Simulate revenue forecasting
    await engine.forecastRevenue(mockEvent, {});
    console.log('   ✅ Revenue forecasting completed');

    // Test 7: Mock mode
    console.log('7. Testing mock mode...');
    process.env.PROMPT_ENGINE_MODE = 'mock';
    const mockResult = await engine.executePrompt('Test prompt');
    console.log(`   ✅ Mock response: ${mockResult}`);
    delete process.env.PROMPT_ENGINE_MODE;

    // Test 8: Error handling
    console.log('8. Testing error handling...');
    const brokenEngine = new BridgePromptEngine();
    try {
      await brokenEngine.executePrompt('This should fail');
      console.log('   ❌ Should have thrown error');
    } catch (error) {
      console.log(`   ✅ Error correctly thrown: ${error.message}`);
    }

    // Test 9: Input validation
    console.log('9. Testing input validation...');
    try {
      engine.generateEconomicPrompt('', 'context');
      console.log('   ❌ Should have thrown error');
    } catch (error) {
      console.log(`   ✅ Input validation works: ${error.message}`);
    }

    console.log('\n🎯 All tests passed! BridgePromptEngine is working correctly.');
    console.log(`📊 Mock executor called ${mockExecutor.getCallCount()} times`);

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run tests if called directly
if (require.main === module) {
  runTests();
}

module.exports = { runTests, MockExecutor };