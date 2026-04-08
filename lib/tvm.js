'use strict';
/**
 * lib/tvm.js — Topic Vector Matrix (TVM) Engine v2.0
 * BridgeOS service: bridgeos.tvm
 *
 * Upgrades from v1:
 *   - HMAC-SHA256 signing (TVM_SECRET env) instead of plain SHA256
 *   - Structured recommendation library (steps, severity, action_type)
 *   - RBAC field-level permissions by role
 *   - Topology edges for global system map
 *   - Event schema builders (observer/executor/map/updated)
 *   - orchestrationTick() for multi-agent loop
 */
const crypto = require('crypto');

// ── Service manifest ──────────────────────────────────────────────────────────
const MANIFEST = {
  id:           'bridgeos.tvm',
  display_name: 'Topic Vector Matrix Service',
  version:      '2.0.0',
  owner:        'platform/ops',
  description:  'Hardened state matrix for configuration, health, and orchestration with human-in-the-loop.',
  interfaces:   { http: { base_path: '/api/tvm' } },
  storage:      { type: 'kv', key_space: 'tvm:', integrity: 'hmac-sha256' },
  security:     { signing: { algorithm: 'HMAC-SHA256', secret_source: 'env:TVM_SECRET' } },
};

// ── RBAC ──────────────────────────────────────────────────────────────────────
// Fields each role may WRITE (signature is always service-computed, never client-set)
const ROLES = {
  READER:   'tvm.reader',
  AGENT:    'tvm.agent',
  OPERATOR: 'tvm.operator',
  SYSTEM:   'tvm.system',
};

const ROLE_WRITABLE = {
  'tvm.agent':    ['healthy', 'degraded', 'last_updated', 'action_required', 'autofix_available', 'human_approval_needed', 'recommendation_code'],
  'tvm.operator': ['healthy', 'degraded', 'last_updated', 'configured', 'action_required', 'autofix_available', 'human_approval_needed', 'recommendation_code', 'risk_score', 'priority'],
  'tvm.system':   ['healthy', 'degraded', 'last_updated', 'configured', 'action_required', 'autofix_available', 'human_approval_needed', 'recommendation_code', 'risk_score', 'priority', 'owner'],
};

// ── HMAC signing ──────────────────────────────────────────────────────────────
function getTVMSecret() {
  const secret = process.env.TVM_SECRET;
  if (!secret) throw new Error('[TVM] TVM_SECRET env var must be set');
  return secret;
}

function canonicalPayload(row) {
  return [
    row.topic,
    row.configured,
    row.healthy,
    row.degraded,
    row.action_required,
    row.autofix_available    || 0,
    row.human_approval_needed || 0,
    row.last_updated,
    row.recommendation_code  || '',
  ].join('|');
}

function sign(row) {
  return crypto.createHmac('sha256', getTVMSecret())
    .update(canonicalPayload(row)).digest('hex').slice(0, 16);
}

function verifyRow(row) {
  if (!row || !row.signature) return false;
  return sign(row) === row.signature;
}

// ── Canonical topic registry ──────────────────────────────────────────────────
const TOPICS = [
  { topic: 'MailPipeline',      owner: 'brain',    priority: 2, risk_score: 3 },
  { topic: 'TreasuryAPI',       owner: 'brain',    priority: 3, risk_score: 4 },
  { topic: 'GlobalMapSync',     owner: 'brain',    priority: 1, risk_score: 2 },
  { topic: 'WordPressSync',     owner: 'brain',    priority: 1, risk_score: 1 },
  { topic: 'VPSGateway',        owner: 'ops',      priority: 3, risk_score: 4 },
  { topic: 'BrainOrchestrator', owner: 'brain',    priority: 3, risk_score: 5 },
  { topic: 'AgentSwarm',        owner: 'brain',    priority: 2, risk_score: 3 },
  { topic: 'AuthService',       owner: 'ops',      priority: 3, risk_score: 4 },
  { topic: 'SkillsEngine',      owner: 'brain',    priority: 2, risk_score: 2 },
  { topic: 'UBIPool',           owner: 'treasury', priority: 2, risk_score: 3 },
  { topic: 'LeadGen',           owner: 'growth',   priority: 2, risk_score: 2 },
  { topic: 'PaymentGateway',    owner: 'ops',      priority: 3, risk_score: 5 },
  { topic: 'BrainVPSSSH',       owner: 'ops',      priority: 3, risk_score: 5 },
  { topic: 'SubdomainSSL',      owner: 'ops',      priority: 2, risk_score: 3 },
  { topic: 'WebwayDNS',         owner: 'ops',      priority: 2, risk_score: 3 },
];

