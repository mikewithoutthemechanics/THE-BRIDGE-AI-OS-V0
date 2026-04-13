// Bridge AI OS — Affiliate Program Routes
// Handles /api/affiliate/* endpoints with Supabase backend

'use strict';

const { supabase, isConfigured: supabaseConfigured } = require('../lib/supabase');

function ts() { return Date.now(); }

async function handleAffiliate(req, res, p, method, parseBody, json) {
  const sub = p.replace('/api/affiliate', '').replace(/^\//, '') || 'dashboard';

  if (sub === 'program' || sub === 'dashboard') {
    if (!supabaseConfigured) {
      // Fallback to mock data if Supabase not configured
      return json(res, {
        program: { commission_pct: 10, cookie_days: 30, min_payout: 50, currency: 'ZAR' },
        stats: { total_affiliates: 3, total_clicks: 519, total_signups: 50, total_revenue: 7450, total_paid: 744.9 },
        top_affiliate: { id: 'aff_002', name: 'Priya Naidoo', code: 'PRIYA20', clicks: 289, signups: 31, revenue: 4619, payout: 461.9, tier: 'gold' },
        ts: ts(),
      });
    }

    try {
      const { data: affiliates } = await supabase
        .from('affiliates')
        .select('*')
        .eq('status', 'active')
        .order('total_revenue', { ascending: false });

      const stats = affiliates ? {
        total_affiliates: affiliates.length,
        total_clicks: affiliates.reduce((s, a) => s + (a.total_clicks || 0), 0),
        total_signups: affiliates.reduce((s, a) => s + (a.total_signups || 0), 0),
        total_revenue: affiliates.reduce((s, a) => s + (a.total_revenue || 0), 0),
        total_paid: affiliates.reduce((s, a) => s + (a.total_paid || 0), 0),
      } : { total_affiliates: 0, total_clicks: 0, total_signups: 0, total_revenue: 0, total_paid: 0 };

      return json(res, {
        program: { commission_pct: 10, cookie_days: 30, min_payout: 50, currency: 'ZAR' },
        stats,
        top_affiliate: affiliates?.[0] || null,
        ts: ts(),
      });
    } catch (e) {
      console.warn('[AFFILIATE] Database query failed:', e.message);
      return json(res, { error: 'database_unavailable', fallback: true }, 503);
    }
  }

  if (sub === 'stats') {
    // Daily stats - simplified for now
    return json(res, { clicks_today: 34, signups_today: 3, revenue_today: 447, conversion_rate: 8.8, ts: ts() });
  }

  if (sub === 'leaderboard') {
    if (!supabaseConfigured) {
      return json(res, {
        leaderboard: [
          { id: 'aff_001', name: 'Sipho Ndlovu', code: 'SIPHO20', clicks: 142, signups: 12, revenue: 1788, payout: 178.8, tier: 'silver' },
          { id: 'aff_002', name: 'Priya Naidoo', code: 'PRIYA20', clicks: 289, signups: 31, revenue: 4619, payout: 461.9, tier: 'gold' },
          { id: 'aff_003', name: 'Thabo Mokoena', code: 'THABO20', clicks: 88, signups: 7, revenue: 1043, payout: 104.3, tier: 'bronze' },
        ],
        ts: ts(),
      });
    }

    try {
      const { data } = await supabase
        .from('affiliates')
        .select('*')
        .eq('status', 'active')
        .order('total_revenue', { ascending: false })
        .limit(20);

      return json(res, { leaderboard: data || [], ts: ts() });
    } catch (e) {
      console.warn('[AFFILIATE] Leaderboard query failed:', e.message);
      return json(res, { error: 'database_unavailable' }, 503);
    }
  }

  if (sub === 'creatives') {
    if (!supabaseConfigured) {
      return json(res, {
        creatives: [
          { id: 'cr_001', type: 'banner', size: '728x90', url: '/assets/banners/bridge-728x90.png', clicks: 211 },
          { id: 'cr_002', type: 'banner', size: '300x250', url: '/assets/banners/bridge-300x250.png', clicks: 178 },
          { id: 'cr_003', type: 'text', copy: 'Automate your business with Bridge AI OS', clicks: 130 },
        ],
        ts: ts(),
      });
    }

    try {
      const { data } = await supabase
        .from('affiliate_creatives')
        .select('*')
        .eq('status', 'active')
        .order('clicks', { ascending: false });

      return json(res, { creatives: data || [], ts: ts() });
    } catch (e) {
      console.warn('[AFFILIATE] Creatives query failed:', e.message);
      return json(res, { error: 'database_unavailable' }, 503);
    }
  }

  if (sub === 'payouts') {
    if (!supabaseConfigured) {
      return json(res, {
        payouts: [
          { id: 'pay_a01', affiliate: 'Priya Naidoo', amount: 461.9, status: 'paid', date: '2026-04-01' },
          { id: 'pay_a02', affiliate: 'Sipho Ndlovu', amount: 178.8, status: 'pending', date: '2026-04-04' },
        ],
        ts: ts(),
      });
    }

    try {
      const { data } = await supabase
        .from('affiliate_payouts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      return json(res, { payouts: data || [], ts: ts() });
    } catch (e) {
      console.warn('[AFFILIATE] Payouts query failed:', e.message);
      return json(res, { error: 'database_unavailable' }, 503);
    }
  }

  if (sub === 'join' && method === 'POST') {
    const body = await parseBody(req);

    if (!supabaseConfigured) {
      // Fallback mock response
      return json(res, {
        ok: true,
        affiliate_id: `aff_${ts()}`,
        code: `${(body.name || 'USER').slice(0, 5).toUpperCase()}20`,
        ts: ts()
      }, 201);
    }

    try {
      // Get default company (assuming there's a default company_id)
      const { data: company } = await supabase
        .from('companies')
        .select('id')
        .limit(1)
        .single();

      if (!company) {
        return json(res, { error: 'no_default_company' }, 400);
      }

      const code = `${(body.name || 'USER').slice(0, 5).toUpperCase()}20`;

      const { data, error } = await supabase
        .from('affiliates')
        .insert({
          company_id: company.id,
          name: body.name,
          email: body.email,
          code: code,
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') { // unique constraint
          return json(res, { error: 'email_or_code_exists' }, 400);
        }
        throw error;
      }

      return json(res, {
        ok: true,
        affiliate_id: data.id,
        code: data.code,
        ts: ts()
      }, 201);
    } catch (e) {
      console.warn('[AFFILIATE] Join failed:', e.message);
      return json(res, { error: 'registration_failed' }, 500);
    }
  }

  return json(res, { error: 'unknown affiliate endpoint' }, 404);
}

module.exports = { handleAffiliate };