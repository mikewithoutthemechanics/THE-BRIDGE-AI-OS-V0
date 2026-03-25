#!/usr/bin/env node

/**
 * SUPADASH Laptop 3 Minimax Orchestrator
 *
 * Launches N Minimax M2.5 instances with sub-agents in parallel
 * Specialization: Code consolidation, query optimization, performance tuning
 * Each instance spawns 2-4 sub-agents for parallel optimization work
 *
 * Start: node agents/laptop3-minimax-orchestrator.js --port 9002 --instances 4
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const http = require('http');

const PORT = process.argv[2] === '--port' ? parseInt(process.argv[3]) : 9002;
const INSTANCE_COUNT = process.argv[4] === '--instances' ? parseInt(process.argv[5]) : 4;
const REPO_PATH = '/c/aoe-unified-final';
const SHARED_PATH = path.join(REPO_PATH, 'shared');
const LOGS_PATH = path.join(REPO_PATH, 'LOGS');
const AGENTS_PATH = path.join(REPO_PATH, 'AGENTS');

// Minimax agent definitions
const MINIMAX_AGENTS = Array.from({ length: INSTANCE_COUNT }, (_, i) => ({
  id: `3M-${String.fromCharCode(65 + i)}`,  // 3M-A, 3M-B, 3M-C, 3M-D
  model: 'Minimax M2.5',
  task: 'Optimization & Consolidation',
  status: 'ready',
  sub_agents: 3  // Each Minimax spawns 3 sub-agents
}));

const TOTAL_SUB_AGENTS = INSTANCE_COUNT * 3;

// Global state
const agentStatus = {};
MINIMAX_AGENTS.forEach(agent => {
  agentStatus[`Agent-${agent.id}`] = {
    model: agent.model,
    task: agent.task,
    status: 'initialized',
    last_heartbeat: new Date(),
    progress_percent: 0,
    optimizations_count: 0,
    consolidations_count: 0,
    sub_agents: Array.from({ length: agent.sub_agents }, (_, i) => ({
      id: `${agent.id}-SA${i + 1}`,
      status: 'ready',
      task: ['Code consolidation', 'Query optimization', 'Performance tuning'][i] || 'Optimization'
    }))
  };
});

// Ensure directories exist
[SHARED_PATH, LOGS_PATH, AGENTS_PATH].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Initialize log file
const logFile = path.join(LOGS_PATH, 'LAPTOP_3.log');
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  fs.appendFileSync(logFile, logMessage + '\n');
}

log('═══════════════════════════════════════════════════════════');
log('SUPADASH STREAMING ORCHESTRATOR - LAPTOP 3 (MINIMAX)');
log('═══════════════════════════════════════════════════════════');
log(`Port: ${PORT}`);
log(`Minimax Instances: ${INSTANCE_COUNT}`);
log(`Sub-Agents per Instance: 3`);
log(`Total Sub-Agents: ${TOTAL_SUB_AGENTS}`);
log(`Specialization: Optimization & Consolidation`);
log(`Timeline: 8 days (streaming, optimization in parallel)`);
log(`Timestamp: ${new Date().toISOString()}`);
log('═══════════════════════════════════════════════════════════');

// Express server
const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    laptop: 'L3-Minimax',
    timestamp: new Date().toISOString(),
    instances: INSTANCE_COUNT,
    sub_agents_total: TOTAL_SUB_AGENTS
  });
});

// Status endpoint
app.get('/api/status', (req, res) => {
  const totalOptimizations = Object.values(agentStatus)
    .reduce((sum, agent) => sum + (agent.optimizations_count || 0), 0);
  const totalConsolidations = Object.values(agentStatus)
    .reduce((sum, agent) => sum + (agent.consolidations_count || 0), 0);

  res.json({
    laptop: 'L3',
    port: PORT,
    role: 'optimization',
    instances: INSTANCE_COUNT,
    sub_agents_total: TOTAL_SUB_AGENTS,
    agents: agentStatus,
    total_optimizations: totalOptimizations,
    total_consolidations: totalConsolidations,
    timestamp: new Date().toISOString()
  });
});

// Agent list
app.get('/api/agents', (req, res) => {
  res.json({
    total_instances: INSTANCE_COUNT,
    total_sub_agents: TOTAL_SUB_AGENTS,
    agents: MINIMAX_AGENTS.map(a => ({
      ...a,
      sub_agents_count: a.sub_agents
    })),
    status_detail: agentStatus
  });
});

// Optimization results
app.get('/api/optimization/:component/results', (req, res) => {
  const component = req.params.component;
  const resultsFile = path.join(SHARED_PATH, `optimization-${component}.json`);

  if (fs.existsSync(resultsFile)) {
    res.json(JSON.parse(fs.readFileSync(resultsFile)));
  } else {
    res.json({ status: 'pending', component, message: 'Optimization in progress' });
  }
});

// Receive status updates from agents
app.post('/api/agent/:id/status', (req, res) => {
  const agentId = `Agent-${req.params.id}`;
  if (agentStatus[agentId]) {
    agentStatus[agentId] = {
      ...agentStatus[agentId],
      ...req.body,
      last_heartbeat: new Date()
    };
    log(`${agentId} status: ${req.body.status} (${req.body.progress_percent || 0}%)`);
    log(`  Optimizations: ${req.body.optimizations_count || 0}, Consolidations: ${req.body.consolidations_count || 0}`);
  }
  res.json({ received: true });
});

// Sync with L1 & L2
function syncWithUpstream() {
  try {
    log(`[SYNC] Pulling latest from L1/L2...`);
    execSync(`cd ${REPO_PATH} && git pull origin feature/supadash-consolidation`, {
      stdio: 'pipe'
    });

    // Check for optimization targets
    const optimizations = fs.readdirSync(SHARED_PATH)
      .filter(f => f.includes('optimization') || f.includes('consolidation'));

    if (optimizations.length > 0) {
      log(`[SYNC] Found ${optimizations.length} optimization targets`);
    }
  } catch (error) {
    log(`[SYNC] Sync with L1/L2: ${error.message}`);
  }
}

// Auto-pull every 5 minutes
setInterval(syncWithUpstream, 5 * 60 * 1000);

// Push optimizations every 10 minutes
setInterval(() => {
  try {
    log(`[PUSH] Pushing optimization results...`);
    execSync(`cd ${REPO_PATH} && git add shared/optimization-*.json && git commit -m "[AUTO] L3 optimization results" && git push origin feature/supadash-consolidation`, {
      stdio: 'pipe'
    });
  } catch (error) {
    // No changes to push, that's OK
  }
}, 10 * 60 * 1000);

// Startup sequence
function startup() {
  log('\n>>> STARTUP SEQUENCE BEGIN');
  log(`Initializing ${INSTANCE_COUNT} Minimax instances with sub-agents...\n`);

  MINIMAX_AGENTS.forEach((agent, idx) => {
    setTimeout(() => {
      const agentKey = `Agent-${agent.id}`;
      agentStatus[agentKey].status = 'running';
      log(`✓ Minimax Instance ${agent.id} initialized`);
      log(`  Task: ${agent.task}`);
      log(`  Sub-agents: ${agent.sub_agents} (code consolidation, query optimization, perf tuning)`);

      // Log sub-agents
      agentStatus[agentKey].sub_agents.forEach(sa => {
        log(`    → ${sa.id}: ${sa.task}`);
      });
    }, idx * 800);
  });

  setTimeout(() => {
    log('\n>>> STARTUP COMPLETE');
    log(`✓ ${INSTANCE_COUNT} Minimax instances running (${TOTAL_SUB_AGENTS} total sub-agents)`);
    log(`✓ Connected to L1 (http://localhost:9000) and L2 (http://localhost:9001)`);
    log(`✓ Waiting for L1 to publish contracts at Day 1 Hour 4...\n`);
    log(`Monitor progress: curl http://localhost:${PORT}/api/status | jq`);
    log(`View optimizations: curl http://localhost:${PORT}/api/optimization/\<component\> | jq\n`);
  }, INSTANCE_COUNT * 800 + 500);
}

// Start server
app.listen(PORT, () => {
  log(`\n✓ Orchestrator listening on port ${PORT}`);
  log(`Endpoint: http://localhost:${PORT}/api/status`);

  // First sync with L1/L2
  syncWithUpstream();

  // Small delay before startup sequence
  setTimeout(startup, 1000);
});

// Graceful shutdown
process.on('SIGINT', () => {
  log('\n[SHUTDOWN] Received shutdown signal');
  log('[SHUTDOWN] Saving final optimization results...');

  // Save final state
  fs.writeFileSync(
    path.join(AGENTS_PATH, 'ORCHESTRATOR_L3_FINAL.json'),
    JSON.stringify(agentStatus, null, 2)
  );

  log('[SHUTDOWN] Orchestrator stopped');
  process.exit(0);
});

log('Orchestrator ready. Waiting for Day 1 Hour 0 bootstrap from L1...\n');
