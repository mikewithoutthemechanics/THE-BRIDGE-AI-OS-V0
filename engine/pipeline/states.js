// =============================================================================
// BRIDGE AI OS — Workflow State Machine Definition
//
// Each state defines:
//   next       — automatic next state after step completes (null = terminal)
//   hitl       — boolean OR function(ctx) → boolean — whether to pause for human
//   hitl_type  — approval gate type string
//   hitl_title — function(ctx) → string
//   hitl_desc  — function(ctx) → string
//   hitl_priority — 'low' | 'normal' | 'high' | 'urgent'
//   step       — async function(ctx, services) → ctx  (the AI work for this step)
// =============================================================================
'use strict';

const STATES = {

  // ── 1. Lead arrives in the system ──────────────────────────────────────────
  lead_captured: {
    next: 'ai_scoring',
    hitl: false,
  },

  // ── 2. AI scores the lead (0–100) ──────────────────────────────────────────
  ai_scoring: {
    next: 'nurture_started',
    // High-value leads (score >= 75) need a human to confirm routing before nurture
    hitl: (ctx) => (ctx.ai_score || 0) >= 75,
    hitl_type: 'qualify',
    hitl_title: (ctx) => `High-value lead ready: ${ctx.contact_name} (score ${ctx.ai_score})`,
    hitl_desc:  (ctx) => `AI scored ${ctx.contact_name} at ${ctx.ai_score}/100. Interested in ${ctx.plan_interest} plan (${ctx.company}). Confirm routing to nurture sequence.`,
    hitl_priority: 'high',
  },

  // ── 3. Nurture email sequence begins ───────────────────────────────────────
  nurture_started: {
    next: 'nurture_in_progress',
    hitl: false,
  },

  // ── 4. Nurture running (emails sent over days) ─────────────────────────────
  nurture_in_progress: {
    next: 'nurture_complete',
    hitl: false,
  },

  // ── 5. Nurture done — human decides if ready to pitch ──────────────────────
  nurture_complete: {
    next: 'pitch_sent',
    hitl: true,
    hitl_type: 'send_pitch',
    hitl_title: (ctx) => `Ready to pitch ${ctx.contact_name}?`,
    hitl_desc:  (ctx) => `Nurture sequence completed for ${ctx.contact_name} (${ctx.company}). ${ctx.emails_sent || 0} emails sent. Last opened: ${ctx.last_email_opened || 'never'}. Approve sending the sales pitch.`,
    hitl_priority: 'normal',
  },

  // ── 6. Pitch/outreach email sent ───────────────────────────────────────────
  pitch_sent: {
    next: 'demo_scheduled',
    hitl: false,
  },

  // ── 7. Demo scheduled and completed ────────────────────────────────────────
  demo_scheduled: {
    next: 'demo_complete',
    hitl: false,
  },

  demo_complete: {
    next: 'quote_generated',
    hitl: true,
    hitl_type: 'send_quote',
    hitl_title: (ctx) => `Generate & send quote to ${ctx.contact_name}?`,
    hitl_desc:  (ctx) => `Demo completed with ${ctx.contact_name} (${ctx.company}). Proposed plan: ${ctx.plan_interest}. Approve generating and sending the quote.`,
    hitl_priority: 'high',
  },

  // ── 8. Quote generated and sent ────────────────────────────────────────────
  quote_generated: {
    next: 'quote_sent',
    hitl: false,
  },

  quote_sent: {
    next: 'quote_accepted',
    hitl: false,
  },

  // ── 9. Quote accepted — human approves closing the deal ────────────────────
  quote_accepted: {
    next: 'deal_closed',
    hitl: true,
    hitl_type: 'close_deal',
    hitl_title: (ctx) => `Approve deal close: ${ctx.contact_name} — ${ctx.plan_interest}`,
    hitl_desc:  (ctx) => `${ctx.contact_name} accepted the quote. Plan: ${ctx.plan_interest}. Value: ${ctx.deal_value_formatted || `$${ctx.deal_value_cents ? ctx.deal_value_cents / 100 : 0}/mo`}. Approve to close and generate invoice.`,
    hitl_priority: 'urgent',
  },

  // ── 10. Deal closed, invoice generated ─────────────────────────────────────
  deal_closed: {
    next: 'invoice_generated',
    hitl: false,
  },

  invoice_generated: {
    next: 'invoice_sent',
    hitl: true,
    hitl_type: 'send_invoice',
    hitl_title: (ctx) => `Send invoice to ${ctx.contact_name}?`,
    hitl_desc:  (ctx) => `Invoice ${ctx.invoice_number || 'ready'} generated for ${ctx.contact_name}. Total: ${ctx.invoice_total_formatted || '—'}. Approve to send.`,
    hitl_priority: 'high',
  },

  // ── 11. Invoice sent, awaiting payment ─────────────────────────────────────
  invoice_sent: {
    next: 'awaiting_payment',
    hitl: false,
  },

  awaiting_payment: {
    next: 'payment_received',
    hitl: false,
  },

  // ── 12. Payment in — start onboarding ──────────────────────────────────────
  payment_received: {
    next: 'onboarding_started',
    hitl: false,
  },

  onboarding_started: {
    next: 'onboarded',
    hitl: false,
  },

  // ── Terminal states ─────────────────────────────────────────────────────────
  onboarded: {
    next: null,
    hitl: false,
  },

  cancelled: {
    next: null,
    hitl: false,
  },

  on_hold: {
    next: null,   // resumes manually
    hitl: false,
  },
};

// Ordered list for progress bar / display
const STATE_ORDER = [
  'lead_captured',
  'ai_scoring',
  'nurture_started',
  'nurture_in_progress',
  'nurture_complete',
  'pitch_sent',
  'demo_scheduled',
  'demo_complete',
  'quote_generated',
  'quote_sent',
  'quote_accepted',
  'deal_closed',
  'invoice_generated',
  'invoice_sent',
  'awaiting_payment',
  'payment_received',
  'onboarding_started',
  'onboarded',
];

function stateIndex(state) {
  return STATE_ORDER.indexOf(state);
}

function progressPct(state) {
  const idx = stateIndex(state);
  if (idx === -1) return 0;
  return Math.round((idx / (STATE_ORDER.length - 1)) * 100);
}

function requiresHitl(state, ctx) {
  const def = STATES[state];
  if (!def) return false;
  if (typeof def.hitl === 'function') return def.hitl(ctx);
  return !!def.hitl;
}

module.exports = { STATES, STATE_ORDER, stateIndex, progressPct, requiresHitl };
