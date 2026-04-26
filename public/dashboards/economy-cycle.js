// economy-cycle.js - Single Source of Truth for Treasury State
// Only this module writes to treasury - all other agents emit events

const EHSAEventBus = require('./ehsa-event-bus');

class EconomyCycle {
  constructor(eventBus) {
    this.eventBus = eventBus || new EHSAEventBus();
    this.taskMetrics = {
      avgTaskValue: 15000,  // Base task value in currency units
      taskVolatility: 0.2,  // Price variation factor
      marketDemand: 1.0,    // Economic demand multiplier
      successRate: 0.65     // Base conversion success rate
    };

    // Register as the ONLY treasury writer
    this.eventBus.on('revenue_realized', this.handleRevenueRealization.bind(this));
  }

  // Dynamic economic calculations (replaces hardcoded abaas_cycle constants)
  calculateRevenue(executions, avgTaskValue, qualityMultiplier = 1.0) {
    // tasks * avgTaskValue * successRate * qualityMultiplier
    const baseValue = executions * avgTaskValue;
    const adjustedValue = baseValue * this.taskMetrics.successRate * qualityMultiplier;
    const marketAdjusted = adjustedValue * this.taskMetrics.marketDemand;

    // Add controlled volatility
    const volatility = 1 + (Math.random() - 0.5) * this.taskMetrics.taskVolatility;
    return Math.floor(marketAdjusted * volatility);
  }

  // Handle revenue realization (ONLY place treasury gets updated)
  handleRevenueRealization(event, state) {
    const revenue = this.calculateRevenue(
      event.executions_source,
      event.avg_task_value || this.taskMetrics.avgTaskValue,
      event.quality_multiplier || 1.0
    );

    // Update treasury (Single Source of Truth)
    state.treasury += revenue;

    // Emit treasury update event for monitoring
    this.eventBus.bus.push({
      type: 'treasury_updated',
      amount_added: revenue,
      new_total: state.treasury,
      source: 'economy_cycle',
      seq: event.seq + 0.1,
      timestamp: Date.now()
    });

    // Update market conditions based on economic activity
    this.adjustMarketConditions(revenue);
  }

  // Dynamic market condition adjustments
  adjustMarketConditions(revenue) {
    // Increase demand with successful revenue
    if (revenue > 50000) {
      this.taskMetrics.marketDemand = Math.min(1.5, this.taskMetrics.marketDemand + 0.05);
    } else if (revenue < 10000) {
      this.taskMetrics.marketDemand = Math.max(0.5, this.taskMetrics.marketDemand - 0.02);
    }

    // Adjust average task value based on market saturation
    if (this.taskMetrics.marketDemand > 1.2) {
      this.taskMetrics.avgTaskValue *= 0.98; // Slight decrease as market saturates
    } else if (this.taskMetrics.marketDemand < 0.8) {
      this.taskMetrics.avgTaskValue *= 1.02; // Slight increase in low demand
    }
  }

  // Economic forecasting and planning
  forecastRevenue(opportunities, currentConversionRate = null) {
    const conversion = currentConversionRate || this.taskMetrics.successRate;
    const expectedExecutions = Math.floor(opportunities * conversion);
    const expectedRevenue = this.calculateRevenue(
      expectedExecutions,
      this.taskMetrics.avgTaskValue
    );

    return {
      expected_executions: expectedExecutions,
      expected_revenue: expectedRevenue,
      confidence_interval: {
        low: Math.floor(expectedRevenue * 0.8),
        high: Math.floor(expectedRevenue * 1.2)
      },
      market_conditions: {
        demand_multiplier: this.taskMetrics.marketDemand,
        avg_task_value: this.taskMetrics.avgTaskValue,
        success_rate: this.taskMetrics.successRate
      }
    };
  }

  // Economic policy adjustments (admin controls)
  adjustEconomicPolicy(policy) {
    if (policy.avgTaskValue !== undefined) {
      this.taskMetrics.avgTaskValue = Math.max(5000, Math.min(50000, policy.avgTaskValue));
    }
    if (policy.marketDemand !== undefined) {
      this.taskMetrics.marketDemand = Math.max(0.1, Math.min(3.0, policy.marketDemand));
    }
    if (policy.successRate !== undefined) {
      this.taskMetrics.successRate = Math.max(0.1, Math.min(0.95, policy.successRate));
    }
  }

  // Get current economic metrics
  getEconomicMetrics() {
    return {
      ...this.taskMetrics,
      timestamp: Date.now(),
      forecast_accuracy: this.calculateForecastAccuracy()
    };
  }

  // Calculate forecast accuracy (simplified)
  calculateForecastAccuracy() {
    // This would track actual vs forecasted revenue over time
    // For now, return a placeholder
    return 0.85; // 85% accuracy
  }

  // Emergency economic intervention
  emergencyIntervention(action) {
    switch (action) {
      case 'stimulus':
        this.taskMetrics.marketDemand += 0.2;
        this.taskMetrics.successRate += 0.1;
        break;
      case 'cooling':
        this.taskMetrics.marketDemand -= 0.1;
        this.taskMetrics.taskVolatility -= 0.05;
        break;
      case 'reset':
        this.taskMetrics = {
          avgTaskValue: 15000,
          taskVolatility: 0.2,
          marketDemand: 1.0,
          successRate: 0.65
        };
        break;
    }

    // Emit intervention event
    this.eventBus.bus.push({
      type: 'economic_intervention',
      action: action,
      new_metrics: { ...this.taskMetrics },
      seq: this.eventBus.lastSeq + 1,
      timestamp: Date.now()
    });
  }
}

// Export for Node.js usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = EconomyCycle;
} else if (typeof window !== 'undefined') {
  window.EconomyCycle = EconomyCycle;
}