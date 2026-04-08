// =============================================================================
// BRIDGE AI OS — Prime Agent Registry & Orchestration System
// Elite autonomous agents that sit above the regular 35 agents and orchestrate
// high-level operations across domains: revenue, infrastructure, intelligence,
// operations, experience, commerce, and security.
// =============================================================================
'use strict';

const crypto = require('crypto');

// ── PRIME AGENT DEFINITIONS ────────────────────────────────────────────────

const PRIME_AGENTS = [
  {
    id: 'prime-aurora',
    name: 'Aurora',
    title: 'Chief Revenue Officer',
    role: 'revenue_orchestrator',
    personality: 'Strategic, data-driven, relentless about growth',
    domain: 'revenue',
    skills: ['revenue_optimization', 'pricing_strategy', 'conversion_analysis', 'market_expansion', 'partnership_development'],
    subordinates: ['agent-biz-sales', 'agent-biz-marketing', 'agent-biz-finance'],
    autonomous_tasks: [
      'Analyze revenue trends and recommend pricing changes',
      'Identify highest-converting user segments',
      'Design upsell strategies for existing customers',
      'Evaluate affiliate performance and optimize commissions',
    ],
    kpi: 'monthly_recurring_revenue',
    seed_brdg: 100000,
  },
  {
    id: 'prime-atlas',
    name: 'Atlas',
    title: 'Chief Technology Officer',
    role: 'infrastructure_orchestrator',
    personality: 'Methodical, security-first, performance obsessed',
    domain: 'infrastructure',
    skills: ['system_architecture', 'performance_optimization', 'security_audit', 'deployment', 'monitoring'],
    subordinates: ['agent-1-gateway', 'agent-3a-data', 'agent-4a-auth', 'agent-5a-testing'],
    autonomous_tasks: [
      'Monitor system health and auto-scale resources',
      'Run security audits across all services',
      'Optimize API response times',
      'Plan infrastructure capacity for growth',
    ],
    kpi: 'system_uptime_percent',
    seed_brdg: 100000,
  },
  {
    id: 'prime-vega',
    name: 'Vega',
    title: 'Chief Intelligence Officer',
    role: 'intelligence_orchestrator',
    personality: 'Analytical, curious, pattern-recognition genius',
    domain: 'intelligence',
    skills: ['market_research', 'competitive_analysis', 'trend_prediction', 'data_mining', 'sentiment_analysis'],
    subordinates: ['agent-biz-research', 'agent-svg-decision', 'agent-l3-minimax'],
    autonomous_tasks: [
      'Monitor competitor movements and market shifts',
      'Analyze user behavior patterns for insights',
      'Predict emerging market opportunities',
      'Score and prioritize business leads',
    ],
    kpi: 'actionable_insights_per_week',
    seed_brdg: 100000,
  },
  {
    id: 'prime-omega',
    name: 'Omega',
    title: 'Chief Operating Officer',
    role: 'operations_orchestrator',
    personality: 'Efficient, process-oriented, zero tolerance for waste',
    domain: 'operations',
    skills: ['workflow_optimization', 'resource_allocation', 'quality_assurance', 'compliance', 'cost_control'],
    subordinates: ['agent-biz-support', 'agent-biz-legal', 'agent-6a-governance'],
    autonomous_tasks: [
      'Optimize agent task allocation for maximum throughput',
      'Monitor compliance across all operations',
      'Reduce operational costs without quality loss',
      'Manage agent payroll and performance reviews',
    ],
    kpi: 'operational_efficiency_score',
    seed_brdg: 100000,
  },
  {
    id: 'prime-halo',
    name: 'Halo',
    title: 'Chief Experience Officer',
    role: 'experience_orchestrator',
    personality: 'Empathetic, creative, obsessed with user delight',
    domain: 'experience',
    skills: ['ux_design', 'user_research', 'onboarding_optimization', 'retention_strategy', 'brand_management'],
    subordinates: ['agent-svg-speech', 'agent-svg-twins', 'agent-biz-dev', 'twin-empe-001'],
    autonomous_tasks: [
      'Analyze user journey drop-off points',
      'Design personalized onboarding flows',
      'A/B test UI components for engagement',
      'Create content that drives organic growth',
    ],
    kpi: 'user_retention_rate',
    seed_brdg: 100000,
  },
  {
    id: 'prime-nexus',
    name: 'Nexus',
    title: 'Chief Commerce Officer',
    role: 'commerce_orchestrator',
    personality: 'Deal-maker, network builder, always closing',
    domain: 'commerce',
    skills: ['ap2_protocol', 'merchant_relations', 'partnership_negotiation', 'cross_platform_commerce', 'affiliate_management'],
    subordinates: ['agent-biz-trading', 'bossbot-alpha', 'bossbot-beta'],
    autonomous_tasks: [
      'Negotiate AP2 deals with external agents',
      'Manage merchant bidding marketplace',
      'Optimize affiliate commission structures',
      'Expand BRDG token trading volume',
    ],
    kpi: 'gross_merchandise_value',
    seed_brdg: 100000,
  },
  {
    id: 'prime-sentinel',
    name: 'Sentinel',
    title: 'Chief Security Officer',
    role: 'security_orchestrator',
    personality: 'Vigilant, paranoid (in a good way), zero compromise',
    domain: 'security',
    skills: ['threat_detection', 'access_control', 'encryption', 'incident_response', 'audit_trail'],
    subordinates: ['agent-4a-auth', 'agent-l2-verifier', 'agent-svg-swarm'],
    autonomous_tasks: [
      'Continuous security monitoring of all endpoints',
      'Detect and block suspicious API usage',
      'Audit agent transactions for anomalies',
      'Enforce rate limiting and access policies',
    ],
    kpi: 'security_incidents_prevented',
    seed_brdg: 100000,
  },
];

