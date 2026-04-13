// =============================================================================
// BRIDGE AI OS — Workflow Step Implementations
//
// Each step receives (ctx, services) and returns updated ctx.
// ctx is the workflow_runs.context JSONB — accumulates data across all steps.
// services = { supabase, mail, uloe, nurture }
// =============================================================================
'use strict';

// ── AI Scoring ────────────────────────────────────────────────────────────────
// Scores a lead 0–100 based on company, plan_interest, source, and signals.
async function ai_scoring(ctx, { supabase }) {
  let score = 20; // base

  // Plan signals
  if (ctx.plan_interest === 'enterprise') score += 40;
  else if (ctx.plan_interest === 'pro')   score += 25;
  else if (ctx.plan_interest === 'starter') score += 10;

  // Source signals
  if (ctx.source === 'referral') score += 15;
  if (ctx.source === 'ad')       score += 10;
  if (ctx.source === 'web')      score += 5;

  // Company size signals (detect from name)
  const company = (ctx.company || '').toLowerCase();
  if (/group|holdings|corp|ltd|limited|pty|inc/.test(company)) score += 10;

  // Email domain signals (business email)
  const email = (ctx.contact_email || '').toLowerCase();
  const freeProviders = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'];
  const domain = email.split('@')[1] || '';
  if (!freeProviders.includes(domain) && domain) score += 10;

  score = Math.min(100, score);

  // Update crm_contacts lead_score
  await supabase
    .from('crm_contacts')
    .update({ lead_score: score, updated_at: new Date().toISOString() })
    .eq('id', ctx.contact_id);

  return { ...ctx, ai_score: score };
}

// ── Nurture Started ───────────────────────────────────────────────────────────
// Schedules the full nurture email sequence for this contact.
async function nurture_started(ctx, { supabase }) {
  const sequences = [
    { name: 'intro',        delay_hours: 0,   subject: `Welcome to Bridge AI OS, ${ctx.contact_name?.split(' ')[0] || 'there'}!` },
    { name: 'follow_up_1',  delay_hours: 48,  subject: `How is Bridge AI OS fitting your workflow?` },
    { name: 'demo_invite',  delay_hours: 96,  subject: `See Bridge AI in action — schedule your demo` },
    { name: 'follow_up_2',  delay_hours: 168, subject: `Quick question about your AI strategy` },
    { name: 'close_offer',  delay_hours: 240, subject: `Special offer: 14 days free on ${ctx.plan_interest} plan` },
  ];

  const now = new Date();
  const rows = sequences.map((seq, i) => ({
    run_id:        ctx.run_id,
    contact_id:    ctx.contact_id,
    sequence_name: seq.name,
    email_index:   i,
    subject:       seq.subject,
    body_html:     _nurtureHtml(ctx, seq),
    status:        'scheduled',
    scheduled_at:  new Date(now.getTime() + seq.delay_hours * 3600000).toISOString(),
  }));

  await supabase.from('email_sequences').insert(rows);

  return { ...ctx, nurture_emails_scheduled: sequences.length, nurture_started_at: now.toISOString() };
}

// ── Nurture In Progress ───────────────────────────────────────────────────────
// Sends due emails in the sequence. Called by the scheduler cron.
async function nurture_in_progress(ctx, { supabase, mail }) {
  const now = new Date().toISOString();
  const { data: due } = await supabase
    .from('email_sequences')
    .select('*')
    .eq('run_id', ctx.run_id)
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)
    .order('email_index', { ascending: true })
    .limit(1);

  if (!due || due.length === 0) {
    return { ...ctx, nurture_pending: 0 };
  }

  const email = due[0];
  let sent = false;
  let error = null;

  try {
    await mail.send({
      to:      ctx.contact_email,
      subject: email.subject,
      html:    email.body_html,
    });
    sent = true;
  } catch (e) {
    error = e.message;
  }

  await supabase
    .from('email_sequences')
    .update({
      status:  sent ? 'sent' : 'failed',
      sent_at: sent ? new Date().toISOString() : null,
      error:   error,
    })
    .eq('id', email.id);

  // Check if all emails sent
  const { count } = await supabase
    .from('email_sequences')
    .select('id', { count: 'exact', head: true })
    .eq('run_id', ctx.run_id)
    .eq('status', 'scheduled');

  const emails_sent = (ctx.emails_sent || 0) + (sent ? 1 : 0);
  const all_done = (count || 0) === 0;

  return {
    ...ctx,
    emails_sent,
    last_email_sent_at: sent ? new Date().toISOString() : ctx.last_email_sent_at,
    nurture_complete: all_done,
    nurture_pending: count || 0,
  };
}

// ── Nurture Complete ───────────────────────────────────────────────────────────
async function nurture_complete(ctx) {
  return { ...ctx, nurture_completed_at: new Date().toISOString() };
}

