'use strict';
/**
 * HITL Queue — persistent escalation queue for human review.
 *
 * Used by the recovery layer to escalate ambiguous or high-risk
 * distributions that cannot be safely auto-retried.
 *
 * Table: hitl_queue (created in migration 20260414100000)
 */

const { supabaseAdmin, isConfigured } = require('./supabase');

/**
 * Add an item to the HITL review queue.
 *
 * The unique index on (payment_id) WHERE status='pending' prevents
 * double-queuing the same payment while it's awaiting review.
 *
 * @param {{ type, paymentId, email, amount, reason, meta? }} item
 * @returns {Promise<{ ok: boolean, id?: string, duplicate?: boolean, error?: string }>}
 */
async function enqueue(item) {
  if (!isConfigured) {
    console.warn('[HITL] Supabase not configured — HITL item logged only:', JSON.stringify(item));
    return { ok: false, reason: 'not_configured' };
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('hitl_queue')
      .insert({
        type:        item.type,
        payment_id:  item.paymentId,
        email:       item.email   || null,
        amount_brdg: item.amount  || 0,
        reason:      item.reason,
        meta:        item.meta    || {},
      })
      .select('id')
      .single();

    if (error) {
      // Unique constraint violation → already queued, not an error
      if (error.code === '23505') return { ok: true, duplicate: true };
      throw error;
    }

    return { ok: true, id: data.id };
  } catch (e) {
    console.warn('[HITL] enqueue failed:', e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * List pending HITL items (for admin review endpoints).
 *
 * @param {{ limit?: number, status?: string }} opts
 * @returns {Promise<Array>}
 */
async function list({ limit = 50, status = 'pending' } = {}) {
  if (!isConfigured) return [];
  try {
    const { data } = await supabaseAdmin
      .from('hitl_queue')
      .select('*')
      .eq('status', status)
      .order('created_at', { ascending: true })
      .limit(limit);
    return data || [];
  } catch (e) {
    console.warn('[HITL] list failed:', e.message);
    return [];
  }
}

/**
 * Resolve (approve or reject) a queued item.
 *
 * @param {string} id         - hitl_queue UUID
 * @param {'approved'|'rejected'} decision
 * @param {string} decidedBy
 */
async function resolve(id, decision, decidedBy = 'system') {
  if (!isConfigured) return;
  try {
    await supabaseAdmin
      .from('hitl_queue')
      .update({
        status:     decision,
        decided_by: decidedBy,
        decided_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
  } catch (e) {
    console.warn('[HITL] resolve failed:', e.message);
  }
}

module.exports = { enqueue, list, resolve };
