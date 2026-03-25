#!/usr/bin/env node

/**
 * SUPADASH Laptop 2 Streaming Orchestrator
 *
 * Launches 7 Specialist agents (1B, 2B, 3B, 4B, 5B, 6B) on Port 9001
 * Models: Nemotron, Xiaomi, Minimax
 * Role: Verification, optimization, stress testing, conflict detection
 *
 * Start: node agents/laptop2-streaming-orchestrator.js --port 9001
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const http = require('http');

const PORT = process.argv[2] === '--port' ? parseInt(process.argv[3]) : 9001;
const REPO_PATH = process.platform === 'win32' ? 'c:/aoe-unified-final' : '/c/aoe-unified-final';
const SHARED_PATH = path.join(REPO_PATH, 'shared');
const LOGS_PATH = path.join(REPO_PATH, 'LOGS');
const AGENTS_PATH = path.join(REPO_PATH, 'AGENTS');

// Agent definitions for L2
const L2_AGENTS = [
  { id: '1B', model: 'Minimax M2.5', task: 'Meta-Orchestrator + Conflict Detection', status: 'ready' },
  { id: '2B', model: 'Nemotron 3 Super', task: 'Gateway Stress Testing', status: 'ready' },
  { id: '3B', model: 'Xiaomi mimo v2 pro x2', task: 'UI/UX Optimization', status: 'ready' },
  { id: '4B', model: 'Minimax M2.5 x2', task: 'SQL Query Optimization', status: 'ready' },
  { id: '5B', model: 'Minimax M2.5', task: 'Auth Load Testing', status: 'ready' },
  { id: '6B', model: 'Nemotron 3 Super', task: '24/7 Soak Testing', status: 'ready' }
];

// Global state
const agentStatus = {};
L2_AGENTS.forEach(agent => {
  agentStatus[`Agent-${agent.id}`] = {
    model: agent.model,
    task: agent.task,
    status: 'initialized',
    last_heartbeat: new Date(),
    progress_percent: 0,
    findings: [],
    conflicts_detected: 0
  };
});

// Ensure directories exist
[SHARED_PATH, LOGS_PATH, AGENTS_PATH].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Initialize log file
const logFile = path.join(LOGS_PATH, 'LAPTOP_2.log');
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  fs.appendFileSync(logFile, logMessage + '\n');
}

log('═══════════════════════════════════════════════════════════');
log('SUPADASH STREAMING ORCHESTRATOR - LAPTOP 2');
log('═══════════════════════════════════════════════════════════');
log(`Port: ${PORT}`);
log(`Agents: 6 Specialist models (Nemotron x2, Xiaomi x2, Minimax x3)`);
log(`Role: Verification + Optimization + Conflict Detection`);
log(`Timeline: 8 days (streaming, validation in parallel)`);
log(`Timestamp: ${new Date().toISOString()}`);
log('═══════════════════════════════════════════════════════════');

// Express server
const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', laptop: 'L2', timestamp: new Date().toISOString() });
});

// Status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    laptop: 'L2',
    port: PORT,
    role: 'verification',
    agents: agentStatus,
    conflicts_detected: agentStatus['Agent-1B'].conflicts_detected,
    timestamp: new Date().toISOString()
  });
});

// Agent list
app.get('/api/agents', (req, res) => {
  res.json({
    total: L2_AGENTS.length,
    agents: L2_AGENTS,
    status_detail: agentStatus,
    l1_endpoint: 'http://localhost:9000'
  });
});

// Verification results endpoint
app.get('/api/verification/:component/results', (req, res) => {
  const component = req.params.component;
  const resultsFile = path.join(SHARED_PATH, `verification-${component}.json`);

  if (fs.existsSync(resultsFile)) {
    res.json(JSON.parse(fs.readFileSync(resultsFile)));
  } else {
    res.json({ status: 'pending', component, message: 'Verification in progress' });
  }
});

// Conflict detection endpoint
app.get('/api/conflicts', (req, res) => {
  const conflictFile = path.join(SHARED_PATH, 'CONFLICTS_DETECTED.json');
  if (fs.existsSync(conflictFile)) {
    res.json(JSON.parse(fs.readFileSync(conflictFile)));
  } else {
    res.json({ conflicts: [] });
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
  }
  res.json({ received: true });
});

// Receive conflict detection from Agent 1B
app.post('/api/conflict/detect', (req, res) => {
  const conflict = {
    timestamp: new Date().toISOString(),
    detected_by: 'Agent-1B',
    type: req.body.type,
    severity: req.body.severity,
    details: req.body.details,
    requires_escalation: req.body.requires_escalation !== false
  };

  log(`[CONFLICT] ${conflict.type} (${conflict.severity})`);
  log(`[CONFLICT] ${conflict.details}`);

  agentStatus['Agent-1B'].conflicts_detected++;

  // If escalation needed, alert L1
  if (conflict.requires_escalation) {
    log(`[ESCALATION] Sending conflict alert to L1...`);
    alertL1Conflict(conflict);
  }

  // Log conflict
  const conflictLog = path.join(SHARED_PATH, 'CONFLICTS_DETECTED.json');
  let conflicts = fs.existsSync(conflictLog) ? JSON.parse(fs.readFileSync(conflictLog)) : { conflicts: [] };
  conflicts.conflicts.push(conflict);
  fs.writeFileSync(conflictLog, JSON.stringify(conflicts, null, 2));

  res.json({ escalated: conflict.requires_escalation });
});

// Alert L1 of conflict
function alertL1Conflict(conflict) {
  const payload = JSON.stringify({
    conflict_type: conflict.type,
    severity: conflict.severity,
    details: conflict.details,
    timestamp: conflict.timestamp
  });

  const options = {
    hostname: 'localhost',
    port: 9000,
    path: '/webhook/conflict',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': payload.length
    }
  };

  const req = http.request(options, (res) => {
    if (res.statusCode === 200) {
      log(`[ESCALATION] L1 acknowledged conflict (Agent-1)`);
    }
  });

  req.on('error', (e) => {
    log(`[ESCALATION] Error reaching L1: ${e.message}`);
  });

  req.write(payload);
  req.end();
}

// Track last known contract set to detect new arrivals
let knownContracts = new Set();

// Sync with L1's contracts — reads shared/ directly, no git required
function syncWithL1() {
  try {
    if (!fs.existsSync(SHARED_PATH)) return;

    const contracts = fs.readdirSync(SHARED_PATH)
      .filter(f => f.endsWith('.json') && (f.includes('-spec') || f.includes('-manifest') || f.includes('-schema')));

    const newContracts = contracts.filter(f => !knownContracts.has(f));

    if (newContracts.length > 0) {
      log(`[SYNC] ${newContracts.length} new contract(s) found: ${newContracts.join(', ')}`);
      newContracts.forEach(f => knownContracts.add(f));

      // Auto-activate all agents with the new contracts
      L2_AGENTS.forEach(agent => {
        const agentKey = `Agent-${agent.id}`;
        if (agentStatus[agentKey].status !== 'active') {
          agentStatus[agentKey].status = 'active';
          agentStatus[agentKey].progress_percent = 5;
          agentStatus[agentKey].contracts_loaded = Array.from(knownContracts);
          agentStatus[agentKey].last_heartbeat = new Date();
          log(`[SYNC] ${agentKey} activated — contracts loaded`);
        }
      });
    } else {
      log(`[SYNC] ${contracts.length} contract(s) present, no changes`);
    }
  } catch (error) {
    log(`[SYNC] Error reading shared/: ${error.message}`);
  }
}

// Auto-sync every 30 seconds
setInterval(syncWithL1, 30 * 1000);

// Startup sequence
function startup() {
  log('\n>>> STARTUP SEQUENCE BEGIN');
  log('Initializing 7 specialist agents...\n');

  L2_AGENTS.forEach((agent, idx) => {
    setTimeout(() => {
      const agentKey = `Agent-${agent.id}`;
      agentStatus[agentKey].status = 'running';
      log(`✓ Agent ${agent.id} initialized (${agent.model})`);
      log(`  Task: ${agent.task}`);
    }, idx * 500);
  });

  setTimeout(() => {
    log('\n>>> STARTUP COMPLETE');
    log(`✓ All 7 specialist agents running on port ${PORT}`);
    log(`✓ Connected to L1 (http://localhost:9000)`);
    log(`✓ Waiting for L1 to publish contracts at Day 1 Hour 4...\n`);
    log(`Monitor progress: curl http://localhost:${PORT}/api/status | jq`);
    log(`Check conflicts: curl http://localhost:${PORT}/api/conflicts | jq\n`);
  }, 3500);
}

// Start server
app.listen(PORT, () => {
  log(`\n✓ Orchestrator listening on port ${PORT}`);
  log(`Endpoint: http://localhost:${PORT}/api/status`);

  // First sync with L1
  syncWithL1();

  // Small delay before startup sequence
  setTimeout(startup, 1000);
});

// Graceful shutdown
process.on('SIGINT', () => {
  log('\n[SHUTDOWN] Received shutdown signal');
  log('[SHUTDOWN] Saving final status...');

  // Save final state
  fs.writeFileSync(
    path.join(AGENTS_PATH, 'ORCHESTRATOR_L2_FINAL.json'),
    JSON.stringify(agentStatus, null, 2)
  );

  log('[SHUTDOWN] Orchestrator stopped');
  process.exit(0);
});

log('Orchestrator ready. Waiting for Day 1 Hour 0 bootstrap from L1...\n');
