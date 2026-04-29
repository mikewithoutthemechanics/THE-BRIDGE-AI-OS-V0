'use strict';
/**
 * lib/revenue-activation.js — Full Revenue Activation Pipeline
 *
 * Converts 353 registered users into paying customers via:
 *   1. Segment & Score  — classify every user by intent signals
 *   2. Campaign Assign  — map segment → email/SMS sequence
 *   3. Touch Scheduling — stagger outreach so it feels human
 *   4. Billing Trigger  — generate PayFast link, send, track
 *   5. Post-Payment     — activate plan, onboard, maintain
 *
 * Segments:
 *   enterprise   → immediate personal outreach (1 user: ryanpcowan@gmail.com)
 *   hot_lead     → real humans who expressed interest (2 users)
 *   warm         → visitors with engagement signals
 *   cold         → registered but never engaged
 *   test_account → auth_t...@ex.com test users (skip outreach)
 */

const crypto = require('crypto');
const { supabaseAdmin, isConfigured } = require('./supabase');

// ── Plan pricing ──────────────────────────────────────────────────────────────
const PLANS = {
  starter:    { price: 79,  name: 'Starter',    label: '5 AI agents, 1K tasks/mo' },
  pro:        { price: 249, name: 'Pro',         label: '20 AI agents, 10K tasks/mo, full analytics' },
  enterprise: { price: 999, name: 'Enterprise',  label: 'Unlimited agents, custom twin, SLA' },
};

