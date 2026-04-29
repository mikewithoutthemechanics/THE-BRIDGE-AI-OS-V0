/**
 * BRIDGE AI OS — Output Registry
 *
 * Every project execution produces a tracked, deterministic output.
 * Outputs are the deliverables of the platform — exported artifacts,
 * integration payloads, or webhook dispatches.
 *
 * Output lifecycle:
 *   pending → generating → ready → (exported | integrated | failed)
 *
 * Tables (Supabase):
 *   outputs — canonical output records with format, destination, status
 *
 * All functions async.
 */

'use strict';

const crypto = require('crypto');
const { supabase, isConfigured } = require('./supabase');

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

// ── Output types + formats ────────────────────────────────────────────────────

const OUTPUT_TYPES = ['export', 'integration', 'hybrid'];
const OUTPUT_FORMATS = ['json', 'markdown', 'zip', 'repo', 'api', 'webhook', 'bundle', 'report'];

// ── Create ───────────────────────────────────────────────────────────────────

/**
 * Register a new output for a project run.
 *
 * @param {string} projectId
 * @param {string} runId
 * @param {object} opts - { type, format, destination, title, userId }
 * @returns {object} output row
 */
async function createOutput(projectId, runId, opts = {}) {
  if (!isConfigured) throw new Error('Supabase not configured');

  const {
    type = 'export',
    format = 'json',
    destination = null,   // URL, channel ID, repo slug, etc.
    title = null,
    userId = null,
    payload = null,       // initial payload (may be null until generation)
  } = opts;

  if (!OUTPUT_TYPES.includes(type)) throw new Error(`Invalid output type: ${type}`);
  if (!OUTPUT_FORMATS.includes(format)) throw new Error(`Invalid output format: ${format}`);

  const now = new Date().toISOString();
  const row = {
    id: uuid(),
    project_id: projectId,
    run_id: runId,
    user_id: userId,
    title: title || `Output ${new Date().toLocaleDateString()}`,
    type,
    format,
    destination,
    payload,
    status: 'pending',
    delivery_attempts: 0,
    last_attempt_at: null,
    delivered_at: null,
    error: null,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabase.from('outputs').insert(row).select().single();
  if (error) throw new Error(`[outputs] create failed: ${error.message}`);

  // Bump output count on project
  await supabase.rpc('increment_project_outputs', { p_id: projectId }).catch(() => {});

  return data;
}

// ── Read ─────────────────────────────────────────────────────────────────────

/**
 * Get a single output by ID.
 */
async function getOutput(outputId, userId = null) {
  if (!isConfigured) return null;
  let q = supabase.from('outputs').select('*').eq('id', outputId);
  if (userId) q = q.eq('user_id', userId);
  const { data, error } = await q.single();
  if (error) return null;
  return data;
}

/**
 * List outputs for a project, newest first.
 */
async function listOutputs(projectId, { limit = 50, status = null } = {}) {
  if (!isConfigured) return [];
  let q = supabase
    .from('outputs')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw new Error(`[outputs] list failed: ${error.message}`);
  return data || [];
}

/**
 * List all outputs for a user across all projects.
 */
async function listUserOutputs(userId, { limit = 100, type = null } = {}) {
  if (!isConfigured) return [];
  let q = supabase
    .from('outputs')
    .select('*, projects(name, tool_id)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (type) q = q.eq('type', type);
  const { data, error } = await q;
  if (error) throw new Error(`[outputs] listUser failed: ${error.message}`);
  return data || [];
}

// ── Update ────────────────────────────────────────────────────────────────────

/**
 * Attach the generated payload to an output and mark it ready.
 */
async function setOutputReady(outputId, payload) {
  if (!isConfigured) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('outputs')
    .update({
      payload,
      status: 'ready',
      updated_at: new Date().toISOString(),
    })
    .eq('id', outputId)
    .select()
    .single();
  if (error) throw new Error(`[outputs] setReady failed: ${error.message}`);
  return data;
}

/**
 * Mark an output as delivered (integration success or export downloaded).
 */
async function markDelivered(outputId, { note = null } = {}) {
  if (!isConfigured) return null;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('outputs')
    .update({
      status: 'delivered',
      delivered_at: now,
      updated_at: now,
      error: null,
    })
    .eq('id', outputId)
    .select()
    .single();
  if (error) throw new Error(`[outputs] markDelivered failed: ${error.message}`);
  return data;
}

/**
 * Record a delivery failure and increment retry counter.
 */
async function markFailed(outputId, errorMsg) {
  if (!isConfigured) return null;
  const now = new Date().toISOString();

  // Fetch current attempt count
  const { data: current } = await supabase
    .from('outputs').select('delivery_attempts').eq('id', outputId).single();
  const attempts = (current?.delivery_attempts || 0) + 1;

  const { data, error } = await supabase
    .from('outputs')
    .update({
      status: attempts >= 3 ? 'failed' : 'retry',
      error: errorMsg,
      delivery_attempts: attempts,
      last_attempt_at: now,
      updated_at: now,
    })
    .eq('id', outputId)
    .select()
    .single();
  if (error) throw new Error(`[outputs] markFailed failed: ${error.message}`);
  return data;
}

// ── Export helpers ─────────────────────────────────────────────────────────

/**
 * Build a downloadable export bundle from an output's payload.
 * Returns { contentType, filename, body }.
 */
function buildExportBundle(output) {
  const safe = (output.title || 'output').replace(/[^a-z0-9-_]/gi, '-').toLowerCase();
  const ts = new Date(output.created_at).toISOString().slice(0, 10);

  switch (output.format) {
    case 'json':
      return {
        contentType: 'application/json',
        filename: `${safe}-${ts}.json`,
        body: JSON.stringify(output.payload, null, 2),
      };
    case 'markdown':
    case 'report':
      return {
        contentType: 'text/markdown',
        filename: `${safe}-${ts}.md`,
        body: typeof output.payload === 'string'
          ? output.payload
          : `# ${output.title}\n\n${JSON.stringify(output.payload, null, 2)}`,
      };
    case 'bundle':
    case 'zip':
      // Caller must handle binary — return JSON envelope
      return {
        contentType: 'application/json',
        filename: `${safe}-${ts}.json`,
        body: JSON.stringify({ bundle: output.payload, format: output.format }, null, 2),
      };
    default:
      return {
        contentType: 'application/json',
        filename: `${safe}-${ts}.json`,
        body: JSON.stringify(output.payload, null, 2),
      };
  }
}

module.exports = {
  OUTPUT_TYPES,
  OUTPUT_FORMATS,
  createOutput,
  getOutput,
  listOutputs,
  listUserOutputs,
  setOutputReady,
  markDelivered,
  markFailed,
  buildExportBundle,
};
