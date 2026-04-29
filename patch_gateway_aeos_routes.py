"""
patch_gateway_aeos_routes.py
────────────────────────────
Run on the VPS (Ubuntu) to insert AEOS economy routes into gateway.js.

Usage:
    python3 patch_gateway_aeos_routes.py [path/to/gateway.js]

Default path: /var/www/bridgeai/gateway.js
"""

import sys, os, shutil, datetime

GATEWAY_PATH = sys.argv[1] if len(sys.argv) > 1 else '/var/www/bridgeai/gateway.js'

ANCHOR = '// ── SVG ENGINE PROXY (/api/svg/*) → localhost:7070 ───────────────────────────'

NEW_ROUTES = r'''// ── AEOS: User Provisioning ───────────────────────────────────────────────────
app.post('/api/provision/user', async (req, res) => {
  try {
    const token = (req.headers.authorization||'').replace(/^Bearer\s+/,'') || req.cookies?.access_token;
    if (!token) return res.status(401).json({ ok:false, error:'Auth required' });
    const payload = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
    const { supabaseAdmin } = require('./lib/supabase');
    const userId = payload.sub || payload.id;
    const tier = req.body?.tier || 'free';

    // get or create wallet
    let { data: wallet, error: wErr } = await supabaseAdmin
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .single();
    if (wErr || !wallet) {
      const { data: newWallet, error: wIErr } = await supabaseAdmin
        .from('wallets')
        .insert({ user_id: userId, balance_zar: 0, balance_brdg: 0, balance_usd: 0 })
        .select()
        .single();
      if (wIErr) throw new Error(wIErr.message);
      wallet = newWallet;
    }

    // update user tier
    await supabaseAdmin.from('users').update({ tier }).eq('id', userId);

    // get or create affiliate code
    let { data: affiliate } = await supabaseAdmin
      .from('affiliates')
      .select('*')
      .eq('user_id', userId)
      .single();
    if (!affiliate) {
      const code = 'AFF-' + userId.slice(0, 8).toUpperCase();
      const { data: newAff, error: aErr } = await supabaseAdmin
        .from('affiliates')
        .insert({ user_id: userId, code, total_earned: 0 })
        .select()
        .single();
      if (aErr) throw new Error(aErr.message);
      affiliate = newAff;
    }

    // get tier config
    const { data: tierConfig } = await supabaseAdmin
      .from('tier_config')
      .select('*')
      .eq('tier', tier)
      .single();

    return res.json({ ok:true, wallet_id: wallet.id, affiliate_code: affiliate.code, tier_config: tierConfig });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});

// ── AEOS: User Economy State ──────────────────────────────────────────────────
app.get('/api/economy/me', async (req, res) => {
  try {
    const token = (req.headers.authorization||'').replace(/^Bearer\s+/,'') || req.cookies?.access_token;
    if (!token) return res.status(401).json({ ok:false, error:'Auth required' });
    const payload = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
    const { supabaseAdmin } = require('./lib/supabase');
    const userId = payload.sub || payload.id;

    const [
      { data: wallet },
      { data: userRow },
      { data: apps },
      { data: leads },
      { data: automations },
      { data: affiliates },
      { data: revenueRows },
    ] = await Promise.all([
      supabaseAdmin.from('wallets').select('*').eq('user_id', userId).single(),
      supabaseAdmin.from('users').select('tier').eq('id', userId).single(),
      supabaseAdmin.from('apps').select('id').eq('user_id', userId).neq('status','deleted'),
      supabaseAdmin.from('leads').select('id').eq('user_id', userId),
      supabaseAdmin.from('automations').select('id').eq('user_id', userId),
      supabaseAdmin.from('affiliates').select('*').eq('user_id', userId),
      supabaseAdmin.from('app_revenue_events').select('amount_zar').eq('user_id', userId),
    ]);

    const tier = userRow?.tier || 'free';
    const { data: tierConfig } = await supabaseAdmin.from('tier_config').select('*').eq('tier', tier).single();

    const revenue_mtd = (revenueRows || []).reduce((s, r) => s + (r.amount_zar || 0), 0);

    return res.json({
      ok: true,
      wallet: wallet || { balance_zar:0, balance_brdg:0, balance_usd:0 },
      tier,
      tier_config: tierConfig || {},
      stats: {
        apps: (apps||[]).length,
        leads: (leads||[]).length,
        automations: (automations||[]).length,
        affiliates: (affiliates||[]).length,
        revenue_mtd,
      },
    });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});

// ── AEOS: Apps CRUD ────────────────────────────────────────────────────────────
app.get('/api/apps', async (req, res) => {
  try {
    const token = (req.headers.authorization||'').replace(/^Bearer\s+/,'') || req.cookies?.access_token;
    if (!token) return res.status(401).json({ ok:false, error:'Auth required' });
    const payload = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
    const { supabaseAdmin } = require('./lib/supabase');
    const userId = payload.sub || payload.id;
    const { data, error } = await supabaseAdmin
      .from('apps')
      .select('*')
      .eq('user_id', userId)
      .neq('status','deleted')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return res.json({ ok:true, apps: data || [] });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});

app.post('/api/apps', async (req, res) => {
  try {
    const token = (req.headers.authorization||'').replace(/^Bearer\s+/,'') || req.cookies?.access_token;
    if (!token) return res.status(401).json({ ok:false, error:'Auth required' });
    const payload = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
    const { supabaseAdmin } = require('./lib/supabase');
    const userId = payload.sub || payload.id;

    // tier limit check
    const { data: userRow } = await supabaseAdmin.from('users').select('tier').eq('id', userId).single();
    const tier = userRow?.tier || 'free';
    const { data: tierConfig } = await supabaseAdmin.from('tier_config').select('max_apps').eq('tier', tier).single();
    if (tierConfig?.max_apps !== null && tierConfig?.max_apps !== undefined) {
      const { count } = await supabaseAdmin.from('apps').select('id', { count:'exact', head:true }).eq('user_id', userId).neq('status','deleted');
      if (count >= tierConfig.max_apps) {
        return res.status(403).json({ ok:false, error:'App limit reached for your tier' });
      }
    }

    const { name, slug, config } = req.body || {};
    if (!name) return res.status(400).json({ ok:false, error:'name is required' });

    const { data, error } = await supabaseAdmin
      .from('apps')
      .insert({ user_id: userId, name, slug: slug || name.toLowerCase().replace(/\s+/g,'-'), status:'active', config: config||{} })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return res.json({ ok:true, app: data });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});

app.patch('/api/apps/:id', async (req, res) => {
  try {
    const token = (req.headers.authorization||'').replace(/^Bearer\s+/,'') || req.cookies?.access_token;
    if (!token) return res.status(401).json({ ok:false, error:'Auth required' });
    const payload = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
    const { supabaseAdmin } = require('./lib/supabase');
    const userId = payload.sub || payload.id;
    const { id } = req.params;
    const { name, status, config } = req.body || {};
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (status !== undefined) updates.status = status;
    if (config !== undefined) updates.config = config;
    const { data, error } = await supabaseAdmin
      .from('apps')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return res.json({ ok:true, app: data });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});

app.delete('/api/apps/:id', async (req, res) => {
  try {
    const token = (req.headers.authorization||'').replace(/^Bearer\s+/,'') || req.cookies?.access_token;
    if (!token) return res.status(401).json({ ok:false, error:'Auth required' });
    const payload = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
    const { supabaseAdmin } = require('./lib/supabase');
    const userId = payload.sub || payload.id;
    const { id } = req.params;
    const { error } = await supabaseAdmin
      .from('apps')
      .update({ status: 'stopped' })
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
    return res.json({ ok:true });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});

// ── AEOS: Revenue Event ────────────────────────────────────────────────────────
app.post('/api/economy/revenue-event', async (req, res) => {
  try {
    const token = (req.headers.authorization||'').replace(/^Bearer\s+/,'') || req.cookies?.access_token;
    if (!token) return res.status(401).json({ ok:false, error:'Auth required' });
    const payload = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
    const { supabaseAdmin } = require('./lib/supabase');
    const userId = payload.sub || payload.id;
    const { app_id, amount_zar, source, affiliate_code } = req.body || {};
    if (!app_id || !amount_zar) return res.status(400).json({ ok:false, error:'app_id and amount_zar are required' });

    // validate app belongs to user
    const { data: appRow, error: appErr } = await supabaseAdmin
      .from('apps').select('id').eq('id', app_id).eq('user_id', userId).single();
    if (appErr || !appRow) return res.status(403).json({ ok:false, error:'App not found or not owned by user' });

    // get user tier
    const { data: userRow } = await supabaseAdmin.from('users').select('tier').eq('id', userId).single();
    const tier = userRow?.tier || 'free';
    const { data: tierConfig } = await supabaseAdmin.from('tier_config').select('*').eq('tier', tier).single();
    const revenue_share_pct = tierConfig?.revenue_share_pct || 70;

    const user_zar = parseFloat((amount_zar * revenue_share_pct / 100).toFixed(2));
    let affiliate_zar = 0;
    let affiliate_user_id = null;
    if (affiliate_code) {
      const { data: affRow } = await supabaseAdmin.from('affiliates').select('*').eq('code', affiliate_code).single();
      if (affRow) {
        affiliate_zar = parseFloat((amount_zar * 0.10).toFixed(2));
        affiliate_user_id = affRow.user_id;
      }
    }
    const ryan_zar = parseFloat((amount_zar - user_zar - affiliate_zar).toFixed(2));

    // insert revenue event
    const { error: revErr } = await supabaseAdmin.from('app_revenue_events').insert({
      user_id: userId, app_id, amount_zar, source: source||'manual',
      affiliate_code: affiliate_code||null,
      user_cut_zar: user_zar, affiliate_cut_zar: affiliate_zar, platform_cut_zar: ryan_zar,
    });
    if (revErr) throw new Error(revErr.message);

    // credit user wallet
    await supabaseAdmin.rpc('increment_wallet_balance', { p_user_id: userId, p_amount_zar: user_zar }).catch(async () => {
      const { data: w } = await supabaseAdmin.from('wallets').select('balance_zar').eq('user_id', userId).single();
      await supabaseAdmin.from('wallets').update({ balance_zar: (w?.balance_zar||0) + user_zar }).eq('user_id', userId);
    });

    // credit affiliate wallet if applicable
    if (affiliate_user_id && affiliate_zar > 0) {
      await supabaseAdmin.rpc('increment_wallet_balance', { p_user_id: affiliate_user_id, p_amount_zar: affiliate_zar }).catch(async () => {
        const { data: w } = await supabaseAdmin.from('wallets').select('balance_zar').eq('user_id', affiliate_user_id).single();
        await supabaseAdmin.from('wallets').update({ balance_zar: (w?.balance_zar||0) + affiliate_zar }).eq('user_id', affiliate_user_id);
      });
    }

    return res.json({ ok:true, splits: { user_zar, affiliate_zar, ryan_zar } });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});

// ── AEOS: Leads CRUD ──────────────────────────────────────────────────────────
app.get('/api/leads', async (req, res) => {
  try {
    const token = (req.headers.authorization||'').replace(/^Bearer\s+/,'') || req.cookies?.access_token;
    if (!token) return res.status(401).json({ ok:false, error:'Auth required' });
    const payload = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
    const { supabaseAdmin } = require('./lib/supabase');
    const userId = payload.sub || payload.id;
    const { status, limit } = req.query;
    let query = supabaseAdmin.from('leads').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(parseInt(limit)||50);
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return res.json({ ok:true, leads: data || [] });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});

app.post('/api/leads', async (req, res) => {
  try {
    const token = (req.headers.authorization||'').replace(/^Bearer\s+/,'') || req.cookies?.access_token;
    if (!token) return res.status(401).json({ ok:false, error:'Auth required' });
    const payload = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
    const { supabaseAdmin } = require('./lib/supabase');
    const userId = payload.sub || payload.id;

    // tier limit check
    const { data: userRow } = await supabaseAdmin.from('users').select('tier').eq('id', userId).single();
    const tier = userRow?.tier || 'free';
    const { data: tierConfig } = await supabaseAdmin.from('tier_config').select('max_leads').eq('tier', tier).single();
    if (tierConfig?.max_leads !== null && tierConfig?.max_leads !== undefined) {
      const { count } = await supabaseAdmin.from('leads').select('id', { count:'exact', head:true }).eq('user_id', userId);
      if (count >= tierConfig.max_leads) {
        return res.status(403).json({ ok:false, error:'Lead limit reached for your tier' });
      }
    }

    const { name, email, phone, app_id, score, ai_notes } = req.body || {};
    const { data, error } = await supabaseAdmin
      .from('leads')
      .insert({ user_id: userId, name, email, phone, app_id, score: score||0, status:'new', ai_notes })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return res.json({ ok:true, lead: data });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});

app.patch('/api/leads/:id', async (req, res) => {
  try {
    const token = (req.headers.authorization||'').replace(/^Bearer\s+/,'') || req.cookies?.access_token;
    if (!token) return res.status(401).json({ ok:false, error:'Auth required' });
    const payload = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
    const { supabaseAdmin } = require('./lib/supabase');
    const userId = payload.sub || payload.id;
    const { id } = req.params;
    const { status, score, ai_notes } = req.body || {};
    const updates = {};
    if (status !== undefined) updates.status = status;
    if (score !== undefined) updates.score = score;
    if (ai_notes !== undefined) updates.ai_notes = ai_notes;
    const { data, error } = await supabaseAdmin
      .from('leads').update(updates).eq('id', id).eq('user_id', userId).select().single();
    if (error) throw new Error(error.message);
    return res.json({ ok:true, lead: data });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});

app.delete('/api/leads/:id', async (req, res) => {
  try {
    const token = (req.headers.authorization||'').replace(/^Bearer\s+/,'') || req.cookies?.access_token;
    if (!token) return res.status(401).json({ ok:false, error:'Auth required' });
    const payload = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
    const { supabaseAdmin } = require('./lib/supabase');
    const userId = payload.sub || payload.id;
    const { id } = req.params;
    const { error } = await supabaseAdmin.from('leads').delete().eq('id', id).eq('user_id', userId);
    if (error) throw new Error(error.message);
    return res.json({ ok:true });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});

// ── AEOS: Affiliates ──────────────────────────────────────────────────────────
app.get('/api/affiliates/me', async (req, res) => {
  try {
    const token = (req.headers.authorization||'').replace(/^Bearer\s+/,'') || req.cookies?.access_token;
    if (!token) return res.status(401).json({ ok:false, error:'Auth required' });
    const payload = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
    const { supabaseAdmin } = require('./lib/supabase');
    const userId = payload.sub || payload.id;
    const { data: affiliate, error } = await supabaseAdmin
      .from('affiliates').select('*').eq('user_id', userId).single();
    if (error) throw new Error(error.message);
    const { count: linksCount } = await supabaseAdmin
      .from('affiliate_links').select('id', { count:'exact', head:true }).eq('affiliate_id', affiliate?.id);
    return res.json({ ok:true, affiliate, links_count: linksCount || 0 });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});

app.get('/api/affiliates/links', async (req, res) => {
  try {
    const token = (req.headers.authorization||'').replace(/^Bearer\s+/,'') || req.cookies?.access_token;
    if (!token) return res.status(401).json({ ok:false, error:'Auth required' });
    const payload = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
    const { supabaseAdmin } = require('./lib/supabase');
    const userId = payload.sub || payload.id;
    const { data: affiliate } = await supabaseAdmin.from('affiliates').select('id').eq('user_id', userId).single();
    if (!affiliate) return res.json({ ok:true, links: [] });
    const { data, error } = await supabaseAdmin
      .from('affiliate_links').select('*').eq('affiliate_id', affiliate.id).order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return res.json({ ok:true, links: data || [] });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});

app.post('/api/affiliates/track', async (req, res) => {
  try {
    const { supabaseAdmin } = require('./lib/supabase');
    const { affiliate_code, app_slug, event, amount_zar } = req.body || {};
    if (!affiliate_code || !app_slug || !event) {
      return res.status(400).json({ ok:false, error:'affiliate_code, app_slug, and event are required' });
    }
    const { data: affiliate, error: affErr } = await supabaseAdmin
      .from('affiliates').select('*').eq('code', affiliate_code).single();
    if (affErr || !affiliate) return res.status(404).json({ ok:false, error:'Affiliate not found' });

    const { data: appRow, error: appErr } = await supabaseAdmin
      .from('apps').select('*').eq('slug', app_slug).single();
    if (appErr || !appRow) return res.status(404).json({ ok:false, error:'App not found' });

    // get or create affiliate link
    let { data: link } = await supabaseAdmin
      .from('affiliate_links')
      .select('*')
      .eq('affiliate_id', affiliate.id)
      .eq('app_id', appRow.id)
      .single();
    if (!link) {
      const { data: newLink } = await supabaseAdmin
        .from('affiliate_links')
        .insert({ affiliate_id: affiliate.id, app_id: appRow.id, clicks:0, conversions:0, revenue_zar:0 })
        .select().single();
      link = newLink;
    }

    if (event === 'click') {
      await supabaseAdmin.from('affiliate_links').update({ clicks: (link.clicks||0) + 1 }).eq('id', link.id);
    } else if (event === 'conversion') {
      const convAmt = amount_zar || 0;
      await supabaseAdmin.from('affiliate_links').update({
        conversions: (link.conversions||0) + 1,
        revenue_zar: (link.revenue_zar||0) + convAmt,
      }).eq('id', link.id);
      if (convAmt > 0) {
        // create revenue event for the app owner
        await supabaseAdmin.from('app_revenue_events').insert({
          user_id: appRow.user_id, app_id: appRow.id, amount_zar: convAmt,
          source: 'affiliate', affiliate_code,
          user_cut_zar: convAmt * 0.70, affiliate_cut_zar: convAmt * 0.10, platform_cut_zar: convAmt * 0.20,
        });
        // credit affiliate wallet
        const affCut = parseFloat((convAmt * 0.10).toFixed(2));
        const { data: w } = await supabaseAdmin.from('wallets').select('balance_zar').eq('user_id', affiliate.user_id).single();
        await supabaseAdmin.from('wallets').update({ balance_zar: (w?.balance_zar||0) + affCut }).eq('user_id', affiliate.user_id);
        await supabaseAdmin.from('affiliates').update({ total_earned: (affiliate.total_earned||0) + affCut }).eq('id', affiliate.id);
      }
    }

    return res.json({ ok:true, event, affiliate_code, app_slug });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});

// ── AEOS: Automations CRUD ────────────────────────────────────────────────────
app.get('/api/automations', async (req, res) => {
  try {
    const token = (req.headers.authorization||'').replace(/^Bearer\s+/,'') || req.cookies?.access_token;
    if (!token) return res.status(401).json({ ok:false, error:'Auth required' });
    const payload = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
    const { supabaseAdmin } = require('./lib/supabase');
    const userId = payload.sub || payload.id;
    const { data, error } = await supabaseAdmin
      .from('automations').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return res.json({ ok:true, automations: data || [] });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});

app.post('/api/automations', async (req, res) => {
  try {
    const token = (req.headers.authorization||'').replace(/^Bearer\s+/,'') || req.cookies?.access_token;
    if (!token) return res.status(401).json({ ok:false, error:'Auth required' });
    const payload = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
    const { supabaseAdmin } = require('./lib/supabase');
    const userId = payload.sub || payload.id;

    // check tier automation_enabled
    const { data: userRow } = await supabaseAdmin.from('users').select('tier').eq('id', userId).single();
    const tier = userRow?.tier || 'free';
    const { data: tierConfig } = await supabaseAdmin.from('tier_config').select('automation_enabled').eq('tier', tier).single();
    if (!tierConfig?.automation_enabled) {
      return res.status(403).json({ ok:false, error:'Automations not available on your tier' });
    }

    const { name, type, config, app_id } = req.body || {};
    if (!name) return res.status(400).json({ ok:false, error:'name is required' });
    const { data, error } = await supabaseAdmin
      .from('automations')
      .insert({ user_id: userId, name, type: type||'custom', config: config||{}, app_id, status:'active' })
      .select().single();
    if (error) throw new Error(error.message);
    return res.json({ ok:true, automation: data });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});

app.patch('/api/automations/:id', async (req, res) => {
  try {
    const token = (req.headers.authorization||'').replace(/^Bearer\s+/,'') || req.cookies?.access_token;
    if (!token) return res.status(401).json({ ok:false, error:'Auth required' });
    const payload = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
    const { supabaseAdmin } = require('./lib/supabase');
    const userId = payload.sub || payload.id;
    const { id } = req.params;
    const { name, status, config } = req.body || {};
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (status !== undefined) updates.status = status;
    if (config !== undefined) updates.config = config;
    const { data, error } = await supabaseAdmin
      .from('automations').update(updates).eq('id', id).eq('user_id', userId).select().single();
    if (error) throw new Error(error.message);
    return res.json({ ok:true, automation: data });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});

app.delete('/api/automations/:id', async (req, res) => {
  try {
    const token = (req.headers.authorization||'').replace(/^Bearer\s+/,'') || req.cookies?.access_token;
    if (!token) return res.status(401).json({ ok:false, error:'Auth required' });
    const payload = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
    const { supabaseAdmin } = require('./lib/supabase');
    const userId = payload.sub || payload.id;
    const { id } = req.params;
    const { error } = await supabaseAdmin.from('automations').delete().eq('id', id).eq('user_id', userId);
    if (error) throw new Error(error.message);
    return res.json({ ok:true });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});

// ── AEOS: Banking / Ledger ────────────────────────────────────────────────────
app.get('/api/banking/ledger', async (req, res) => {
  try {
    const token = (req.headers.authorization||'').replace(/^Bearer\s+/,'') || req.cookies?.access_token;
    if (!token) return res.status(401).json({ ok:false, error:'Auth required' });
    const payload = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
    const { supabaseAdmin } = require('./lib/supabase');
    const userId = payload.sub || payload.id;
    const { data, error } = await supabaseAdmin
      .from('banking_ledger')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return res.json({ ok:true, ledger: data || [] });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});

app.get('/api/banking/summary', async (req, res) => {
  try {
    const token = (req.headers.authorization||'').replace(/^Bearer\s+/,'') || req.cookies?.access_token;
    if (!token) return res.status(401).json({ ok:false, error:'Auth required' });
    const payload = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
    const { supabaseAdmin } = require('./lib/supabase');
    const userId = payload.sub || payload.id;
    const { data, error } = await supabaseAdmin.from('banking_ledger').select('type,amount_zar,amount_brdg').eq('user_id', userId);
    if (error) throw new Error(error.message);
    const rows = data || [];
    const total_credited_zar = rows.filter(r => r.type === 'credit').reduce((s, r) => s + (r.amount_zar||0), 0);
    const total_debited_zar  = rows.filter(r => r.type === 'debit').reduce((s, r) => s + (r.amount_zar||0), 0);
    const total_brdg         = rows.filter(r => r.type === 'credit').reduce((s, r) => s + (r.amount_brdg||0), 0);
    return res.json({ ok:true, total_credited_zar, total_debited_zar, net_zar: total_credited_zar - total_debited_zar, total_brdg });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});

// ── AEOS: Tier Config (public) ────────────────────────────────────────────────
app.get('/api/tiers', async (req, res) => {
  try {
    const { supabaseAdmin } = require('./lib/supabase');
    const { data, error } = await supabaseAdmin.from('tier_config').select('*').order('id', { ascending: true });
    if (error) throw new Error(error.message);
    return res.json({ ok:true, tiers: data || [] });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});

// ── AEOS: AI Leadgen ──────────────────────────────────────────────────────────
app.post('/api/leads/ai-generate', async (req, res) => {
  try {
    const token = (req.headers.authorization||'').replace(/^Bearer\s+/,'') || req.cookies?.access_token;
    if (!token) return res.status(401).json({ ok:false, error:'Auth required' });
    const payload = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
    const { supabaseAdmin } = require('./lib/supabase');
    const userId = payload.sub || payload.id;
    const { app_id, target_description, count } = req.body || {};
    if (!app_id || !target_description) return res.status(400).json({ ok:false, error:'app_id and target_description are required' });

    // check tier automation_enabled
    const { data: userRow } = await supabaseAdmin.from('users').select('tier').eq('id', userId).single();
    const tier = userRow?.tier || 'free';
    const { data: tierConfig } = await supabaseAdmin.from('tier_config').select('automation_enabled').eq('tier', tier).single();
    if (!tierConfig?.automation_enabled) {
      return res.status(403).json({ ok:false, error:'AI leadgen not available on your tier' });
    }

    const genCount = Math.min(parseInt(count) || 5, 50);
    const leads = [];
    for (let i = 0; i < genCount; i++) {
      const score = Math.floor(Math.random() * 51) + 40; // 40-90
      const { data: lead, error: lErr } = await supabaseAdmin
        .from('leads')
        .insert({
          user_id: userId,
          app_id,
          name: `AI Lead ${i + 1}`,
          score,
          status: 'new',
          ai_notes: 'AI-generated: ' + target_description,
        })
        .select()
        .single();
      if (lErr) throw new Error(lErr.message);
      leads.push(lead);
    }

    return res.json({ ok:true, leads });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});

// ── AEOS: Corporate Dashboard Data (superadmin only) ─────────────────────────
app.get('/api/system/overview', async (req, res) => {
  try {
    const token = (req.headers.authorization||'').replace(/^Bearer\s+/,'') || req.cookies?.access_token;
    if (!token) return res.status(401).json({ ok:false, error:'Auth required' });
    const payload = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
    const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL || 'ryanpcowan@gmail.com';
    const SUPERUSERS = (process.env.SUPERUSERS || SUPERADMIN_EMAIL).split(',').map(s => s.trim());
    const userEmail = payload.email || '';
    if (!SUPERUSERS.includes(userEmail)) {
      return res.status(403).json({ ok:false, error:'Superadmin access required' });
    }
    const { supabaseAdmin } = require('./lib/supabase');

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [
      { count: total_users },
      { count: active_users },
      { data: revenueRows },
      { data: usersByTier },
      { data: topApps },
      { data: recentRevenue },
      { count: total_leads },
      { count: total_automations },
      { count: affiliate_count },
    ] = await Promise.all([
      supabaseAdmin.from('users').select('id', { count:'exact', head:true }),
      supabaseAdmin.from('users').select('id', { count:'exact', head:true }).gte('last_seen', thirtyDaysAgo),
      supabaseAdmin.from('app_revenue_events').select('amount_zar'),
      supabaseAdmin.from('users').select('tier'),
      supabaseAdmin.from('apps').select('id,name,revenue_mtd').order('revenue_mtd', { ascending: false }).limit(5),
      supabaseAdmin.from('app_revenue_events').select('*').order('created_at', { ascending: false }).limit(10),
      supabaseAdmin.from('leads').select('id', { count:'exact', head:true }),
      supabaseAdmin.from('automations').select('id', { count:'exact', head:true }),
      supabaseAdmin.from('affiliates').select('id', { count:'exact', head:true }),
    ]);

    const total_revenue_zar = (revenueRows || []).reduce((s, r) => s + (r.amount_zar || 0), 0);

    const tierCounts = {};
    (usersByTier || []).forEach(u => { tierCounts[u.tier] = (tierCounts[u.tier] || 0) + 1; });

    return res.json({
      ok: true,
      total_users: total_users || 0,
      active_users: active_users || 0,
      total_revenue_zar,
      users_by_tier: tierCounts,
      top_apps: topApps || [],
      recent_revenue_events: recentRevenue || [],
      total_leads: total_leads || 0,
      total_automations: total_automations || 0,
      affiliate_count: affiliate_count || 0,
    });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});

// ── AEOS: User Dashboard Overview ─────────────────────────────────────────────
app.get('/api/dashboard/overview', async (req, res) => {
  try {
    const token = (req.headers.authorization||'').replace(/^Bearer\s+/,'') || req.cookies?.access_token;
    if (!token) return res.status(401).json({ ok:false, error:'Auth required' });
    const payload = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
    const { supabaseAdmin } = require('./lib/supabase');
    const userId = payload.sub || payload.id;

    const { data: userRow } = await supabaseAdmin.from('users').select('tier').eq('id', userId).single();
    const tier = userRow?.tier || 'free';
    const { data: tierConfig } = await supabaseAdmin.from('tier_config').select('*').eq('tier', tier).single();

    const [
      { data: wallet },
      { data: apps },
      { data: leads },
      { data: automations },
      { data: ledger },
      { data: revenueRows },
    ] = await Promise.all([
      supabaseAdmin.from('wallets').select('*').eq('user_id', userId).single(),
      supabaseAdmin.from('apps').select('*').eq('user_id', userId).eq('status','active'),
      supabaseAdmin.from('leads').select('status').eq('user_id', userId),
      supabaseAdmin.from('automations').select('id,status').eq('user_id', userId).eq('status','active'),
      supabaseAdmin.from('banking_ledger').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(5),
      supabaseAdmin.from('app_revenue_events').select('amount_zar').eq('user_id', userId),
    ]);

    const leadsByStatus = {};
    (leads || []).forEach(l => { leadsByStatus[l.status] = (leadsByStatus[l.status] || 0) + 1; });

    const revenue_mtd = (revenueRows || []).reduce((s, r) => s + (r.amount_zar || 0), 0);

    return res.json({
      ok: true,
      wallet: wallet || { balance_zar:0, balance_brdg:0, balance_usd:0 },
      tier_config: tierConfig || {},
      apps: apps || [],
      leads_by_status: leadsByStatus,
      active_automations: (automations || []).length,
      recent_ledger: ledger || [],
      revenue_mtd,
    });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});

'''