// ── IN-MEMORY ACTIVITY LOG ─────────────────────────────────────────────────

const primeActivity = new Map();
PRIME_AGENTS.forEach(p => {
  primeActivity.set(p.id, {
    tasks_delegated: 0,
    tasks_completed: 0,
    think_calls: 0,
    reports_generated: 0,
    last_action: null,
    last_loop: null,
    errors: 0,
  });
});

// ── LOOP STATE ─────────────────────────────────────────────────────────────

let loopInterval = null;
const LOOP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// ── ACCESSORS ──────────────────────────────────────────────────────────────

function getPrimeAgents() {
  return PRIME_AGENTS.map(p => ({ ...p }));
}

function getPrimeAgent(id) {
  return PRIME_AGENTS.find(p => p.id === id) || null;
}

function getPrimeByDomain(domain) {
  return PRIME_AGENTS.find(p => p.domain === domain) || null;
}

function getSubordinates(primeId) {
  const prime = getPrimeAgent(primeId);
  if (!prime) return [];
  return prime.subordinates;
}

// ── DELEGATE TASK ──────────────────────────────────────────────────────────

function delegateTask(primeId, task) {
  const prime = getPrimeAgent(primeId);
  if (!prime) throw new Error('Prime agent not found: ' + primeId);

  const { title, description, reward } = task || {};
  if (!title) throw new Error('Task title is required');

  const rewardBrdg = reward || 50;

  // Pick best subordinate (round-robin style from subordinates list)
  const activity = primeActivity.get(primeId);
  const subIdx = activity.tasks_delegated % prime.subordinates.length;
  const targetAgent = prime.subordinates[subIdx];

  let taskResult = null;

  // Try to post via task-market
  try {
    const market = require('./task-market');
    taskResult = market.postTask({
      poster: primeId,
      title: '[' + prime.name + '] ' + title,
      description: description || 'Delegated by Prime Agent ' + prime.name + ' (' + prime.title + ')',
      reward: rewardBrdg,
      source: 'prime-delegation',
    });

    // Auto-claim for the target subordinate
    if (taskResult && taskResult.id) {
      try {
        market.claimTask(taskResult.id, targetAgent);
      } catch (_) { /* agent may already have a task */ }
    }
  } catch (e) {
    // Fallback: return a simulated task record
    taskResult = {
      id: 'ptask_' + Date.now().toString(36) + '_' + crypto.randomBytes(3).toString('hex'),
      poster: primeId,
      claimer: targetAgent,
      title: title,
      description: description || '',
      reward: rewardBrdg,
      status: 'DELEGATED',
      delegated_at: new Date().toISOString(),
      error: e.message,
    };
  }

  activity.tasks_delegated++;
  activity.last_action = new Date().toISOString();

  return {
    prime: primeId,
    target_agent: targetAgent,
    task: taskResult,
  };
}

