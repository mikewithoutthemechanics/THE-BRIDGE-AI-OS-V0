'use strict';

/**
 * mail.js — Unified transactional mail for Bridge AI OS
 *
 * Transport chain (in order):
 *   1. Brevo   — smtp-relay.brevo.com:587  (primary, high deliverability)
 *   2. Gmail   — smtp.gmail.com:587        (backup, requires App Password)
 *
 * Credentials (set in .env):
 *   BREVO_SMTP_USER     your Brevo account email
 *   BREVO_SMTP_KEY      Brevo SMTP key  (Brevo → SMTP & API → SMTP → Generate key)
 *   BREVO_FROM          sender address verified in Brevo  e.g. noreply@bridge-ai-os.com
 *   BREVO_FROM_NAME     display name  e.g. Bridge AI OS
 *
 *   GMAIL_USER          your Gmail address
 *   GMAIL_APP_PASS      Google App Password (NOT your login password)
 *                       Generate: myaccount.google.com → Security → App passwords
 *
 * Usage:
 *   const mail = require('./lib/mail');
 *   await mail.send({ to: 'user@example.com', subject: 'Hi', html: '<p>Hello</p>' });
 *   await mail.test();           // sends a test email to BREVO_FROM
 *   const ok = await mail.ping(); // returns { brevo: bool, gmail: bool }
 */

const nodemailer = require('nodemailer');

// ── Config ────────────────────────────────────────────────────────────────────

function cfg() {
  // BREVO_* vars take priority; fall back to legacy SMTP_BACKUP_* if present
  const brevoUser = process.env.BREVO_SMTP_USER || process.env.SMTP_BACKUP_USER || '';
  const brevoPass = process.env.BREVO_SMTP_KEY  || process.env.SMTP_BACKUP_PASS  || '';
  const brevoFrom = process.env.BREVO_FROM      || process.env.SMTP_FROM         || brevoUser;
  const fromName  = process.env.BREVO_FROM_NAME || process.env.SMTP_FROM_NAME    || 'Bridge AI OS';

  return {
    brevo: { user: brevoUser, pass: brevoPass, from: brevoFrom, fromName },
    gmail: {
      user:     process.env.GMAIL_USER     || '',
      pass:     process.env.GMAIL_APP_PASS || '',
      from:     process.env.GMAIL_USER     || '',
      fromName,
    },
  };
}

function isBrevoReady()  { const c = cfg().brevo; return !!(c.user && c.pass && c.from); }
function isGmailReady()  { const c = cfg().gmail; return !!(c.user && c.pass); }

// ── Transport builders ────────────────────────────────────────────────────────

function buildBrevoTransport() {
  const c = cfg().brevo;
  return nodemailer.createTransport({
    host:   'smtp-relay.brevo.com',
    port:   587,
    secure: false,
    auth:   { user: c.user, pass: c.pass },
    tls:    { rejectUnauthorized: true },
    pool:   true,
    maxConnections: 5,
  });
}

function buildGmailTransport() {
  const c = cfg().gmail;
  return nodemailer.createTransport({
    service: 'gmail',
    auth:    { user: c.user, pass: c.pass },
    // Gmail App Passwords work with standard OAuth-less SMTP
  });
}

// ── Core send with fallback chain ─────────────────────────────────────────────

/**
 * Send an email via Brevo → Gmail fallback.
 *
 * @param {object} opts
 * @param {string|string[]} opts.to        - recipient(s)
 * @param {string}          opts.subject
 * @param {string}          opts.html      - HTML body
 * @param {string}          [opts.text]    - plain text fallback
 * @param {string}          [opts.from]    - override sender
 * @param {string}          [opts.replyTo]
 * @param {object[]}        [opts.attachments]
 *
 * @returns {{ ok: boolean, provider: string, messageId: string }}
 */
async function send(opts) {
  if (!opts.to || !opts.subject || (!opts.html && !opts.text)) {
    throw new Error('mail.send: to, subject, and html/text are required');
  }

  const errors = [];

  // 1. Try Brevo
  if (isBrevoReady()) {
    try {
      const c = cfg().brevo;
      const from = opts.from || `"${c.fromName}" <${c.from}>`;
      const result = await buildBrevoTransport().sendMail({ ...opts, from });
      return { ok: true, provider: 'brevo', messageId: result.messageId };
    } catch (e) {
      errors.push(`brevo: ${e.message}`);
      console.warn('[MAIL] Brevo failed, trying Gmail backup:', e.message);
    }
  } else {
    errors.push('brevo: not configured (BREVO_SMTP_USER / BREVO_SMTP_KEY missing)');
  }

  // 2. Try Gmail
  if (isGmailReady()) {
    try {
      const c = cfg().gmail;
      const from = opts.from || `"${c.fromName}" <${c.from}>`;
      const result = await buildGmailTransport().sendMail({ ...opts, from });
      return { ok: true, provider: 'gmail', messageId: result.messageId };
    } catch (e) {
      errors.push(`gmail: ${e.message}`);
    }
  } else {
    errors.push('gmail: not configured (GMAIL_USER / GMAIL_APP_PASS missing)');
  }

  throw new Error(`All mail transports failed:\n  ${errors.join('\n  ')}`);
}

