# EHSA Causal AI Economy - State Transition Schemas

## Overview
This document defines the precise state-transition schemas for each agent in the causal value chain, ensuring unidirectional data propagation and preventing state divergence.

## Core Principles

### 1. Unidirectional Value Chain
```
Intelligence Cycle → EHSA (Leads) → Supaclaw (Opportunities) → Economy (Executions) → Treasury (State)
```

### 2. Event-Driven Communication
- All agents emit events, never write directly to shared state
- Events flow through Event Bus with strict sequence ordering
- Economy Cycle is the Single Source of Truth for treasury writes

### 3. Deterministic Entropy Injection
- Zero-state loops prevented through seeded random generation
- Entropy seeds updated deterministically each cycle

---

## Agent State Transition Schemas

### Intelligence Cycle Agent

**Purpose**: Generates intelligence data that seeds the economic pipeline

**Input Schema**:
```javascript
{
  type: "intelligence_cycle_trigger",
  intelligence_score: number, // 0.0-1.0
  source: string,            // "ai_engine", "manual_trigger", "api_feed"
  market_conditions: {
    demand_level: number,    // 0.0-1.0
    competition_index: number // 0.0-1.0
  },
  seq: number,
  timestamp: number
}
```

**State Transitions**:
```javascript
// Current State
intelligence_cycle.state = {
  active_cycles: number,
  last_intelligence_score: number,
  entropy_seed: number
}

// Transition Logic
function processIntelligenceCycle(event) {
  // Update internal state
  state.active_cycles += 1;
  state.last_intelligence_score = event.intelligence_score;

  // Generate leads based on intelligence quality
  const baseLeads = Math.floor(event.intelligence_score * 100);
  const entropyFactor = state.entropy_seed;
  const totalLeads = Math.floor(baseLeads * (0.8 + entropyFactor * 0.4));

  // Emit event (NEVER write to treasury)
  emitEvent({
    type: "leads_generated",
    leads_count: totalLeads,
    intelligence_source: event.source,
    seq: event.seq + 0.1
  });

  // Update entropy for next cycle
  state.entropy_seed = (state.entropy_seed + 0.1) % 1;
}
```

**Output Event**: `leads_generated`

---

### EHSA (Leads) Agent

**Purpose**: Converts intelligence into qualified leads

**Input Schema**:
```javascript
{
  type: "leads_generated",
  leads_count: number,
  intelligence_source: string,
  seq: number,
  timestamp: number
}
```

**State Transitions**:
```javascript
// Current State
ehsa_leads.state = {
  total_leads: number,
  qualified_leads: number,
  conversion_rate: number,
  entropy_seed: number
}

// Transition Logic
function processLeadsGenerated(event) {
  // Update lead counts
  state.total_leads += event.leads_count;

  // Quality-based qualification
  const qualificationRate = 0.6 + (state.entropy_seed * 0.3);
  const qualifiedCount = Math.floor(event.leads_count * qualificationRate);

  state.qualified_leads += qualifiedCount;

  // Emit opportunities (NEVER write to treasury)
  emitEvent({
    type: "opportunities_created",
    opportunities_count: qualifiedCount,
    leads_source: event.intelligence_source,
    avg_task_value: 15000, // Dynamic calculation
    seq: event.seq + 0.1
  });

  // Update entropy
  state.entropy_seed = (state.entropy_seed + 0.13) % 1;
}
```

**Output Event**: `opportunities_created`

---

### Supaclaw (Opportunities) Agent

**Purpose**: Converts qualified leads into executable opportunities

**Input Schema**:
```javascript
{
  type: "opportunities_created",
  opportunities_count: number,
  leads_source: string,
  avg_task_value: number,
  seq: number,
  timestamp: number
}
```

**State Transitions**:
```javascript
// Current State
supaclaw_opportunities.state = {
  total_opportunities: number,
  pipeline_value: number,
  success_probability: number,
  entropy_seed: number
}

// Transition Logic
function processOpportunitiesCreated(event) {
  // Update opportunity pipeline
  state.total_opportunities += event.opportunities_count;
  state.pipeline_value += (event.opportunities_count * event.avg_task_value);

  // Success-based execution
  const executionRate = 0.4 + (state.entropy_seed * 0.3);
  const executions = Math.floor(event.opportunities_count * executionRate);

  // Emit executions (NEVER write to treasury)
  emitEvent({
    type: "executions_completed",
    executions_count: executions,
    avg_task_value: event.avg_task_value,
    opportunities_source: event.leads_source,
    seq: event.seq + 0.1
  });

  // Update entropy
  state.entropy_seed = (state.entropy_seed + 0.17) % 1;
}
```

**Output Event**: `executions_completed`

---

### Economy Cycle Agent (Single Source of Truth)

**Purpose**: Final state aggregator - ONLY agent that writes to treasury

**Input Schema**:
```javascript
{
  type: "executions_completed",
  executions_count: number,
  avg_task_value: number,
  opportunities_source: string,
  seq: number,
  timestamp: number
}
```