// ── Pitch Sent ────────────────────────────────────────────────────────────────
async function pitch_sent(ctx, { mail }) {
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2>Ready to transform your business with Bridge AI?</h2>
      <p>Hi ${ctx.contact_name?.split(' ')[0] || 'there'},</p>
      <p>Based on your interest in our <strong>${ctx.plan_interest}</strong> plan, I wanted to reach out personally.</p>
      <p>Bridge AI OS gives you:</p>
      <ul>
        <li>Full AI agent orchestration for your team</li>
        <li>Automated CRM, billing, and operations</li>
        <li>Blockchain-backed audit trails</li>
        <li>White-label deployment options</li>
      </ul>
      <p><a href="https://bridge-ai-os.com/checkout" style="background:#6366f1;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px">Book a Demo</a></p>
      <p>Best,<br>The Bridge AI Team</p>
    </div>`;

  await mail.send({ to: ctx.contact_email, subject: `${ctx.contact_name?.split(' ')[0] || 'Hi'}, your Bridge AI OS demo awaits`, html });
  return { ...ctx, pitch_sent_at: new Date().toISOString() };
}

// ── Demo Scheduled / Complete ─────────────────────────────────────────────────
async function demo_scheduled(ctx) {
  return { ...ctx, demo_scheduled_at: new Date().toISOString() };
}

async function demo_complete(ctx) {
  return { ...ctx, demo_completed_at: new Date().toISOString() };
}

// ── Quote Generated ───────────────────────────────────────────────────────────
async function quote_generated(ctx, { supabase }) {
  const PLAN_PRICING = {
    free:       { monthly: 0,    annual: 0 },
    starter:    { monthly: 7900, annual: 79000 },
    pro:        { monthly: 24900, annual: 249000 },
    enterprise: { monthly: 99900, annual: 999000 },
  };
  const pricing = PLAN_PRICING[ctx.plan_interest] || PLAN_PRICING.starter;
  const amountCents = pricing.monthly;

  const quoteNumber = `QUO-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  const quoteData = {
    number: quoteNumber,
    plan: ctx.plan_interest,
    amount_cents: amountCents,
    currency: 'USD',
    valid_until: new Date(Date.now() + 7 * 86400000).toISOString(),
    line_items: [
      { description: `Bridge AI OS — ${ctx.plan_interest} plan (monthly)`, qty: 1, unit_cents: amountCents, total_cents: amountCents },
    ],
  };

  return {
    ...ctx,
    quote_number: quoteNumber,
    deal_value_cents: amountCents,
    deal_value_formatted: `$${(amountCents / 100).toFixed(2)}/mo`,
    quote_data: quoteData,
    quote_generated_at: new Date().toISOString(),
  };
}

// ── Quote Sent ────────────────────────────────────────────────────────────────
async function quote_sent(ctx, { mail }) {
  const q = ctx.quote_data || {};
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2>Your Bridge AI OS Quote — ${ctx.quote_number}</h2>
      <p>Hi ${ctx.contact_name?.split(' ')[0] || 'there'},</p>
      <p>Here's your personalised quote:</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr style="background:#f5f5f5"><th style="padding:8px;text-align:left">Plan</th><th style="padding:8px;text-align:right">Monthly</th></tr>
        <tr><td style="padding:8px">Bridge AI OS — ${ctx.plan_interest}</td><td style="padding:8px;text-align:right">${ctx.deal_value_formatted}</td></tr>
      </table>
      <p><a href="https://bridge-ai-os.com/checkout" style="background:#22c55e;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px">Accept Quote & Get Started</a></p>
      <p>This quote is valid for 7 days. Questions? Reply to this email.</p>
      <p>Best,<br>The Bridge AI Team</p>
    </div>`;

  await mail.send({ to: ctx.contact_email, subject: `Your Bridge AI OS quote — ${ctx.quote_number}`, html });
  return { ...ctx, quote_sent_at: new Date().toISOString() };
}

// ── Deal Closed ───────────────────────────────────────────────────────────────
async function deal_closed(ctx, { supabase }) {
  await supabase
    .from('crm_contacts')
    .update({
      status:       'customer',
      funnel_stage: 'closed_won',
      updated_at:   new Date().toISOString(),
    })
    .eq('id', ctx.contact_id);

  return { ...ctx, deal_closed_at: new Date().toISOString() };
}

// ── Invoice Generated ─────────────────────────────────────────────────────────
async function invoice_generated(ctx, { supabase }) {
  const { data: seqRow } = await supabase.rpc('nextval', { sequence_name: 'invoice_seq' }).single();
  const seq = seqRow?.nextval || Date.now();
  const invoiceNumber = `INV-${new Date().getFullYear()}-${String(seq).padStart(6, '0')}`;
  const totalCents = ctx.deal_value_cents || 0;

  return {
    ...ctx,
    invoice_number: invoiceNumber,
    invoice_total_cents: totalCents,
    invoice_total_formatted: `$${(totalCents / 100).toFixed(2)}`,
    invoice_generated_at: new Date().toISOString(),
  };
}

// ── Invoice Sent ──────────────────────────────────────────────────────────────
async function invoice_sent(ctx, { mail }) {
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2>Invoice ${ctx.invoice_number}</h2>
      <p>Hi ${ctx.contact_name?.split(' ')[0] || 'there'},</p>
      <p>Thank you for choosing Bridge AI OS! Here is your invoice:</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr style="background:#f5f5f5"><th style="padding:8px;text-align:left">Description</th><th style="padding:8px;text-align:right">Amount</th></tr>
        <tr><td style="padding:8px">Bridge AI OS — ${ctx.plan_interest} plan</td><td style="padding:8px;text-align:right">${ctx.invoice_total_formatted}</td></tr>
      </table>
      <p><a href="https://bridge-ai-os.com/payment" style="background:#6366f1;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px">Pay Invoice</a></p>
      <p>Invoice #: ${ctx.invoice_number}</p>
    </div>`;

  await mail.send({ to: ctx.contact_email, subject: `Invoice ${ctx.invoice_number} from Bridge AI OS`, html });
  return { ...ctx, invoice_sent_at: new Date().toISOString() };
}

