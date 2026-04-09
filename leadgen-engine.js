'use strict';

/**
 * leadgen-engine.js — Unified LeadGen + CRM + OSINT + Email Engine
 * Backed by Supabase, replaces separate SQLite instances
 *
 * Mounts on the main server as Express routes:
 *   /api/leadgen/*   — agents, tasks, scraping
 *   /api/crm/*       — leads, interactions, campaigns, stats
 *   /api/outreach/*  — email queue, sending, tracking
 *   /api/osint/*     — company intelligence profiles
 */

const { supabase } = require('./lib/supabase');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const mail       = require('./lib/mail');
const path = require('path');

function uuid() { return crypto.randomUUID(); }

// ===== SECRETS + SMTP CONFIG =====
const secrets = require('./lib/secrets');

function buildTransport(host, port, user, pass, rejectUnauthorized = false) {
    return nodemailer.createTransport({
        host, port: parseInt(port),
        secure: parseInt(port) === 465,
        auth: { user, pass },
        tls: { rejectUnauthorized },
    });
}

function getSmtpTransporter() {
    const host = secrets.getSecret('SMTP_HOST', 'mail.api.ai-os.co.za');
    const port = secrets.getSecret('SMTP_PORT', '587');
    const user = secrets.getSecret('SMTP_USER', '');
    const pass = secrets.getSecret('SMTP_PASS', '');
    if (!user || !pass) return null;
    const rejectUnauthorized = secrets.getSecret('SMTP_TLS_REJECT_UNAUTHORIZED', 'false') !== 'false';
    return buildTransport(host, port, user, pass, rejectUnauthorized);
}

function getBrevoFallbackTransporter() {
    const host = secrets.getSecret('SMTP_BACKUP_HOST', 'smtp-relay.brevo.com');
    const port = secrets.getSecret('SMTP_BACKUP_PORT', '587');
    const user = secrets.getSecret('SMTP_BACKUP_USER', '');
    const pass = secrets.getSecret('SMTP_BACKUP_PASS', '');
    if (!user || !pass) return null;
    return buildTransport(host, port, user, pass, true);
}

async function sendMailWithFallback(mailOptions) {
    // Delegate to lib/mail.js — Brevo primary, Gmail backup
    return mail.send(mailOptions);
}

function getSmtpFrom() {
    return secrets.getSecret('SMTP_FROM', secrets.getSecret('SMTP_USER', 'admin@api.ai-os.co.za'));
}
const SMTP_FROM_NAME = process.env.SMTP_FROM_NAME || secrets.getSecret('SMTP_FROM_NAME', 'Mr. Myburg — Bridge AI Brain');

