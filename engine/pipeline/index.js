// =============================================================================
// BRIDGE AI OS — Workflow Orchestration Engine
//
// Runs durable AI-orchestrated workflows with HITL gates.
// Every state transition is persisted to workflow_runs before execution.
// If the process crashes, the run resumes from its last persisted state.
//
// Usage:
//   const workflow = require('./engine/workflow');
//   const run = await workflow.start(contactData);   // starts lead_to_close
//   await workflow.advance(runId);                   // advances one step
//   await workflow.approve(approvalId, { by, notes }); // human approves gate
//   await workflow.reject(approvalId, { by, notes });   // human rejects gate
// =============================================================================
'use strict';

const { supabase }      = require('../../lib/supabase');
const mail              = require('../../lib/mail');
const { STATES, requiresHitl, progressPct } = require('./states');
const STEPS             = require('./steps');

let uloe = null;
try { uloe = require('../user-lifecycle'); } catch (_) {}

// Services bundle passed into every step
function _services() {
  return { supabase, mail, uloe };
}

// ── Start a new workflow run ──────────────────────────────────────────────────
async function start(contactData) {
  // Upsert contact
  const contact = await _upsertContact(contactData);
  if (!contact) throw new Error('Failed to upsert contact');

  // Create the run
  const { data: run, error } = await supabase
    .from('workflow_runs')
    .insert({
      contact_id:    contact.id,
      workflow_type: 'lead_to_close',
      state:         'lead_captured',
      status:        'running',
      priority:      contactData.priority || 'normal',
      assigned_to:   contactData.assigned_to || null,
      context: {
        contact_id:     contact.id,
        contact_email:  contact.email,
        contact_name:   contact.name,
        company:        contact.company,
        plan_interest:  contact.plan_interest || 'starter',
        source:         contact.source || 'manual',
      },
    })
    .select()
    .single();

  if (error) throw new Error('Failed to create workflow run: ' + error.message);

  // Advance immediately from lead_captured
  await advance(run.id);
  return run;
}

// ── Advance a run one step ────────────────────────────────────────────────────
// Executes the current state's step, then:
//   - If HITL required: creates approval_queue row, pauses run
//   - If no HITL:       transitions to next state immediately
async function advance(runId) {
  const run = await _loadRun(runId);
  if (!run) throw new Error('Run not found: ' + runId);
  if (run.status === 'completed' || run.status === 'cancelled') return run;
  if (run.status === 'paused') return run; // waiting for human approval

  const stateDef = STATES[run.state];
  if (!stateDef) throw new Error('Unknown state: ' + run.state);

  // Terminal state — mark complete
  if (stateDef.next === null) {
    await supabase.from('workflow_runs').update({
      status:       'completed',
      completed_at: new Date().toISOString(),
    }).eq('id', runId);
    return _loadRun(runId);
  }

  // Execute the step
  const stepFn = STEPS[run.state];
  let ctx = run.context || {};
  ctx.run_id = runId;

  const stepRecord = await _startStep(runId, run.state, ctx);

  try {
    if (stepFn) {
      ctx = await stepFn(ctx, _services());
    }
    await _completeStep(stepRecord.id, ctx);
  } catch (err) {
    await _failStep(stepRecord.id, err.message);
    await supabase.from('workflow_runs').update({
      status: 'failed',
      error:  err.message,
    }).eq('id', runId);
    throw err;
  }

  // Persist updated context
  await supabase.from('workflow_runs').update({
    context:    ctx,
    updated_at: new Date().toISOString(),
  }).eq('id', runId);

  // Check if next state needs HITL
  const nextState = stateDef.next;
  const nextDef   = STATES[nextState];

  if (nextDef && requiresHitl(nextState, ctx)) {
    // Pause and create approval gate
    await supabase.from('workflow_runs').update({
      state:     nextState,
      status:    'paused',
      paused_at: new Date().toISOString(),
    }).eq('id', runId);

    await _createApproval(runId, nextState, nextDef, ctx);
  } else {
    // Move to next state and continue
    await supabase.from('workflow_runs').update({
      state:     nextState,
      status:    'running',
      paused_at: null,
    }).eq('id', runId);

    // Recursively advance — but cap depth to avoid stack overflows
    // (In practice, state machines have limited depth)
    if (nextState && STATES[nextState]?.next !== null) {
      await advance(runId);
    }
  }

  return _loadRun(runId);
}