// ── Structured recommendation library ─────────────────────────────────────────
// Domain  · action_type  · severity (1–5)  · steps  · requires_human_approval
const RECOMMENDATION_LIB = {
  'MP-AF-ROTATE-TOKEN': {
    domain: 'MailPipeline', action_type: 'autofix', severity: 3,
    description: 'Rotate SMTP/Brevo token and restart mail relay',
    steps: [
      'Revoke existing SMTP/Brevo token in Brevo dashboard',
      'Generate new API key under Transactional → SMTP & API',
      'Update BREVO_SMTP_KEY env in Vercel (vercel env add)',
      'Redeploy: vercel --prod',
      'Verify: POST /api/tvm/MailPipeline health probe returns healthy=1',
    ],
    requires_human_approval: true,
  },
  'TR-RECONCILE': {
    domain: 'TreasuryAPI', action_type: 'autofix', severity: 4,
    description: 'Run treasury reconciliation — balance drift detected',
    steps: [
      'Snapshot current treasury balances via GET /api/treasury/status',
      'Run reconcile: POST /api/treasury/reconcile',
      'Flag any drift > 0.01 BRDG to treasury owner',
      'Re-sign TVM row after reconcile',
    ],
    requires_human_approval: true,
  },
  'GMS-RECONNECT': {
    domain: 'GlobalMapSync', action_type: 'autofix', severity: 2,
    description: 'Reconnect global map WebSocket feed',
    steps: [
      'Close stale WebSocket connection',
      'Re-authenticate with map broker',
      'Re-subscribe to topology events',
      'Verify node count matches registry',
    ],
    requires_human_approval: false,
  },
  'WPS-SYNC': {
    domain: 'WordPressSync', action_type: 'sync', severity: 1,
    description: 'Push 50-applications content to WordPress sites',
    steps: [
      'Fetch latest 50-applications.html from Vercel CDN',
      'Parse application entries',
      'Upsert pages via WP REST API (bridge-wp-api worker)',
      'Log sync result',
    ],
    requires_human_approval: false,
  },
  'VPS-RESTART-GW': {
    domain: 'VPSGateway', action_type: 'autofix', severity: 4,
    description: 'Restart bridge-gateway via PM2 on VPS',
    steps: [
      'Restore SSH access (see VPS-SSH-RESTORE first)',
      'SSH: ssh root@102.208.231.53',
      'Run: pm2 restart bridge-gateway',
      'Wait 15 s for service startup',
      'Confirm GET /health returns 200',
    ],
    requires_human_approval: true,
  },
  'BR-HEALTHCHECK': {
    domain: 'BrainOrchestrator', action_type: 'diagnostics', severity: 3,
    description: 'Run brain orchestrator self-test and reload agents',
    steps: [
      'POST /api/agents/dispatch { action: "self-test" }',
      'Await GET /orchestrator/status → status: "running"',
      'Reload agent registry from SVG engine',
      'Re-run swarm health check via GET /api/swarm/health',
    ],
    requires_human_approval: false,
  },
  'SW-REBALANCE': {
    domain: 'AgentSwarm', action_type: 'autofix', severity: 3,
    description: 'Rebalance agent swarm — utilization drift detected',
    steps: [
      'GET /api/swarm/matrix to fetch current utilization',
      'Identify agents with utilization > 85%',
      'Redistribute task queue via POST /api/swarm/rebalance',
      'Confirm GET /api/swarm/health returns balanced=true',
    ],
    requires_human_approval: false,
  },
  'AUTH-ROTATE-JWT': {
    domain: 'AuthService', action_type: 'security', severity: 4,
    description: 'Rotate JWT signing keys and invalidate sessions',
    steps: [
      'Generate new JWT signing keypair',
      'Update AUTH_SECRET in Vercel env',
      'Redeploy: vercel --prod',
      'Invalidate existing sessions (bump token version)',
      'Notify active users of re-login requirement',
    ],
    requires_human_approval: true,
  },
  'SK-RELOAD': {
    domain: 'SkillsEngine', action_type: 'sync', severity: 2,
    description: 'Reload skills registry from SVG engine',
    steps: [
      'Fetch latest SVG skill definitions from /skills/registry',
      'Parse skill metadata and capabilities',
      'Upsert into skills registry',
      'Emit skills.updated event',
    ],
    requires_human_approval: false,
  },
  'UBI-REPOOL': {
    domain: 'UBIPool', action_type: 'autofix', severity: 3,
    description: 'Recalculate UBI pool eligibility and balances',
    steps: [
      'Fetch active citizen roster',
      'Apply eligibility rules (min stake, activity threshold)',
      'Recalculate pool distribution',
      'Update wallet balances via treasury ledger',
      'Log summary to TVM',
    ],
    requires_human_approval: true,
  },
  'LG-RESTART': {
    domain: 'LeadGen', action_type: 'autofix', severity: 2,
    description: 'Restart lead generation scheduler',
    steps: [
      'Kill stale LeadGen process (if VPS: pm2 restart leadgen)',
      'Clear prospect queue backlog',
      'Restart scheduler with fresh config',
      'Verify first prospect emitted within 60 s',
    ],
    requires_human_approval: false,
  },
  'PAY-VERIFY': {
    domain: 'PaymentGateway', action_type: 'diagnostics', severity: 5,
    description: 'Verify PayFast webhook and payment state',
    steps: [
      'Check PayFast webhook delivery logs in PayFast dashboard',
      'Verify PAYFAST_MERCHANT_ID and PAYFAST_MERCHANT_KEY in Vercel env',
      'Test IPN endpoint with test payload',
      'Reconcile last 24 h transactions against treasury',
    ],
    requires_human_approval: true,
  },
  'VPS-SSH-RESTORE': {
    domain: 'BrainVPSSSH', action_type: 'configuration', severity: 5,
    description: 'Add SSH key to VPS authorized_keys via Webway support',
    steps: [
      'Email support@webway.co.za with subject: SSH Key Restoration — Server 102.208.231.53',
      'Attach your SSH public key (~/.ssh/id_rsa.pub)',
      'Wait for Webway to add to /root/.ssh/authorized_keys',
      'Test: ssh root@102.208.231.53',
      'Run vps-fix.sh once access is confirmed',
    ],
    requires_human_approval: true,
  },
  'SSL-DNS-FLIP': {
    domain: 'SubdomainSSL', action_type: 'configuration', severity: 3,
    description: 'Update 6 A records in Webway DNS to 76.76.21.21',
    steps: [
      'Log into Webway DNS panel (or email support@webway.co.za)',
      'Change A records for: ehsa, hospitalinabox, aid, rootedearth, aurora, ubi (.ai-os.co.za) → 76.76.21.21',
      'Wait for DNS propagation (up to 48 h)',
      'Verify SSL provisioning per subdomain in Vercel dashboard',
      'Update SubdomainSSL + WebwayDNS TVM rows to healthy=1',
    ],
    requires_human_approval: true,
  },
  'DNS-PROPAGATE': {
    domain: 'WebwayDNS', action_type: 'diagnostics', severity: 3,
    description: 'Wait for DNS propagation or contact Webway support',
    steps: [
      'Run: dig ehsa.ai-os.co.za (expect 76.76.21.21)',
      'If still old IP: email support@webway.co.za for ETA',
      'Check global propagation at dnschecker.org',
      'Re-run SSL check once propagation confirmed',
    ],
    requires_human_approval: false,
  },
  'OK': {
    domain: null, action_type: 'none', severity: 0,
    description: 'No action required — system healthy',
    steps: [],
    requires_human_approval: false,
  },
};

