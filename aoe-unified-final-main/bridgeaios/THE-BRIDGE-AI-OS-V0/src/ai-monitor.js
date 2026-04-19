// ai-monitor.js - Performance Monitoring Dashboard for AI Operations
// Tracks and displays AI executor performance and system metrics

class AIMonitor {
  constructor(eventBus, aiExecutor) {
    this.eventBus = eventBus;
    this.aiExecutor = aiExecutor;
    this.metrics = {
      startTime: Date.now(),
      events: {
        intelligence_enhanced: 0,
        opportunities_optimized: 0,
        revenue_forecasted: 0,
        intelligence_enhancement_failed: 0,
        opportunity_optimization_failed: 0,
        revenue_forecast_failed: 0
      },
      performance: {
        avgResponseTime: 0,
        totalResponseTime: 0,
        responseCount: 0
      },
      errors: []
    };

    this.setupEventListeners();
    console.log('📊 AI Monitor initialized - tracking performance metrics');
  }

  // Setup event listeners for all AI operations
  setupEventListeners() {
    // Success events
    this.eventBus.on('intelligence_enhanced', (event) => {
      this.metrics.events.intelligence_enhanced++;
      this.recordResponseTime(event);
      this.logSuccess('Intelligence Enhanced', event);
    });

    this.eventBus.on('opportunities_optimized', (event) => {
      this.metrics.events.opportunities_optimized++;
      this.recordResponseTime(event);
      this.logSuccess('Opportunities Optimized', event);
    });

    this.eventBus.on('revenue_forecasted', (event) => {
      this.metrics.events.revenue_forecasted++;
      this.recordResponseTime(event);
      this.logSuccess('Revenue Forecasted', event);
    });

    // Error events
    this.eventBus.on('intelligence_enhancement_failed', (event) => {
      this.metrics.events.intelligence_enhancement_failed++;
      this.recordError('Intelligence Enhancement Failed', event);
    });

    this.eventBus.on('opportunity_optimization_failed', (event) => {
      this.metrics.events.opportunity_optimization_failed++;
      this.recordError('Opportunity Optimization Failed', event);
    });

    this.eventBus.on('revenue_forecast_failed', (event) => {
      this.metrics.events.revenue_forecast_failed++;
      this.recordError('Revenue Forecast Failed', event);
    });
  }

  // Record response time metrics
  recordResponseTime(event) {
    if (event.timestamp && event.input?.timestamp) {
      const responseTime = event.timestamp - event.input.timestamp;
      this.metrics.performance.totalResponseTime += responseTime;
      this.metrics.performance.responseCount++;
      this.metrics.performance.avgResponseTime =
        this.metrics.performance.totalResponseTime / this.metrics.performance.responseCount;
    }
  }

  // Record errors
  recordError(operation, event) {
    this.metrics.errors.push({
      operation,
      error: event.error,
      timestamp: Date.now(),
      eventData: event
    });

    // Keep only last 100 errors
    if (this.metrics.errors.length > 100) {
      this.metrics.errors.shift();
    }
  }

  // Log successful operations
  logSuccess(operation, event) {
    const provider = event.output?.provider || 'unknown';
    const contentLength = event.output?.content?.length || 0;
    const responseTime = event.timestamp && event.input?.timestamp ?
      `${event.timestamp - event.input.timestamp}ms` : 'unknown';

    console.log(`✅ ${operation} | Provider: ${provider} | Content: ${contentLength} chars | Time: ${responseTime}`);
  }

  // Get comprehensive status report
  getStatusReport() {
    const uptime = Date.now() - this.metrics.startTime;
    const uptimeHours = (uptime / (1000 * 60 * 60)).toFixed(1);

    const totalEvents = Object.values(this.metrics.events).reduce((sum, count) => sum + count, 0);
    const successfulEvents = this.metrics.events.intelligence_enhanced +
                            this.metrics.events.opportunities_optimized +
                            this.metrics.events.revenue_forecasted;
    const failedEvents = totalEvents - successfulEvents;
    const successRate = totalEvents > 0 ? ((successfulEvents / totalEvents) * 100).toFixed(1) + '%' : '0%';

    return {
      uptime: `${uptimeHours}h`,
      totalEvents,
      successfulEvents,
      failedEvents,
      successRate,
      eventsByType: this.metrics.events,
      performance: {
        avgResponseTime: `${this.metrics.performance.avgResponseTime.toFixed(0)}ms`,
        totalResponses: this.metrics.performance.responseCount
      },
      aiExecutorStats: this.aiExecutor.getStats(),
      recentErrors: this.metrics.errors.slice(-5), // Last 5 errors
      systemState: this.eventBus.getState(),
      timestamp: new Date().toISOString()
    };
  }

  // Display formatted dashboard
  displayDashboard() {
    const report = this.getStatusReport();

    console.log('\n📊 BRIDGE AI OS - Performance Dashboard');
    console.log('=' .repeat(50));
    console.log(`⏱️  Uptime: ${report.uptime}`);
    console.log(`🎯 Total Events: ${report.totalEvents}`);
    console.log(`✅ Success Rate: ${report.successRate}`);
    console.log(`⚡ Avg Response Time: ${report.performance.avgResponseTime}`);
    console.log('\n📈 Event Breakdown:');
    console.log(`  Intelligence Enhanced: ${report.eventsByType.intelligence_enhanced}`);
    console.log(`  Opportunities Optimized: ${report.eventsByType.opportunities_optimized}`);
    console.log(`  Revenue Forecasted: ${report.eventsByType.revenue_forecasted}`);
    console.log(`  Failed Operations: ${report.eventsByType.intelligence_enhancement_failed +
                                        report.eventsByType.opportunity_optimization_failed +
                                        report.eventsByType.revenue_forecast_failed}`);

    console.log('\n🤖 AI Executor Stats:');
    console.log(`  Total Calls: ${report.aiExecutorStats.totalCalls}`);
    console.log(`  Success Rate: ${report.aiExecutorStats.successRate}`);

    console.log('\n🏦 Economic State:');
    console.log(`  Cycle: ${report.systemState.cycle}`);
    console.log(`  Treasury: $${report.systemState.treasury.toLocaleString()}`);
    console.log(`  Leads: ${report.systemState.leads}`);
    console.log(`  Opportunities: ${report.systemState.opportunities}`);
    console.log(`  Executions: ${report.systemState.executions}`);

    if (report.recentErrors.length > 0) {
      console.log('\n❌ Recent Errors:');
      report.recentErrors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error.operation}: ${error.error}`);
      });
    }

    console.log(`\n🕒 Last Updated: ${new Date(report.timestamp).toLocaleString()}`);
  }

  // Export metrics for external analysis
  exportMetrics() {
    return {
      ...this.getStatusReport(),
      rawMetrics: this.metrics
    };
  }
}

// Export for Node.js usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AIMonitor;
} else if (typeof window !== 'undefined') {
  window.AIMonitor = AIMonitor;
}