// ── Verify SMTP connections (no email sent) ───────────────────────────────────

async function ping() {
  const result = { brevo: false, gmail: false, errors: {} };

  if (isBrevoReady()) {
    try {
      await buildBrevoTransport().verify();
      result.brevo = true;
    } catch (e) {
      result.errors.brevo = e.message;
    }
  } else {
    result.errors.brevo = 'not configured';
  }

  if (isGmailReady()) {
    try {
      await buildGmailTransport().verify();
      result.gmail = true;
    } catch (e) {
      result.errors.gmail = e.message;
    }
  } else {
    result.errors.gmail = 'not configured';
  }

  result.ok = result.brevo || result.gmail;
  result.primary = result.brevo ? 'brevo' : result.gmail ? 'gmail' : 'none';
  return result;
}

// ── Test send ─────────────────────────────────────────────────────────────────

async function test(toOverride = null) {
  const c   = cfg().brevo;
  const to  = toOverride || c.from;
  if (!to) throw new Error('No recipient — set BREVO_FROM or pass toOverride');

  return send({
    to,
    subject: `[Bridge AI OS] Mail test — ${new Date().toISOString()}`,
    html: `
      <h2>Mail transport working</h2>
      <p>This is an automated test from Bridge AI OS.</p>
      <p>Sent: ${new Date().toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })}</p>
      <p>Transport chain: Brevo → Gmail</p>
    `,
    text: `Mail transport working. Sent: ${new Date().toISOString()}`,
  });
}

// ── Status summary ────────────────────────────────────────────────────────────

function status() {
  return {
    brevo: {
      configured: isBrevoReady(),
      user:       cfg().brevo.user   ? cfg().brevo.user.replace(/(.{3}).*@/, '$1***@') : null,
      from:       cfg().brevo.from   || null,
    },
    gmail: {
      configured: isGmailReady(),
      user:       cfg().gmail.user   ? cfg().gmail.user.replace(/(.{3}).*@/, '$1***@') : null,
    },
    primary: isBrevoReady() ? 'brevo' : isGmailReady() ? 'gmail' : 'none',
  };
}

// ── Campaign email templates ──────────────────────────────────────────────────