**State Transitions**:
```javascript
// Current State (ONLY treasury writer)
economy_cycle.state = {
  treasury: number,          // SINGLE SOURCE OF TRUTH
  total_executions: number,
  economic_metrics: {
    avg_task_value: number,
    market_demand: number,
    success_rate: number
  },
  entropy_seed: number
}

// Transition Logic
function processExecutionsCompleted(event) {
  // Calculate dynamic revenue (replaces hardcoded abaas_cycle constants)
  const baseRevenue = event.executions_count * event.avg_task_value;
  const qualityMultiplier = 0.8 + (state.entropy_seed * 0.4);
  const marketMultiplier = state.economic_metrics.market_demand;
  const totalRevenue = Math.floor(baseRevenue * qualityMultiplier * marketMultiplier);

  // Update execution counts
  state.total_executions += event.executions_count;

  // Emit revenue realization (ONLY place treasury gets updated)
  emitEvent({
    type: "revenue_realized",
    revenue_amount: totalRevenue,
    executions_source: event.executions_count,
    quality_multiplier: qualityMultiplier,
    seq: event.seq + 0.1
  });

  // Update economic conditions based on activity
  updateEconomicMetrics(totalRevenue);

  // Update entropy
  state.entropy_seed = (state.entropy_seed + 0.19) % 1;
}

function handleRevenueRealization(event) {
  // ONLY PLACE TREASURY GETS UPDATED - SINGLE SOURCE OF TRUTH
  state.treasury += event.revenue_amount;

  // Emit final state update
  emitEvent({
    type: "treasury_updated",
    amount_added: event.revenue_amount,
    new_total: state.treasury,
    source: "economy_cycle",
    seq: event.seq + 0.1
  });
}

function updateEconomicMetrics(revenue) {
  // Dynamic economic adjustments
  if (revenue > 50000) {
    state.economic_metrics.market_demand = Math.min(1.5, state.economic_metrics.market_demand + 0.05);
  } else if (revenue < 10000) {
    state.economic_metrics.market_demand = Math.max(0.5, state.economic_metrics.market_demand - 0.02);
  }

  // Adjust task values based on market saturation
  if (state.economic_metrics.market_demand > 1.2) {
    state.economic_metrics.avg_task_value *= 0.98;
  } else if (state.economic_metrics.market_demand < 0.8) {
    state.economic_metrics.avg_task_value *= 1.02;
  }
}
```

**Output Events**: `revenue_realized`, `treasury_updated`

---

## Event Bus Wiring Schema

### Event Processing Order
```javascript
const EVENT_PROCESSING_CHAIN = [
  "intelligence_cycle_trigger"  → intelligence_cycle_agent.processIntelligenceCycle(),
  "leads_generated"            → ehsa_leads_agent.processLeadsGenerated(),
  "opportunities_created"      → supaclaw_opportunities_agent.processOpportunitiesCreated(),
  "executions_completed"       → economy_cycle_agent.processExecutionsCompleted(),
  "revenue_realized"          → economy_cycle_agent.handleRevenueRealization(),
  "treasury_updated"          → ui_controllers.updateTreasuryDisplay()
];
```

### Sequence Numbering Schema
- Base sequence from triggering event
- Decimal increments (0.1) for causal chain events
- Ensures strict ordering: `event.seq < next_event.seq`

### Error Handling Schema
```javascript
function handleEventError(event, error) {
  emitEvent({
    type: "system_error",
    original_event: event,
    error_message: error.message,
    error_stack: error.stack,
    seq: event.seq + 0.01, // Error events get priority sequencing
    timestamp: Date.now()
  });
}
```

---

## Entropy Injection Schema

### Deterministic Seeding Mechanism
```javascript
// Prevents zero-state loops
const ENTROPY_SEEDS = {
  intelligence_cycle: Math.random(),  // 0.0-1.0
  lead_generation: Math.random(),
  opportunity_creation: Math.random(),
  execution_success: Math.random()
};

// Update pattern (deterministic progression)
function updateEntropy() {
  Object.keys(ENTROPY_SEEDS).forEach(key => {
    ENTROPY_SEEDS[key] = (ENTROPY_SEEDS[key] + 0.1) % 1;
  });
}
```

### Auto-Entropy Triggers
- Zero-state detection: `leads === 0 && opportunities === 0 && executions === 0`
- Periodic refresh: Every 10 cycles
- Manual injection: Admin controls

---

## Integration Testing Schema

### State Consistency Checks
```javascript
function validateCausalConsistency(state) {
  const checks = [
    state.leads >= 0,
    state.opportunities <= state.leads,
    state.executions <= state.opportunities,
    state.treasury >= 0
  ];

  return checks.every(check => check === true);
}
```

### Event Chain Validation
```javascript
function validateEventChain(events) {
  return events.every((event, index) => {
    if (index === 0) return true;
    return event.seq > events[index - 1].seq;
  });
}
```

This schema ensures the system moves from isolated, deterministic cycles to a dynamic, event-driven ecosystem with guaranteed causal linkage and economic realism.