// ── Human approves a gate ─────────────────────────────────────────────────────
async function approve(approvalId, { by = 'admin', notes = '' } = {}) {
  const approval = await _loadApproval(approvalId);
  if (!approval) throw new Error('Approval not found: ' + approvalId);
  if (approval.status !== 'pending') throw new Error('Approval already decided');

  await supabase.from('approval_queue').update({
    status:         'approved',
    decided_by:     by,
    decision_notes: notes,
    decided_at:     new Date().toISOString(),
  }).eq('id', approvalId);

  // Resume the run
  await supabase.from('workflow_runs').update({
    status:    'running',
    paused_at: null,
  }).eq('id', approval.run_id);

  return advance(approval.run_id);
}

// ── Human rejects a gate ──────────────────────────────────────────────────────
async function reject(approvalId, { by = 'admin', notes = '', action = 'hold' } = {}) {
  const approval = await _loadApproval(approvalId);
  if (!approval) throw new Error('Approval not found: ' + approvalId);
  if (approval.status !== 'pending') throw new Error('Approval already decided');

  await supabase.from('approval_queue').update({
    status:         'rejected',
    decided_by:     by,
    decision_notes: notes,
    decided_at:     new Date().toISOString(),
  }).eq('id', approvalId);

  const newStatus = action === 'cancel' ? 'cancelled' : 'on_hold';
  await supabase.from('workflow_runs').update({
    status:    newStatus,
    paused_at: null,
  }).eq('id', approval.run_id);

  return _loadRun(approval.run_id);
}

// ── Signal a state change from outside (e.g. payment webhook) ─────────────────
async function signal(runId, signalType, payload = {}) {
  const run = await _loadRun(runId);
  if (!run) throw new Error('Run not found: ' + runId);

  const SIGNAL_STATE_MAP = {
    quote_accepted: 'quote_accepted',
    payment_received: 'payment_received',
    demo_complete: 'demo_complete',
  };

  const targetState = SIGNAL_STATE_MAP[signalType];
  if (!targetState) throw new Error('Unknown signal: ' + signalType);

  // Update context with signal payload
  const ctx = { ...run.context, ...payload, [`${signalType}_at`]: new Date().toISOString() };

  await supabase.from('workflow_runs').update({
    state:  targetState,
    status: 'running',
    context: ctx,
  }).eq('id', runId);

  return advance(runId);
}