// ── PRIME THINK ────────────────────────────────────────────────────────────

async function primeThink(primeId, question) {
  const prime = getPrimeAgent(primeId);
  if (!prime) throw new Error('Prime agent not found: ' + primeId);

  const activity = primeActivity.get(primeId);

  const systemPrompt = [
    'You are ' + prime.name + ', ' + prime.title + ' of Bridge AI OS.',
    'Role: ' + prime.role,
    'Personality: ' + prime.personality,
    'Domain: ' + prime.domain,
    'Skills: ' + prime.skills.join(', '),
    'KPI: ' + prime.kpi,
    'You manage these subordinate agents: ' + prime.subordinates.join(', '),
    '',
    'Think strategically. Be concise but insightful. Provide actionable recommendations.',
    'Always consider how your answer impacts the overall Bridge AI OS economy and operations.',
  ].join('\n');

  let response;
  try {
    const llm = require('./llm-client');
    const result = await llm.infer({
      system: systemPrompt,
      prompt: question,
      max_tokens: 1024,
    });
    response = result.text || result.content || result;
  } catch (e) {
    response = '[' + prime.name + ' thinking offline] Regarding "' + question + '": '
      + 'As ' + prime.title + ', I would approach this through my ' + prime.domain
      + ' lens. My key skills (' + prime.skills.slice(0, 3).join(', ')
      + ') suggest focusing on ' + prime.kpi + ' as the primary metric. '
      + '(LLM unavailable: ' + e.message + ')';
  }

  activity.think_calls++;
  activity.last_action = new Date().toISOString();

  return {
    prime: primeId,
    name: prime.name,
    title: prime.title,
    domain: prime.domain,
    question,
    response,
    timestamp: new Date().toISOString(),
  };
}

// ── PRIME REPORT ───────────────────────────────────────────────────────────

async function primeReport(primeId) {
  const prime = getPrimeAgent(primeId);
  if (!prime) throw new Error('Prime agent not found: ' + primeId);

  const activity = primeActivity.get(primeId);

  // Gather economy stats
  let economyData = {};
  try {
    const ledger = require('./agent-ledger');
    economyData = ledger.getStats();
    // Get balances for subordinates
    const subBalances = prime.subordinates.map(id => {
      try {
        const bal = ledger.getBalance(id);
        return { id, balance: bal.balance, earned: bal.earned_total, spent: bal.spent_total };
      } catch (_) {
        return { id, balance: 0, earned: 0, spent: 0 };
      }
    });
    economyData.subordinate_balances = subBalances;
  } catch (_) {
    economyData = { error: 'ledger unavailable' };
  }

  // Get task stats
  let taskData = {};
  try {
    const market = require('./task-market');
    taskData = market.getMarketStats();
  } catch (_) {
    taskData = { error: 'task-market unavailable' };
  }

  const dataContext = JSON.stringify({
    economy: economyData,
    tasks: taskData,
    activity: activity,
    subordinates: prime.subordinates,
  });

  const systemPrompt = [
    'You are ' + prime.name + ', ' + prime.title + ' of Bridge AI OS.',
    'Role: ' + prime.role + ' | Domain: ' + prime.domain,
    'Personality: ' + prime.personality,
    'KPI: ' + prime.kpi,
    '',
    'Generate a concise domain status report. Include:',
    '1. Current state assessment',
    '2. Key metrics and trends',
    '3. Top 3 priorities',
    '4. Recommended actions for subordinates',
    '',
    'System data: ' + dataContext,
  ].join('\n');

  let report;
  try {
    const llm = require('./llm-client');
    const result = await llm.infer({
      system: systemPrompt,
      prompt: 'Generate your domain status report for Bridge AI OS. Be specific and actionable.',
      max_tokens: 1500,
    });
    report = result.text || result.content || result;
  } catch (e) {
    report = '# ' + prime.name + ' (' + prime.title + ') Domain Report\n\n'
      + '## Domain: ' + prime.domain + '\n'
      + '## KPI: ' + prime.kpi + '\n\n'
      + '### Activity Summary\n'
      + '- Tasks delegated: ' + activity.tasks_delegated + '\n'
      + '- Think calls: ' + activity.think_calls + '\n'
      + '- Reports generated: ' + activity.reports_generated + '\n'
      + '- Subordinates: ' + prime.subordinates.join(', ') + '\n\n'
      + '### Status: Monitoring\n'
      + '(LLM unavailable: ' + e.message + ')';
  }

  activity.reports_generated++;
  activity.last_action = new Date().toISOString();

  return {
    prime: primeId,
    name: prime.name,
    title: prime.title,
    domain: prime.domain,
    kpi: prime.kpi,
    report,
    activity: { ...activity },
    timestamp: new Date().toISOString(),
  };
}