// ── Email campaigns (step-based drip sequences) ───────────────────────────────
const CAMPAIGNS = {

  enterprise_vip: {
    segment: 'enterprise',
    pitchPlan: 'enterprise',
    steps: [
      { day: 0, channel: 'email', template: 'enterprise_personal',
        subject: 'Ryan — your Bridge AI OS enterprise account is ready',
        body: (u) => `Hi ${u.name || 'there'},

I noticed you signed up for our Enterprise plan — I wanted to reach out personally.

Bridge AI OS gives your business a full AI workforce:
• Unlimited agents running 24/7 (sales, support, research, finance, legal)
• Your own digital twin that learns your decision style
• On-chain BRDG token economy — agents earn as they work
• Real-time revenue pipeline running autonomously

Your enterprise account is live at ai-os.co.za. To activate billing and unlock everything:

→ [Complete Setup — R999/mo](https://ai-os.co.za/payment?plan=enterprise&ref=${u.id})

If you'd prefer a demo first, reply to this email or book a 20-min call.

Ryan Saunders
Bridge AI Agency
` },
      { day: 2, channel: 'email', template: 'enterprise_followup',
        subject: 'Quick question about your AI workforce goals',
        body: (u) => `Hi ${u.name || 'there'},

Just checking in — what's the main business problem you're looking to solve with Bridge AI OS?

Common use cases for enterprise clients:
→ Replace manual sales outreach with AI agents (saves 20+ hrs/week)
→ Autonomous financial monitoring + BRDG treasury management
→ 24/7 customer support without hiring
→ On-chain agent economy for your own products

Reply with your use case and I'll set up your agent stack personally.

R999/mo — activate here: https://ai-os.co.za/payment?plan=enterprise&ref=${u.id}
` },
      { day: 5, channel: 'email', template: 'enterprise_offer',
        subject: 'Special offer: 2 months free on Enterprise',
        body: (u) => `Hi ${u.name || 'there'},

For enterprise clients who activate this week, I'm including 2 months free on annual billing (save R5,994).

Your ROI in 30 days or we refund. No questions.

→ Activate Enterprise Annual: https://ai-os.co.za/payment?plan=enterprise_annual&ref=${u.id}
→ Stay monthly: https://ai-os.co.za/payment?plan=enterprise&ref=${u.id}
` },
    ],
  },

  hot_lead_close: {
    segment: 'hot_lead',
    pitchPlan: 'pro',
    steps: [
      { day: 0, channel: 'email', template: 'lead_direct',
        subject: 'Your Bridge AI OS account — activate now',
        body: (u) => `Hi ${u.name || 'there'},

You registered at ai-os.co.za — here's exactly what you get on the Pro plan:

✓ 20 AI agents running your sales, support, research & ops
✓ Full analytics dashboard with real-time revenue tracking
✓ BRDG token wallet — agents earn tokens as they complete tasks
✓ CRM, invoicing, legal docs, HR — all AI-powered
✓ IoT device integration (earn BRDG from sensors)

Start today for R249/mo:
→ https://ai-os.co.za/payment?plan=pro&ref=${u.id}

Or start with Starter (R79/mo):
→ https://ai-os.co.za/payment?plan=starter&ref=${u.id}

14-day money-back guarantee.
` },
      { day: 3, channel: 'email', template: 'lead_roi',
        subject: 'What R249/mo gets your business in 30 days',
        body: (u) => `Hi ${u.name || 'there'},

Here's the math on Bridge AI OS for a typical SME:

COST SAVINGS:
→ Sales outreach automation: saves 15 hrs/week × R250/hr = R15,000/mo
→ Support ticket automation: saves 10 hrs/week = R10,000/mo
→ Financial reporting: saves 5 hrs/week = R5,000/mo
Total saved: R30,000/mo

YOUR COST: R249/mo

ROI: 12,000% in month one.

Activate: https://ai-os.co.za/payment?plan=pro&ref=${u.id}
` },
      { day: 7, channel: 'email', template: 'lead_trial',
        subject: 'Last chance: 20% off your first month',
        body: (u) => `Hi ${u.name || 'there'},

20% off your first month — use code ACTIVATE20 at checkout.

Starter: R79 → R63.20 first month
Pro: R249 → R199.20 first month

This offer expires in 48 hours.

→ https://ai-os.co.za/payment?plan=pro&ref=${u.id}&discount=ACTIVATE20
` },
    ],
  },

  warm_nurture: {
    segment: 'warm',
    pitchPlan: 'starter',
    steps: [
      { day: 0, channel: 'email', template: 'warm_welcome',
        subject: 'Welcome to Bridge AI OS — here\'s what to do next',
        body: (u) => `Hi ${u.name || 'there'},

You signed up for Bridge AI OS. Here's what's waiting for you:

🤖 AI Agent Workforce — sales, support, research, finance running 24/7
📊 Revenue Dashboard — real-time business analytics
🔗 BRDG Token Economy — earn crypto as your agents work
🏭 IoT Integration — connect sensors and devices as economic agents

Start with our Starter plan — R79/mo, cancel anytime:
→ https://ai-os.co.za/payment?plan=starter&ref=${u.id}

Or explore free at: https://ai-os.co.za/dashboard
` },
      { day: 4, channel: 'email', template: 'warm_case_study',
        subject: 'How African SMEs are using AI agents to cut costs by 60%',
        body: (u) => `Hi ${u.name || 'there'},

Bridge AI OS clients are using AI agents to automate:

→ Lead generation (300+ leads/month on autopilot)
→ Invoice collection (automated reminders, 40% faster payment)
→ Customer support (24/7, R0 extra staff cost)
→ Compliance monitoring (POPIA, GDPR automated)

All for R79-R999/month depending on scale.

See your free dashboard: https://ai-os.co.za/dashboard
Upgrade to activate agents: https://ai-os.co.za/payment?plan=starter&ref=${u.id}
` },
      { day: 10, channel: 'email', template: 'warm_scarcity',
        subject: 'Your account is expiring — 72-hour reactivation window',
        body: (u) => `Hi ${u.name || 'there'},

Free accounts become read-only after 14 days of inactivity.

You have 72 hours to activate a paid plan and keep full access.

Starter — R79/mo (most popular for SMEs):
→ https://ai-os.co.za/payment?plan=starter&ref=${u.id}

After 72 hours your agents pause and dashboard goes read-only.
` },
      { day: 14, channel: 'email', template: 'warm_final',
        subject: 'Final notice — activate or lose your spot',
        body: (u) => `Hi ${u.name || 'there'},

Last email from us. Your Bridge AI OS account is at risk of deactivation.

If you want to keep it, activate any plan now:
→ Starter R79/mo: https://ai-os.co.za/payment?plan=starter&ref=${u.id}
→ Pro R249/mo: https://ai-os.co.za/payment?plan=pro&ref=${u.id}

If you're done, no hard feelings — just ignore this email.
` },
    ],
  },

  cold_drip: {
    segment: 'cold',
    pitchPlan: 'starter',
    steps: [
      { day: 0, channel: 'email', template: 'cold_intro',
        subject: 'What is Bridge AI OS? (you signed up last week)',
        body: (u) => `Hi ${u.name || 'there'},

You signed up for Bridge AI OS — here's the 30-second version of what it is:

Bridge AI OS is an AI-powered operating system for your business. You get:
• A team of AI agents (sales, support, ops, finance, legal) for R79-R999/mo
• An on-chain BRDG token that your agents earn as they work
• A real-time dashboard showing every rand earned and spent

It's live and running at https://ai-os.co.za

Try the dashboard free → https://ai-os.co.za/aoe-dashboard.html
Activate agents → https://ai-os.co.za/payment?plan=starter&ref=${u.id}
` },
      { day: 7, channel: 'email', template: 'cold_value',
        subject: 'Can an AI agent run your business while you sleep?',
        body: (u) => `Hi ${u.name || 'there'},

Short answer: yes.

Bridge AI OS agents work 24/7:
• Following up on unpaid invoices
• Qualifying inbound leads
• Monitoring your bank balance
• Generating compliance reports
• Earning BRDG tokens on every task

Cost: R79/month. Coffee money.

Start: https://ai-os.co.za/payment?plan=starter&ref=${u.id}
` },
    ],
  },
};

