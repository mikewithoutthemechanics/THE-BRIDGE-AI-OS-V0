// =============================================================================
// BRIDGE AI OS — Billing Service
// Charge API — PayFast integration (SA payment processor) + Stripe-ready
// =============================================================================
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const PORT = parseInt(process.env.BILLING_PORT, 10) || 6060;
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

// ── Charge endpoint ─────────────────────────────────────────────────────────
app.post('/charge', async (req, res) => {
  const { user_id, amount, currency, description } = req.body;

  if (!user_id || !amount) {
    return res.status(400).json({ error: 'user_id and amount required' });
  }

  const chargeId = `chg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  // Record charge in DB
  if (isConfigured && supabase) {
    const { error } = await supabase.from('billing_charges').insert({
      charge_id: chargeId,
      user_id,
      amount: parseFloat(amount),
      currency: currency || 'USD',
      description: description || 'Platform usage',
      status: 'pending',
      created_at: new Date().toISOString(),
    });

    if (error && !error.message.includes('does not exist')) {
      console.warn('[BILLING] Charge record failed:', error.message);
    }
  }

  console.log(`[BILLING] Charge ${chargeId}: user=${user_id} amount=$${amount}`);
  res.json({ success: true, charge_id: chargeId, status: 'pending' });
});

// ── PayFast webhook (IPN) ───────────────────────────────────────────────────
app.post('/payfast/notify', async (req, res) => {
  const { payment_status, pf_payment_id, amount_gross, custom_str1 } = req.body;

  if (payment_status === 'COMPLETE') {
    console.log(`[BILLING] PayFast payment ${pf_payment_id}: $${amount_gross} for ${custom_str1}`);

    if (isConfigured && supabase) {
      await supabase.from('billing_charges').update({
        status: 'paid',
        provider: 'payfast',
        provider_id: pf_payment_id,
        paid_at: new Date().toISOString(),
      }).eq('user_id', custom_str1).eq('status', 'pending');
    }
  }

  res.status(200).send('OK');
});

// ── Invoice list ────────────────────────────────────────────────────────────
app.get('/invoices/:user_id', async (req, res) => {
  if (!isConfigured || !supabase) return res.json([]);

  const { data } = await supabase
    .from('billing_charges')
    .select('*')
    .eq('user_id', req.params.user_id)
    .order('created_at', { ascending: false })
    .limit(50);

  res.json(data || []);
});

// ── Health + metrics ────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'billing', supabase: isConfigured });
});

app.get('/metrics', (_req, res) => {
  res.type('text/plain').send([
    '# HELP billing_up Service is running',
    '# TYPE billing_up gauge',
    'billing_up 1',
  ].join('\n') + '\n');
});

// ── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[BILLING] Service running on http://localhost:${PORT}`);
  console.log(`[BILLING] Supabase: ${isConfigured ? 'connected' : 'offline'}`);
});
