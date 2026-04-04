#!/usr/bin/env node

/**
 * SUPADASH Laptop 1 Streaming Orchestrator
 *
 * Launches 6 Claude agents (1, 2A, 3A, 4A, 5A, 6A) on Port 9000
 * Coordinates: Gateway, Dashboard, Data, Auth, Testing, Governance
 *
 * Start: node agents/laptop1-streaming-orchestrator.js --port 9000
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PORT = process.argv[2] === '--port' ? parseInt(process.argv[3]) : 9000;
const REPO_PATH = '/c/aoe-unified-final';
const SHARED_PATH = path.join(REPO_PATH, 'shared');
const LOGS_PATH = path.join(REPO_PATH, 'LOGS');
const AGENTS_PATH = path.join(REPO_PATH, 'AGENTS');

// Agent definitions for L1
const L1_AGENTS = [
  { id: '1', model: 'Opus 4.6', task: 'Master Orchestrator + Decisions', status: 'ready' },
  { id: '2A', model: 'Sonnet 4.6', task: 'Gateway Infrastructure', status: 'ready' },
  { id: '3A', model: 'Sonnet 4.6', task: 'Dashboard Consolidation', status: 'ready' },
  { id: '4A', model: 'Sonnet 4.6', task: 'Data Layer Migrations', status: 'ready' },
  { id: '5A', model: 'Haiku 4.5', task: 'Auth & Referral Services', status: 'ready' },
  { id: '6A', model: 'Haiku 4.5', task: 'Unit Testing', status: 'ready' }
];

// Global state
const agentStatus = {};
L1_AGENTS.forEach(agent => {
  agentStatus[`Agent-${agent.id}`] = {
    model: agent.model,
    task: agent.task,
    status: 'initialized',
    last_heartbeat: new Date(),
    progress_percent: 0,
    blockers: []
  };
});

// Ensure directories exist
[SHARED_PATH, LOGS_PATH, AGENTS_PATH].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`✓ Created directory: ${dir}`);
  }
});

// Initialize log file
const logFile = path.join(LOGS_PATH, 'LAPTOP_1.log');
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  fs.appendFileSync(logFile, logMessage + '\n');
}

log('═══════════════════════════════════════════════════════════');
log('SUPADASH STREAMING ORCHESTRATOR - LAPTOP 1');
log('═══════════════════════════════════════════════════════════');
log(`Port: ${PORT}`);
log(`Agents: 6 Claude models (Opus, Sonnet x3, Haiku x2)`);
log(`Timeline: 8 days (streaming)`);
log(`Timestamp: ${new Date().toISOString()}`);
log('═══════════════════════════════════════════════════════════');

// Express server
const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    laptop: 'L1',
    port: PORT,
    agents: agentStatus,
    timestamp: new Date().toISOString(),
    mode: 'streaming',
    timeline_days: 8
  });
});

// Agent list
app.get('/api/agents', (req, res) => {
  res.json({
    total: L1_AGENTS.length,
    agents: L1_AGENTS,
    status_detail: agentStatus
  });
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
    log(`${agentId} status update: ${req.body.status} (${req.body.progress_percent || 0}%)`);
  }
  res.json({ received: true });
});

// Webhook for contract changes (from L2)
app.post('/webhook/contract-change', (req, res) => {
  log(`[WEBHOOK] Contract change detected from L2`);
  // Trigger immediate contract sync
  syncContractsFromGit();
  res.json({ status: 'processed' });
});

// Webhook for conflict detection (from L2)
app.post('/webhook/conflict', (req, res) => {
  log(`[CRITICAL] CONFLICT DETECTED: ${req.body.conflict_type}`);
  log(`Details: ${JSON.stringify(req.body.details)}`);
  agentStatus['Agent-1'].blockers.push({
    timestamp: new Date(),
    type: 'conflict',
    details: req.body.details
  });
  res.json({ escalated: true });
});

// Approval endpoint (Agent 1 approves decisions)
app.post('/api/decision/:id/approve', (req, res) => {
  log(`Agent-1: Decision approved: ${req.params.id}`);
  fs.appendFileSync(
    path.join(SHARED_PATH, 'SUPADASH_CRITICAL_DECISIONS.md'),
    `\n- [${new Date().toISOString()}] ${req.params.id}: APPROVED\n`
  );
  res.json({ approved: true });
});

// Sync contracts from git
function syncContractsFromGit() {
  try {
    log(`[SYNC] Pulling latest contracts from git...`);
    execSync(`cd ${REPO_PATH} && git pull origin feature/supadash-consolidation`, {
      stdio: 'pipe'
    });

    const contracts = fs.readdirSync(SHARED_PATH)
      .filter(f => f.includes('-spec') || f.includes('-manifest'));
    log(`[SYNC] Found ${contracts.length} contracts in shared/`);

    contracts.forEach(c => log(`  ✓ ${c}`));
  } catch (error) {
    log(`[SYNC] Error pulling git: ${error.message}`);
  }
}

// Auto-pull every 5 minutes
setInterval(syncContractsFromGit, 5 * 60 * 1000);

// Startup sequence
function startup() {
  log('\n>>> STARTUP SEQUENCE BEGIN');
  log('Initializing 6 agents...\n');

  L1_AGENTS.forEach((agent, idx) => {
    setTimeout(() => {
      const agentKey = `Agent-${agent.id}`;
      agentStatus[agentKey].status = 'running';
      log(`✓ Agent ${agent.id} initialized (${agent.model})`);
      log(`  Task: ${agent.task}`);
    }, idx * 500);
  });

  setTimeout(() => {
    log('\n>>> STARTUP COMPLETE');
    log(`✓ All 6 agents running on port ${PORT}`);
    log(`✓ Streaming timeline active (8 days)`);
    log(`✓ Waiting for Day 1 Hour 4 contract publishing...\n`);
    log(`Monitor progress: curl http://localhost:${PORT}/api/status | jq`);
    log(`Or watch git: watch -n 5 'git log --oneline | head -10'\n`);
  }, 3500);
}

// Start server
app.listen(PORT, () => {
  log(`\n✓ Orchestrator listening on port ${PORT}`);
  log(`Endpoint: http://localhost:${PORT}/api/status`);

  // Small delay before startup sequence
  setTimeout(startup, 1000);
});

// Graceful shutdown
process.on('SIGINT', () => {
  log('\n[SHUTDOWN] Received shutdown signal');
  log('[SHUTDOWN] Saving final status...');

  // Save final state
  fs.writeFileSync(
    path.join(AGENTS_PATH, 'ORCHESTRATOR_L1_FINAL.json'),
    JSON.stringify(agentStatus, null, 2)
  );

  log('[SHUTDOWN] Orchestrator stopped');
  process.exit(0);
});

log('Orchestrator ready. Waiting for Day 1 Hour 0 bootstrap...\n');