def main():
    if not os.path.isfile(GATEWAY_PATH):
        print(f'ERROR: File not found: {GATEWAY_PATH}')
        sys.exit(1)

    with open(GATEWAY_PATH, 'r', encoding='utf-8') as f:
        content = f.read()

    if ANCHOR not in content:
        print(f'ERROR: Anchor not found in {GATEWAY_PATH}')
        print(f'Searched for: {ANCHOR!r}')
        sys.exit(1)

    if '// ── AEOS: User Provisioning' in content:
        print('WARNING: AEOS routes already appear to be present in gateway.js. Aborting to avoid duplicate insertion.')
        sys.exit(1)

    # backup
    ts = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_path = GATEWAY_PATH + f'.bak_{ts}'
    shutil.copy2(GATEWAY_PATH, backup_path)
    print(f'Backup created: {backup_path}')

    new_content = content.replace(ANCHOR, NEW_ROUTES + ANCHOR, 1)

    if new_content == content:
        print('ERROR: Replacement produced no change. Anchor may contain non-printable chars.')
        sys.exit(1)

    with open(GATEWAY_PATH, 'w', encoding='utf-8') as f:
        f.write(new_content)

    added = new_content.count('\n') - content.count('\n')
    print(f'Done. Inserted AEOS routes ({added} new lines) before SVG ENGINE PROXY anchor.')
    print(f'File written: {GATEWAY_PATH}')

if __name__ == '__main__':
    main()
