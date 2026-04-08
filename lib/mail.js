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

module.exports = { send, ping, test, status, isBrevoReady, isGmailReady };
