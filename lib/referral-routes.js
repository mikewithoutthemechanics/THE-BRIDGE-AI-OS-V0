// =============================================================================
// BRIDGE AI OS — Referral Routes
// Viral referral system for exponential revenue growth
// =============================================================================
'use strict';

const { Pool } = require('pg');
const crypto = require('crypto');

const ECONOMY_DB_URL = process.env.ECONOMY_DB_URL;

let referralDb;
if (ECONOMY_DB_URL) {
  referralDb = new Pool({
    connectionString: ECONOMY_DB_URL,
    max: 5,
    connectionTimeoutMillis: 5000,
  });
}

const REFERRAL_COMMISSION_PCT = 10;

function generateReferralCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'REF-';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function initReferralTables(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS referral_codes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT,
      code TEXT UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS referral_referrals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      referrer_code TEXT NOT NULL,
      referred_user_id TEXT NOT NULL,
      referred_email TEXT,
      first_payment_amount NUMERIC,
      first_payment_at TIMESTAMP,
      commission_paid NUMERIC DEFAULT 0,
      commission_paid_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(referred_user_id)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS referral_earnings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      referrer_code TEXT NOT NULL,
      amount NUMERIC NOT NULL,
      source_user_id TEXT,
      source_payment_id TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

function registerReferralRoutes(app) {
  if (!referralDb) {
    console.log('[REFERRAL] No ECONOMY_DB_URL - routes disabled');
    return;
  }

  initReferralTables(referralDb).catch(e => console.error('[REFERRAL] Init error:', e.message));

  // POST /api/referral/create - Generate unique referral code per user
  app.post('/api/referral/create', async (req, res) => {
    const { user_id } = req.body;
    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    try {
      const existing = await referralDb.query(
        'SELECT code FROM referral_codes WHERE user_id = $1',
        [user_id]
      );

      if (existing.rows.length > 0) {
        return res.json({ code: existing.rows[0].code, existing: true });
      }

      const code = generateReferralCode();
      await referralDb.query(
        'INSERT INTO referral_codes (user_id, code) VALUES ($1, $2)',
        [user_id, code]
      );

      res.json({ code, existing: false });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/referral/record-signup - Record referral relationship on signup
  app.post('/api/referral/record-signup', async (req, res) => {
    const { user_id, email, referral_code } = req.body;
    if (!user_id || !email) {
      return res.status(400).json({ error: 'user_id and email are required' });
    }

    try {
      if (referral_code) {
        const existingCode = await referralDb.query(
          'SELECT code FROM referral_codes WHERE code = $1',
          [referral_code]
        );

        if (existingCode.rows.length > 0 && existingCode.rows[0].code !== referral_code) {
          await referralDb.query(
            `INSERT INTO referral_referrals (referrer_code, referred_user_id, referred_email)
             VALUES ($1, $2, $3)
             ON CONFLICT (referred_user_id) DO UPDATE SET referrer_code = $1, referred_email = $3`,
            [referral_code, user_id, email]
          );
        }
      }

      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/referral/stats/:code - Track referrals and earnings
  app.get('/api/referral/stats/:code', async (req, res) => {
    const { code } = req.params;

    try {
      const referrals = await referralDb.query(
        `SELECT 
          rr.referred_user_id,
          rr.referred_email,
          rr.first_payment_amount,
          rr.first_payment_at,
          rr.commission_paid,
          rr.commission_paid_at,
          rr.created_at
        FROM referral_referrals rr
        WHERE rr.referrer_code = $1
        ORDER BY rr.created_at DESC`,
        [code]
      );

      const earnings = await referralDb.query(
        `SELECT COALESCE(SUM(amount), 0) as total
         FROM referral_earnings
         WHERE referrer_code = $1`,
        [code]
      );

      const stats = {
        total_referrals: referrals.rows.length,
        paid_referrals: referrals.rows.filter(r => r.commission_paid > 0).length,
        pending_referrals: referrals.rows.filter(r => r.first_payment_amount > 0 && r.commission_paid === 0).length,
        total_earnings: parseFloat(earnings.rows[0]?.total || 0),
        referral_details: referrals.rows
      };

      res.json(stats);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/referral/leaderboard - Top referrers
  app.get('/api/referral/leaderboard', async (req, res) => {
    try {
      const leaderboard = await referralDb.query(
        `SELECT 
          re.referrer_code as code,
          rc.user_id,
          COUNT(rr.id) as referral_count,
          COALESCE(SUM(rr.commission_paid), 0) as total_earnings,
          MAX(rr.created_at) as last_referral
        FROM referral_codes rc
        LEFT JOIN referral_referrals rr ON rr.referrer_code = rc.code
        LEFT JOIN referral_earnings re ON re.referrer_code = rc.code
        GROUP BY rc.code, rc.user_id
        ORDER BY total_earnings DESC, referral_count DESC
        LIMIT 20`
      );

      const ranked = leaderboard.rows.map((row, idx) => ({
        rank: idx + 1,
        code: row.code,
        user_id: row.user_id,
        referral_count: parseInt(row.referral_count || 0),
        total_earnings: parseFloat(row.total_earnings || 0),
        last_referral: row.last_referral
      }));

      res.json({ leaderboard: ranked });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}

async function creditReferrerOnPayment(referrerCode, referredUserId, referredEmail, paymentAmount, paymentId) {
  if (!referralDb || !referrerCode) return;

  try {
    const existing = await referralDb.query(
      `SELECT id, first_payment_amount, commission_paid 
       FROM referral_referrals 
       WHERE referrer_code = $1 AND referred_user_id = $2`,
      [referrerCode, referredUserId]
    );

    if (existing.rows.length === 0) {
      await referralDb.query(
        `INSERT INTO referral_referrals (referrer_code, referred_user_id, referred_email, first_payment_amount, first_payment_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [referrerCode, referredUserId, referredEmail, paymentAmount]
      );
    } else if (!existing.rows[0].first_payment_amount) {
      await referralDb.query(
        `UPDATE referral_referrals 
         SET first_payment_amount = $1, first_payment_at = NOW()
         WHERE referrer_code = $2 AND referred_user_id = $3`,
        [paymentAmount, referrerCode, referredUserId]
      );
    } else {
      return;
    }

    const referral = await referralDb.query(
      `SELECT id, commission_paid FROM referral_referrals 
       WHERE referrer_code = $1 AND referred_user_id = $2`,
      [referrerCode, referredUserId]
    );

    if (referral.rows.length === 0 || referral.rows[0].commission_paid > 0) return;

    const commission = (paymentAmount * REFERRAL_COMMISSION_PCT / 100);
    
    await referralDb.query(
      `INSERT INTO referral_earnings (referrer_code, amount, source_user_id, source_payment_id)
       VALUES ($1, $2, $3, $4)`,
      [referrerCode, commission, referredUserId, paymentId]
    );

    await referralDb.query(
      `UPDATE referral_referrals 
       SET commission_paid = $1, commission_paid_at = NOW()
       WHERE referrer_code = $2 AND referred_user_id = $3`,
      [commission, referrerCode, referredUserId]
    );

    console.log(`[REFERRAL] Credited ${commission} ZAR to ${referrerCode} for ${referredUserId}'s first payment`);
  } catch (e) {
    console.error('[REFERRAL] Credit error:', e.message);
  }
}

module.exports = {
  registerReferralRoutes,
  creditReferrerOnPayment,
  generateReferralCode,
};