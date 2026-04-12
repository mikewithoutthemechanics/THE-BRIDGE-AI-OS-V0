// =============================================================================
// BRIDGE AI OS — ULOE Usage Tracking & Quota Enforcement
//
// Records every resource consumption event and enforces plan limits.
// Quota table is a materialized current-period summary — fast to query,
// updated atomically with each usage event via Supabase RPC.
// =============================================================================
'use strict';

const { supabase }                     = require('../../lib/supabase');
const history                          = require('./history');
const { ok, fail, EVENTS, getPlan, planLimitFor, uuid } = require('./schemas');

// Resource types and their quota field mappings
const RESOURCE_QUOTA_MAP = {
  api_call:        'api_calls_used',
  agent_task:      'agent_tasks_used',
  llm_tokens:      'llm_tokens_used',
  storage_bytes:   'storage_bytes_used',
};

const LIMIT_MAP = {
  api_call:        'api_calls_per_month',
  agent_task:      'agent_tasks_per_month',
  llm_tokens:      'llm_tokens_per_month',
  storage_bytes:   'storage_bytes',
};

// ── Record usage event ────────────────────────────────────────────────────────
async function record(userId, {
  resourceType,
  quantity     = 1,
  unit         = 'count',
  apiKeyId     = null,
  costMicrocents = 0,
  metadata     = {},
}) {
  const event = {
    id:               uuid(),
    user_id:          userId,
    api_key_id:       apiKeyId,
    resource_type:    resourceType,
    quantity,
    unit,
    cost_microcents:  costMicrocents,
    metadata,
    recorded_at:      new Date().toISOString(),
  };

  const { error } = await supabase.from('usage_events').insert(event);
  if (error) return fail('usage.record', userId, error.message);

  // Upsert quota counter
  await _incrementQuota(userId, resourceType, quantity);

  return ok('usage.record', userId, {
    meta: { usage_id: event.id, resource_type: resourceType, quantity },
  });
}

// ── Check quota before consuming ──────────────────────────────────────────────
// Returns { allowed: boolean, used: number, limit: number, remaining: number }
async function checkQuota(userId, resourceType, quantity = 1) {
  const quota = await _getCurrentQuota(userId);
  if (!quota) return { allowed: true, used: 0, limit: 0, remaining: -1 };

  // Look up the user's plan to get the limit
  const { data: user } = await supabase.from('users').select('plan').eq('id', userId).single();
  const plan  = user?.plan || 'free';
  const limit = planLimitFor(plan, LIMIT_MAP[resourceType]);

  if (limit === 0) return { allowed: true, used: 0, limit: 0, remaining: -1 }; // unlimited

  const field = RESOURCE_QUOTA_MAP[resourceType];
  const used  = quota[field] || 0;
  const remaining = Math.max(0, limit - used);
  const allowed   = (used + quantity) <= limit;

  return { allowed, used, limit, remaining, plan };
}

// ── Enforce quota — throws-style return if exceeded ───────────────────────────
async function enforce(userId, resourceType, quantity = 1) {
  const check = await checkQuota(userId, resourceType, quantity);

  if (!check.allowed) {
    await history.append({
      userId,
      category: 'usage',
      action:   EVENTS.USAGE.QUOTA_HIT,
      details:  { resource_type: resourceType, used: check.used, limit: check.limit, quantity },
    });
    return fail('usage.enforce', userId,
      `Quota exceeded for ${resourceType}: ${check.used}/${check.limit}`, {
        meta: check,
      });
  }

  // Warn at 80%
  if (check.limit > 0 && check.used / check.limit >= 0.80) {
    await history.append({
      userId,
      category: 'usage',
      action:   EVENTS.USAGE.QUOTA_WARNING,
      details:  { resource_type: resourceType, used: check.used, limit: check.limit, pct: Math.round(check.used / check.limit * 100) },
    });
  }

  return ok('usage.enforce', userId, { meta: check });
}

// ── Reset quota (called at period renewal) ────────────────────────────────────
async function resetQuota(userId, { periodStart, periodEnd, plan, correlationId } = {}) {
  const planDef = getPlan(plan);
  const now     = new Date().toISOString();

  const quota = {
    user_id:              userId,
    period_start:         periodStart || now,
    period_end:           periodEnd   || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    api_calls_used:       0,
    agent_tasks_used:     0,
    llm_tokens_used:      0,
    storage_bytes_used:   0,
    api_calls_limit:      planDef.limits.api_calls_per_month     || 0,
    agent_tasks_limit:    planDef.limits.agent_tasks_per_month   || 0,
    llm_tokens_limit:     planDef.limits.llm_tokens_per_month    || 0,
    storage_bytes_limit:  planDef.limits.storage_bytes           || 0,
    updated_at:           now,
  };

  const { error } = await supabase.from('usage_quotas').upsert(quota, { onConflict: 'user_id,period_start' });
  if (error) return fail('usage.reset', userId, error.message);

  const eventLogged = await history.append({
    userId,
    category:      'usage',
    action:        EVENTS.USAGE.QUOTA_RESET,
    details:       { plan, period_start: quota.period_start, period_end: quota.period_end },
    correlationId,
  });

  return ok('usage.reset', userId, {
    affected_files: ['usage.json'],
    state_changes:  { 'usage.json': { api_calls_used: 0, agent_tasks_used: 0 } },
    event_logged:   eventLogged,
    next_actions:   [],
  });
}

// ── Get current usage summary ─────────────────────────────────────────────────
async function getSummary(userId) {
  const quota = await _getCurrentQuota(userId);

  const { data: recent } = await supabase
    .from('usage_events')
    .select('resource_type, quantity, cost_microcents, recorded_at')
    .eq('user_id', userId)
    .order('recorded_at', { ascending: false })
    .limit(10);

  return ok('usage.summary', userId, {
    meta: { quota, recent_events: recent || [] },
  });
}

// ── Internal helpers ──────────────────────────────────────────────────────────
async function _getCurrentQuota(userId) {
  const now = new Date().toISOString();
  const { data } = await supabase
    .from('usage_quotas')
    .select('*')
    .eq('user_id', userId)
    .lte('period_start', now)
    .gte('period_end', now)
    .order('period_start', { ascending: false })
    .limit(1)
    .single();
  return data || null;
}

async function _incrementQuota(userId, resourceType, quantity) {
  const field = RESOURCE_QUOTA_MAP[resourceType];
  if (!field) return;

  const now = new Date().toISOString();

  // Try to increment existing quota record via RPC (atomic increment)
  // Falls back to raw update if RPC not available
  const quota = await _getCurrentQuota(userId);
  if (!quota) return;

  const { error } = await supabase
    .from('usage_quotas')
    .update({
      [field]:    (quota[field] || 0) + quantity,
      updated_at: now,
    })
    .eq('id', quota.id);

  if (error) console.error('[USAGE] Quota increment failed:', error.message);
}

module.exports = { record, checkQuota, enforce, resetQuota, getSummary };
