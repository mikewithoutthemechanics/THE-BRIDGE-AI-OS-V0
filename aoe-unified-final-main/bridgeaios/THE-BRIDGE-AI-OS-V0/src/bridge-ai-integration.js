// bridge-ai-integration.js - Live System Integration for THE BRIDGE AI OS
// Wires the prompt engine into the running causal AI economy

const BridgePromptEngine = require('./prompt-engine/bridge-prompt-engine');
const EHSAEventBus = require('./ehsa-event-bus');
const EconomyCycle = require('./economy-cycle');
const AIExecutor = require('./ai-executor');
const AIMonitor = require('./ai-monitor');
const { loadEnv } = require('./env-loader');

class BridgeAIIntegration {
  constructor() {
    // Load environment variables first
    loadEnv();

    this.eventBus = new EHSAEventBus();
    this.economyCycle = new EconomyCycle(this.eventBus);
    this.aiExecutor = new AIExecutor();
    this.promptEngine = new BridgePromptEngine(this.eventBus, this.economyCycle, this.aiExecutor);
    this.monitor = new AIMonitor(this.eventBus, this.aiExecutor);

    this.setupMonitoring();
    this.initialize();
  }

  // Setup monitoring and logging for AI operations
  setupMonitoring() {
    console.log('📊 AI Monitor active - tracking all operations');
    // Event monitoring is now handled by AIMonitor class
  }

  // Initialize the integrated system
  async initialize() {
    console.log('🚀 BRIDGE AI OS - Initializing Live AI Integration');
    console.log('=' .repeat(60));

    // Health check AI executor
    console.log('🔍 Checking AI Executor Health...');
    const health = await this.aiExecutor.healthCheck();
    if (health.healthy) {
      console.log(`✅ AI Executor Ready (${health.provider})`);
    } else {
      console.log(`⚠️  AI Executor Issue: ${health.error}`);
    }

    // Test the system with a simulated event
    console.log('🧪 Running System Test...');
    await this.runSystemTest();

    console.log('🎉 BRIDGE AI OS - Live AI Integration Complete');
    console.log('📊 Monitoring active - watch logs for AI operations');
    console.log('🤖 System ready for autonomous economic intelligence');

    // Show initial dashboard
    console.log('\n📈 Initial System Status:');
    this.showDashboard();
  }

  // Run system test with simulated economic events
  async runSystemTest() {
    try {
      // Simulate intelligence cycle completion
      console.log('🧠 Simulating Intelligence Cycle...');
      await this.simulateIntelligenceCycle(0.87);

      // Simulate opportunity creation
      console.log('📈 Simulating Opportunity Creation...');
      await this.simulateOpportunityCreation();

      // Simulate execution completion
      console.log('💼 Simulating Execution Completion...');
      await this.simulateExecutionCompletion();

      // Show AI executor statistics
      const stats = this.aiExecutor.getStats();
      console.log('📊 AI Executor Statistics:', stats);

    } catch (error) {
      console.error('❌ System test failed:', error.message);
    }
  }

  // Simulate intelligence cycle event
  async simulateIntelligenceCycle(score) {
    const event = {
      type: 'intelligence_cycle_complete',
      intelligence_score: score,
      source: 'system_test',
      seq: Date.now(),
      timestamp: Date.now()
    };

    this.eventBus.ingest(event);
    // Give time for async processing
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Simulate opportunity creation event
  async simulateOpportunityCreation() {
    const event = {
      type: 'opportunities_created',
      opportunities: [
        { id: 'test-1', value: 25000, type: 'lead', quality: 'high' },
        { id: 'test-2', value: 18000, type: 'prospect', quality: 'medium' },
        { id: 'test-3', value: 35000, type: 'qualified', quality: 'high' }
      ],
      opportunities_count: 3,
      leads_source: 'ai_generated',
      seq: Date.now() + 1,
      timestamp: Date.now()
    };

    this.eventBus.ingest(event);
    // Give time for async processing
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Simulate execution completion event
  async simulateExecutionCompletion() {
    const event = {
      type: 'executions_completed',
      executions_count: 2,
      avg_task_value: 20000,
      quality_multiplier: 1.2,
      seq: Date.now() + 2,
      timestamp: Date.now()
    };

    this.eventBus.ingest(event);
    // Give time for async processing
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Get system status
  getStatus() {
    return {
      eventBusState: this.eventBus.getState(),
      aiExecutorStats: this.aiExecutor.getStats(),
      promptEngineReady: this.promptEngine.isReady(),
      monitorReport: this.monitor.getStatusReport(),
      timestamp: new Date().toISOString()
    };
  }

  // Display performance dashboard
  showDashboard() {
    this.monitor.displayDashboard();
  }

  // Graceful shutdown
  async shutdown() {
    console.log('🛑 Shutting down BRIDGE AI OS Integration...');
    // Any cleanup logic here
    console.log('✅ Shutdown complete');
  }
}

// Export for Node.js usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BridgeAIIntegration;
} else if (typeof window !== 'undefined') {
  window.BridgeAIIntegration = BridgeAIIntegration;
}

// Auto-start if run directly
if (require.main === module) {
  const integration = new BridgeAIIntegration();

  // Graceful shutdown handling
  process.on('SIGINT', async () => {
    await integration.shutdown();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await integration.shutdown();
    process.exit(0);
  });
}