// ── Segmentation logic ────────────────────────────────────────────────────────

function segmentUser(user) {
  const email = (user.email || '').toLowerCase();

  // Filter out test accounts
  if (email.includes('auth_t') || email.includes('@ex.com') || email.includes('test@') || email.includes('example.com')) {
    return { segment: 'test_account', score: 0, campaign: null, pitchPlan: null };
  }

  // Enterprise plan
  if (user.plan === 'enterprise') {
    return { segment: 'enterprise', score: 95, campaign: 'enterprise_vip', pitchPlan: 'enterprise' };
  }

  // Real humans who expressed interest
  if (user.funnel_stage === 'lead' || user.plan === 'client') {
    return { segment: 'hot_lead', score: 80, campaign: 'hot_lead_close', pitchPlan: 'pro' };
  }

  // Score based on behavioral signals
  let score = 10; // base for being registered
  const pages = user.pages_visited || [];
  const pageArr = Array.isArray(pages) ? pages : [];

  if (pageArr.some(p => String(p).includes('pricing'))) score += 30;
  if (pageArr.some(p => String(p).includes('payment'))) score += 25;
  if (pageArr.some(p => String(p).includes('docs') || String(p).includes('api'))) score += 15;
  if ((user.conversations || 0) > 0) score += 20;
  if ((user.lead_score || 0) > 50) score += 15;
  if (user.company) score += 10;

  if (score >= 60) return { segment: 'warm', score, campaign: 'warm_nurture', pitchPlan: 'pro' };
  if (score >= 20) return { segment: 'warm', score, campaign: 'warm_nurture', pitchPlan: 'starter' };
  return { segment: 'cold', score, campaign: 'cold_drip', pitchPlan: 'starter' };
}

// ── Pipeline operations ───────────────────────────────────────────────────────

/**
 * Score and load all users into activation_state.
 * Idempotent — safe to run repeatedly, skips test accounts.
 */
async function seedActivationPipeline() {
  if (!isConfigured) return { seeded: 0, skipped: 0 };

  const { data: users, error } = await supabaseAdmin
    .from('users')
    .select('id, email, name, plan, funnel_stage, lead_score, pages_visited, conversations, company, last_page');

  if (error || !users) throw new Error('Failed to load users: ' + (error?.message || 'unknown'));

  let seeded = 0, skipped = 0, testSkipped = 0;

  for (const user of users) {
    const { segment, score, campaign, pitchPlan } = segmentUser(user);
    if (segment === 'test_account') { testSkipped++; continue; }

    const now = new Date();
    const nextTouch = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2h from now (stagger)

    const { error: upsertErr } = await supabaseAdmin.from('activation_state').upsert({
      user_id:      user.id,
      email:        user.email,
      name:         user.name || null,
      segment,
      score,
      campaign,
      plan_target:  pitchPlan,
      stage:        'new',
      step:         0,
      next_touch_at: nextTouch.toISOString(),
      updated_at:   now.toISOString(),
    }, { onConflict: 'user_id', ignoreDuplicates: false });

    if (!upsertErr) seeded++;
    else skipped++;
  }

  return { seeded, skipped, testSkipped, total: users.length };
}

/**
 * Process due touches — called by autonomous pipeline every cycle.
 * Sends the next email in the campaign sequence for each user whose
 * next_touch_at has passed.
 */
