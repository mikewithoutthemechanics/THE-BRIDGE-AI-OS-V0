/**
 * scripts/sendEmails.js — Bridge AI OS superuser welcome emails
 *
 * Sends a welcome/activation email to each superuser via Brevo SMTP.
 *
 * Usage:
 *   BREVO_SMTP_KEY=<key> node scripts/sendEmails.js
 *
 * Environment variables:
 *   BREVO_SMTP_KEY  — Brevo SMTP API key (required)
 *   FROM_EMAIL      — Sender address (default: noreply@bridge-ai-os.com)
 */

'use strict';

require('dotenv').config();

const nodemailer = require('nodemailer');

const SUPERUSERS = [
  { email: 'ryanpcowan@gmail.com',      name: 'Ryan' },
  { email: 'michaelgraemek@gmail.com',  name: 'Michael' },
  { email: 'marvin.saunders@gmail.com', name: 'Marvin' },
];

const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@bridge-ai-os.com';

if (!process.env.BREVO_SMTP_KEY) {
  console.error('[sendEmails] ERROR: BREVO_SMTP_KEY environment variable is not set.');
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com',
  port: 587,
  auth: {
    user: 'apikey',
    pass: process.env.BREVO_SMTP_KEY,
  },
});

function buildEmailBody(name) {
  return `Hello ${name},

Your Superuser access to Bridge AI OS has been successfully activated.

🔐 LOGIN:
https://go.ai-os.co.za/onboarding.html

Once you log in, you will be automatically redirected to your admin control panel.

---

🧠 YOUR ACCESS INCLUDES:

• Full Admin Panel
  https://go.ai-os.co.za/admin.html

• System Dashboard
  https://go.ai-os.co.za/dashboard.html

• Command Execution
  https://go.ai-os.co.za/admin-command.html

• Revenue Intelligence
  https://go.ai-os.co.za/admin-revenue.html

• Withdrawals
  https://go.ai-os.co.za/admin-withdraw.html

• Audit Logs
  https://go.ai-os.co.za/bridge-audit-dashboard.html

• God Mode Terminal
  https://go.ai-os.co.za/godmode-terminal.html

---

⚙️ HOW IT WORKS:

• Your email = your identity
• No separate admin login required
• System assigns your avatar + wallet automatically
• All actions are tied to your economic tier + agent role

---

💰 ECONOMIC SYSTEM:

• Each user operates via an avatar wallet
• Revenue flows based on function + tier
• Agents created under you inherit billing logic
• You have full control over system economics

---

🔒 SECURITY:

• Token-based authentication (bridge_token)
• Full audit logging of all actions
• Session persists per domain
• Cross-domain joins require re-auth

---

🚀 NEXT STEP:

Log in now and verify access:
https://go.ai-os.co.za/onboarding.html

---

Bridge AI OS
God Mode Enabled
`;
}

async function sendEmails() {
  for (const user of SUPERUSERS) {
    try {
      await transporter.sendMail({
        from: `"Bridge AI OS" <${FROM_EMAIL}>`,
        to: user.email,
        subject: 'Bridge AI OS — Superuser Access Activated',
        text: buildEmailBody(user.name),
      });
      console.log(`[sendEmails] ✓ Sent to ${user.email}`);
    } catch (err) {
      console.error(`[sendEmails] ✗ Failed to send to ${user.email}:`, err.message);
    }
  }
}

sendEmails().catch(err => {
  console.error('[sendEmails] Fatal error:', err);
  process.exit(1);
});
