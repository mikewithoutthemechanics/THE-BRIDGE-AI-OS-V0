'use strict';
/**
 * lib/billing-activation.js — Subscription Billing Activation Workflow
 *
 * Workflow:
 *   1. generatePaymentLink(user, plan) → PayFast URL
 *   2. sendActivationEmail(user, plan, link) → email with link
 *   3. handlePaymentConfirmed(ref) → activate plan, onboard, chain proof
 *   4. startOnboarding(user) → drip onboarding sequence
 *   5. handleFailedPayment(ref) → retry logic + alert
 */

const crypto   = require('crypto');
const { supabaseAdmin, isConfigured } = require('./supabase');

const BASE_URL   = process.env.BASE_URL || 'https://ai-os.co.za';
const MERCHANT   = process.env.PAYFAST_MERCHANT_ID   || '';
const MERCHANT_KEY = process.env.PAYFAST_MERCHANT_KEY || '';
const PASSPHRASE = process.env.PAYFAST_PASSPHRASE     || '';
const SANDBOX    = process.env.PAYFAST_SANDBOX === 'true';

const PLANS = {
  starter:           { price: 79,    name: 'Bridge AI OS Starter',    agents: 5,   tasks: 1000 },
  pro:               { price: 249,   name: 'Bridge AI OS Pro',         agents: 20,  tasks: 10000 },
  enterprise:        { price: 999,   name: 'Bridge AI OS Enterprise',  agents: -1,  tasks: -1 },
  enterprise_annual: { price: 9990,  name: 'Bridge AI OS Enterprise Annual (2 months free)', agents: -1, tasks: -1 },
};

// ── Step 1: Generate PayFast payment link ────────────────────────────────────

