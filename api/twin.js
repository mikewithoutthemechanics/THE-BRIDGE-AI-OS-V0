// =============================================================================
// BRIDGE AI OS — Digital Twin API
// Manages agent creation, activation, task dispatch, and state.
//
// Endpoints:
//   POST /api/twin/activate     — create or return existing twin for authed user
//   GET  /api/twin/state        — full twin state (agent + CRM metrics + tasks)
//   POST /api/twin/task         — dispatch a task to a named LLM agent
//   GET  /api/twin/tasks        — list recent tasks for this twin
//
// Supabase tables required (see migration at db/twin-migration.sql):
//   agent_twins  — one row per user
//   agent_tasks  — task history, FK → agent_twins.id
// =============================================================================
'use strict';

const crypto = require('crypto');

let supabaseLib = null;
try { supabaseLib = require('../lib/supabase'); } catch (_) {}

let agentExec = null;
try { agentExec = require('../lib/agent-execution-server'); } catch (_) {}

let userLib = null;
try { userLib = require('../lib/user-identity'); } catch (_) {}

const supabase = supabaseLib?.supabase || null;

// ── Capabilities per plan ────────────────────────────────────────────────────
const CAPABILITIES = {
  free:    ['intelligence', 'creative', 'support'],
  starter: ['intelligence', 'creative', 'support', 'nurture', 'campaign'],
  pro:     ['intelligence', 'creative', 'support', 'nurture', 'campaign', 'closer', 'growth', 'finance', 'quote', 'supply'],
  admin:   ['intelligence', 'creative', 'support', 'nurture', 'campaign', 'closer', 'growth', 'finance', 'quote', 'supply'],
};

// ── Deterministic agent ID from user ID ─────────────────────────────────────
function agentIdFor(userId) {
  const salt = process.env.AGENT_SALT || 'bridge-ai-os-v1';
  return 'AGT-' + crypto
    .createHash('sha256')
    .update(userId + salt)
    .digest('hex')
    .slice(0, 16)
    .toUpperCase();
}

// ── Auth helper — extracts user from Authorization or bridge_token cookie ────
function extractToken(req) {
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7);
  const cookies = req.headers['cookie'] || '';
  const match = cookies.match(/bridge_token=([^;]+)/);
  return match ? match[1] : null;
}

async function resolveUser(req) {
  if (!userLib) return null;
  const token = extractToken(req);
  if (!token) return null;
  try {
    return userLib.verifyToken(token);
  } catch (_) {
    return null;
  }
}

// ── GET /api/twin/state ──────────────────────────────────────────────────────
async function getTwinState(req, res) {
  const user = await resolveUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const agent_id = agentIdFor(user.id || user.sub || user.userId);

  // Fetch twin record
  let twin = null;
  if (supabase) {
    const { data } = await supabase
      .from('agent_twins')
      .select('*')
      .eq('user_id', user.id || user.sub || user.userId)
      .single();
    twin = data;
  }

  // Fetch recent tasks (last 10)
  let tasks = [];
  if (supabase && twin) {
    const { data } = await supabase
      .from('agent_tasks')
      .select('id, agent_name, status, input_summary, output_summary, brdg_cost, created_at')
      .eq('twin_id', twin.id)
      .order('created_at', { ascending: false })
      .limit(10);
    tasks = data || [];
  }

  // Fetch CRM stats (real data)
  let crmStats = { contacts: 0, deals: 0, pipeline_value: 0 };
  if (supabase) {
    try {
      const { data: contacts } = await supabase.from('crm_contacts').select('id', { count: 'exact', head: true });
      const { count: contactCount } = await supabase.from('crm_contacts').select('*', { count: 'exact', head: true }).eq('user_id', user.id || user.sub || user.userId);
      const { data: deals } = await supabase.from('crm_deals').select('value').eq('user_id', user.id || user.sub || user.userId);
      crmStats.contacts = contactCount || 0;
      crmStats.deals = deals?.length || 0;
      crmStats.pipeline_value = deals?.reduce((s, d) => s + (parseFloat(d.value) || 0), 0) || 0;
    } catch (_) {}
  }

  res.json({
    ok: true,
    agent: {
      id: agent_id,
      status: twin?.status || 'inactive',
      capabilities: twin?.capabilities || [],
      plan: twin?.plan || 'free',
      activated_at: twin?.activated_at,
      tasks_run: twin?.tasks_run || 0,
      brdg_spent: twin?.brdg_spent || 0,
    },
    twin: twin || null,
    crm: crmStats,
    tasks,
  });
}

// ── POST /api/twin/activate ──────────────────────────────────────────────────
async function activateTwin(req, res) {
  const user = await resolveUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const userId = user.id || user.sub || user.userId;
  const agent_id = agentIdFor(userId);
  const plan = user.plan || 'free';
  const capabilities = CAPABILITIES[plan] || CAPABILITIES.free;

  if (!supabase) {
    // No DB — return ephemeral twin
    return res.json({
      ok: true,
      agent_id,
      status: 'active',
      capabilities,
      plan,
      message: 'Twin activated (ephemeral — no DB)',
    });
  }

  // Upsert twin record — idempotent
  const { data: twin, error } = await supabase
    .from('agent_twins')
    .upsert({
      user_id: userId,
      agent_id,
      status: 'active',
      plan,
      capabilities,
      activated_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
    }, {
      onConflict: 'user_id',
      ignoreDuplicates: false,
    })
    .select()
    .single();

  if (error) {
    console.error('[TWIN] Upsert error:', error);
    return res.status(500).json({ ok: false, error: error.message });
  }

  res.json({
    ok: true,
    agent_id,
    status: twin.status,
    capabilities: twin.capabilities,
    plan: twin.plan,
    activated_at: twin.activated_at,
    twin_id: twin.id,
  });
}

