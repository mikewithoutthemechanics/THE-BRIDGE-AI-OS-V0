'use strict';

/**
 * leadgen-engine.js — Unified LeadGen + CRM + OSINT + Email Engine
 * Single SQLite database (users.db), replaces separate LowDB instances
 *
 * Mounts on the main server as Express routes:
 *   /api/leadgen/*   — agents, tasks, scraping
 *   /api/crm/*       — leads, interactions, campaigns, stats
 *   /api/outreach/*  — email queue, sending, tracking
 *   /api/osint/*     — company intelligence profiles
 */

const Database = require('better-sqlite3');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const path = require('path');

const DB_PATH = path.join(__dirname, 'users.db');

// ===== DB =====
let db;
function getDB() {
    if (!db) {
        db = new Database(DB_PATH);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
    }
    return db;
}

function uuid() { return crypto.randomUUID(); }

// ===== SECRETS + SMTP CONFIG =====
const secrets = require('./lib/secrets');

function getSmtpTransporter() {
    const host = secrets.getSecret('SMTP_HOST', 'smtp-relay.brevo.com');
    const port = parseInt(secrets.getSecret('SMTP_PORT', '587'));
    const user = secrets.getSecret('SMTP_USER', '');
    const pass = secrets.getSecret('SMTP_PASS', '');
    if (!user || !pass) return null;
    return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}

function getSmtpFrom() {
    return secrets.getSecret('SMTP_FROM', secrets.getSecret('SMTP_USER', ''));
}
const SMTP_FROM_NAME = process.env.SMTP_FROM_NAME || 'Bridge AI';

let transporter = getSmtpTransporter();

// ===== SCHEDULING =====
const OPTIMAL_SEND_HOURS = [9, 10, 14, 15];
const RATE_LIMIT = 5;
const AUTO_SEND_INTERVAL = 60 * 1000;

// ===== EMAIL TEMPLATES =====
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
<p>Noticed <b>${data.company}</b> is building in tech. We help companies like yours ship faster with AI-powered dev tools and automation.</p>
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
    founder: (data) => ({
        subject: `Growth Opportunity for ${data.company}`,
        html: `<p>Hi,</p>
<p>As a fellow founder, I know how precious time is. Our AI platform helps <b>${data.company}</b>-sized businesses automate repetitive work and focus on growth.</p>
<p>Worth a quick chat?</p>
<p>Best,<br>Bridge AI Team</p>`
    }),
    standard: (data) => ({
        subject: `How ${data.company} Can Benefit from AI Automation`,
        html: `<p>Hello,</p>
<p>We help businesses like <b>${data.company}</b> save time and money with intelligent automation.</p>
<p>Would you be open to a brief conversation about how we could help?</p>
<p>Kind regards,<br>Bridge AI Team</p>`
    }),
    general: (data) => ({
        subject: `Introduction — Bridge AI x ${data.company}`,
        html: `<p>Hi,</p>
<p>I'm reaching out because <b>${data.company}</b> looks like a great fit for our AI platform.</p>
<p>We'd love to explore how we can add value. Would you be open to connecting?</p>
<p>Best,<br>Bridge AI Team</p>`
    })
};

// ===== SCORE WEIGHTS =====
const SCORE_WEIGHTS = { email_opened: 5, link_clicked: 10, email_replied: 25, call_booked: 50 };