// ── Topology (for global system map) ─────────────────────────────────────────
// Layer layout in 960×500 SVG:
//   apps (y=80): WordPressSync, MailPipeline, GlobalMapSync, AgentSwarm, SkillsEngine, UBIPool, LeadGen
//   services (y=270): AuthService, BrainOrchestrator, TreasuryAPI, PaymentGateway
//   infra (y=430): BrainVPSSSH, VPSGateway, SubdomainSSL, WebwayDNS
const TOPOLOGY = {
  version: '1.0',
  groups: {
    brain: { label: 'Brain',    color: '#448aff' },
    ops:   { label: 'Ops',      color: '#ff9800' },
    treasury: { label: 'Treasury', color: '#00e676' },
    growth:   { label: 'Growth',   color: '#e040fb' },
  },
  positions: {
    WordPressSync:     [80,   80],  MailPipeline:      [200,  80],
    GlobalMapSync:     [320,  80],  AgentSwarm:        [440,  80],
    SkillsEngine:      [560,  80],  UBIPool:           [700,  80],
    LeadGen:           [840,  80],
    AuthService:       [160, 270],  BrainOrchestrator: [400, 270],
    TreasuryAPI:       [640, 270],  PaymentGateway:    [880, 270],
    BrainVPSSSH:       [120, 430],  VPSGateway:        [320, 430],
    SubdomainSSL:      [560, 430],  WebwayDNS:         [780, 430],
  },
  edges: [
    { from: 'BrainVPSSSH',      to: 'VPSGateway',        type: 'depends_on' },
    { from: 'VPSGateway',       to: 'BrainOrchestrator',  type: 'depends_on' },
    { from: 'WebwayDNS',        to: 'SubdomainSSL',       type: 'depends_on' },
    { from: 'SubdomainSSL',     to: 'BrainOrchestrator',  type: 'depends_on' },
    { from: 'PaymentGateway',   to: 'TreasuryAPI',        type: 'depends_on' },
    { from: 'AuthService',      to: 'BrainOrchestrator',  type: 'depends_on' },
    { from: 'TreasuryAPI',      to: 'BrainOrchestrator',  type: 'depends_on' },
    { from: 'WordPressSync',    to: 'BrainOrchestrator',  type: 'depends_on' },
    { from: 'MailPipeline',     to: 'BrainOrchestrator',  type: 'depends_on' },
    { from: 'GlobalMapSync',    to: 'BrainOrchestrator',  type: 'depends_on' },
    { from: 'AgentSwarm',       to: 'BrainOrchestrator',  type: 'depends_on' },
    { from: 'SkillsEngine',     to: 'BrainOrchestrator',  type: 'depends_on' },
    { from: 'UBIPool',          to: 'TreasuryAPI',        type: 'depends_on' },
    { from: 'LeadGen',          to: 'BrainOrchestrator',  type: 'depends_on' },
  ],
};

