// ehsa-event-bus.js - Event Bus Implementation for Causal AI Economy
// Transforms isolated cycles into dynamic, event-driven ecosystem

class EHSAEventBus {
  constructor() {
    this.bus = [];
    this.lastSeq = 0;
    this.handlers = new Map();
    this.state = {
      cycle: 0,
      treasury: 0,
      leads: 0,
      opportunities: 0,
      executions: 0,
      entropy_seeds: {
        intelligence_cycle: Math.random(),
        lead_generation: Math.random(),
        opportunity_creation: Math.random(),
        execution_success: Math.random()
      }
    };
  }

  // Event ingestion with strict ordering
  ingest(event) {
    if (!event.seq || event.seq <= this.lastSeq) return false;
    this.lastSeq = event.seq;
    this.bus.push(event);
    this.processBus();
    return true;
  }

  // Register event handlers
  on(eventType, handler) {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType).push(handler);
  }

  // Process event queue with causal propagation
  processBus() {
    while (this.bus.length > 0) {
      const event = this.bus.shift();
      this.processEvent(event);
    }
  }

  // Event processing with state transitions
  processEvent(event) {
    switch (event.type) {
      case 'intelligence_cycle_complete':
        this.handleIntelligenceCycle(event);
        break;
      case 'leads_generated':
        this.handleLeadGeneration(event);
        break;
      case 'opportunities_created':
        this.handleOpportunityCreation(event);
        break;
      case 'executions_completed':
        this.handleExecutions(event);
        break;
      case 'revenue_realized':
        this.handleRevenue(event);
        break;
      case 'entropy_injection':
        this.handleEntropyInjection(event);
        break;
    }

    // Notify registered handlers
    const handlers = this.handlers.get(event.type) || [];
    handlers.forEach(handler => handler(event, this.state));
  }

  // Intelligence Cycle → EHSA Leads
  handleIntelligenceCycle(event) {
    // Dynamic lead generation based on intelligence quality
    const baseLeads = Math.max(1, Math.floor(event.intelligence_score * 10));
    const entropyFactor = this.state.entropy_seeds.intelligence_cycle;
    const totalLeads = Math.floor(baseLeads * (0.8 + entropyFactor * 0.4));

    this.state.leads += totalLeads;

    // Emit lead generation event
    this.bus.push({
      type: 'leads_generated',
      leads_count: totalLeads,
      intelligence_source: event.source,
      seq: event.seq + 0.1,
      timestamp: Date.now()
    });
  }

  // EHSA Leads → Supaclaw Opportunities
  handleLeadGeneration(event) {
    // Conversion rate based on lead quality and market conditions
    const conversionRate = 0.3 + (this.state.entropy_seeds.lead_generation * 0.4);
    const opportunities = Math.floor(event.leads_count * conversionRate);

    this.state.opportunities += opportunities;

    // Emit opportunity creation event
    this.bus.push({
      type: 'opportunities_created',
      opportunities_count: opportunities,
      leads_source: event.intelligence_source,
      seq: event.seq + 0.1,
      timestamp: Date.now()
    });
  }

  // Supaclaw Opportunities → Economy Executions
  handleOpportunityCreation(event) {
    // Success rate based on opportunity quality and execution capability
    const successRate = 0.4 + (this.state.entropy_seeds.opportunity_creation * 0.3);
    const executions = Math.floor(event.opportunities_count * successRate);

    this.state.executions += executions;

    // Emit execution completion event
    this.bus.push({
      type: 'executions_completed',
      executions_count: executions,
      avg_task_value: event.avg_task_value || 15000, // Dynamic task value
      seq: event.seq + 0.1,
      timestamp: Date.now()
    });
  }

  // Economy Executions → Treasury State (Single Source of Truth)
  handleExecutions(event) {
    // Dynamic revenue calculation: tasks * avgTaskValue * successRate
    const baseRevenue = event.executions_count * event.avg_task_value;
    const qualityMultiplier = 0.8 + (this.state.entropy_seeds.execution_success * 0.4);
    const totalRevenue = Math.floor(baseRevenue * qualityMultiplier);

    // Emit revenue realization (ONLY place treasury gets updated)
    this.bus.push({
      type: 'revenue_realized',
      revenue_amount: totalRevenue,
      executions_source: event.executions_count,
      seq: event.seq + 0.1,
      timestamp: Date.now()
    });
  }

  // Treasury aggregation (Single Source of Truth)
  handleRevenue(event) {
    this.state.treasury += event.revenue_amount;
    this.state.cycle += 1;

    // Update entropy seeds for next cycle
    this.updateEntropySeeds();
  }

  // Entropy injection to prevent zero-state loops
  handleEntropyInjection(event) {
    // Deterministic seeding mechanism
    this.state.entropy_seeds.intelligence_cycle = (this.state.entropy_seeds.intelligence_cycle + 0.1) % 1;
    this.state.entropy_seeds.lead_generation = (this.state.entropy_seeds.lead_generation + 0.13) % 1;
    this.state.entropy_seeds.opportunity_creation = (this.state.entropy_seeds.opportunity_creation + 0.17) % 1;
    this.state.entropy_seeds.execution_success = (this.state.entropy_seeds.execution_success + 0.19) % 1;
  }

  updateEntropySeeds() {
    // Periodic entropy refresh
    if (this.state.cycle % 10 === 0) {
      Object.keys(this.state.entropy_seeds).forEach(key => {
        this.state.entropy_seeds[key] = Math.random();
      });
    }
  }

  // Auto-entropy injection if system stalls
  checkSystemHealth() {
    const hasZeroState = this.state.leads === 0 && this.state.opportunities === 0 &&
                        this.state.executions === 0;

    if (hasZeroState && this.state.cycle > 0) {
      this.ingest({
        type: 'entropy_injection',
        reason: 'zero_state_detected',
        seq: this.lastSeq + 1,
        timestamp: Date.now()
      });
    }
  }

  // Public API for external agents
  emitIntelligenceCycle(intelligenceScore, source = 'ai_engine') {
    this.ingest({
      type: 'intelligence_cycle_complete',
      intelligence_score: intelligenceScore,
      source: source,
      seq: this.lastSeq + 1,
      timestamp: Date.now()
    });
  }

  // Get current state snapshot
  getState() {
    return { ...this.state };
  }

  // Reset for testing/development
  reset() {
    this.bus = [];
    this.lastSeq = 0;
    this.state = {
      cycle: 0,
      treasury: 0,
      leads: 0,
      opportunities: 0,
      executions: 0,
      entropy_seeds: {
        intelligence_cycle: Math.random(),
        lead_generation: Math.random(),
        opportunity_creation: Math.random(),
        execution_success: Math.random()
      }
    };
  }
}

// Export for Node.js or attach to window
if (typeof module !== 'undefined' && module.exports) {
  module.exports = EHSAEventBus;
} else if (typeof window !== 'undefined') {
  window.EHSAEventBus = EHSAEventBus;
}