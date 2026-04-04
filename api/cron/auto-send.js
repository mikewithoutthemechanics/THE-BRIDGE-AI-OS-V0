/**
 * Vercel Serverless Function: GET /api/cron/auto-send
 * Runs every 60 seconds via Vercel Cron
 * Sends queued emails during optimal hours (9am, 10am, 2pm, 3pm)
 *
 * Set up in vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/auto-send",
 *     "schedule": "*/1 * * * *"
 *   }]
 * }
 */

const nodemailer = require('nodemailer');
const { getSecret, getQueuedEmails, markEmailSent } = require('../../lib/supabase');

const OPTIMAL_SEND_HOURS = [9, 10, 14, 15];
const RATE_LIMIT = 5;

const emailTemplates = {
  executive: (data) => ({
    subject: `Strategic Partnership Opportunity — ${data.company}`,
    html: `<p>Dear Decision Maker at <b>${data.company}</b>,</p>
<p>We've identified a strategic opportunity to enhance your operations with AI-powered automation.</p>
<p>Our platform delivers measurable ROI within 30 days. Could we schedule a 15-minute executive briefing?</p>
<p>Best regards,<br>Bridge AI Team</p>`
  }),
  tech_founder: (data) => ({
    subject: `AI Infrastructure for ${data.company}`,
    html: `<p>Hi,</p>
<p>Noticed <b>${data.company}</b> is building in tech. We help companies like yours ship faster with AI-powered dev tools.</p>
<p>Would love to show you a quick demo — no strings attached.</p>
<p>Cheers,<br>Bridge AI Team</p>`
  }),
  marketing_pro: (data) => ({
    subject: `Boost ${data.company}'s Lead Generation with AI`,
    html: `<p>Hi there,</p>
<p>Marketing teams at companies like <b>${data.company}</b> are using our AI to 3x their lead pipeline.</p>
<p>Interested in seeing how? Happy to walk you through it.</p>
<p>Best,<br>Bridge AI Team</p>`
  }),
  general: (data) => ({
    subject: `Introduction — Bridge AI x ${data.company}`,
    html: `<p>Hi,</p>
<p>I'm reaching out because <b>${data.company}</b> looks like a great fit for our platform.</p>
<p>Would you be open to a quick conversation?</p>
<p>Best,<br>Bridge AI Team</p>`
  })
};

async function createTransporter() {
  const smtpHost = await getSecret('SMTP_HOST');
  const smtpPort = await getSecret('SMTP_PORT', '587');
  const smtpUser = await getSecret('SMTP_USER');
  const smtpPass = await getSecret('SMTP_PASS');

  if (!smtpUser || !smtpPass) {
    throw new Error('SMTP credentials not configured in Supabase secrets_vault');
  }

  return nodemailer.createTransport({
    host: smtpHost,
    port: parseInt(smtpPort),
    secure: false,
    auth: {
      user: smtpUser,
      pass: smtpPass
    }
  });
}

module.exports = async (req, res) => {
  // Verify cron secret
  const cronSecret = req.headers['x-vercel-cron-secret'];
  if (cronSecret !== process.env.VERCEL_CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const hour = new Date().getHours();

  // Only send during optimal hours
  if (!OPTIMAL_SEND_HOURS.includes(hour)) {
    return res.json({
      message: 'Not optimal send hour',
      current_hour: hour,
      optimal_hours: OPTIMAL_SEND_HOURS
    });
  }

  try {
    const transporter = await createTransporter();
    const smtpFrom = await getSecret('SMTP_FROM', 'noreply@bridge-ai.co');
    const smtpFromName = await getSecret('SMTP_FROM_NAME', 'Bridge AI');

    // Get queued emails
    const queued = await getQueuedEmails(RATE_LIMIT);

    if (queued.length === 0) {
      return res.json({ message: 'No queued emails', sent: 0 });
    }

    let sentCount = 0;
    const errors = [];

    for (const item of queued) {
      try {
        const templateFn = emailTemplates[item.template_type] || emailTemplates.general;
        const { subject, html } = templateFn({
          company: item.company || 'your company',
          email: item.email
        });

        // Add tracking pixel
        const trackingPixel = `<img src="https://go.ai-os.co.za/api/tracking/pixel/${item.id}" width="1" height="1" style="display:none;" />`;
        const fullHtml = html + trackingPixel;

        // Send email
        await transporter.sendMail({
          from: `"${smtpFromName}" <${smtpFrom}>`,
          to: item.email,
          subject,
          html: fullHtml
        });

        // Mark as sent in Supabase
        await markEmailSent(item.id, item.email, subject, item.template_type);
        sentCount++;
        console.log(`[AUTO-SEND] Sent to: ${item.email}`);
      } catch (err) {
        const errMsg = `Failed for ${item.email}: ${err.message}`;
        console.error('[AUTO-SEND]', errMsg);
        errors.push(errMsg);
      }
    }

    res.json({
      success: true,
      hour,
      sent: sentCount,
      total_queued: queued.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (err) {
    console.error('[AUTO-SEND] Fatal error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
