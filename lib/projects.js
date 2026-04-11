/**
 * BRIDGE AI OS — Project State Engine
 *
 * Persistent execution containers. Every tool run, agent chain, and
 * output is anchored to a project. Projects are the canonical unit of
 * work inside the platform.
 *
 * Tables (Supabase):
 *   projects        — container metadata + subscription gate + status
 *   project_runs    — individual agent execution records
 *   project_integrations — which external targets this project pushes to
 *
 * All functions are async. Callers must await.
 */

'use strict';

const crypto = require('crypto');
const { supabase, isConfigured } = require('./supabase');

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

// ── Tool → subscription tier map ────────────────────────────────────────────
// toolId values match the /tools/:toolId route namespace
const TOOL_TIERS = {
  'growth-engine':      'starter',
  'marketplace-builder':'pro',
  'avatar-ai':          'starter',
  'neurolink':          'pro',
  'ap2-orchestrator':   'pro',
  'intelligence':       'admin',
  'treasury':           'admin',
  'prime-council':      'enterprise',
  'data-flywheel':      'pro',
  'analytics':          'starter',
};

const TIER_RANK = { free: 0, starter: 1, pro: 2, admin: 3, enterprise: 4 };

/**
 * Check whether a user's subscription covers a given toolId.
 * Returns { ok: boolean, required: string, has: string }
 */
function checkToolAccess(toolId, userTier = 'free') {
  const required = TOOL_TIERS[toolId] || 'starter';
  const ok = (TIER_RANK[userTier] ?? 0) >= (TIER_RANK[required] ?? 1);
  return { ok, required, has: userTier };
}

// ── Projects CRUD ────────────────────────────────────────────────────────────

/**
 * Create a new project for a user.
 *
 * @param {string} userId
 * @param {object} opts - { name, toolId, intent, integrationTargets, scaffold }
 * @returns {object} project row
 */
async function createProject(userId, opts = {}) {
  if (!isConfigured) throw new Error('Supabase not configured');
  const {
    name = 'Untitled Project',
    toolId = null,
    intent = null,
    integrationTargets = [],
    scaffold = null,
  } = opts;

  const now = new Date().toISOString();
  const row = {
    id: uuid(),
    user_id: userId,
    name,
    tool_id: toolId,
    intent,
    integration_targets: integrationTargets,
    scaffold,
    status: 'active',
    run_count: 0,
    output_count: 0,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabase.from('projects').insert(row).select().single();
  if (error) throw new Error(`[projects] create failed: ${error.message}`);
  return data;
}

/**
 * List all projects for a user, newest first.
 */
async function listProjects(userId, { limit = 50, status = null } = {}) {
  if (!isConfigured) return [];
  let q = supabase
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw new Error(`[projects] list failed: ${error.message}`);
  return data || [];
}

/**
 * Get a single project by id. Enforces user ownership.
 */
async function getProject(projectId, userId) {
  if (!isConfigured) return null;
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .eq('user_id', userId)
    .single();
  if (error) return null;
  return data;
}

/**
 * Update project fields (name, status, scaffold, integrationTargets).
 */
async function updateProject(projectId, userId, fields = {}) {
  if (!isConfigured) throw new Error('Supabase not configured');
  const safe = {};
  const allowed = ['name', 'status', 'scaffold', 'intent', 'integration_targets'];
  for (const k of allowed) {
    if (k in fields) safe[k] = fields[k];
  }
  safe.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('projects')
    .update(safe)
    .eq('id', projectId)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) throw new Error(`[projects] update failed: ${error.message}`);
  return data;
}

/**
 * Archive (soft-delete) a project.
 */
async function archiveProject(projectId, userId) {
  return updateProject(projectId, userId, { status: 'archived' });
}

// ── Project Runs ─────────────────────────────────────────────────────────────

/**
 * Record a new agent execution run against a project.
 *
 * @param {string} projectId
 * @param {object} runMeta - { toolId, agentIds, inputs, trigger }
 * @returns {object} run row with run_id
 */
async function createRun(projectId, runMeta = {}) {
  if (!isConfigured) throw new Error('Supabase not configured');
  const now = new Date().toISOString();
  const row = {
    id: uuid(),
    project_id: projectId,
    tool_id: runMeta.toolId || null,
    agent_ids: runMeta.agentIds || [],
    inputs: runMeta.inputs || {},
    trigger: runMeta.trigger || 'manual',
    status: 'running',
    started_at: now,
    completed_at: null,
    result: null,
    error: null,
    latency_ms: null,
    tokens_used: null,
    brdg_cost: null,
  };

  const { data, error } = await supabase.from('project_runs').insert(row).select().single();
  if (error) throw new Error(`[projects] createRun failed: ${error.message}`);

  // Increment run_count on project
  await supabase.rpc('increment_project_runs', { p_id: projectId }).catch(() => {});

  return data;
}

/**
 * Complete a run with result or error. Called by agent pipelines.
 */
async function completeRun(runId, { result = null, error = null, tokensUsed = 0, brdgCost = 0 } = {}) {
  if (!isConfigured) return null;
  const started = await supabase.from('project_runs').select('started_at').eq('id', runId).single();
  const startedAt = started.data?.started_at ? new Date(started.data.started_at) : new Date();
  const latency = Date.now() - startedAt.getTime();

  const { data, err } = await supabase
    .from('project_runs')
    .update({
      status: error ? 'failed' : 'completed',
      result,
      error,
      completed_at: new Date().toISOString(),
      latency_ms: latency,
      tokens_used: tokensUsed,
      brdg_cost: brdgCost,
    })
    .eq('id', runId)
    .select()
    .single();
  if (err) throw new Error(`[projects] completeRun failed: ${err.message}`);
  return data;
}

/**
 * List runs for a project.
 */
async function listRuns(projectId, { limit = 20 } = {}) {
  if (!isConfigured) return [];
  const { data, error } = await supabase
    .from('project_runs')
    .select('*')
    .eq('project_id', projectId)
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`[projects] listRuns failed: ${error.message}`);
  return data || [];
}

module.exports = {
  checkToolAccess,
  TOOL_TIERS,
  TIER_RANK,
  createProject,
  listProjects,
  getProject,
  updateProject,
  archiveProject,
  createRun,
  completeRun,
  listRuns,
};