// ── Awaiting Payment ───────────────────────────────────────────────────────────
async function awaiting_payment(ctx) {
  return ctx; // passive — payment webhook updates this
}

// ── Payment Received ───────────────────────────────────────────────────────────
async function payment_received(ctx, { mail }) {
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2>Payment confirmed — Welcome to Bridge AI OS!</h2>
      <p>Hi ${ctx.contact_name?.split(' ')[0] || 'there'},</p>
      <p>Your payment of ${ctx.invoice_total_formatted} has been received. Your account is being set up now.</p>
      <p>You will receive your login details shortly.</p>
    </div>`;

  await mail.send({ to: ctx.contact_email, subject: 'Payment confirmed — Bridge AI OS', html }).catch(() => {});
  return { ...ctx, payment_received_at: new Date().toISOString() };
}

// ── Onboarding Started ────────────────────────────────────────────────────────
async function onboarding_started(ctx, { uloe }) {
  if (uloe) {
    try {
      const result = await uloe.bootstrap({
        email:     ctx.contact_email,
        name:      ctx.contact_name,
        plan:      ctx.plan_interest,
        user_type: 'personal',
        source:    'workflow',
      });
      return { ...ctx, uloe_user_id: result.user_id, onboarding_started_at: new Date().toISOString() };
    } catch (_) {}
  }
  return { ...ctx, onboarding_started_at: new Date().toISOString() };
}

// ── Onboarded ─────────────────────────────────────────────────────────────────
async function onboarded(ctx, { mail }) {
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2>You're all set — Bridge AI OS is ready</h2>
      <p>Hi ${ctx.contact_name?.split(' ')[0] || 'there'},</p>
      <p>Your Bridge AI OS ${ctx.plan_interest} account is live. Here's how to get started:</p>
      <ol>
        <li><a href="https://bridge-ai-os.com/auth-dashboard">Log in to your dashboard</a></li>
        <li>Complete your business profile</li>
        <li>Launch your first AI agent</li>
      </ol>
      <p>Welcome aboard!</p>
    </div>`;

  await mail.send({ to: ctx.contact_email, subject: 'Welcome to Bridge AI OS — you\'re all set!', html }).catch(() => {});
  return { ...ctx, onboarded_at: new Date().toISOString() };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _nurtureHtml(ctx, seq) {
  const first = ctx.contact_name?.split(' ')[0] || 'there';
  const templates = {
    intro: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto"><h2>Welcome to Bridge AI OS, ${first}!</h2><p>Thanks for your interest in Bridge AI OS. We help businesses automate everything — from lead management to invoicing — with AI agents.</p><p><a href="https://bridge-ai-os.com">Explore Bridge AI OS →</a></p></div>`,
    follow_up_1: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto"><h2>How can Bridge AI help ${ctx.company || 'your business'}?</h2><p>Hi ${first}, I wanted to check in — have you had a chance to explore our platform?</p><p><a href="https://bridge-ai-os.com/pricing">View pricing →</a></p></div>`,
    demo_invite: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto"><h2>See Bridge AI OS in action</h2><p>Hi ${first}, let me show you exactly how Bridge AI can save your team 10+ hours a week.</p><p><a href="https://bridge-ai-os.com">Book a 20-minute demo →</a></p></div>`,
    follow_up_2: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto"><h2>Quick question, ${first}</h2><p>What's your biggest challenge right now — lead management, billing, customer support, or something else? I'd love to show you exactly how we solve it.</p></div>`,
    close_offer: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto"><h2>Special offer for ${first}</h2><p>Get 14 days free on our ${ctx.plan_interest} plan. No credit card required.</p><p><a href="https://bridge-ai-os.com/checkout" style="background:#6366f1;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px">Claim your free trial →</a></p></div>`,
  };
  return templates[seq.name] || templates.intro;
}

module.exports = {
  lead_captured:       async (ctx) => ctx,  // no-op — just marks arrival
  ai_scoring,
  nurture_started,
  nurture_in_progress,
  nurture_complete,
  pitch_sent,
  demo_scheduled,
  demo_complete,
  quote_generated,
  quote_sent,
  deal_closed,
  invoice_generated,
  invoice_sent,
  awaiting_payment,
  payment_received,
  onboarding_started,
  onboarded,
};