const CAMPAIGN_TEMPLATES = {
  conversion: (user, data) => ({
    subject: 'Your Bridge AI OS trial is ready',
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#e0e0e0;padding:32px;border-radius:8px">
<h2 style="color:#00d4ff;margin-top:0">Welcome to Bridge AI OS</h2>
<p>Hi ${user.name || user.email},</p>
<p>You've been selected for exclusive access to the Bridge AI OS platform.</p>
<p style="margin:24px 0">
  <a href="https://ai-os.co.za/billing" style="background:#00d4ff;color:#000;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block">Upgrade Now — 20% Off</a>
</p>
<p style="color:#888;font-size:13px">This offer expires in 48 hours.</p>
</div>`,
  }),

  nurture: (user, data) => ({
    subject: 'Your AI system is waiting',
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#e0e0e0;padding:32px;border-radius:8px">
<h2 style="color:#00d4ff;margin-top:0">Ready to activate your AI OS?</h2>
<p>Hi ${user.name || user.email},</p>
<p>Your Bridge AI OS account is set up. Here's what's waiting for you:</p>
<ul style="line-height:1.8">
  <li>Multi-agent orchestration (AP2-v3)</li>
  <li>Real-time NeuroLink streaming</li>
  <li>Integrated CRM, invoicing, and lead generation</li>
</ul>
<p style="margin:24px 0">
  <a href="https://ai-os.co.za/profile" style="background:#00d4ff;color:#000;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block">Open Your Dashboard</a>
</p>
</div>`,
  }),

  offer: (user, data) => ({
    subject: `Special offer: ${data.offerTitle || 'Upgrade Bridge AI OS'}`,
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#e0e0e0;padding:32px;border-radius:8px">
<h2 style="color:#00d4ff;margin-top:0">${data.offerTitle || 'Exclusive Offer'}</h2>
<p>Hi ${user.name || user.email},</p>
<p>${data.offerBody || 'You have a special offer waiting on Bridge AI OS.'}</p>
<p style="margin:24px 0">
  <a href="https://ai-os.co.za/billing?offer=${data.offerCode || ''}" style="background:#00d4ff;color:#000;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block">Claim Offer</a>
</p>
</div>`,
  }),

  onboarding: (user, data) => ({
    subject: 'Welcome to Bridge AI OS — Getting Started',
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#e0e0e0;padding:32px;border-radius:8px">
<h2 style="color:#00d4ff;margin-top:0">You're in! Here's how to start.</h2>
<p>Hi ${user.name || user.email},</p>
<p>Your Bridge AI OS account is active. Take these first steps:</p>
<ol style="line-height:2">
  <li><a href="https://ai-os.co.za/demo" style="color:#00d4ff">Try the demo</a> — 5 free agent runs</li>
  <li><a href="https://ai-os.co.za/profile" style="color:#00d4ff">Set up your profile</a> — configure integrations</li>
  <li><a href="https://ai-os.co.za/projects" style="color:#00d4ff">Create your first project</a> — persistent AI workflows</li>
</ol>
<p style="margin:24px 0">
  <a href="https://ai-os.co.za/console" style="background:#00d4ff;color:#000;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block">Open Console</a>
</p>
</div>`,
  }),

  retention: (user, data) => ({
    subject: 'We noticed you might need help — Bridge AI OS',
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#e0e0e0;padding:32px;border-radius:8px">
<h2 style="color:#00d4ff;margin-top:0">We're here to help</h2>
<p>Hi ${user.name || user.email},</p>
<p>We noticed some unusual activity on your account and wanted to check in.</p>
<p>As a thank-you for being with us, here's a <strong style="color:#00d4ff">30% discount</strong> on your next month:</p>
<p style="margin:24px 0">
  <a href="https://ai-os.co.za/billing?discount=RETAIN30" style="background:#00d4ff;color:#000;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block">Claim 30% Off</a>
</p>
<p>Or reply to this email — we'd love to hear from you.</p>
</div>`,
  }),

  payment_success: (user, data) => ({
    subject: 'Payment confirmed — Plan upgraded',
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#e0e0e0;padding:32px;border-radius:8px">
<h2 style="color:#00d4ff;margin-top:0">Payment Confirmed ✓</h2>
<p>Hi ${user.name || user.email},</p>
<p>Your <strong>${data.plan || 'new'}</strong> plan is now active.</p>
${data.amount ? `<p>Amount paid: <strong style="color:#00d4ff">R${data.amount}</strong></p>` : ''}
<p><strong>What's included:</strong> ${data.features || 'Full platform access, multi-agent orchestration, NeuroLink streaming, CRM & invoicing'}</p>
<p style="margin:24px 0">
  <a href="https://ai-os.co.za/profile" style="background:#00d4ff;color:#000;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block">Access Your Dashboard</a>
</p>
</div>`,
  }),

  productivity_offer: (user, data) => ({
    subject: `Boost your focus — ${data.offerTitle || 'Focus Timer Pro available'}`,
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#e0e0e0;padding:32px;border-radius:8px">
<h2 style="color:#00d4ff;margin-top:0">Your focus window is open</h2>
<p>Hi ${user.name || user.email},</p>
<p>NeuroLink detected a high-focus window for you. Now's the best time to try:</p>
<p><strong style="color:#00d4ff">${data.offer || 'Focus Timer Pro + Distraction Blocker'}</strong>${data.price ? ` — $${data.price}` : ''}</p>
<p style="margin:24px 0">
  <a href="https://ai-os.co.za/billing" style="background:#00d4ff;color:#000;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block">Activate Now</a>
</p>
</div>`,
  }),
};

/**
 * Send a campaign email based on campaign type.
 * Silently skips if SMTP is not configured (returns { ok: false, reason }).
 *
 * @param {{ email: string, name?: string }} user
 * @param {string} campaignType  — one of: conversion, nurture, offer, onboarding, retention, payment_success, productivity_offer
 * @param {object} [data]        — template-specific variables (offerTitle, plan, amount, etc.)
 * @returns {Promise<{ ok: boolean, provider?: string, messageId?: string, reason?: string }>}
 */
async function sendCampaignEmail(user, campaignType, data = {}) {
  if (!user || !user.email) {
    console.warn('[mail] sendCampaignEmail: no user.email — skipping');
    return { ok: false, reason: 'no_email' };
  }

  if (!isBrevoReady() && !isGmailReady()) {
    console.warn('[mail] sendCampaignEmail: SMTP not configured — skipping campaign', campaignType, 'to', user.email);
    return { ok: false, reason: 'smtp_not_configured' };
  }

  const templateFn = CAMPAIGN_TEMPLATES[campaignType] || CAMPAIGN_TEMPLATES.nurture;
  const { subject, html } = templateFn(user, data);

  try {
    const result = await send({ to: user.email, subject, html });
    console.log(`[mail] campaign=${campaignType} to=${user.email} provider=${result.provider} id=${result.messageId}`);
    return result;
  } catch (err) {
    console.error(`[mail] campaign=${campaignType} to=${user.email} FAILED:`, err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { send, ping, test, status, isBrevoReady, isGmailReady, sendCampaignEmail };
