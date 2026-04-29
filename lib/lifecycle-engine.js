'use strict';
/**
 * lib/lifecycle-engine.js — Post-Billing Customer Lifecycle Engine
 *
 * 8 stages that run for every paying subscriber after payment is confirmed:
 *
 *  1. Post-Activation Engagement   — onboarding drip, module confirmation
 *  2. Usage Monitoring             — login frequency, feature adoption, score
 *  3. Intelligent Routing          — agent vs human CSM, reactivation vs upsell
 *  4. Ongoing Nurturing            — tips, feature spotlights, usage summaries
 *  5. Renewal Preparation          — 30/7/1-day reminders, value report
 *  6. Renewal Billing              — charge, update subscription, invoice
 *  7. Upsell & Expansion           — tier upgrade, API packages, team seats
 *  8. Long-Term Retention          — satisfaction scoring, churn prediction, intervention
 *
 * All stages write to: customer_events, engagement_scores, lifecycle_touches, customer_usage
 * Called from: autonomous-pipeline.js (stageLifecycle) + gateway.js API
 */

const { supabaseAdmin, isConfigured } = require('./supabase');

// ── Configuration ────────────────────────────────────────────────────────────

const ENGAGEMENT_WEIGHTS = {
  login_7d:        30,   // logged in within 7 days
  login_30d:       10,   // logged in within 30 days (fallback)
  feature_used:     5,   // per distinct feature accessed (max 25)
  agent_deployed:  15,   // deployed at least 1 agent
  task_completed:  10,   // completed at least 1 task
  wallet_checked:   5,   // checked BRDG wallet
  api_used:        20,   // called API (pro+ indicator)
  dashboard_viewed: 5,   // opened control/dashboard
};

// Engagement score thresholds → routing decision
const ROUTING = {
  CHAMPION:      80,   // → upsell candidate
  HEALTHY:       50,   // → standard nurture
  AT_RISK:       25,   // → reactivation sequence
  CHURNED:        0,   // → win-back (re-enter activation pipeline)
};

// Onboarding drip sequence (days after activation)
const ONBOARDING_DRIP = [
  { day: 0,  key: 'welcome',         subject: 'Welcome — your AI workforce is deploying',       template: 'welcome' },
  { day: 1,  key: 'first_steps',     subject: 'Day 1: Launch your first agent in 5 minutes',    template: 'first_steps' },
  { day: 3,  key: 'feature_tip',     subject: 'Pro tip: how top teams use Bridge AI OS',        template: 'feature_tip' },
  { day: 7,  key: 'first_week',      subject: 'Your first week summary — here\'s what\'s live', template: 'first_week' },
  { day: 14, key: 'usage_check',     subject: 'Quick check-in — how are your agents performing?', template: 'usage_check' },
  { day: 30, key: 'month_one_recap', subject: 'Month 1 complete — your AI ROI so far',          template: 'month_one_recap' },
];

// Renewal reminder schedule (days before renewal)
const RENEWAL_REMINDERS = [
  { daysBefore: 30, key: 'renewal_30', subject: 'Your Bridge AI OS plan renews in 30 days' },
  { daysBefore: 7,  key: 'renewal_7',  subject: 'Renewal in 7 days — here\'s your value report' },
  { daysBefore: 1,  key: 'renewal_1',  subject: 'Renewal tomorrow — everything you\'ve accomplished' },
];

// Upsell triggers
const UPSELL_TRIGGERS = {
  starter_to_pro:         { score: 70, agentUtilization: 0.8, plan: 'starter',    targetPlan: 'pro',        savings: null },
  pro_to_enterprise:      { score: 80, agentUtilization: 0.9, plan: 'pro',        targetPlan: 'enterprise', savings: null },
  enterprise_to_annual:   { score: 85, plan: 'enterprise', targetPlan: 'enterprise_annual', savings: '2 months free' },
};

const BASE_URL = process.env.BASE_URL || 'https://ai-os.co.za';
const PLANS = {
  starter:           { price: 79,   name: 'Bridge AI OS Starter',    agents: 5,   tasks: 1000 },
  pro:               { price: 249,  name: 'Bridge AI OS Pro',         agents: 20,  tasks: 10000 },
  enterprise:        { price: 999,  name: 'Bridge AI OS Enterprise',  agents: -1,  tasks: -1 },
  enterprise_annual: { price: 9990, name: 'Bridge AI OS Enterprise Annual', agents: -1, tasks: -1 },
};

// ── DB helpers ───────────────────────────────────────────────────────────────

async function logLifecycleEvent(userId, event, data = {}) {
  if (!isConfigured) return;
  try {
    await supabaseAdmin.from('customer_events').insert({
      user_id:    userId,
      event,
      data,
      ts: new Date().toISOString(),
    });
  } catch (_) {}
}