// ── Event schema builders ─────────────────────────────────────────────────────
function buildObserverRequest(topic, row) {
  return {
    event_type: 'observer.request', version: '1.0', topic,
    tvm_snapshot: { ...row },
    correlation_id: `${topic}-obs-${Date.now()}`,
    emitted_at: Math.floor(Date.now() / 1000),
  };
}

function buildExecutorRequest(topic, code, rec) {
  return {
    event_type: 'executor.request', version: '1.0', topic,
    recommendation_code: code,
    steps: rec ? rec.steps : [],
    requires_human_approval: rec ? !!rec.requires_human_approval : false,
    correlation_id: `${topic}-exe-${Date.now()}`,
    emitted_at: Math.floor(Date.now() / 1000),
  };
}

function buildTvmUpdated(topic, previous, current, role) {
  return {
    event_type: 'tvm.updated', version: '1.0', topic,
    previous: {
      healthy: previous.healthy, degraded: previous.degraded,
      action_required: previous.action_required, recommendation_code: previous.recommendation_code,
    },
    current: {
      healthy: current.healthy, degraded: current.degraded,
      action_required: current.action_required, recommendation_code: current.recommendation_code,
    },
    changed_by_role: role || 'tvm.system',
    correlation_id: `${topic}-upd-${Date.now()}`,
    emitted_at: Math.floor(Date.now() / 1000),
  };
}

function buildMapUpdated(matrix) {
  return {
    event_type: 'map.updated', version: '1.0',
    nodes: matrix.map(r => ({
      id:               r.topic,
      status:           r.healthy ? 'healthy' : (r.degraded ? 'degraded' : 'unhealthy'),
      action_required:  !!r.action_required,
      autofix_available: !!r.autofix_available,
    })),
    correlation_id: `map-upd-${Date.now()}`,
    emitted_at: Math.floor(Date.now() / 1000),
  };
}