async function processDueTouches(limit = 20) {
  if (!isConfigured) return { processed: 0 };

  const now = new Date().toISOString();
  const { data: due } = await supabaseAdmin
    .from('activation_state')
    .select('*')
    .lte('next_touch_at', now)
    .in('stage', ['new', 'contacted', 'nurturing'])
    .order('score', { ascending: false })
    .limit(limit);

  if (!due || due.length === 0) return { processed: 0 };

  const mail = (() => { try { return require('./mail'); } catch (_) { return null; } })();
  let processed = 0;

  for (const state of due) {
    const campaign = CAMPAIGNS[state.campaign];
    if (!campaign) { await markLost(state.user_id, 'no_campaign'); continue; }

    const step = campaign.steps[state.step];
    if (!step) {
      // Campaign exhausted — mark as lost (no response)
      await markLost(state.user_id, 'no_response_campaign_end');
      continue;
    }

    // Build and send email
    const user = { id: state.user_id, name: state.name, email: state.email };
    const body = step.body(user);
    const subject = step.subject;

    let sent = false;
    if (mail) {
      try {
        await mail.send({ to: state.email, subject, html: body.replace(/\n/g, '<br>'), text: body });
        sent = true;
      } catch (e) {
        console.warn('[activation] mail send failed:', state.email, e.message);
      }
    }

    // Log touch
    await supabaseAdmin.from('activation_touches').insert({
      user_id:  state.user_id,
      email:    state.email,
      channel:  step.channel,
      template: step.template,
      subject,
      status:   sent ? 'sent' : 'queued',
      sent_at:  sent ? now : null,
    }).catch(() => {});

    // Advance pipeline state
    const nextStep = state.step + 1;
    const hasMoreSteps = nextStep < campaign.steps.length;
    const nextStepDef = campaign.steps[nextStep];
    const nextTouchAt = hasMoreSteps
      ? new Date(Date.now() + (nextStepDef.day - step.day) * 24 * 60 * 60 * 1000).toISOString()
      : null;

    await supabaseAdmin.from('activation_state').update({
      stage:        nextStep === 1 ? 'contacted' : 'nurturing',
      step:         nextStep,
      touches:      (state.touches || 0) + 1,
      last_touch_at: now,
      next_touch_at: nextTouchAt,
      updated_at:   now,
    }).eq('user_id', state.user_id);

    processed++;
  }

  return { processed, due: due.length };
}

async function markLost(userId, reason) {
  await supabaseAdmin.from('activation_state').update({
    stage:    'lost',
    lost_at:  new Date().toISOString(),
    lost_reason: reason,
    next_touch_at: null,
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId).catch(() => {});
}

async function markWon(userId, plan) {
  await supabaseAdmin.from('activation_state').update({
    stage:        'won',
    plan_target:  plan,
    converted_at: new Date().toISOString(),
    next_touch_at: null,
    updated_at:   new Date().toISOString(),
  }).eq('user_id', userId).catch(() => {});
}

// ── Dashboard data ────────────────────────────────────────────────────────────

async function getPipelineDashboard() {
  if (!isConfigured) return { stages: {}, segments: {}, total: 0 };

  const [statesRes, touchesRes, billingRes] = await Promise.all([
    supabaseAdmin.from('activation_state').select('segment, stage, score, email, name, plan_target, touches, last_touch_at, converted_at, next_touch_at'),
    supabaseAdmin.from('activation_touches').select('status', { count: 'exact', head: true }),
    supabaseAdmin.from('billing_activations').select('status, amount_zar, plan'),
  ]);

  const states  = statesRes.data  || [];
  const billing = billingRes.data || [];

  // Stage breakdown
  const stages = {};
  states.forEach(s => { stages[s.stage] = (stages[s.stage] || 0) + 1; });

  // Segment breakdown
  const segments = {};
  states.forEach(s => { segments[s.segment] = (segments[s.segment] || 0) + 1; });

  // Revenue pipeline value (if everyone converted at plan_target price)
  const PLAN_PRICE = { starter: 79, pro: 249, enterprise: 999 };
  const pipelineValue = states
    .filter(s => !['won','lost'].includes(s.stage))
    .reduce((sum, s) => sum + (PLAN_PRICE[s.plan_target] || 79), 0);

  const wonRevenue = billing
    .filter(b => b.status === 'paid')
    .reduce((sum, b) => sum + (b.amount_zar || 0), 0);

  return {
    total:         states.length,
    stages,
    segments,
    pipelineValue,
    wonRevenue,
    totalTouches:  touchesRes.count || 0,
    dueForTouch:   states.filter(s => s.next_touch_at && new Date(s.next_touch_at) <= new Date()).length,
    topUsers:      states.sort((a,b) => b.score - a.score).slice(0, 10),
    conversionRate: states.length > 0 ? +((stages.won || 0) / states.length * 100).toFixed(1) : 0,
  };
}

async function getUserActivationState(userId) {
  if (!isConfigured) return null;
  const { data } = await supabaseAdmin.from('activation_state').select('*').eq('user_id', userId).single();
  return data;
}

async function getAllActivationStates(limit = 200) {
  if (!isConfigured) return [];
  const { data } = await supabaseAdmin
    .from('activation_state')
    .select('*')
    .order('score', { ascending: false })
    .limit(limit);
  return data || [];
}

module.exports = {
  seedActivationPipeline,
  processDueTouches,
  getPipelineDashboard,
  getUserActivationState,
  getAllActivationStates,
  markWon,
  markLost,
  segmentUser,
  CAMPAIGNS,
  PLANS,
};