// ── POST /api/twin/task ──────────────────────────────────────────────────────
async function dispatchTask(req, res) {
  const user = await resolveUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const userId = user.id || user.sub || user.userId;
  const { agent_name, input } = req.body || {};

  if (!agent_name || !input) {
    return res.status(400).json({ ok: false, error: 'agent_name and input required' });
  }

  // Validate agent is in user's capabilities
  const plan = user.plan || 'free';
  const allowed = CAPABILITIES[plan] || CAPABILITIES.free;
  if (!allowed.includes(agent_name)) {
    return res.status(403).json({ ok: false, error: `Agent "${agent_name}" not available on ${plan} plan` });
  }

  // Look up twin
  let twinId = null;
  if (supabase) {
    const { data } = await supabase.from('agent_twins').select('id').eq('user_id', userId).single();
    twinId = data?.id;
  }

  // Execute via LLM agent
  let output = null;
  let brdg_cost = 0.5;
  const AGENT_COST = 0.5;

  try {
    if (agentExec && agentExec.executeAgent) {
      output = await agentExec.executeAgent(agent_name, input, { user });
    } else {
      // Fallback: direct LLM call
      const llm = require('../lib/llm-client');
      const prompts = {
        intelligence: 'You are Intelligence AI. Analyse the following and return JSON with insights, opportunities, and recommended actions.',
        creative: 'You are Creative AI. Generate compelling content, copy, or creative direction for the following request. Return JSON.',
        support: 'You are Support AI. Resolve the following support request. Return JSON with solution steps.',
        nurture: 'You are Nurture AI. Create a lead nurture sequence for the following. Return JSON with email sequence.',
        campaign: 'You are Campaign AI. Design a marketing campaign for the following. Return JSON with plan, channels, budget.',
        closer: 'You are Closer AI. Provide closing strategy and scripts for the following deal. Return JSON.',
        growth: 'You are Growth AI. Provide growth strategy for the following. Return JSON with tactics and projections.',
        finance: 'You are Finance AI. Analyse financials and provide recommendations. Return JSON.',
        quote: 'You are QuoteGen AI. Generate a pricing proposal for the following. Return JSON with line items.',
        supply: 'You are Supply AI. Optimise supply chain for the following. Return JSON.',
      };
      const systemPrompt = prompts[agent_name] || 'You are a specialist AI agent. Return structured JSON.';
      const result = await llm.complete({ system: systemPrompt, user: input });
      output = { text: result.text, provider: result.provider };
      brdg_cost = AGENT_COST;
    }
  } catch (err) {
    console.error('[TWIN] Agent execution error:', err.message);
    output = { error: err.message, text: 'Agent execution failed — check LLM configuration.' };
    brdg_cost = 0;
  }

  // Record task in DB
  let taskId = null;
  if (supabase && twinId) {
    const { data: task } = await supabase
      .from('agent_tasks')
      .insert({
        twin_id: twinId,
        user_id: userId,
        agent_name,
        status: output?.error ? 'failed' : 'completed',
        input_summary: input.slice(0, 200),
        output_summary: JSON.stringify(output).slice(0, 500),
        brdg_cost,
      })
      .select('id')
      .single();
    taskId = task?.id;

    // Increment counters on twin
    await supabase.rpc('increment_twin_counters', {
      p_user_id: userId,
      p_brdg: brdg_cost,
    }).catch(() => {
      // Fallback if RPC doesn't exist — direct update
      supabase.from('agent_twins')
        .update({
          tasks_run: supabase.raw ? undefined : undefined,
          last_seen: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .catch(() => {});
    });
  }

  res.json({
    ok: true,
    task_id: taskId,
    agent_name,
    brdg_cost,
    output,
  });
}

// ── GET /api/twin/tasks ──────────────────────────────────────────────────────
async function listTasks(req, res) {
  const user = await resolveUser(req);
  if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const userId = user.id || user.sub || user.userId;

  if (!supabase) return res.json({ ok: true, tasks: [] });

  const { data: tasks, error } = await supabase
    .from('agent_tasks')
    .select('id, agent_name, status, input_summary, output_summary, brdg_cost, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, tasks: tasks || [] });
}

// ── Router ───────────────────────────────────────────────────────────────────
async function handleTwin(req, res) {
  const p = (req.path || req.url || '').split('?')[0];

  if (p === '/api/twin/activate' && req.method === 'POST') return activateTwin(req, res);
  if (p === '/api/twin/state'    && req.method === 'GET')  return getTwinState(req, res);
  if (p === '/api/twin/task'     && req.method === 'POST') return dispatchTask(req, res);
  if (p === '/api/twin/tasks'    && req.method === 'GET')  return listTasks(req, res);

  return null; // not handled — let next middleware proceed
}

module.exports = { handleTwin };