// ── In-memory store ───────────────────────────────────────────────────────────
let _matrix = null;

function makeRow(def, overrides = {}) {
  const base = {
    topic:                 def.topic,
    configured:            overrides.configured            ?? 1,
    healthy:               overrides.healthy               ?? 1,
    degraded:              overrides.degraded              ?? 0,
    action_required:       overrides.action_required       ?? 0,
    autofix_available:     overrides.autofix_available     ?? 0,
    human_approval_needed: overrides.human_approval_needed ?? 0,
    last_updated:          overrides.last_updated          ?? Math.floor(Date.now() / 1000),
    recommendation_code:   overrides.recommendation_code   ?? 'OK',
    risk_score:            overrides.risk_score            ?? def.risk_score ?? 1,
    priority:              overrides.priority              ?? def.priority   ?? 1,
    owner:                 overrides.owner                 ?? def.owner      ?? 'ops',
  };
  base.signature = sign(base);
  return base;
}

const KNOWN_STATE = {
  MailPipeline:      { configured: 1, healthy: 1, degraded: 0, action_required: 0, recommendation_code: 'OK' },
  TreasuryAPI:       { configured: 1, healthy: 1, degraded: 0, action_required: 0, recommendation_code: 'OK' },
  GlobalMapSync:     { configured: 1, healthy: 1, degraded: 0, action_required: 0, recommendation_code: 'OK' },
  WordPressSync:     { configured: 1, healthy: 1, degraded: 0, action_required: 0, recommendation_code: 'OK' },
  VPSGateway:        { configured: 1, healthy: 0, degraded: 1, action_required: 1, autofix_available: 0, human_approval_needed: 1, recommendation_code: 'VPS-RESTART-GW' },
  BrainOrchestrator: { configured: 1, healthy: 1, degraded: 0, action_required: 0, recommendation_code: 'OK' },
  AgentSwarm:        { configured: 1, healthy: 1, degraded: 0, action_required: 0, recommendation_code: 'OK' },
  AuthService:       { configured: 1, healthy: 1, degraded: 0, action_required: 0, recommendation_code: 'OK' },
  SkillsEngine:      { configured: 1, healthy: 1, degraded: 0, action_required: 0, recommendation_code: 'OK' },
  UBIPool:           { configured: 1, healthy: 1, degraded: 0, action_required: 0, recommendation_code: 'OK' },
  LeadGen:           { configured: 1, healthy: 1, degraded: 0, action_required: 0, recommendation_code: 'OK' },
  PaymentGateway:    { configured: 1, healthy: 1, degraded: 0, action_required: 0, recommendation_code: 'OK' },
  BrainVPSSSH:       { configured: 0, healthy: 0, degraded: 1, action_required: 1, autofix_available: 0, human_approval_needed: 1, recommendation_code: 'VPS-SSH-RESTORE' },
  SubdomainSSL:      { configured: 1, healthy: 0, degraded: 1, action_required: 1, autofix_available: 0, human_approval_needed: 1, recommendation_code: 'SSL-DNS-FLIP' },
  WebwayDNS:         { configured: 1, healthy: 0, degraded: 1, action_required: 1, autofix_available: 0, human_approval_needed: 1, recommendation_code: 'DNS-PROPAGATE' },
};

function buildInitialMatrix() {
  const now = Math.floor(Date.now() / 1000);
  return TOPICS.map(def => makeRow(def, { last_updated: now, ...KNOWN_STATE[def.topic] || {} }));
}

// ── Public API ─────────────────────────────────────────────────────────────────
function getMatrix() {
  if (!_matrix) _matrix = buildInitialMatrix();
  return _matrix;
}

function getRow(topic) {
  return getMatrix().find(r => r.topic === topic) || null;
}