function generatePaymentLink(user, planKey) {
  const plan = PLANS[planKey];
  if (!plan) throw new Error('Unknown plan: ' + planKey);

  const ref = 'ACT_' + user.id.slice(0, 8) + '_' + Date.now().toString(36).toUpperCase();
  const customStr = JSON.stringify({ plan: planKey, email: user.email, userId: user.id });

  const fields = {
    merchant_id:  MERCHANT || '10000100',    // fallback to sandbox
    merchant_key: MERCHANT_KEY || 'key01234567890',
    return_url:   BASE_URL + '/payment-success.html',
    cancel_url:   BASE_URL + '/payment-cancel.html',
    notify_url:   BASE_URL + '/api/payments/webhook/payfast',
    name_first:   (user.name || 'Customer').split(' ')[0],
    name_last:    (user.name || 'Customer').split(' ').slice(1).join(' ') || 'User',
    email_address: user.email,
    m_payment_id:  ref,
    amount:        plan.price.toFixed(2),
    item_name:     plan.name,
    item_description: plan.label || plan.name,
    custom_str1:   customStr,
    subscription_type: 1,   // recurring
    billing_date:  new Date().toDate ? new Date().toISOString().slice(0,10) : new Date().toISOString().slice(0,10),
    recurring_amount: plan.price.toFixed(2),
    frequency:     3,       // monthly
    cycles:        0,       // indefinite
  };

  if (PASSPHRASE) {
    const paramStr = Object.entries(fields)
      .filter(([,v]) => v !== '' && v !== undefined)
      .map(([k,v]) => `${k}=${encodeURIComponent(String(v)).replace(/%20/g,'+')}`)
      .join('&') + '&passphrase=' + encodeURIComponent(PASSPHRASE);
    fields.signature = crypto.createHash('md5').update(paramStr).digest('hex');
  }

  const base = SANDBOX
    ? 'https://sandbox.payfast.co.za/eng/process'
    : 'https://www.payfast.co.za/eng/process';

  const queryString = Object.entries(fields)
    .filter(([,v]) => v !== '' && v !== undefined)
    .map(([k,v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');

  return { url: base + '?' + queryString, ref, plan: planKey, amount: plan.price };
}

// ── Step 2: Send activation email ────────────────────────────────────────────

async function sendActivationEmail(user, planKey, paymentLink) {
  const plan = PLANS[planKey];
  const mail = (() => { try { return require('./mail'); } catch (_) { return null; } })();
  if (!mail) return { sent: false, reason: 'mail_module_unavailable' };

  const html = `
<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:2rem;background:#0a0e1a;color:#e2e8f0">
  <div style="text-align:center;margin-bottom:2rem">
    <h1 style="color:#00d4ff;font-size:1.5rem;margin:0">Bridge AI OS</h1>
    <p style="color:#64748b;margin:.5rem 0 0">Activate Your ${plan.name}</p>
  </div>

  <p>Hi ${user.name || 'there'},</p>
  <p>Your Bridge AI OS account is ready. Activate <strong>${plan.name}</strong> (R${plan.price}/mo) to deploy your AI workforce.</p>

  <div style="background:#111827;border:1px solid #1e2d4a;border-radius:8px;padding:1.5rem;margin:1.5rem 0">
    <h3 style="color:#00d4ff;margin:0 0 1rem">What you get on ${plan.name}:</h3>
    ${planKey === 'starter' ? `
    <ul style="margin:0;padding-left:1.2rem;line-height:2">
      <li>5 AI agents (sales, support, ops)</li>
      <li>1,000 automated tasks/month</li>
      <li>BRDG token wallet</li>
      <li>Basic analytics dashboard</li>
    </ul>` : planKey === 'pro' ? `
    <ul style="margin:0;padding-left:1.2rem;line-height:2">
      <li>20 AI agents — full business suite</li>
      <li>10,000 tasks/month</li>
      <li>Full CRM, invoicing, legal, HR</li>
      <li>Real-time revenue dashboard</li>
      <li>BRDG token economy</li>
      <li>API access</li>
    </ul>` : `
    <ul style="margin:0;padding-left:1.2rem;line-height:2">
      <li>Unlimited agents + unlimited tasks</li>
      <li>Custom digital twin</li>
      <li>SLA guarantee (99.9% uptime)</li>
      <li>IoT device integration</li>
      <li>On-chain BRDG treasury</li>
      <li>Priority support + custom setup</li>
    </ul>`}
  </div>

  <div style="text-align:center;margin:2rem 0">
    <a href="${paymentLink}" style="background:#00d4ff;color:#0a0e1a;padding:.9rem 2rem;border-radius:6px;text-decoration:none;font-weight:700;font-size:1.1rem;display:inline-block">
      Activate ${plan.name} — R${plan.price}/mo →
    </a>
  </div>

  <p style="color:#64748b;font-size:.85rem">Secure payment via PayFast. 14-day money-back guarantee. Cancel anytime.</p>

  <hr style="border-color:#1e2d4a;margin:1.5rem 0">
  <p style="color:#64748b;font-size:.8rem">
    Bridge AI Agency · ai-os.co.za<br>
    <a href="${BASE_URL}/unsubscribe?email=${encodeURIComponent(user.email)}" style="color:#64748b">Unsubscribe</a>
  </p>
</div>`;

  try {
    await mail.send({
      to: user.email,
      subject: `Activate your Bridge AI OS ${plan.name} — R${plan.price}/mo`,
      html,
      text: `Activate your ${plan.name} at: ${paymentLink}`,
    });
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: e.message };
  }
}

// ── Step 3: Handle confirmed payment (called from PayFast IPN) ───────────────

async function handlePaymentConfirmed(payfastData) {
  const { m_payment_id, amount_gross, custom_str1, email_address, pf_payment_id } = payfastData;
  let meta = {};
  try { meta = JSON.parse(custom_str1 || '{}'); } catch (_) {}

  const planKey = meta.plan || 'starter';
  const userId  = meta.userId || null;
  const email   = meta.email || email_address;

  // 1. Record billing activation
  if (isConfigured) {
    await supabaseAdmin.from('billing_activations').upsert({
      user_id:     userId || email,
      email,
      plan:        planKey,
      amount_zar:  parseFloat(amount_gross || 0),
      payment_ref: m_payment_id,
      status:      'paid',
      payfast_data: payfastData,
      activated_at: new Date().toISOString(),
    }, { onConflict: 'payment_ref' }).catch(() => {});

    // 2. Upgrade user plan in users table
    if (userId) {
      await supabaseAdmin.from('users').update({
        plan:         planKey,
        funnel_stage: 'customer',
        updated_at:   new Date().toISOString(),
      }).eq('id', userId).catch(() => {});
    } else if (email) {
      await supabaseAdmin.from('users').update({
        plan:         planKey,
        funnel_stage: 'customer',
        updated_at:   new Date().toISOString(),
      }).eq('email', email).catch(() => {});
    }

    // 3. Mark activation pipeline as won
    const activation = require('./revenue-activation');
    if (userId) await activation.markWon(userId, planKey).catch(() => {});

    // 4. Chain into payment proofs (revenue dashboard)
    const proofStore = require('./proof-store');
    await proofStore.recordPayment({
      id:        'pf_' + (pf_payment_id || m_payment_id),
      amount:    parseFloat(amount_gross || 0),
      currency:  'ZAR',
      source:    'payfast',
      webhookId: pf_payment_id || m_payment_id,
      timestamp: new Date().toISOString(),
      meta:      { plan: planKey, email, userId },
    }).catch(() => {});
  }

  // 5. Send welcome/onboarding email
  await startOnboarding({ email, name: email.split('@')[0], id: userId }, planKey).catch(() => {});

  return { ok: true, plan: planKey, email };
}

// ── Step 4: Onboarding sequence ───────────────────────────────────────────────

async function startOnboarding(user, planKey) {
  const mail = (() => { try { return require('./mail'); } catch (_) { return null; } })();
  if (!mail) return;

  const plan = PLANS[planKey] || PLANS.starter;
  const dashUrl = BASE_URL + '/aoe-dashboard.html';

  await mail.send({
    to: user.email,
    subject: `Welcome to Bridge AI OS ${plan.name} — your agents are deploying`,
    html: `
<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:2rem;background:#0a0e1a;color:#e2e8f0">
  <h1 style="color:#00ff88;font-size:1.4rem">✓ Payment confirmed — welcome aboard!</h1>
  <p>Hi ${user.name || 'there'}, your <strong>${plan.name}</strong> is now active.</p>

  <h3 style="color:#00d4ff">Your next 3 steps:</h3>
  <ol style="line-height:2.2">
    <li><a href="${dashUrl}" style="color:#00d4ff">Open your dashboard</a> — see agents deploying in real-time</li>
    <li>Review your <a href="${BASE_URL}/control.html" style="color:#00d4ff">control panel</a> — revenue + cost tracking live</li>
    <li>Connect your first data source or IoT device — earn BRDG from day one</li>
  </ol>

  <div style="background:#111827;border:1px solid #00ff88;border-radius:8px;padding:1rem;margin:1.5rem 0">
    <strong style="color:#00ff88">Your BRDG wallet is active.</strong><br>
    Agents earn BRDG as they complete tasks. Check your balance at:<br>
    <a href="${BASE_URL}/wallet.html" style="color:#00d4ff">${BASE_URL}/wallet.html</a>
  </div>

  <p style="color:#64748b;font-size:.85rem">Need help? Reply to this email or visit <a href="${BASE_URL}/docs.html" style="color:#64748b">docs</a>.</p>
</div>`,
    text: `Welcome to Bridge AI OS ${plan.name}! Open your dashboard: ${dashUrl}`,
  }).catch(() => {});
}

// ── Step 5: Handle failed payment ────────────────────────────────────────────

async function handleFailedPayment(ref) {
  if (!isConfigured) return;

  const { data } = await supabaseAdmin.from('billing_activations')
    .select('*').eq('payment_ref', ref).single();
  if (!data) return;

  await supabaseAdmin.from('billing_activations').update({ status: 'failed' }).eq('payment_ref', ref);

  // Re-queue in activation pipeline for retry
  if (data.user_id) {
    const plan = PLANS[data.plan] || PLANS.starter;
    const newLink = generatePaymentLink({ id: data.user_id, email: data.email, name: '' }, data.plan);
    await supabaseAdmin.from('activation_state').update({
      stage:        'contacted',
      next_touch_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // retry in 24h
      updated_at:   new Date().toISOString(),
    }).eq('user_id', data.user_id);

    const mail = (() => { try { return require('./mail'); } catch (_) { return null; } })();
    if (mail) {
      await mail.send({
        to: data.email,
        subject: 'Your Bridge AI OS payment didn\'t go through — retry link',
        html: `<p>Your payment for <strong>${plan.name}</strong> was unsuccessful. Try again here:</p><p><a href="${newLink.url}">Retry payment — R${plan.price}/mo</a></p>`,
        text: `Retry payment: ${newLink.url}`,
      }).catch(() => {});
    }
  }
}

module.exports = {
  generatePaymentLink,
  sendActivationEmail,
  handlePaymentConfirmed,
  startOnboarding,
  handleFailedPayment,
  PLANS,
};
