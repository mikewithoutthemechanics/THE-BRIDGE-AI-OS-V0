// =============================================================================
// BRIDGE AI OS — Subscription Service
// Tier management, plan enforcement, upgrade/downgrade flows
// =============================================================================
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const PORT = parseInt(process.env.SUBSCRIPTION_PORT, 10) || 6061;
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

const isConfigured = !!(
  SUPABASE_URL && SUPABASE_SERVICE_KEY &&
  SUPABASE_URL.startsWith('https://') && SUPABASE_SERVICE_KEY.length > 20
);

let supabase = null;
if (isConfigured) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const app = express();
app.use(express.json());

// ── Plan definitions ────────────────────────────────────────────────────────
const PLANS = {
  free:       { name: 'Free',       price: 0,    agents: 3,  api_calls: 100,   storage_mb: 50,   features: ['basic_dashboard', 'community_support'] },
  starter:    { name: 'Starter',    price: 9,    agents: 10, api_calls: 5000,  storage_mb: 500,  features: ['basic_dashboard', 'email_support', 'custom_agents'] },
  pro:        { name: 'Pro',        price: 29,   agents: 50, api_calls: 50000, storage_mb: 5000, features: ['advanced_dashboard', 'priority_support', 'custom_agents', 'analytics', 'api_access'] },
  enterprise: { name: 'Enterprise', price: 99,   agents: -1, api_calls: -1,    storage_mb: -1,   features: ['full_access', 'dedicated_support', 'sla', 'custom_integrations', 'white_label'] },
};

// ── Get user tier ───────────────────────────────────────────────────────────
app.get('/tier/:user_id', async (req, res) => {
  const userId = req.params.user_id;

  if (isConfigured && supabase) {
    const { data } = await supabase
      .from('user_subscriptions')
      .select('plan, status, expires_at')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (data) {
      const plan = PLANS[data.plan] || PLANS.free;
      return res.json({ user_id: userId, tier: data.plan, ...plan, expires_at: data.expires_at });
    }
  }

  // Default to free tier
  res.json({ user_id: userId, tier: 'free', ...PLANS.free });
});

// ── Upgrade / change plan ───────────────────────────────────────────────────
app.post('/upgrade', async (req, res) => {
  const { user_id, plan } = req.body;

  if (!user_id || !plan) return res.status(400).json({ error: 'user_id and plan required' });
  if (!PLANS[plan]) return res.status(400).json({ error: 'Invalid plan. Options: ' + Object.keys(PLANS).join(', ') });

  if (!isConfigured || !supabase) {
    return res.json({ success: true, plan, _offline: true });
  }

  // Deactivate current plan
  await supabase
    .from('user_subscriptions')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('user_id', user_id)
    .eq('status', 'active');

  // Activate new plan
  const { error } = await supabase.from('user_subscriptions').insert({
    user_id,
    plan,
    status: 'active',
    started_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });

  if (error) {
    console.warn('[SUBSCRIPTIONS] Upgrade failed:', error.message);
    return res.status(500).json({ error: 'Upgrade failed' });
  }

  console.log(`[SUBSCRIPTIONS] User ${user_id} upgraded to ${plan}`);
  res.json({ success: true, user_id, plan, ...PLANS[plan] });
});

// ── Check limits ────────────────────────────────────────────────────────────
app.get('/limits/:user_id', async (req, res) => {
  const userId = req.params.user_id;
  let tier = 'free';

  if (isConfigured && supabase) {
    const { data } = await supabase
      .from('user_subscriptions')
      .select('plan')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();
    if (data) tier = data.plan;
  }

  const plan = PLANS[tier] || PLANS.free;
  res.json({
    user_id: userId,
    tier,
    limits: {
      agents: plan.agents,
      api_calls_per_month: plan.api_calls,
      storage_mb: plan.storage_mb,
    },
  });
});

// ── List all plans ──────────────────────────────────────────────────────────
app.get('/plans', (_req, res) => res.json(PLANS));

// ── Health + metrics ────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'subscriptions', supabase: isConfigured });
});

app.get('/metrics', (_req, res) => {
  res.type('text/plain').send([
    '# HELP subscriptions_up Service is running',
    '# TYPE subscriptions_up gauge',
    'subscriptions_up 1',
  ].join('\n') + '\n');
});

// ── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[SUBSCRIPTIONS] Service running on http://localhost:${PORT}`);
  console.log(`[SUBSCRIPTIONS] Plans: ${Object.keys(PLANS).join(', ')}`);
  console.log(`[SUBSCRIPTIONS] Supabase: ${isConfigured ? 'connected' : 'offline'}`);
});