function updateRow(topic, agentUpdate) {
  const matrix = getMatrix();
  const idx = matrix.findIndex(r => r.topic === topic);
  if (idx === -1) return { ok: false, error: 'topic not found' };

  const prev = { ...matrix[idx] };
  const role = agentUpdate._role ||
    (agentUpdate._actor === 'human' ? 'tvm.operator' : 'tvm.agent');
  const allowed = ROLE_WRITABLE[role] || ROLE_WRITABLE['tvm.agent'];

  const update = {};
  for (const [k, v] of Object.entries(agentUpdate)) {
    if (k.startsWith('_')) continue;
    if (!allowed.includes(k)) continue;
    update[k] = v;
  }
  update.last_updated = Math.floor(Date.now() / 1000);

  const updated = { ...prev, ...update };
  updated.signature = sign(updated);
  matrix[idx] = updated;
  return { ok: true, row: updated, event: buildTvmUpdated(topic, prev, updated, role) };
}

function approveAction(topic) {
  return updateRow(topic, { _actor: 'human', action_required: 0, human_approval_needed: 0 });
}

function rejectAction(topic) {
  return updateRow(topic, {
    _actor: 'human',
    action_required: 0,
    human_approval_needed: 0,
    autofix_available: 0,
    recommendation_code: 'OK',
  });
}

function agentPropose(topic, proposalCode, justification) {
  const row = getRow(topic);
  if (!row) return { ok: false, error: 'topic not found' };
  const rec = RECOMMENDATION_LIB[proposalCode];
  if (!rec) return { ok: false, error: 'unknown recommendation_code' };

  return {
    ok: true,
    proposal: {
      topic,
      proposal_code: proposalCode,
      justification,
      requires_human_approval: !!row.human_approval_needed || rec.requires_human_approval,
      steps: rec.steps,
      severity: rec.severity,
      ts: Math.floor(Date.now() / 1000),
    },
    event: buildExecutorRequest(topic, proposalCode, rec),
  };
}

function getSummary() {
  const m = getMatrix();
  return {
    total:            m.length,
    healthy:          m.filter(r => r.healthy).length,
    degraded:         m.filter(r => r.degraded).length,
    action_required:  m.filter(r => r.action_required).length,
    pending_approval: m.filter(r => r.human_approval_needed).length,
    autofix_ready:    m.filter(r => r.autofix_available && !r.human_approval_needed).length,
    ts: Math.floor(Date.now() / 1000),
  };
}

function getRecommendation(code) {
  const rec = RECOMMENDATION_LIB[code];
  return rec ? rec.description : 'Unknown recommendation code';
}

function getRecommendationDetail(code) {
  return RECOMMENDATION_LIB[code] || null;
}

function getTopology() { return TOPOLOGY; }

/**
 * orchestrationTick() — One tick of the multi-agent orchestration loop.
 * Returns array of event objects to publish on the bus (no side effects here —
 * callers decide what to do with the events).
 */
function orchestrationTick() {
  const matrix = getMatrix();
  const events = [];

  for (const row of matrix) {
    if (!verifyRow(row)) {
      events.push({ event_type: 'tvm.integrity_violation', version: '1.0', topic: row.topic, emitted_at: Math.floor(Date.now() / 1000) });
      continue;
    }
    if (row.healthy && !row.action_required) continue;

    // Unhealthy and no recommendation → ask observer agent
    if (!row.healthy && (!row.recommendation_code || row.recommendation_code === 'OK')) {
      events.push(buildObserverRequest(row.topic, row));
      continue;
    }
    // Recommendation exists but needs human approval → hold
    if (row.recommendation_code && row.human_approval_needed) continue;

    // Approved and action still required → dispatch executor
    if (row.recommendation_code && !row.human_approval_needed && row.action_required) {
      const rec = RECOMMENDATION_LIB[row.recommendation_code];
      events.push(buildExecutorRequest(row.topic, row.recommendation_code, rec));
    }
  }

  if (matrix.some(r => !r.healthy || r.degraded)) {
    events.push(buildMapUpdated(matrix));
  }
  return events;
}

module.exports = {
  // Core API
  getMatrix, getRow, updateRow, approveAction, rejectAction, agentPropose,
  getSummary, getRecommendation, getRecommendationDetail, verifyRow,
  // Topology & map
  getTopology, buildMapUpdated,
  // Event builders
  buildObserverRequest, buildExecutorRequest, buildTvmUpdated,
  // Orchestration
  orchestrationTick,
  // Reference data (read-only)
  RECOMMENDATION_LIB, TOPOLOGY, ROLES, ROLE_WRITABLE, MANIFEST,
  // Signing utilities (for cross-language verification)
  sign, canonicalPayload,
};