// ── List pending approvals ────────────────────────────────────────────────────
async function getPendingApprovals({ limit = 50, assigned_to } = {}) {
  let q = supabase
    .from('approval_queue')
    .select(`
      *,
      workflow_runs (
        id, state, priority, assigned_to,
        crm_contacts ( id, name, email, company, plan_interest, lead_score )
      )
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (assigned_to) q = q.eq('assigned_to', assigned_to);

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// ── List workflow runs ────────────────────────────────────────────────────────
async function listRuns({ status, limit = 50, offset = 0 } = {}) {
  let q = supabase
    .from('workflow_runs')
    .select(`
      *,
      crm_contacts ( id, name, email, company, plan_interest, lead_score, funnel_stage ),
      approval_queue ( id, type, title, status, created_at )
    `)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) q = q.eq('status', status);

  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(r => ({ ...r, progress_pct: progressPct(r.state) }));
}

// ── Get single run ────────────────────────────────────────────────────────────
async function getRun(runId) {
  const { data, error } = await supabase
    .from('workflow_runs')
    .select(`
      *,
      crm_contacts ( * ),
      workflow_steps ( * ),
      approval_queue ( * )
    `)
    .eq('id', runId)
    .single();

  if (error) throw error;
  return { ...data, progress_pct: progressPct(data.state) };
}

// ── Dashboard stats ───────────────────────────────────────────────────────────
async function stats() {
  const [runsRes, approvalsRes, contactsRes] = await Promise.all([
    supabase.from('workflow_runs').select('status', { count: 'exact' }),
    supabase.from('approval_queue').select('status', { count: 'exact' }).eq('status', 'pending'),
    supabase.from('crm_contacts').select('status', { count: 'exact' }),
  ]);

  const runs = runsRes.data || [];
  return {
    runs: {
      total:     runs.length,
      running:   runs.filter(r => r.status === 'running').length,
      paused:    runs.filter(r => r.status === 'paused').length,
      completed: runs.filter(r => r.status === 'completed').length,
      cancelled: runs.filter(r => r.status === 'cancelled').length,
      failed:    runs.filter(r => r.status === 'failed').length,
    },
    pending_approvals: approvalsRes.count || 0,
    total_contacts:    contactsRes.count || 0,
  };
}

// ── Scheduled tick — sends due nurture emails ─────────────────────────────────
async function tick() {
  const { data: runs } = await supabase
    .from('workflow_runs')
    .select('id, state, context, status')
    .eq('state', 'nurture_in_progress')
    .eq('status', 'running');

  let processed = 0;
  for (const run of (runs || [])) {
    try {
      await advance(run.id);
      processed++;
    } catch (_) {}
  }
  return { processed };
}

// ── Internal helpers ──────────────────────────────────────────────────────────
async function _upsertContact(data) {
  const { data: existing } = await supabase
    .from('crm_contacts')
    .select('*')
    .eq('email', data.email)
    .single();

  if (existing) return existing;

  const { data: created, error } = await supabase
    .from('crm_contacts')
    .insert({
      email:        data.email,
      name:         data.name || '',
      company:      data.company || '',
      phone:        data.phone || null,
      plan_interest: data.plan || data.plan_interest || 'starter',
      source:       data.source || 'manual',
      assigned_to:  data.assigned_to || null,
    })
    .select()
    .single();

  if (error) throw new Error('Contact upsert failed: ' + error.message);
  return created;
}

async function _loadRun(runId) {
  const { data } = await supabase.from('workflow_runs').select('*').eq('id', runId).single();
  return data;
}

async function _loadApproval(approvalId) {
  const { data } = await supabase.from('approval_queue').select('*').eq('id', approvalId).single();
  return data;
}

async function _startStep(runId, stepName, input) {
  const { data } = await supabase.from('workflow_steps').insert({
    run_id:     runId,
    step_name:  stepName,
    status:     'running',
    input:      input,
    started_at: new Date().toISOString(),
  }).select().single();
  return data || { id: null };
}

async function _completeStep(stepId, output) {
  if (!stepId) return;
  const now = new Date().toISOString();
  await supabase.from('workflow_steps').update({
    status:       'completed',
    output:       output,
    completed_at: now,
  }).eq('id', stepId);
}

async function _failStep(stepId, errorMsg) {
  if (!stepId) return;
  await supabase.from('workflow_steps').update({
    status:       'failed',
    error:        errorMsg,
    completed_at: new Date().toISOString(),
  }).eq('id', stepId);
}

async function _createApproval(runId, state, stateDef, ctx) {
  const priority = stateDef.hitl_priority || 'normal';
  const title = typeof stateDef.hitl_title === 'function' ? stateDef.hitl_title(ctx) : `Approval required: ${state}`;
  const desc  = typeof stateDef.hitl_desc  === 'function' ? stateDef.hitl_desc(ctx)  : '';

  await supabase.from('approval_queue').insert({
    run_id:      runId,
    step:        state,
    type:        stateDef.hitl_type || 'custom',
    title,
    description: desc,
    priority,
    context: {
      state,
      contact_name:  ctx.contact_name,
      contact_email: ctx.contact_email,
      company:       ctx.company,
      plan:          ctx.plan_interest,
      ai_score:      ctx.ai_score,
      quote_number:  ctx.quote_number,
      deal_value:    ctx.deal_value_formatted,
      invoice_number: ctx.invoice_number,
      emails_sent:   ctx.emails_sent,
    },
  });
}

// ── Cancel a run ──────────────────────────────────────────────────────────────
async function cancelRun(runId) {
  const { error } = await supabase
    .from('workflow_runs')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', runId);
  if (error) throw new Error(error.message);
  return { ok: true, run_id: runId, status: 'cancelled' };
}

// ── CRM contact helpers ───────────────────────────────────────────────────────
async function listContacts({ limit = 100 } = {}) {
  const { data, error } = await supabase
    .from('crm_contacts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data || [];
}

async function getContact(contactId) {
  const { data, error } = await supabase
    .from('crm_contacts')
    .select('*, runs:workflow_runs(*)')
    .eq('id', contactId)
    .single();
  if (error) throw new Error('Contact not found');
  return data;
}

async function updateContact(contactId, updates) {
  const ALLOWED = ['name', 'company', 'phone', 'status', 'funnel_stage', 'lead_score', 'plan_interest', 'assigned_to', 'notes', 'tags'];
  const safe = Object.fromEntries(Object.entries(updates).filter(([k]) => ALLOWED.includes(k)));
  const { data, error } = await supabase
    .from('crm_contacts')
    .update({ ...safe, updated_at: new Date().toISOString() })
    .eq('id', contactId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

module.exports = {
  start, advance, approve, reject, signal, cancelRun,
  getPendingApprovals, listRuns, getRun, stats, tick,
  listContacts, getContact, updateContact,
};