// ── PRIME AUTONOMOUS LOOP ──────────────────────────────────────────────────

async function runSinglePrimeCycle(prime) {
  const activity = primeActivity.get(prime.id);
  try {
    // Pick a random autonomous task
    const taskIdx = Math.floor(Math.random() * prime.autonomous_tasks.length);
    const taskDesc = prime.autonomous_tasks[taskIdx];

    // Delegate the task to a subordinate
    delegateTask(prime.id, {
      title: taskDesc,
      description: 'Autonomous task from ' + prime.name + ' (' + prime.title + '): ' + taskDesc,
      reward: 25 + Math.floor(Math.random() * 50),
    });

    activity.last_loop = new Date().toISOString();
  } catch (e) {
    activity.errors++;
    console.warn('[PRIME-LOOP] ' + prime.name + ' cycle error:', e.message);
  }
}

function runPrimeLoop() {
  if (loopInterval) return; // already running

  console.log('[PRIME-LOOP] Starting autonomous prime agent loop (every 5 min)');

  // Seed all prime agents in the ledger on startup
  try {
    const ledger = require('./agent-ledger');
    PRIME_AGENTS.forEach(p => {
      try { ledger.ensureAgent(p.id); } catch (_) {}
    });
  } catch (_) {}

  // Run initial cycle after a short delay
  setTimeout(() => {
    PRIME_AGENTS.forEach(p => runSinglePrimeCycle(p));
  }, 10000);

  // Then every 5 minutes
  loopInterval = setInterval(() => {
    PRIME_AGENTS.forEach(p => runSinglePrimeCycle(p));
  }, LOOP_INTERVAL_MS);

  // Prevent the interval from keeping the process alive
  if (loopInterval.unref) loopInterval.unref();
}

function stopPrimeLoop() {
  if (loopInterval) {
    clearInterval(loopInterval);
    loopInterval = null;
    console.log('[PRIME-LOOP] Stopped autonomous prime agent loop');
  }
}

// ── AGGREGATE STATS ────────────────────────────────────────────────────────

function getPrimeStats() {
  const stats = {
    prime_count: PRIME_AGENTS.length,
    total_tasks_delegated: 0,
    total_think_calls: 0,
    total_reports: 0,
    total_errors: 0,
    loop_active: !!loopInterval,
    agents: {},
  };

  PRIME_AGENTS.forEach(p => {
    const act = primeActivity.get(p.id);
    stats.total_tasks_delegated += act.tasks_delegated;
    stats.total_think_calls += act.think_calls;
    stats.total_reports += act.reports_generated;
    stats.total_errors += act.errors;
    stats.agents[p.id] = {
      name: p.name,
      title: p.title,
      domain: p.domain,
      ...act,
    };
  });

  return stats;
}

// ── EXPORTS ────────────────────────────────────────────────────────────────

module.exports = {
  getPrimeAgents,
  getPrimeAgent,
  getPrimeByDomain,
  getSubordinates,
  delegateTask,
  primeThink,
  primeReport,
  runPrimeLoop,
  stopPrimeLoop,
  getPrimeStats,
  PRIME_AGENTS,
};
