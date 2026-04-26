// routes/affiliate.js — Affiliate program API
// Mounted at /api/affiliate by server.js (before brain catch-all).
// Uses affiliate_referrals (economyDb) as the profile table — this is the
// canonical table in bridgeai_economy created by the existing migration schema.

const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();

module.exports = function affiliateRouter(db) {

  // ── GET /api/affiliate/me ─────────────────────────────────────────────────
  // Returns authenticated affiliate's dashboard data.
  // Auto-creates an affiliate_referrals row if none exists for this user.
  router.get('/me', async (req, res) => {
    const userId = req.user?.id || req.headers['x-user-id'];
    if (!userId) return res.status(401).json({ error: 'auth_required' });

    try {
      const profile = await _getOrCreate(db, String(userId));
      const code    = profile.referral_code;

      const [metrics, referrals] = await Promise.all([
        db.query('SELECT * FROM get_affiliate_metrics($1)', [code]).then(r => r.rows[0] || {}),
        db.query(`
          SELECT ae.event_data->>'email'  AS email,
                 ae.event_data->>'source' AS source,
                 ae.created_at            AS joined,
                 ae.event_data->>'status' AS status,
                 COALESCE(ac.amount, 0)   AS earnings
          FROM affiliate_events ae
          LEFT JOIN affiliate_commissions ac ON ac.event_id = ae.id
          WHERE ae.referral_code = $1 AND ae.event_type = 'signup'
          ORDER BY ae.created_at DESC LIMIT 20
        `, [code]).then(r => r.rows),
      ]);

      res.json({
        referralCode:     code,
        referralLink:     `https://go.ai-os.co.za/ref/${code}`,
        commissionRate:   parseFloat(profile.commission_rate || 10),
        tier:             profile.tier || 'standard',
        availableBalance: parseFloat(metrics.available_balance || 0),
        pendingAmount:    parseFloat(metrics.pending_balance   || 0),
        totalWithdrawn:   parseFloat(metrics.total_withdrawn   || 0),
        totalClicks:      parseInt(metrics.total_clicks        || 0, 10),
        totalSignups:     parseInt(metrics.total_signups       || 0, 10),
        conversionRate:   metrics.total_clicks > 0
          ? +((metrics.total_signups / metrics.total_clicks) * 100).toFixed(2)
          : 0,
        referrals: referrals.map(r => ({
          name:     (r.email || 'Anonymous').split('@')[0],
          email:    r.email  || 'N/A',
          source:   r.source || 'Direct',
          joined:   r.joined ? new Date(r.joined).toLocaleDateString('en-US',
            { month: 'short', day: 'numeric', year: 'numeric' }) : '—',
          status:   r.status || 'pending',
          earnings: parseFloat(r.earnings || 0),
        })),
      });
    } catch (err) {
      console.error('[affiliate] /me error:', err.message);
      res.status(500).json({ error: 'affiliate_fetch_failed', detail: err.message });
    }
  });

  // ── POST /api/affiliate/convert ───────────────────────────────────────────
  // Server-side: record a signup conversion for a referral code.
  // Called from /auth/register handler when aff_ref cookie is present.
  router.post('/convert', async (req, res) => {
    const { referral_code, click_id, new_user_email, commission_amount } = req.body || {};
    if (!referral_code || !new_user_email) return res.status(400).json({ error: 'missing_fields' });

    try {
      const client = await db.connect();
      try {
        await client.query('BEGIN');

        const evtRes = await client.query(`
          INSERT INTO affiliate_events (referral_code, event_type, event_data, commission_amount)
          VALUES ($1, 'signup', $2::jsonb, $3) RETURNING id
        `, [referral_code,
            JSON.stringify({ email: new_user_email, source: 'web', status: 'active', click_id: click_id || null }),
            parseFloat(commission_amount || 0)]);

        if (commission_amount && parseFloat(commission_amount) > 0) {
          await client.query(`
            INSERT INTO affiliate_commissions (referral_code, event_id, click_id, amount, status)
            VALUES ($1, $2, $3, $4, 'pending')
          `, [referral_code, evtRes.rows[0].id, click_id || null, parseFloat(commission_amount)]);
        }

        if (click_id) {
          await client.query(
            `UPDATE affiliate_clicks SET converted_at = NOW(), conversion_value = $1 WHERE click_id = $2`,
            [parseFloat(commission_amount || 0), click_id]);
        }

        await client.query('COMMIT');
        res.json({ ok: true, event_id: evtRes.rows[0].id });
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    } catch (err) {
      console.error('[affiliate] convert error:', err.message);
      res.status(500).json({ error: 'convert_failed' });
    }
  });

  // ── POST /api/affiliate/withdraw ──────────────────────────────────────────
  // Request a payout of the affiliate's available balance.
  router.post('/withdraw', async (req, res) => {
    const userId = req.user?.id || req.headers['x-user-id'];
    if (!userId) return res.status(401).json({ error: 'auth_required' });

    const { amount, payout_method, payout_details } = req.body || {};
    if (!amount || parseFloat(amount) < 50) return res.status(400).json({ error: 'minimum_50' });

    try {
      const profile = await _getProfile(db, String(userId));
      if (!profile) return res.status(404).json({ error: 'no_affiliate_profile' });

      const metrics = await db.query('SELECT available_balance FROM get_affiliate_metrics($1)', [profile.referral_code])
        .then(r => r.rows[0]);
      if (parseFloat(metrics?.available_balance || 0) < parseFloat(amount)) {
        return res.status(400).json({ error: 'insufficient_balance',
          available: parseFloat(metrics?.available_balance || 0) });
      }

      const result = await db.query(`
        INSERT INTO affiliate_withdrawals (referral_code, amount, payout_method, payout_details)
        VALUES ($1, $2, $3, $4) RETURNING id, requested_at
      `, [profile.referral_code, parseFloat(amount),
          payout_method || 'bank_transfer', JSON.stringify(payout_details || {})]);

      res.json({ ok: true, withdrawal_id: result.rows[0].id, requested_at: result.rows[0].requested_at });
    } catch (err) {
      console.error('[affiliate] withdraw error:', err.message);
      res.status(500).json({ error: 'withdraw_failed' });
    }
  });

  // ── GET /api/affiliate/leaderboard ────────────────────────────────────────
  // Public top-20 by signups (no PII — code and tier only).
  router.get('/leaderboard', async (_req, res) => {
    try {
      const rows = await db.query(`
        SELECT ar.tier, ar.referral_code, ar.commission_rate,
               COALESCE(clicks.cnt,0)   AS total_clicks,
               COALESCE(signups.cnt,0)  AS total_signups,
               COALESCE(ar.total_earned,0) AS total_earned
        FROM affiliate_referrals ar
        LEFT JOIN (
          SELECT referral_code, COUNT(*) AS cnt FROM affiliate_clicks GROUP BY referral_code
        ) clicks ON clicks.referral_code = ar.referral_code
        LEFT JOIN (
          SELECT referral_code, COUNT(*) AS cnt FROM affiliate_events
          WHERE event_type = 'signup' GROUP BY referral_code
        ) signups ON signups.referral_code = ar.referral_code
        WHERE ar.status = 'active'
        ORDER BY total_signups DESC, total_earned DESC LIMIT 20
      `).then(r => r.rows);
      res.json({ ok: true, leaderboard: rows });
    } catch (err) {
      console.error('[affiliate] leaderboard error:', err.message);
      res.status(500).json({ error: 'leaderboard_failed' });
    }
  });

  // ── GET /api/affiliate/admin/withdrawals ─────────────────────────────────
  // Admin: list pending/all withdrawal requests. Requires x-admin-token header.
  router.get('/admin/withdrawals', _requireAdmin, async (req, res) => {
    const status = req.query.status || 'pending';
    try {
      const rows = await db.query(`
        SELECT aw.*, ar.referrer_id, ar.tier, ar.commission_rate
        FROM affiliate_withdrawals aw
        JOIN affiliate_referrals ar ON ar.referral_code = aw.referral_code
        WHERE ($1 = 'all' OR aw.status = $1)
        ORDER BY aw.requested_at DESC LIMIT 100
      `, [status]).then(r => r.rows);
      res.json({ ok: true, count: rows.length, withdrawals: rows });
    } catch (err) {
      res.status(500).json({ error: 'fetch_failed', detail: err.message });
    }
  });

  // ── POST /api/affiliate/admin/withdrawals/:id/action ──────────────────────
  // Admin: approve, pay, or reject a withdrawal. Body: { action, notes? }
  router.post('/admin/withdrawals/:id/action', _requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { action, notes } = req.body || {};
    if (!['approve', 'pay', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'invalid_action', valid: ['approve','pay','reject'] });
    }
    const statusMap = { approve: 'approved', pay: 'paid', reject: 'rejected' };
    try {
      const result = await db.query(`
        UPDATE affiliate_withdrawals
        SET status = $1,
            processed_at = NOW(),
            notes = COALESCE($2, notes)
        WHERE id = $3 RETURNING *
      `, [statusMap[action], notes || null, id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'not_found' });
      res.json({ ok: true, withdrawal: result.rows[0] });
    } catch (err) {
      res.status(500).json({ error: 'action_failed', detail: err.message });
    }
  });

  // ── GET /api/affiliate/admin/dashboard ────────────────────────────────────
  // Admin: summary stats for all affiliates.
  router.get('/admin/dashboard', _requireAdmin, async (req, res) => {
    try {
      const [summary, topAffiliates] = await Promise.all([
        db.query(`
          SELECT
            COUNT(*)                                         AS total_affiliates,
            COUNT(*) FILTER (WHERE status='active')          AS active_affiliates,
            COALESCE(SUM(total_earned),0)                    AS total_commissions_paid,
            (SELECT COUNT(*) FROM affiliate_clicks)          AS total_clicks,
            (SELECT COUNT(*) FROM affiliate_events WHERE event_type='signup') AS total_signups,
            (SELECT COUNT(*) FROM affiliate_withdrawals WHERE status='pending') AS pending_withdrawals,
            (SELECT COALESCE(SUM(amount),0) FROM affiliate_withdrawals WHERE status='pending') AS pending_payout_total
          FROM affiliate_referrals
        `).then(r => r.rows[0]),
        db.query(`
          SELECT ar.referral_code, ar.tier, ar.commission_rate,
                 COALESCE(ar.total_earned,0) AS earned,
                 COUNT(ae.id) AS signups
          FROM affiliate_referrals ar
          LEFT JOIN affiliate_events ae ON ae.referral_code = ar.referral_code AND ae.event_type = 'signup'
          GROUP BY ar.referral_code, ar.tier, ar.commission_rate, ar.total_earned
          ORDER BY signups DESC LIMIT 10
        `).then(r => r.rows),
      ]);
      res.json({ ok: true, summary, topAffiliates });
    } catch (err) {
      res.status(500).json({ error: 'admin_dashboard_failed', detail: err.message });
    }
  });

  return router;
};

// AUTH DISABLED on this branch — pass through. Restore the X-Admin-Token
// check before shipping to production.
function _requireAdmin(_req, _res, next) {
  return next();
}

// ── Helpers ───────────────────────────────────────────────────────────────

async function _getProfile(db, referrerId) {
  const r = await db.query('SELECT * FROM affiliate_referrals WHERE referrer_id = $1 LIMIT 1', [referrerId]);
  return r.rows[0] || null;
}

async function _getOrCreate(db, referrerId) {
  const existing = await _getProfile(db, referrerId);
  if (existing) return existing;

  const code = 'BR' + referrerId.slice(0, 4).toUpperCase().padEnd(4, '0') +
               crypto.randomBytes(3).toString('hex').toUpperCase();
  const r = await db.query(`
    INSERT INTO affiliate_referrals (referrer_id, referral_code, commission_rate, status)
    VALUES ($1, $2, 10.00, 'active') RETURNING *
  `, [referrerId, code]);
  return r.rows[0];
}