// transporter is now built on-demand via sendMailWithFallback() — supports hot-reload of secrets
let transporter = null;

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

    // ─── AGENTS ──────────────────────────────────────
    app.post('/api/leadgen/agents', async (req, res) => {
        const id = uuid();
        const { name = 'agent-' + id.slice(0, 8), type = 'leadgen' } = req.body;
        await supabase.from('lg_agents').insert({ id, name, type });
        res.json({ id, name, type, status: 'active' });
    });

    app.get('/api/leadgen/agents', async (req, res) => {
        const { data } = await supabase.from('lg_agents').select('*').order('created_at', { ascending: false });
        res.json(data || []);
    });

    // ─── TASKS ───────────────────────────────────────
    app.post('/api/leadgen/tasks', async (req, res) => {
        const id = uuid();
        const { agent_id, payload } = req.body;
        const p = typeof payload === 'string' ? payload : JSON.stringify(payload);
        await supabase.from('lg_tasks').insert({ id, agent_id, payload: p });
        res.json({ task_id: id, status: 'pending' });
    });

    app.get('/api/leadgen/tasks/:id', async (req, res) => {
        const { data } = await supabase.from('lg_tasks').select('*').eq('id', req.params.id).single();
        data ? res.json(data) : res.status(404).json({ error: 'not found' });
    });

    app.get('/api/leadgen/tasks', async (req, res) => {
        const limit = parseInt(req.query.limit) || 50;
        const { data } = await supabase.from('lg_tasks').select('*').order('created_at', { ascending: false }).limit(limit);
        res.json(data || []);
    });

    // ─── CRM LEADS ───────────────────────────────────
    app.post('/api/crm/leads', async (req, res) => {
        const id = uuid();
        const { email, company, osint_profile, source = 'scraper' } = req.body;
        const profile = typeof osint_profile === 'string' ? osint_profile : JSON.stringify(osint_profile || {});
        await supabase.from('crm_leads').insert({ id, email, company: company || '', source, osint_profile: profile });
        res.json({ id, email, company, status: 'prospect', score: 0 });
    });

    // Also serve on /leads for backward compat with Python backend
    app.post('/leads', async (req, res) => {
        const id = uuid();
        const { email, company, osint_profile, source = 'scraper' } = req.body;
        const profile = typeof osint_profile === 'string' ? osint_profile : JSON.stringify(osint_profile || {});
        await supabase.from('crm_leads').insert({ id, email, company: company || '', source, osint_profile: profile });
        res.json({ id, email, company, status: 'prospect', score: 0 });
    });

    app.get('/api/crm/leads', async (req, res) => {
        const { status, company, limit = 50 } = req.query;
        let query = supabase.from('crm_leads').select('*');
        if (status) query = query.eq('status', status);
        if (company) query = query.ilike('company', `%${company}%`);
        query = query.order('created_at', { ascending: false }).limit(parseInt(limit));
        const { data } = await query;
        res.json(data || []);
    });

    app.get('/api/crm/leads/:id', async (req, res) => {
        const { data } = await supabase.from('crm_leads').select('*').eq('id', req.params.id).single();
        data ? res.json(data) : res.status(404).json({ error: 'not found' });
    });

    app.patch('/api/crm/leads/:id/status', async (req, res) => {
        const { status } = req.body;
        await supabase.from('crm_leads').update({ status, updated_at: new Date().toISOString() }).eq('id', req.params.id);
        res.json({ id: req.params.id, status });
    });

    // ─── CRM INTERACTIONS ────────────────────────────
    app.post('/api/crm/interactions', async (req, res) => {
        const { lead_id, type, metadata } = req.body;
        const meta = typeof metadata === 'string' ? metadata : JSON.stringify(metadata || {});
        await supabase.from('crm_interactions').insert({ lead_id, type, metadata: meta });

        // Auto-score
        const weight = SCORE_WEIGHTS[type] || 0;
        if (weight > 0) {
            const { data: lead } = await supabase.from('crm_leads').select('score, status').eq('id', lead_id).single();
            if (lead) {
                const newScore = (lead.score || 0) + weight;
                const updates = { score: newScore };
                if (newScore >= 30 && lead.status === 'prospect') {
                    updates.status = 'qualified';
                    updates.updated_at = new Date().toISOString();
                }
                await supabase.from('crm_leads').update(updates).eq('id', lead_id);
            }
        }
        res.json({ ok: true, score_added: weight });
    });

    // Backward compat
    app.post('/interactions', async (req, res) => {
        const { lead_id, type, metadata } = req.body;
        const meta = typeof metadata === 'string' ? metadata : JSON.stringify(metadata || {});
        await supabase.from('crm_interactions').insert({ lead_id, type, metadata: meta });
        const weight = SCORE_WEIGHTS[type] || 0;
        if (weight > 0) {
            const { data: lead } = await supabase.from('crm_leads').select('score').eq('id', lead_id).single();
            if (lead) {
                await supabase.from('crm_leads').update({ score: (lead.score || 0) + weight }).eq('id', lead_id);
            }
        }
        res.json({ ok: true });
    });

    app.get('/api/crm/interactions/:lead_id', async (req, res) => {
        const { data } = await supabase.from('crm_interactions').select('*').eq('lead_id', req.params.lead_id).order('created_at', { ascending: false });
        res.json(data || []);
    });

    // ─── CRM CAMPAIGNS ──────────────────────────────
    app.post('/api/crm/campaigns', async (req, res) => {
        const id = uuid();
        const { name, template_type = 'general' } = req.body;
        await supabase.from('crm_campaigns').insert({ id, name, template_type });
        res.json({ id, name, template_type, status: 'draft' });
    });

    app.get('/api/crm/campaigns', async (req, res) => {
        const { data } = await supabase.from('crm_campaigns').select('*').order('created_at', { ascending: false });
        res.json(data || []);
    });

    app.patch('/api/crm/campaigns/:id/launch', async (req, res) => {
        await supabase.from('crm_campaigns').update({ status: 'active' }).eq('id', req.params.id);
        res.json({ id: req.params.id, status: 'active' });
    });

    // ─── CRM STATS ───────────────────────────────────
    app.get('/api/crm/stats', async (req, res) => {
        const { count: total } = await supabase.from('crm_leads').select('*', { count: 'exact', head: true });
        const byStatus = {};
        for (const s of ['prospect', 'qualified', 'deal', 'won']) {
            const { count } = await supabase.from('crm_leads').select('*', { count: 'exact', head: true }).eq('status', s);
            byStatus[s] = count || 0;
        }
        const { data: interRows } = await supabase.from('crm_interactions').select('type');
        const interactions = {};
        (interRows || []).forEach(r => { interactions[r.type] = (interactions[r.type] || 0) + 1; });
        const { data: scoreRows } = await supabase.from('crm_leads').select('score');
        const scores = (scoreRows || []).map(r => r.score || 0);
        const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
        const { count: campaignsActive } = await supabase.from('crm_campaigns').select('*', { count: 'exact', head: true }).eq('status', 'active');
        res.json({ total_leads: total || 0, by_status: byStatus, interactions, avg_lead_score: avgScore, campaigns_active: campaignsActive || 0 });
    });

    // Backward compat
    app.get('/stats', async (req, res) => {
        const { count: total } = await supabase.from('crm_leads').select('*', { count: 'exact', head: true });
        const byStatus = {};
        for (const s of ['prospect', 'qualified', 'deal', 'won']) {
            const { count } = await supabase.from('crm_leads').select('*', { count: 'exact', head: true }).eq('status', s);
            byStatus[s] = count || 0;
        }
        res.json({ total_leads: total || 0, by_status: byStatus, avg_lead_score: 0, campaigns_active: 0 });
    });

    // ─── OUTREACH (Email Queue) ──────────────────────
    app.post('/api/outreach/queue', async (req, res) => {
        const id = uuid();
        const { email, company, template_type = 'general', campaign_id } = req.body;
        await supabase.from('email_outreach').insert({ id, email, company: company || '', template_type, campaign_id: campaign_id || null });
        res.json({ id, status: 'queued' });
    });

    // Backward compat for LeadGenX POST /leads
    app.post('/api/outreach/leads', async (req, res) => {
        const id = uuid();
        const { email, company, template_type = 'general' } = req.body;
        await supabase.from('email_outreach').insert({ id, email, company: company || '', template_type });
        res.json({ id, status: 'queued' });
    });

    app.get('/api/outreach/stats', async (req, res) => {
        const { count: queued } = await supabase.from('email_outreach').select('*', { count: 'exact', head: true }).eq('status', 'queued');
        const { count: sent } = await supabase.from('email_sent').select('*', { count: 'exact', head: true });
        const { count: opened } = await supabase.from('email_opens').select('*', { count: 'exact', head: true });
        const { count: followups } = await supabase.from('email_followups').select('*', { count: 'exact', head: true });
        res.json({ queued: queued || 0, sent: sent || 0, opened: opened || 0, followups: followups || 0 });
    });

    // ─── TRACKING ENDPOINTS ──────────────────────────
    app.get('/api/outreach/pixel/:id', async (req, res) => {
        const sentId = req.params.id;
        const openId = uuid();
        try {
            await supabase.from('email_opens').insert({ id: openId, sent_id: sentId, ip: req.ip, user_agent: req.get('user-agent') || '' });
            // Report to CRM
            const { data: sentRow } = await supabase.from('email_sent').select('email').eq('id', sentId).single();
            if (sentRow) {
                const { data: lead } = await supabase.from('crm_leads').select('id').eq('email', sentRow.email).single();
                if (lead) {
                    await supabase.from('crm_interactions').insert({ lead_id: lead.id, type: 'email_opened', metadata: JSON.stringify({ sent_id: sentId }) });
                    const { data: curLead } = await supabase.from('crm_leads').select('score').eq('id', lead.id).single();
                    if (curLead) await supabase.from('crm_leads').update({ score: (curLead.score || 0) + 5 }).eq('id', lead.id);
                }
            }
        } catch (_) { /* duplicate open, ignore */ }
        // 1x1 transparent pixel
        const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
        res.set('Content-Type', 'image/gif');
        res.set('Cache-Control', 'no-store');
        res.send(pixel);
    });

    app.get('/api/outreach/click/:id', async (req, res) => {
        const sentId = req.params.id;
        const clickId = uuid();
        try {
            await supabase.from('email_clicks').insert({ id: clickId, sent_id: sentId, url: req.query.url || '' });
            const { data: sentRow } = await supabase.from('email_sent').select('email').eq('id', sentId).single();
            if (sentRow) {
                const { data: lead } = await supabase.from('crm_leads').select('id').eq('email', sentRow.email).single();
                if (lead) {
                    await supabase.from('crm_interactions').insert({ lead_id: lead.id, type: 'link_clicked', metadata: JSON.stringify({ sent_id: sentId }) });
                    const { data: curLead } = await supabase.from('crm_leads').select('score').eq('id', lead.id).single();
                    if (curLead) await supabase.from('crm_leads').update({ score: (curLead.score || 0) + 10 }).eq('id', lead.id);
                }
            }
        } catch (_) { /* ignore */ }
        res.redirect(req.query.url || 'https://bridge-ai.co');
    });

    // ─── OSINT REGISTRY ──────────────────────────────
    app.post('/api/osint/register', async (req, res) => {
        const { task_id, url, title, emails, company_name, industry, size_estimate, template_type, profile_confidence, full_profile } = req.body;
        const e = typeof emails === 'string' ? emails : JSON.stringify(emails || []);
        const fp = typeof full_profile === 'string' ? full_profile : JSON.stringify(full_profile || {});
        await supabase.from('osint_registry').insert({ task_id, url, title, emails: e, company_name, industry, size_estimate, template_type, profile_confidence, full_profile: fp });
        res.json({ ok: true });
    });

    app.get('/api/osint/profiles', async (req, res) => {
        const { industry, limit = 50 } = req.query;
        let query = supabase.from('osint_registry').select('*');
        if (industry) query = query.eq('industry', industry);
        query = query.order('created_at', { ascending: false }).limit(parseInt(limit));
        const { data } = await query;
        res.json(data || []);
    });

    // ─── AUTO-SEND LOOP ──────────────────────────────
    async function sendBatch() {
        // Refresh transporter each batch (picks up rotated secrets)
        transporter = getSmtpTransporter();
        if (!transporter) return;
        const hour = new Date().getHours();
        if (!OPTIMAL_SEND_HOURS.includes(hour)) return;

        const { data: queued } = await supabase.from('email_outreach').select('*').eq('status', 'queued').limit(RATE_LIMIT);
        let sentCount = 0;

        for (const item of (queued || [])) {
            const sentId = uuid();
            const templateFn = emailTemplates[item.template_type] || emailTemplates.general;
            const { subject, html } = templateFn({ company: item.company || 'your company', email: item.email });

            const trackingPixel = `<img src="https://go.ai-os.co.za/api/outreach/pixel/${sentId}" width="1" height="1" />`;
            const trackingLink = `https://go.ai-os.co.za/api/outreach/click/${sentId}?url=https://bridge-ai.co`;
            const fullHtml = html.replace('</p>\n', `</p>\n<p><a href="${trackingLink}">Learn more about Bridge AI</a></p>\n`) + trackingPixel;

            try {
                await sendMailWithFallback({
                    from: `"${SMTP_FROM_NAME}" <${getSmtpFrom()}>`,
                    to: item.email,
                    subject,
                    html: fullHtml
                });

                await supabase.from('email_sent').insert({ id: sentId, outreach_id: item.id, email: item.email, subject, template_type: item.template_type });
                await supabase.from('email_outreach').update({ status: 'sent' }).eq('id', item.id);
                sentCount++;
            } catch (err) {
                console.log(`[OUTREACH] Send failed for ${item.email}: ${err.message}`);
                await supabase.from('email_outreach').update({ status: 'failed' }).eq('id', item.id);
            }
        }
        if (sentCount > 0) console.log(`[OUTREACH] Sent ${sentCount} emails`);
    }

    // Start auto-send loop
    setInterval(sendBatch, AUTO_SEND_INTERVAL);
    console.log(`[LEADGEN] Engine mounted — SMTP: ${secrets.getSecret('SMTP_USER') || 'not configured'}`);
    console.log(`[LEADGEN] Auto-send: every ${AUTO_SEND_INTERVAL / 1000}s during hours ${OPTIMAL_SEND_HOURS.join(',')}`);
}

module.exports = { mount };