// ===== MOUNT ROUTES =====
function mount(app) {
    const d = getDB();

    // ─── AGENTS ──────────────────────────────────────────
    app.post('/api/leadgen/agents', (req, res) => {
        const id = uuid();
        const { name = 'agent-' + id.slice(0, 8), type = 'leadgen' } = req.body;
        d.prepare('INSERT INTO lg_agents (id, name, type) VALUES (?, ?, ?)').run(id, name, type);
        res.json({ id, name, type, status: 'active' });
    });

    app.get('/api/leadgen/agents', (req, res) => {
        res.json(d.prepare('SELECT * FROM lg_agents ORDER BY created_at DESC').all());
    });

    // ─── TASKS ───────────────────────────────────────────
    app.post('/api/leadgen/tasks', (req, res) => {
        const id = uuid();
        const { agent_id, payload } = req.body;
        const p = typeof payload === 'string' ? payload : JSON.stringify(payload);
        d.prepare('INSERT INTO lg_tasks (id, agent_id, payload) VALUES (?, ?, ?)').run(id, agent_id, p);
        res.json({ task_id: id, status: 'pending' });
    });

    app.get('/api/leadgen/tasks/:id', (req, res) => {
        const row = d.prepare('SELECT * FROM lg_tasks WHERE id = ?').get(req.params.id);
        row ? res.json(row) : res.status(404).json({ error: 'not found' });
    });

    app.get('/api/leadgen/tasks', (req, res) => {
        const limit = parseInt(req.query.limit) || 50;
        res.json(d.prepare('SELECT * FROM lg_tasks ORDER BY created_at DESC LIMIT ?').all(limit));
    });

    // ─── CRM LEADS ───────────────────────────────────────
    app.post('/api/crm/leads', (req, res) => {
        const id = uuid();
        const { email, company, osint_profile, source = 'scraper' } = req.body;
        const profile = typeof osint_profile === 'string' ? osint_profile : JSON.stringify(osint_profile || {});
        d.prepare('INSERT INTO crm_leads (id, email, company, source, osint_profile) VALUES (?, ?, ?, ?, ?)')
            .run(id, email, company || '', source, profile);
        res.json({ id, email, company, status: 'prospect', score: 0 });
    });

    // Also serve on /leads for backward compat with Python backend
    app.post('/leads', (req, res) => {
        const id = uuid();
        const { email, company, osint_profile, source = 'scraper' } = req.body;
        const profile = typeof osint_profile === 'string' ? osint_profile : JSON.stringify(osint_profile || {});
        d.prepare('INSERT INTO crm_leads (id, email, company, source, osint_profile) VALUES (?, ?, ?, ?, ?)')
            .run(id, email, company || '', source, profile);
        res.json({ id, email, company, status: 'prospect', score: 0 });
    });

    app.get('/api/crm/leads', (req, res) => {
        const { status, company, limit = 50 } = req.query;
        let sql = 'SELECT * FROM crm_leads WHERE 1=1';
        const params = [];
        if (status) { sql += ' AND status = ?'; params.push(status); }
        if (company) { sql += ' AND company LIKE ?'; params.push(`%${company}%`); }
        sql += ' ORDER BY created_at DESC LIMIT ?';
        params.push(parseInt(limit));
        res.json(d.prepare(sql).all(...params));
    });

    app.get('/api/crm/leads/:id', (req, res) => {
        const row = d.prepare('SELECT * FROM crm_leads WHERE id = ?').get(req.params.id);
        row ? res.json(row) : res.status(404).json({ error: 'not found' });
    });

    app.patch('/api/crm/leads/:id/status', (req, res) => {
        const { status } = req.body;
        d.prepare('UPDATE crm_leads SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(status, req.params.id);
        res.json({ id: req.params.id, status });
    });

    // ─── CRM INTERACTIONS ────────────────────────────────
    app.post('/api/crm/interactions', (req, res) => {
        const { lead_id, type, metadata } = req.body;
        const meta = typeof metadata === 'string' ? metadata : JSON.stringify(metadata || {});
        d.prepare('INSERT INTO crm_interactions (lead_id, type, metadata) VALUES (?, ?, ?)')
            .run(lead_id, type, meta);

        // Auto-score
        const weight = SCORE_WEIGHTS[type] || 0;
        if (weight > 0) {
            d.prepare('UPDATE crm_leads SET score = score + ? WHERE id = ?').run(weight, lead_id);
            // Auto-qualify
            const lead = d.prepare('SELECT score, status FROM crm_leads WHERE id = ?').get(lead_id);
            if (lead && lead.score >= 30 && lead.status === 'prospect') {
                d.prepare("UPDATE crm_leads SET status = 'qualified', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
                    .run(lead_id);
            }
        }
        res.json({ ok: true, score_added: weight });
    });

    // Backward compat
    app.post('/interactions', (req, res) => {
        const { lead_id, type, metadata } = req.body;
        const meta = typeof metadata === 'string' ? metadata : JSON.stringify(metadata || {});
        d.prepare('INSERT INTO crm_interactions (lead_id, type, metadata) VALUES (?, ?, ?)')
            .run(lead_id, type, meta);
        const weight = SCORE_WEIGHTS[type] || 0;
        if (weight > 0) {
            d.prepare('UPDATE crm_leads SET score = score + ? WHERE id = ?').run(weight, lead_id);
        }
        res.json({ ok: true });
    });

    app.get('/api/crm/interactions/:lead_id', (req, res) => {
        res.json(d.prepare('SELECT * FROM crm_interactions WHERE lead_id = ? ORDER BY created_at DESC')
            .all(req.params.lead_id));
    });

    // ─── CRM CAMPAIGNS ──────────────────────────────────
    app.post('/api/crm/campaigns', (req, res) => {
        const id = uuid();
        const { name, template_type = 'general' } = req.body;
        d.prepare('INSERT INTO crm_campaigns (id, name, template_type) VALUES (?, ?, ?)')
            .run(id, name, template_type);
        res.json({ id, name, template_type, status: 'draft' });
    });

    app.get('/api/crm/campaigns', (req, res) => {
        res.json(d.prepare('SELECT * FROM crm_campaigns ORDER BY created_at DESC').all());
    });

    app.patch('/api/crm/campaigns/:id/launch', (req, res) => {
        d.prepare("UPDATE crm_campaigns SET status = 'active' WHERE id = ?").run(req.params.id);
        res.json({ id: req.params.id, status: 'active' });
    });

    // ─── CRM STATS ───────────────────────────────────────
    app.get('/api/crm/stats', (req, res) => {
        const total = d.prepare('SELECT COUNT(*) as c FROM crm_leads').get().c;
        const byStatus = {};
        for (const s of ['prospect', 'qualified', 'deal', 'won']) {
            byStatus[s] = d.prepare('SELECT COUNT(*) as c FROM crm_leads WHERE status = ?').get(s).c;
        }
        const interactions = {};
        for (const row of d.prepare('SELECT type, COUNT(*) as c FROM crm_interactions GROUP BY type').all()) {
            interactions[row.type] = row.c;
        }
        const avgScore = d.prepare('SELECT AVG(score) as a FROM crm_leads').get().a || 0;
        const campaignsActive = d.prepare("SELECT COUNT(*) as c FROM crm_campaigns WHERE status = 'active'").get().c;
        res.json({ total_leads: total, by_status: byStatus, interactions, avg_lead_score: Math.round(avgScore), campaigns_active: campaignsActive });
    });

    // Backward compat
    app.get('/stats', (req, res) => {
        const total = d.prepare('SELECT COUNT(*) as c FROM crm_leads').get().c;
        const byStatus = {};
        for (const s of ['prospect', 'qualified', 'deal', 'won']) {
            byStatus[s] = d.prepare('SELECT COUNT(*) as c FROM crm_leads WHERE status = ?').get(s).c;
        }
        res.json({ total_leads: total, by_status: byStatus, avg_lead_score: 0, campaigns_active: 0 });
    });

    // ─── OUTREACH (Email Queue) ──────────────────────────
    app.post('/api/outreach/queue', (req, res) => {
        const id = uuid();
        const { email, company, template_type = 'general', campaign_id } = req.body;
        d.prepare('INSERT INTO email_outreach (id, email, company, template_type, campaign_id) VALUES (?, ?, ?, ?, ?)')
            .run(id, email, company || '', template_type, campaign_id || null);
        res.json({ id, status: 'queued' });
    });

    // Backward compat for LeadGenX POST /leads
    app.post('/api/outreach/leads', (req, res) => {
        const id = uuid();
        const { email, company, template_type = 'general' } = req.body;
        d.prepare('INSERT INTO email_outreach (id, email, company, template_type) VALUES (?, ?, ?, ?)')
            .run(id, email, company || '', template_type);
        res.json({ id, status: 'queued' });
    });

    app.get('/api/outreach/stats', (req, res) => {
        const queued = d.prepare("SELECT COUNT(*) as c FROM email_outreach WHERE status = 'queued'").get().c;
        const sent = d.prepare('SELECT COUNT(*) as c FROM email_sent').get().c;
        const opened = d.prepare('SELECT COUNT(*) as c FROM email_opens').get().c;
        const followups = d.prepare('SELECT COUNT(*) as c FROM email_followups').get().c;
        res.json({ queued, sent, opened, followups });
    });

    // ─── TRACKING ENDPOINTS ──────────────────────────────
    app.get('/api/outreach/pixel/:id', (req, res) => {
        const sentId = req.params.id;
        const openId = uuid();
        try {
            d.prepare('INSERT INTO email_opens (id, sent_id, ip, user_agent) VALUES (?, ?, ?, ?)')
                .run(openId, sentId, req.ip, req.get('user-agent') || '');
            // Report to CRM
            const sent = d.prepare('SELECT email FROM email_sent WHERE id = ?').get(sentId);
            if (sent) {
                const lead = d.prepare('SELECT id FROM crm_leads WHERE email = ?').get(sent.email);
                if (lead) {
                    d.prepare('INSERT INTO crm_interactions (lead_id, type, metadata) VALUES (?, ?, ?)')
                        .run(lead.id, 'email_opened', JSON.stringify({ sent_id: sentId }));
                    d.prepare('UPDATE crm_leads SET score = score + 5 WHERE id = ?').run(lead.id);
                }
            }
        } catch (e) { /* duplicate open, ignore */ }
        // 1x1 transparent pixel
        const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
        res.set('Content-Type', 'image/gif');
        res.set('Cache-Control', 'no-store');
        res.send(pixel);
    });

    app.get('/api/outreach/click/:id', (req, res) => {
        const sentId = req.params.id;
        const clickId = uuid();
        try {
            d.prepare('INSERT INTO email_clicks (id, sent_id, url) VALUES (?, ?, ?)')
                .run(clickId, sentId, req.query.url || '');
            const sent = d.prepare('SELECT email FROM email_sent WHERE id = ?').get(sentId);
            if (sent) {
                const lead = d.prepare('SELECT id FROM crm_leads WHERE email = ?').get(sent.email);
                if (lead) {
                    d.prepare('INSERT INTO crm_interactions (lead_id, type, metadata) VALUES (?, ?, ?)')
                        .run(lead.id, 'link_clicked', JSON.stringify({ sent_id: sentId }));
                    d.prepare('UPDATE crm_leads SET score = score + 10 WHERE id = ?').run(lead.id);
                }
            }
        } catch (e) { /* ignore */ }
        res.redirect(req.query.url || 'https://bridge-ai.co');
    });

    // ─── OSINT REGISTRY ──────────────────────────────────
    app.post('/api/osint/register', (req, res) => {
        const { task_id, url, title, emails, company_name, industry, size_estimate, template_type, profile_confidence, full_profile } = req.body;
        const e = typeof emails === 'string' ? emails : JSON.stringify(emails || []);
        const fp = typeof full_profile === 'string' ? full_profile : JSON.stringify(full_profile || {});
        d.prepare(`INSERT INTO osint_registry (task_id, url, title, emails, company_name, industry, size_estimate, template_type, profile_confidence, full_profile)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(task_id, url, title, e, company_name, industry, size_estimate, template_type, profile_confidence, fp);
        res.json({ ok: true });
    });

    app.get('/api/osint/profiles', (req, res) => {
        const { industry, limit = 50 } = req.query;
        let sql = 'SELECT * FROM osint_registry WHERE 1=1';
        const params = [];
        if (industry) { sql += ' AND industry = ?'; params.push(industry); }
        sql += ' ORDER BY created_at DESC LIMIT ?';
        params.push(parseInt(limit));
        res.json(d.prepare(sql).all(...params));
    });

    // ─── AUTO-SEND LOOP ──────────────────────────────────
    async function sendBatch() {
        // Refresh transporter each batch (picks up rotated secrets)
        transporter = getSmtpTransporter();
        if (!transporter) return;
        const hour = new Date().getHours();
        if (!OPTIMAL_SEND_HOURS.includes(hour)) return;

        const queued = d.prepare("SELECT * FROM email_outreach WHERE status = 'queued' LIMIT ?").all(RATE_LIMIT);
        let sentCount = 0;

        for (const item of queued) {
            const sentId = uuid();
            const templateFn = emailTemplates[item.template_type] || emailTemplates.general;
            const { subject, html } = templateFn({ company: item.company || 'your company', email: item.email });

            const trackingPixel = `<img src="https://go.ai-os.co.za/api/outreach/pixel/${sentId}" width="1" height="1" />`;
            const trackingLink = `https://go.ai-os.co.za/api/outreach/click/${sentId}?url=https://bridge-ai.co`;
            const fullHtml = html.replace('</p>\n', `</p>\n<p><a href="${trackingLink}">Learn more about Bridge AI</a></p>\n`) + trackingPixel;

            try {
                await transporter.sendMail({
                    from: `"${SMTP_FROM_NAME}" <${getSmtpFrom()}>`,
                    to: item.email,
                    subject,
                    html: fullHtml
                });

                d.prepare('INSERT INTO email_sent (id, outreach_id, email, subject, template_type) VALUES (?, ?, ?, ?, ?)')
                    .run(sentId, item.id, item.email, subject, item.template_type);
                d.prepare("UPDATE email_outreach SET status = 'sent' WHERE id = ?").run(item.id);
                sentCount++;
            } catch (err) {
                console.log(`[OUTREACH] Send failed for ${item.email}: ${err.message}`);
                d.prepare("UPDATE email_outreach SET status = 'failed' WHERE id = ?").run(item.id);
            }
        }
        if (sentCount > 0) console.log(`[OUTREACH] Sent ${sentCount} emails`);
    }

    // Start auto-send loop
    setInterval(sendBatch, AUTO_SEND_INTERVAL);
    console.log(`[LEADGEN] Engine mounted — SMTP: ${secrets.getSecret('SMTP_USER') || 'not configured'}`);
    console.log(`[LEADGEN] Auto-send: every ${AUTO_SEND_INTERVAL / 1000}s during hours ${OPTIMAL_SEND_HOURS.join(',')}`);
}

module.exports = { mount, getDB };