async function touchSent(userId, touchKey) {
  if (!isConfigured) return false;
  try {
    const { data } = await supabaseAdmin
      .from('lifecycle_touches')
      .select('id')
      .eq('user_id', userId)
      .eq('touch_key', touchKey)
      .single();
    return !!data;
  } catch (_) { return false; }
}

async function recordTouch(userId, touchKey, meta = {}) {
  if (!isConfigured) return;
  try {
    await supabaseAdmin.from('lifecycle_touches').upsert({
      user_id:   userId,
      touch_key: touchKey,
      sent_at:   new Date().toISOString(),
      meta,
    }, { onConflict: 'user_id,touch_key' });
  } catch (_) {}
}

async function upsertEngagementScore(userId, score, breakdown) {
  if (!isConfigured) return;
  try {
    await supabaseAdmin.from('engagement_scores').upsert({
      user_id:   userId,
      score,
      breakdown,
      routing:   scoreToRouting(score),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  } catch (_) {}
}

function scoreToRouting(score) {
  if (score >= ROUTING.CHAMPION) return 'champion';
  if (score >= ROUTING.HEALTHY)  return 'healthy';
  if (score >= ROUTING.AT_RISK)  return 'at_risk';
  return 'churned';
}

// ── Mail helper ──────────────────────────────────────────────────────────────

function getMail() {
  try { return require('./mail'); } catch (_) { return null; }
}

function emailStyle() {
  return 'font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:2rem;background:#0a0e1a;color:#e2e8f0';
}

// ── Stage 1: Post-Activation Engagement (onboarding drip) ───────────────────

async function stagePostActivation(user) {
  const mail = getMail();
  if (!mail || !user.email) return { sent: 0 };

  const activatedAt = new Date(user.activated_at || user.created_at || Date.now());
  const now = Date.now();
  let sent = 0;

  for (const step of ONBOARDING_DRIP) {
    const sendAfterMs = step.day * 24 * 60 * 60 * 1000;
    const dueAt = activatedAt.getTime() + sendAfterMs;

    if (now < dueAt) continue; // not yet due
    if (await touchSent(user.id, 'onboard_' + step.key)) continue; // already sent

    const html = buildOnboardingEmail(user, step);
    try {
      await mail.send({ to: user.email, subject: step.subject, html, text: step.subject });
      await recordTouch(user.id, 'onboard_' + step.key, { day: step.day, template: step.template });
      await logLifecycleEvent(user.id, 'onboarding_email_sent', { step: step.key, day: step.day });
      sent++;
    } catch (_) {}
  }

  return { sent };
}

function buildOnboardingEmail(user, step) {
  const name = (user.name || user.email || '').split('@')[0] || 'there';
  const plan  = PLANS[user.plan] || PLANS.starter;

  const bodies = {
    welcome: `
      <h1 style="color:#00ff88">Welcome to Bridge AI OS!</h1>
      <p>Hi ${name}, your <strong>${plan.name}</strong> is now active.</p>
      <p>Your AI agents are deploying. Head to your <a href="${BASE_URL}/aoe-dashboard.html" style="color:#00d4ff">dashboard</a> to watch them come online.</p>
      <h3 style="color:#00d4ff">Your first 3 actions:</h3>
      <ol style="line-height:2.2">
        <li>Open <a href="${BASE_URL}/aoe-dashboard.html" style="color:#00d4ff">Agent Dashboard</a> — see agents live</li>
        <li>Check <a href="${BASE_URL}/wallet.html" style="color:#00d4ff">BRDG Wallet</a> — tokens earned from day 1</li>
        <li>Explore <a href="${BASE_URL}/control.html" style="color:#00d4ff">Control Panel</a> — revenue + cost tracking</li>
      </ol>`,
    first_steps: `
      <h1 style="color:#00d4ff">Day 1: Launch your first agent</h1>
      <p>Hi ${name}, it takes 3 minutes to deploy your first agent.</p>
      <p>Go to <a href="${BASE_URL}/agents.html" style="color:#00d4ff">Agents</a> → click "Deploy" → choose Sales or Support → done.</p>
      <p>Once deployed, your agent will start completing tasks and earning BRDG automatically.</p>`,
    feature_tip: `
      <h1 style="color:#00d4ff">Pro tip from top Bridge AI OS teams</h1>
      <p>Hi ${name}, the teams seeing the fastest ROI deploy agents in pairs:</p>
      <ul style="line-height:2"><li>Sales agent + Research agent → auto-qualify leads</li><li>Support agent + Knowledge base → deflect 60% of tickets</li></ul>
      <p><a href="${BASE_URL}/agents.html" style="color:#00d4ff">Add your second agent →</a></p>`,
    first_week: `
      <h1 style="color:#00d4ff">Your first week on Bridge AI OS</h1>
      <p>Hi ${name}, your agents have been running for 7 days. Check your <a href="${BASE_URL}/control.html" style="color:#00d4ff">control panel</a> to see tasks completed and BRDG earned.</p>
      <p>Need help interpreting the data? Reply to this email — our team will walk you through it.</p>`,
    usage_check: `
      <h1 style="color:#00d4ff">Quick check-in</h1>
      <p>Hi ${name}, how are your agents performing after 2 weeks?</p>
      <p>If you haven't yet: <a href="${BASE_URL}/aoe-dashboard.html" style="color:#00d4ff">view live agent performance →</a></p>
      <p>Common quick wins at this stage: enable the API integration, connect a data source, or add IoT devices to earn more BRDG.</p>`,
    month_one_recap: `
      <h1 style="color:#00d4ff">Month 1 complete — your AI ROI</h1>
      <p>Hi ${name}, your Bridge AI OS subscription has been live for 30 days.</p>
      <p>Your agents have been working 24/7. Check your <a href="${BASE_URL}/control.html" style="color:#00d4ff">revenue dashboard</a> to see the full picture.</p>
      <p style="color:#00ff88">If you're seeing value, consider upgrading to unlock more agents and API access.</p>
      <p><a href="${BASE_URL}/pricing.html" style="color:#00d4ff">View upgrade options →</a></p>`,
  };

  const body = bodies[step.template] || `<p>Hi ${name}, an update from Bridge AI OS.</p>`;

  return `<div style="${emailStyle()}">${body}
    <hr style="border-color:#1e2d4a;margin:1.5rem 0">
    <p style="color:#64748b;font-size:.8rem">Bridge AI Agency · ai-os.co.za<br>
    <a href="${BASE_URL}/settings.html" style="color:#64748b">Manage notifications</a></p>
  </div>`;
}

// ── Stage 2: Usage Monitoring & Behaviour Tracking ───────────────────────────

async function stageUsageMonitoring(user) {
  if (!isConfigured) return { score: 0, routing: 'churned' };

  // Read usage signals from Supabase
  const now = new Date();
  const day7ago  = new Date(now - 7  * 86400000).toISOString();
  const day30ago = new Date(now - 30 * 86400000).toISOString();

  let breakdown = {};
  let score = 0;

  try {
    // Login recency
    const { data: loginData } = await supabaseAdmin
      .from('auth_sessions')
      .select('created_at')
      .eq('user_id', user.id)
      .gte('created_at', day7ago)
      .limit(1);

    if (loginData?.length) {
      breakdown.login_7d = ENGAGEMENT_WEIGHTS.login_7d;
      score += ENGAGEMENT_WEIGHTS.login_7d;
    } else {
      const { data: login30 } = await supabaseAdmin
        .from('auth_sessions')
        .select('created_at')
        .eq('user_id', user.id)
        .gte('created_at', day30ago)
        .limit(1);
      if (login30?.length) {
        breakdown.login_30d = ENGAGEMENT_WEIGHTS.login_30d;
        score += ENGAGEMENT_WEIGHTS.login_30d;
      }
    }
  } catch (_) {}

  try {
    // Feature usage
    const { data: events } = await supabaseAdmin
      .from('customer_usage')
      .select('feature')
      .eq('user_id', user.id)
      .gte('ts', day30ago);

    if (events?.length) {
      const features = new Set(events.map(e => e.feature));
      const featureScore = Math.min(features.size * ENGAGEMENT_WEIGHTS.feature_used, 25);
      breakdown.features_used = features.size;
      breakdown.feature_score = featureScore;
      score += featureScore;

      if (features.has('agent_deployed')) { breakdown.agent_deployed = ENGAGEMENT_WEIGHTS.agent_deployed; score += ENGAGEMENT_WEIGHTS.agent_deployed; }
      if (features.has('task_completed')) { breakdown.task_completed = ENGAGEMENT_WEIGHTS.task_completed; score += ENGAGEMENT_WEIGHTS.task_completed; }
      if (features.has('wallet'))         { breakdown.wallet_checked = ENGAGEMENT_WEIGHTS.wallet_checked; score += ENGAGEMENT_WEIGHTS.wallet_checked; }
      if (features.has('api'))            { breakdown.api_used = ENGAGEMENT_WEIGHTS.api_used; score += ENGAGEMENT_WEIGHTS.api_used; }
      if (features.has('dashboard'))      { breakdown.dashboard_viewed = ENGAGEMENT_WEIGHTS.dashboard_viewed; score += ENGAGEMENT_WEIGHTS.dashboard_viewed; }
    }
  } catch (_) {}

  score = Math.min(score, 100);
  await upsertEngagementScore(user.id, score, breakdown);
  await logLifecycleEvent(user.id, 'usage_scored', { score, routing: scoreToRouting(score) });

  return { score, routing: scoreToRouting(score), breakdown };
}

// ── Stage 3: Intelligent Routing ─────────────────────────────────────────────

async function stageIntelligentRouting(user, score) {
  const routing = scoreToRouting(score);
  const plan = user.plan || 'starter';

  let action = 'standard_nurture';
  let reason  = '';

  if (routing === 'champion' && UPSELL_TRIGGERS[plan + '_to_' + (plan === 'starter' ? 'pro' : 'enterprise')]) {
    action = 'upsell';
    reason = 'High engagement + high agent utilization';
  } else if (routing === 'champion' && plan === 'enterprise') {
    action = 'annual_upsell';
    reason = 'Enterprise champion — offer annual deal';
  } else if (routing === 'at_risk') {
    action = 'reactivation';
    reason = 'Engagement score below 25 — risk of churn';
  } else if (routing === 'churned') {
    action = 'win_back';
    reason = 'Zero engagement — re-enter activation pipeline';
  } else if (routing === 'healthy' || routing === 'champion') {
    action = 'standard_nurture';
    reason = 'Active subscriber';
  }

  await logLifecycleEvent(user.id, 'routing_decision', { routing, action, reason, score });

  try {
    await supabaseAdmin.from('engagement_scores')
      .update({ action, action_reason: reason, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);
  } catch (_) {}

  return { routing, action, reason };
}

// ── Stage 4: Ongoing Nurturing & Value Reinforcement ─────────────────────────

async function stageNurturing(user, routingDecision) {
  const mail = getMail();
  if (!mail || !user.email) return { sent: 0 };
  if (routingDecision.action === 'upsell' || routingDecision.action === 'annual_upsell') return { sent: 0 }; // handled by stage 7

  // Monthly feature spotlight — send once per month
  const monthKey = 'nurture_spotlight_' + new Date().toISOString().slice(0, 7); // YYYY-MM
  if (await touchSent(user.id, monthKey)) return { sent: 0 };

  const plan = PLANS[user.plan] || PLANS.starter;
  const name  = (user.name || user.email || '').split('@')[0] || 'there';

  const spotlights = [
    { feature: 'IoT Integration',    tip: 'Connect physical devices to earn BRDG passively.',       link: '/iot.html' },
    { feature: 'Digital Twin',       tip: 'Mirror your business as a live AI entity.',              link: '/digital-twin-console.html' },
    { feature: 'API Access',         tip: 'Embed your agents into any external tool via REST API.', link: '/docs.html' },
    { feature: 'BRDG Economy',       tip: 'Stake BRDG to unlock premium agent capabilities.',       link: '/wallet.html' },
    { feature: 'Analytics Dashboard',tip: 'See which agents generate the most revenue.',            link: '/control.html' },
  ];

  const spotlight = spotlights[new Date().getMonth() % spotlights.length];

  const html = `<div style="${emailStyle()}">
    <h1 style="color:#00d4ff">Feature Spotlight: ${spotlight.feature}</h1>
    <p>Hi ${name}, here's what top ${plan.name} teams are using this month:</p>
    <div style="background:#111827;border:1px solid #1e2d4a;border-radius:8px;padding:1.5rem;margin:1.5rem 0">
      <strong style="color:#00d4ff">${spotlight.feature}</strong><br>
      <p>${spotlight.tip}</p>
      <a href="${BASE_URL}${spotlight.link}" style="background:#00d4ff;color:#0a0e1a;padding:.7rem 1.5rem;border-radius:6px;text-decoration:none;font-weight:700;display:inline-block;margin-top:.5rem">Explore ${spotlight.feature} →</a>
    </div>
    <p style="color:#64748b;font-size:.85rem">Your ${plan.name} plan includes this feature. No extra cost.</p>
    <hr style="border-color:#1e2d4a;margin:1.5rem 0">
    <p style="color:#64748b;font-size:.8rem">Bridge AI Agency · <a href="${BASE_URL}/settings.html" style="color:#64748b">Manage notifications</a></p>
  </div>`;

  try {
    await mail.send({ to: user.email, subject: `Bridge AI OS tip: ${spotlight.feature}`, html, text: `Tip: ${spotlight.tip} ${BASE_URL}${spotlight.link}` });
    await recordTouch(user.id, monthKey, { feature: spotlight.feature });
    await logLifecycleEvent(user.id, 'nurture_spotlight_sent', { feature: spotlight.feature });
    return { sent: 1 };
  } catch (_) { return { sent: 0 }; }
}

// ── Stage 5: Renewal Preparation ─────────────────────────────────────────────

async function stageRenewalPrep(user) {
  const mail = getMail();
  if (!mail || !user.email || !user.billing_renewal_at) return { sent: 0 };

  const renewalDate = new Date(user.billing_renewal_at);
  const now = Date.now();
  const plan = PLANS[user.plan] || PLANS.starter;
  const name  = (user.name || user.email || '').split('@')[0] || 'there';
  let sent = 0;

  for (const reminder of RENEWAL_REMINDERS) {
    const triggerAt = renewalDate.getTime() - reminder.daysBefore * 86400000;
    if (now < triggerAt) continue; // not yet
    if (await touchSent(user.id, reminder.key)) continue; // already sent

    // Build value summary (tasks completed, BRDG earned)
    let valueLines = '';
    if (isConfigured) {
      try {
        const { data: earning } = await supabaseAdmin
          .from('iot_earnings')
          .select('brdg_earned')
          .eq('user_id', user.id)
          .limit(100);
        const totalBrdg = (earning || []).reduce((s, r) => s + (r.brdg_earned || 0), 0);
        if (totalBrdg > 0) valueLines = `<li>BRDG earned by your agents: <strong style="color:#00ff88">${totalBrdg.toFixed(2)} BRDG</strong></li>`;
      } catch (_) {}
    }

    const html = `<div style="${emailStyle()}">
      <h1 style="color:#00d4ff">Your Bridge AI OS plan renews in ${reminder.daysBefore} day${reminder.daysBefore !== 1 ? 's' : ''}</h1>
      <p>Hi ${name}, your <strong>${plan.name}</strong> (R${plan.price}/mo) renews on <strong>${renewalDate.toLocaleDateString('en-ZA')}</strong>.</p>
      ${valueLines ? `<div style="background:#111827;border:1px solid #00ff88;border-radius:8px;padding:1rem;margin:1rem 0"><strong style="color:#00ff88">What your agents delivered this cycle:</strong><ul style="line-height:2">${valueLines}</ul></div>` : ''}
      <p>Payment will be processed automatically via PayFast. If you need to update your payment method, <a href="${BASE_URL}/billing.html" style="color:#00d4ff">visit billing settings</a>.</p>
      <hr style="border-color:#1e2d4a;margin:1.5rem 0">
      <p style="color:#64748b;font-size:.8rem">Bridge AI Agency · <a href="${BASE_URL}/settings.html" style="color:#64748b">Manage notifications</a></p>
    </div>`;

    try {
      await mail.send({ to: user.email, subject: reminder.subject, html, text: `${reminder.subject} — ${BASE_URL}/billing.html` });
      await recordTouch(user.id, reminder.key, { daysBefore: reminder.daysBefore, renewalDate: renewalDate.toISOString() });
      await logLifecycleEvent(user.id, 'renewal_reminder_sent', { daysBefore: reminder.daysBefore });
      sent++;
    } catch (_) {}
  }

  return { sent };
}

// ── Stage 6: Renewal Billing & Continuation ───────────────────────────────────

async function stageRenewalBilling(user) {
  // PayFast handles recurring billing automatically (subscription_type=1, cycles=0).
  // This stage: records renewal event + updates subscription state when PayFast fires IPN.
  // Called from brain.js PayFast IPN handler on each recurring charge.

  if (!isConfigured || !user.id) return { ok: false, reason: 'not_configured' };

  const plan = PLANS[user.plan] || PLANS.starter;
  const now  = new Date().toISOString();

  try {
    // Update renewal date (monthly)
    const nextRenewal = new Date(Date.now() + 30 * 86400000).toISOString();
    await supabaseAdmin.from('users').update({
      billing_renewal_at: nextRenewal,
      funnel_stage:       'customer',
      updated_at:         now,
    }).eq('id', user.id);

    // Insert invoice record
    await supabaseAdmin.from('billing_activations').insert({
      user_id:     user.id,
      email:       user.email,
      plan:        user.plan,
      amount_zar:  plan.price,
      status:      'renewed',
      activated_at: now,
    }).catch(() => {});

    await logLifecycleEvent(user.id, 'subscription_renewed', { plan: user.plan, amount: plan.price });

    // Send renewal confirmation
    const mail = getMail();
    if (mail && user.email) {
      const name = (user.name || user.email || '').split('@')[0] || 'there';
      const html = `<div style="${emailStyle()}">
        <h1 style="color:#00ff88">✓ Subscription renewed — thank you!</h1>
        <p>Hi ${name}, your <strong>${plan.name}</strong> has been renewed for another month.</p>
        <p>Amount charged: <strong style="color:#00ff88">R${plan.price}/mo</strong></p>
        <p>Your agents continue running 24/7. <a href="${BASE_URL}/aoe-dashboard.html" style="color:#00d4ff">View dashboard →</a></p>
        <hr style="border-color:#1e2d4a;margin:1.5rem 0">
        <p style="color:#64748b;font-size:.8rem">Bridge AI Agency · <a href="${BASE_URL}/billing.html" style="color:#64748b">View billing history</a></p>
      </div>`;
      await mail.send({ to: user.email, subject: `Bridge AI OS ${plan.name} renewed — R${plan.price}`, html, text: `Subscription renewed. Amount: R${plan.price}` }).catch(() => {});
    }

    return { ok: true, plan: user.plan, nextRenewal };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

// ── Stage 7: Upsell & Expansion Workflow ─────────────────────────────────────

async function stageUpsell(user, score) {
  const mail = getMail();
  if (!mail || !user.email) return { triggered: false };

  const plan = user.plan || 'starter';
  const name  = (user.name || user.email || '').split('@')[0] || 'there';

  // Determine upsell target
  let trigger = null;
  for (const [key, t] of Object.entries(UPSELL_TRIGGERS)) {
    if (t.plan === plan && score >= t.score) { trigger = { key, ...t }; break; }
  }
  if (!trigger) return { triggered: false };

  const upsellKey = 'upsell_' + trigger.key;
  if (await touchSent(user.id, upsellKey)) return { triggered: false }; // only once per trigger

  const targetPlan = PLANS[trigger.targetPlan];
  if (!targetPlan) return { triggered: false };

  const priceDiff = targetPlan.price - (PLANS[plan]?.price || 0);
  const savings   = trigger.savings || null;

  const html = `<div style="${emailStyle()}">
    <div style="background:#00d4ff10;border:1px solid #00d4ff;border-radius:8px;padding:1.5rem;margin-bottom:1.5rem">
      <strong style="color:#00d4ff">You've unlocked upgrade eligibility</strong><br>
      Your usage puts you in the top tier of ${PLANS[plan]?.name || plan} customers.
    </div>
    <h1 style="color:#00d4ff">Upgrade to ${targetPlan.name}</h1>
    <p>Hi ${name}, based on your usage patterns, you're ready for more.</p>
    <div style="background:#111827;border:1px solid #1e2d4a;border-radius:8px;padding:1.5rem;margin:1.5rem 0">
      <h3 style="color:#00d4ff;margin:0 0 1rem">${targetPlan.name} unlocks:</h3>
      <ul style="line-height:2;margin:0;padding-left:1.2rem">
        ${trigger.targetPlan === 'pro'               ? '<li>20 agents (from 5)</li><li>10,000 tasks/month</li><li>Full CRM + invoicing + HR modules</li><li>API access</li>' : ''}
        ${trigger.targetPlan === 'enterprise'         ? '<li>Unlimited agents + tasks</li><li>Custom digital twin</li><li>99.9% SLA + priority support</li><li>On-chain BRDG treasury</li>' : ''}
        ${trigger.targetPlan === 'enterprise_annual'  ? `<li>Everything in Enterprise</li><li style="color:#00ff88">2 months FREE (save R${(999 * 2).toLocaleString()})</li><li>Annual contract — predictable costs</li>` : ''}
      </ul>
    </div>
    ${savings ? `<p style="color:#00ff88"><strong>${savings}</strong></p>` : ''}
    <div style="text-align:center;margin:2rem 0">
      <a href="${BASE_URL}/pricing.html?upgrade=${trigger.targetPlan}&ref=${user.id}" style="background:#00d4ff;color:#0a0e1a;padding:.9rem 2rem;border-radius:6px;text-decoration:none;font-weight:700;font-size:1.1rem;display:inline-block">
        Upgrade to ${targetPlan.name} — R${targetPlan.price}${trigger.targetPlan === 'enterprise_annual' ? '/yr' : '/mo'} →
      </a>
    </div>
    <p style="color:#64748b;font-size:.85rem">Upgrade takes effect immediately. Prorated for remaining billing cycle.</p>
    <hr style="border-color:#1e2d4a;margin:1.5rem 0">
    <p style="color:#64748b;font-size:.8rem">Bridge AI Agency · <a href="${BASE_URL}/settings.html" style="color:#64748b">Manage notifications</a></p>
  </div>`;

  try {
    await mail.send({
      to:      user.email,
      subject: `You're ready for ${targetPlan.name} — ${savings || 'upgrade available'}`,
      html,
      text:    `Upgrade to ${targetPlan.name}: ${BASE_URL}/pricing.html?upgrade=${trigger.targetPlan}`,
    });
    await recordTouch(user.id, upsellKey, { targetPlan: trigger.targetPlan, score });
    await logLifecycleEvent(user.id, 'upsell_triggered', { targetPlan: trigger.targetPlan, score });
    return { triggered: true, targetPlan: trigger.targetPlan };
  } catch (_) { return { triggered: false }; }
}

// ── Stage 8: Long-Term Retention & Churn Prediction ──────────────────────────

async function stageLongTermRetention(user, score, routingDecision) {
  const mail = getMail();
  const results = { reactivation: false, survey: false, winBack: false, csm: false };

  // Sub-stage A: Reactivation sequence (at_risk users)
  if (routingDecision.action === 'reactivation') {
    const reactivationKey = 'reactivation_' + new Date().toISOString().slice(0, 7);
    if (mail && user.email && !(await touchSent(user.id, reactivationKey))) {
      const name = (user.name || user.email || '').split('@')[0] || 'there';
      const plan = PLANS[user.plan] || PLANS.starter;

      const html = `<div style="${emailStyle()}">
        <h1 style="color:#ffd166">We miss you, ${name}</h1>
        <p>Your Bridge AI OS agents are still running — but we haven't seen you log in recently.</p>
        <p>Here's what's happened while you were away:</p>
        <div style="background:#111827;border:1px solid #ffd166;border-radius:8px;padding:1rem;margin:1rem 0">
          <ul style="line-height:2;margin:0;padding-left:1.2rem">
            <li>Your agents completed tasks autonomously</li>
            <li>New features launched: IoT integration, Digital Twin v2</li>
            <li>BRDG staking now live — earn yield on your balance</li>
          </ul>
        </div>
        <div style="text-align:center;margin:2rem 0">
          <a href="${BASE_URL}/aoe-dashboard.html" style="background:#ffd166;color:#0a0e1a;padding:.9rem 2rem;border-radius:6px;text-decoration:none;font-weight:700;display:inline-block">
            Return to Dashboard →
          </a>
        </div>
        <p style="color:#64748b;font-size:.85rem">Questions? Reply to this email — we'll help you get the most from your ${plan.name}.</p>
        <hr style="border-color:#1e2d4a;margin:1.5rem 0">
        <p style="color:#64748b;font-size:.8rem">Bridge AI Agency · <a href="${BASE_URL}/settings.html" style="color:#64748b">Manage notifications</a></p>
      </div>`;

      try {
        await mail.send({ to: user.email, subject: 'Your Bridge AI OS agents are waiting for you', html, text: `Return to dashboard: ${BASE_URL}/aoe-dashboard.html` });
        await recordTouch(user.id, reactivationKey, { score });
        await logLifecycleEvent(user.id, 'reactivation_sent', { score });
        results.reactivation = true;
      } catch (_) {}
    }
  }

  // Sub-stage B: Win-back (churned users — re-enter activation pipeline)
  if (routingDecision.action === 'win_back') {
    try {
      if (isConfigured) {
        await supabaseAdmin.from('activation_state').upsert({
          user_id:      user.id,
          email:        user.email,
          stage:        'contacted',
          campaign:     'warm_nurture',
          step_index:   0,
          score:        20,
          next_touch_at: new Date().toISOString(),
          updated_at:   new Date().toISOString(),
        }, { onConflict: 'user_id' });
        await logLifecycleEvent(user.id, 'win_back_queued', { score });
        results.winBack = true;
      }
    } catch (_) {}
  }

  // Sub-stage C: Satisfaction survey (quarterly for healthy/champion users)
  const surveyKey = 'survey_' + new Date().getFullYear() + '_Q' + Math.ceil((new Date().getMonth() + 1) / 3);
  if ((routingDecision.routing === 'healthy' || routingDecision.routing === 'champion') && !(await touchSent(user.id, surveyKey))) {
    if (mail && user.email) {
      const name = (user.name || user.email || '').split('@')[0] || 'there';
      const html = `<div style="${emailStyle()}">
        <h1 style="color:#00d4ff">How are we doing?</h1>
        <p>Hi ${name}, you've been with Bridge AI OS for a while — your feedback shapes what we build next.</p>
        <p>Quick 2-minute survey: <a href="${BASE_URL}/feedback.html?uid=${user.id}" style="color:#00d4ff">Share your experience →</a></p>
        <p style="color:#64748b;font-size:.85rem">As a thank-you, you'll receive 50 BRDG credited to your wallet.</p>
        <hr style="border-color:#1e2d4a;margin:1.5rem 0">
        <p style="color:#64748b;font-size:.8rem">Bridge AI Agency · <a href="${BASE_URL}/settings.html" style="color:#64748b">Manage notifications</a></p>
      </div>`;
      try {
        await mail.send({ to: user.email, subject: 'Quick question: how is Bridge AI OS working for you?', html, text: `Share feedback: ${BASE_URL}/feedback.html?uid=${user.id}` });
        await recordTouch(user.id, surveyKey, { quarter: surveyKey });
        await logLifecycleEvent(user.id, 'survey_sent', { quarter: surveyKey });
        results.survey = true;
      } catch (_) {}
    }
  }

  // Sub-stage D: Enterprise CSM escalation flag (champion + enterprise)
  if (routingDecision.routing === 'champion' && user.plan === 'enterprise') {
    const csmKey = 'csm_check_' + new Date().toISOString().slice(0, 7);
    if (!(await touchSent(user.id, csmKey)) && isConfigured) {
      try {
        await supabaseAdmin.from('csm_queue').upsert({
          user_id:   user.id,
          email:     user.email,
          plan:      user.plan,
          score,
          priority:  'high',
          reason:    'Champion enterprise customer — proactive QBR',
          created_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
        await recordTouch(user.id, csmKey);
        results.csm = true;
      } catch (_) {}
    }
  }

  return results;
}

// ── Master orchestrator: run all 8 stages for a single subscriber ─────────────

async function runLifecycleForUser(user) {
  if (!user?.id || !user?.email) return { skipped: true };

  try {
    // Stage 1: Onboarding drip
    const onboardResult = await stagePostActivation(user);

    // Stage 2: Measure engagement
    const { score, routing, breakdown } = await stageUsageMonitoring(user);

    // Stage 3: Route the user
    const routingDecision = await stageIntelligentRouting(user, score);

    // Stage 4: Nurture active subscribers
    const nurtureResult = await stageNurturing(user, routingDecision);

    // Stage 5: Renewal prep (if billing_renewal_at is set)
    const renewalPrepResult = await stageRenewalPrep(user);

    // Stage 6: Renewal billing — driven by PayFast IPN, not polled here
    // Stage 7: Upsell if champion
    const upsellResult = routingDecision.action === 'upsell' || routingDecision.action === 'annual_upsell'
      ? await stageUpsell(user, score)
      : { triggered: false };

    // Stage 8: Retention, reactivation, churn intervention
    const retentionResult = await stageLongTermRetention(user, score, routingDecision);

    return {
      user_id: user.id,
      email:   user.email,
      score,
      routing,
      actions: {
        onboarding_emails: onboardResult.sent,
        nurture:           nurtureResult.sent,
        renewal_reminders: renewalPrepResult.sent,
        upsell:            upsellResult.triggered,
        retention:         retentionResult,
      },
    };
  } catch (e) {
    console.error('[LIFECYCLE] Error for user ' + user.id + ':', e.message);
    return { user_id: user.id, error: e.message };
  }
}

// ── Batch runner (called from autonomous pipeline) ────────────────────────────

async function processActiveSubscribers(limit = 25) {
  if (!isConfigured) return { processed: 0, reason: 'supabase_not_configured' };

  let users = [];
  try {
    const { data } = await supabaseAdmin
      .from('users')
      .select('id, email, name, plan, activated_at, billing_renewal_at, created_at')
      .eq('funnel_stage', 'customer')
      .not('plan', 'is', null)
      .not('email', 'like', '%auth_t%')
      .not('email', 'like', '%@ex.com%')
      .order('updated_at', { ascending: true }) // process least-recently-touched first
      .limit(limit);
    users = data || [];
  } catch (e) {
    return { processed: 0, error: e.message };
  }

  const results = [];
  for (const user of users) {
    const result = await runLifecycleForUser(user);
    results.push(result);
  }

  return {
    processed: users.length,
    results,
    ts: new Date().toISOString(),
  };
}

// ── Record usage event (called from frontend beacons / API usage) ─────────────

async function recordUsageEvent(userId, feature, meta = {}) {
  if (!isConfigured || !userId) return;
  try {
    await supabaseAdmin.from('customer_usage').insert({
      user_id: userId,
      feature,
      meta,
      ts: new Date().toISOString(),
    });
  } catch (_) {}
}

// ── stageRenewalBilling is exported for PayFast IPN handler ──────────────────

module.exports = {
  processActiveSubscribers,
  runLifecycleForUser,
  recordUsageEvent,
  stagePostActivation,
  stageUsageMonitoring,
  stageIntelligentRouting,
  stageNurturing,
  stageRenewalPrep,
  stageRenewalBilling,
  stageUpsell,
  stageLongTermRetention,
  scoreToRouting,
  PLANS,
  ROUTING,
};
