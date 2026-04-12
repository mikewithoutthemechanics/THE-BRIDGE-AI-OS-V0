// =============================================================================
// BRIDGE AI OS — Autonomous Revenue Pipeline (ARP)
// Full end-to-end: lead intake → qualify → nurture → close → payment →
//                  reinvest → task generation → ABAAS signals → compound → repeat
//
// Every stage feeds the next. Revenue is ALWAYS taxed, reinvested, compounded.
// This module runs 24/7 as the master orchestrator of the entire economy.
// =============================================================================
'use strict';

const { supabase, isConfigured } = require('./supabase');
const ledger = require('./agent-ledger');
const market = require('./task-market');

// ── Configuration ─────────────────────────────────────────────────────────────
const PIPELINE_TICK_MS   = 30  * 1000;  // Stage 1–3: every 30s
const REINVEST_TICK_MS   = 5   * 60 * 1000; // Stage 4: every 5min (after compounding)
const ABAAS_FEED_TICK_MS = 15  * 1000;  // ABAAS signal injection: every 15s

// Revenue allocation for reinvestment growth tasks
const GROWTH_TASK_TEMPLATES = [
  { title: 'Prospect 10 new enterprise leads',    poster: 'agent-biz-sales',     reward: 300, stage: 'leadgen' },
  { title: 'Run targeted LinkedIn outreach',       poster: 'agent-biz-marketing', reward: 200, stage: 'leadgen' },
  { title: 'Enrich CRM contact data (batch 20)',   poster: 'agent-biz-research',  reward: 250, stage: 'leadgen' },
  { title: 'Write nurture email sequence (5-day)', poster: 'agent-biz-marketing', reward: 180, stage: 'nurture' },
  { title: 'A/B test subject lines (3 variants)',  poster: 'agent-biz-marketing', reward: 150, stage: 'nurture' },
  { title: 'Score warm leads from last 48h',       poster: 'agent-biz-sales',     reward: 200, stage: 'qualify' },
  { title: 'Generate ROI proposal for hot lead',   poster: 'agent-biz-sales',     reward: 350, stage: 'close' },
  { title: 'Analyse deal win/loss patterns',       poster: 'agent-biz-research',  reward: 280, stage: 'close' },
  { title: 'Reconcile payment provider data',      poster: 'agent-biz-finance',   reward: 160, stage: 'billing' },
  { title: 'Audit subscription churn signals',     poster: 'agent-biz-sales',     reward: 220, stage: 'retain' },
  { title: 'Compile BRDG economy health report',   poster: 'agent-svg-treasury',  reward: 140, stage: 'aoe' },
  { title: 'Detect low-trust agents (ABAAS scan)', poster: 'prime-sentinel',      reward: 190, stage: 'abaas' },
];

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  started_at: null,
  ticks: 0,
  stages: {
    intake:   { runs: 0, leads_found: 0, last_run: null },
    qualify:  { runs: 0, qualified: 0, dropped: 0, last_run: null },
    nurture:  { runs: 0, emails_queued: 0, last_run: null },
    close:    { runs: 0, deals_assessed: 0, last_run: null },
    reinvest:   { runs: 0, tasks_created: 0, brdg_deployed: 0, last_run: null },
    abaas:      { runs: 0, signals_injected: 0, last_run: null },
    aoe:        { runs: 0, economy_value: 0, last_run: null },
    activation: { runs: 0, touches_sent: 0, last_run: null },
    lifecycle:  { runs: 0, users_processed: 0, last_run: null },
  },
  pipeline_log: [],  // last 100 events
};

let _abaasPushFn = null; // injected by mount()

function log(stage, msg, data) {
  const entry = { stage, msg, data: data || {}, ts: new Date().toISOString() };
  state.pipeline_log.push(entry);
  if (state.pipeline_log.length > 100) state.pipeline_log.shift();
  console.log('[ARP:' + stage.toUpperCase() + '] ' + msg);
}

// ── Stage 1: Lead Intake ─────────────────────────────────────────────────────
// Pull new/unprocessed leads from BOTH leads (new) and crm_leads (existing).
// Dual-read pattern: safe cutover without losing historical data.

async function stageIntake() {
  state.stages.intake.runs++;
  state.stages.intake.last_run = new Date().toISOString();

  if (!isConfigured || !supabase) return;

  const allLeads = [];

  // Source A: new unified `leads` table
  try {
    const { data: newLeads } = await supabase
      .from('leads')
      .select('id, email, name, company, score, status, temperature, source, created_at')
      .in('status', ['new', 'unqualified'])
      .order('created_at', { ascending: false })
      .limit(15);

    if (newLeads && newLeads.length > 0) {
      allLeads.push(...newLeads.map(l => ({ ...l, _src: 'leads' })));
      const ids = newLeads.map(l => l.id);
      await supabase.from('leads').update({ status: 'pipeline_entered' }).in('id', ids);
    }
  } catch (_) {}

  // Source B: existing `crm_leads` table (real historical data)
  try {
    const { data: crmLeads } = await supabase
      .from('crm_leads')
      .select('id, email, company, score, status, source, created_at')
      .in('status', ['new', 'unqualified', 'contacted'])
      .order('created_at', { ascending: false })
      .limit(15);

    if (crmLeads && crmLeads.length > 0) {
      // Normalise crm_leads to shared shape — temperature inferred from score
      allLeads.push(...crmLeads.map(l => ({
        id: l.id,
        email: l.email,
        name: l.company || l.email,    // crm_leads has no name column
        company: l.company,
        score: l.score || 50,
        status: l.status,
        temperature: (l.score || 50) >= 75 ? 'hot' : (l.score || 50) >= 55 ? 'warm' : 'cold',
        source: l.source,
        created_at: l.created_at,
        _src: 'crm_leads',
      })));
      // Mark crm_leads as 'pipeline' so we don't re-process them
      const ids = crmLeads.map(l => l.id);
      await supabase.from('crm_leads').update({ status: 'pipeline' }).in('id', ids);
    }
  } catch (_) {}

  if (allLeads.length === 0) return [];

  state.stages.intake.leads_found += allLeads.length;
  log('intake', `Found ${allLeads.length} leads (${allLeads.filter(l => l._src === 'leads').length} new + ${allLeads.filter(l => l._src === 'crm_leads').length} crm)`, { count: allLeads.length });

  return allLeads;
}

// ── Stage 2: Qualify ─────────────────────────────────────────────────────────
// Score >= 60 → warm/hot; < 60 → cold (dropped from pipeline).

function stageQualify(leads) {
  state.stages.qualify.runs++;
  state.stages.qualify.last_run = new Date().toISOString();

  if (!leads || leads.length === 0) return { warm: [], hot: [], cold: [] };

  const hot  = leads.filter(l => (l.score || 50) >= 75 || l.temperature === 'hot');
  const warm = leads.filter(l => (l.score || 50) >= 55 && (l.score || 50) < 75 && l.temperature !== 'hot');
  const cold = leads.filter(l => (l.score || 50) < 55 && l.temperature !== 'hot' && l.temperature !== 'warm');

  state.stages.qualify.qualified += hot.length + warm.length;
  state.stages.qualify.dropped   += cold.length;

  if (hot.length + warm.length > 0) {
    log('qualify', 'Qualified ' + (hot.length + warm.length) + ' leads (' + hot.length + ' hot, ' + warm.length + ' warm)');
  }

  return { hot, warm, cold };
}

// ── Stage 3a: Nurture ─────────────────────────────────────────────────────────
// Warm leads → queue nurture sequence. Creates a marketplace task per lead.

async function stageNurture(warmLeads) {
  state.stages.nurture.runs++;
  state.stages.nurture.last_run = new Date().toISOString();

  if (!warmLeads || warmLeads.length === 0) return;
  if (!isConfigured || !supabase) return;

  for (const lead of warmLeads) {
    try {
      // Record nurture intent in DB — the email engine picks this up
      await supabase.from('nurture_queue').upsert({
        lead_id:    lead.id,
        email:      lead.email,
        name:       lead.name || lead.company,
        company:    lead.company,
        stage:      'day_0',
        status:     'queued',
        queued_at:  new Date().toISOString(),
      }, { onConflict: 'lead_id' });

      // Update whichever table this lead came from
      if (lead._src === 'crm_leads') {
        await supabase.from('crm_leads').update({ status: 'nurturing' }).eq('id', lead.id);
      } else {
        await supabase.from('leads').update({ status: 'nurturing' }).eq('id', lead.id);
      }

      state.stages.nurture.emails_queued++;
    } catch (e) {
      // nurture_queue table may not exist yet — silently skip
    }
  }

  if (warmLeads.length > 0) {
    log('nurture', 'Queued ' + warmLeads.length + ' nurture sequences');
  }
}

// ── Stage 3b: Close ──────────────────────────────────────────────────────────
// Hot leads → request closer agent assessment + generate checkout intent.

async function stageClose(hotLeads) {
  state.stages.close.runs++;
  state.stages.close.last_run = new Date().toISOString();

  if (!hotLeads || hotLeads.length === 0) return;
  if (!isConfigured || !supabase) return;

  for (const lead of hotLeads) {
    try {
      // Create a high-priority closing task in the marketplace
      // agent-biz-sales will pick it up and run the closer agent
      await supabase.from('tasks_market').insert({
        id:           'close_' + lead.id + '_' + Date.now().toString(36),
        poster_agent: 'prime-vega',
        title:        'Close deal: ' + (lead.company || lead.email),
        description:  'Hot lead ready to close. Score: ' + (lead.score || 75) + '. Run deal readiness assessment and generate personalized checkout offer.',
        reward_brdg:  500,
        escrow_amount: 0,
        status:       'POSTED',
        source:       'pipeline',
        posted_at:    new Date().toISOString(),
        metadata:     JSON.stringify({ lead_id: lead.id, email: lead.email, company: lead.company }),
      });

      // Mark lead as 'closing' in whichever source table it came from
      if (lead._src === 'crm_leads') {
        await supabase.from('crm_leads').update({ status: 'closing' }).eq('id', lead.id);
      } else {
        await supabase.from('leads').update({ status: 'closing' }).eq('id', lead.id);
      }

      state.stages.close.deals_assessed++;
    } catch (e) {
      log('close', 'Error for lead ' + lead.id + ': ' + e.message);
    }
  }

  if (hotLeads.length > 0) {
    log('close', 'Initiated closing for ' + hotLeads.length + ' hot leads');
  }
}

// ── Stage 4: Post-Payment Reinvestment ───────────────────────────────────────
// Every 5 min: read unprocessed payments → allocate to growth tasks.
// This is the COMPOUNDING FLYWHEEL — every ZAR in becomes more leads.

async function stageReinvest() {
  state.stages.reinvest.runs++;
  state.stages.reinvest.last_run = new Date().toISOString();

  if (!isConfigured || !supabase) return;

  try {
    const allPayments = [];

    // Source A: real `payments` table (PayFast IPN, invoices — primary source)
    try {
      const { data: realPayments } = await supabase
        .from('payments')
        .select('id, amount, status, reference, created_at')
        .eq('status', 'paid')
        .is('reinvested', null)          // NULL means not yet processed
        .order('created_at', { ascending: true })
        .limit(8);
      if (realPayments && realPayments.length > 0) {
        allPayments.push(...realPayments.map(p => ({ ...p, currency: 'ZAR', _src: 'payments' })));
      }
    } catch (_) {}

    // Source B: proof chain (crypto/on-chain payments)
    try {
      const { data: chainPayments } = await supabase
        .from('payment_proof_chain')
        .select('id, amount, currency, created_at')
        .eq('reinvested', false)
        .order('created_at', { ascending: true })
        .limit(5);
      if (chainPayments && chainPayments.length > 0) {
        allPayments.push(...chainPayments.map(p => ({ ...p, _src: 'proof_chain' })));
      }
    } catch (_) {}

    const payments = allPayments;
    if (payments.length === 0) return;

    let totalGrowthBudget = 0;
    const pids = { payments: [], proof_chain: [] };

    for (const p of payments) {
      const zarAmount = (p.currency === 'ZAR' || p._src === 'payments') ? p.amount : p.amount * 18;
      const growthBudget = zarAmount * 0.40; // 40% of revenue → growth
      totalGrowthBudget += growthBudget;
      if (p._src === 'payments') pids.payments.push(p.id);
      else pids.proof_chain.push(p.id);
    }

    if (totalGrowthBudget <= 0) return;

    // Convert growth budget to BRDG (1 ZAR = 10 BRDG)
    const growthBrdg = Math.round(totalGrowthBudget * 10);

    // Post growth tasks proportional to budget
    const tasksToPost = Math.min(Math.floor(growthBrdg / 200), 5); // ~200 BRDG per task
    const templates = GROWTH_TASK_TEMPLATES.filter(t => t.stage === 'leadgen' || t.stage === 'nurture');

    for (let i = 0; i < tasksToPost; i++) {
      const tmpl = templates[i % templates.length];
      try {
        await supabase.from('tasks_market').insert({
          id:           'reinvest_' + Date.now().toString(36) + '_' + i,
          poster_agent: tmpl.poster,
          title:        tmpl.title,
          description:  'Growth reinvestment task — funded from revenue allocation R' + Math.round(totalGrowthBudget / tasksToPost),
          reward_brdg:  tmpl.reward,
          escrow_amount: 0,
          status:       'POSTED',
          source:       'reinvestment',
          posted_at:    new Date().toISOString(),
        });
        state.stages.reinvest.tasks_created++;
        state.stages.reinvest.brdg_deployed += tmpl.reward;
      } catch (_) {}
    }

    // Mark payments as reinvested in both source tables
    if (pids.payments.length > 0) {
      try { await supabase.from('payments').update({ reinvested: true, reinvested_at: new Date().toISOString() }).in('id', pids.payments); } catch (_) {}
    }
    if (pids.proof_chain.length > 0) {
      try { await supabase.from('payment_proof_chain').update({ reinvested: true }).in('id', pids.proof_chain); } catch (_) {}
    }

    // Credit prime-atlas (Growth orchestrator) with BRDG for deploying growth budget
    try {
      await ledger.credit('prime-atlas', Math.round(growthBrdg * 0.05), 'growth_orchestration', 'Reinvestment orchestration fee');
    } catch (_) {}

    // ── Affiliate BRDG crediting ─────────────────────────────────────────────
    // For each processed payment, check if it has an affiliated referrer and
    // credit their BRDG commission tier.
    try {
      const affTiers = { starter: 0.10, bronze: 0.15, silver: 0.20, gold: 0.25, platinum: 0.30, diamond: 0.35 };

      for (const p of payments) {
        if (p._src !== 'payments') continue; // only real PayFast payments carry affiliate refs
        if (!p.reference) continue;

        // Look up if this payment's reference has an affiliate click
        const { data: click } = await supabase
          .from('affiliate_clicks')
          .select('affiliate_id, conversion_value')
          .eq('reference', p.reference)
          .eq('converted', false)
          .maybeSingle();

        if (!click || !click.affiliate_id) continue;

        // Get affiliate tier
        const { data: aff } = await supabase
          .from('affiliates')
          .select('id, tier, brdg_earned')
          .eq('id', click.affiliate_id)
          .maybeSingle();

        if (!aff) continue;

        const tier = aff.tier || 'starter';
        const commissionRate = affTiers[tier] || 0.10;
        const zarAmount = p.amount || 0;
        const brdgReward = Math.round(zarAmount * commissionRate * 10); // ZAR → BRDG at 10x

        // Credit affiliate's BRDG balance in agent ledger
        await ledger.credit(
          'affiliate_' + aff.id,
          brdgReward,
          'affiliate_commission',
          `Affiliate commission (${tier}): R${zarAmount.toFixed(2)} × ${Math.round(commissionRate * 100)}% → ${brdgReward} BRDG`
        );

        // Record conversion
        await supabase.from('affiliate_conversions').insert({
          affiliate_id:     aff.id,
          click_id:         click.id || null,
          payment_reference: p.reference,
          sale_amount:      zarAmount,
          commission_rate:  commissionRate,
          commission_amount: +(zarAmount * commissionRate).toFixed(2),
          brdg_bonus:       brdgReward,
          tier,
          created_at:       new Date().toISOString(),
        });

        // Mark click as converted
        await supabase.from('affiliate_clicks').update({ converted: true, conversion_value: zarAmount }).eq('affiliate_id', aff.id).eq('reference', p.reference);

        // Update affiliates summary
        await supabase.from('affiliates').update({
          brdg_earned:       (aff.brdg_earned || 0) + brdgReward,
          total_conversions: supabase.rpc ? undefined : undefined, // incremented via trigger
        }).eq('id', aff.id);

        log('reinvest', `Affiliate ${aff.id} (${tier}) credited ${brdgReward} BRDG for R${zarAmount.toFixed(2)} sale`);
      }
    } catch (affErr) {
      // Affiliate crediting is non-critical — log but don't fail reinvestment
      log('reinvest', 'Affiliate credit error (non-fatal): ' + affErr.message);
    }

    log('reinvest', 'Deployed ' + state.stages.reinvest.brdg_deployed + ' BRDG across ' + tasksToPost + ' growth tasks', {
      growth_budget_zar: totalGrowthBudget.toFixed(2),
      tasks_posted: tasksToPost,
    });
  } catch (e) {
    log('reinvest', 'Error: ' + e.message);
  }
}

// ── Stage 5: ABAAS Signal Injection ─────────────────────────────────────────
// Feed real signals from the economy into ABAAS scan queues so the
// Greek-letter agents process REAL business data, not empty queues.

async function stageAbaasFeeder() {
  state.stages.abaas.runs++;
  state.stages.abaas.last_run = new Date().toISOString();

  if (!_abaasPushFn) return;

  try {
    let signalCount = 0;

    // Market signals: pull from BRDG economy stats (real price pressure, volume, burn rate)
    try {
      const { data: balRows } = await supabase.from('agent_balances').select('balance').order('balance', { ascending: false }).limit(5);
      const { count: txCount } = await supabase.from('agent_transactions').select('*', { count: 'exact', head: true });
      if (balRows) {
        _abaasPushFn('market', {
          type: 'brdg_economy',
          total_circulating: balRows.reduce((s, r) => s + (r.balance || 0), 0),
          tx_volume: txCount || 0,
          confidence: 0.8,
          ts: Date.now(),
        });
        signalCount++;
      }
    } catch (_) {}

    // Business leads: pull hot/warm leads from both CRM sources
    try {
      const hotLeadsAll = [];
      const { data: l1 } = await supabase.from('leads').select('id, email, company, score').in('status', ['closing', 'pipeline_entered']).gte('score', 60).limit(3);
      const { data: l2 } = await supabase.from('crm_leads').select('id, email, company, score').in('status', ['pipeline', 'closing', 'qualified']).gte('score', 60).limit(3);
      if (l1) hotLeadsAll.push(...l1);
      if (l2) hotLeadsAll.push(...l2);

      hotLeadsAll.forEach(l => {
        _abaasPushFn('leads', { id: l.id, email: l.email, company: l.company, value: (l.score || 60) * 100, priority: (l.score || 60) / 100, ts: Date.now() });
        signalCount++;
      });
    } catch (_) {}

    // System issues: pull from auto-task loop stats, flag high error rates
    try {
      const { data: failedTasks } = await supabase
        .from('tasks_market')
        .select('id, title')
        .eq('status', 'FAILED')
        .order('posted_at', { ascending: false })
        .limit(3);

      if (failedTasks && failedTasks.length > 0) {
        failedTasks.forEach(t => {
          _abaasPushFn('issues', { task_id: t.id, title: t.title, severity: 'low', priority: 0.4, ts: Date.now() });
          signalCount++;
        });
      }
    } catch (_) {}

    state.stages.abaas.signals_injected += signalCount;
    if (signalCount > 0) {
      log('abaas', 'Injected ' + signalCount + ' signals (market + leads + issues)');
    }
  } catch (e) {
    log('abaas', 'Feed error: ' + e.message);
  }
}

// ── Stage 6: AOE Economy Health ──────────────────────────────────────────────
// Update AOE metrics — track total economy value (BRDG in circulation + task volume).

async function stageAoeHealth() {
  state.stages.aoe.runs++;
  state.stages.aoe.last_run = new Date().toISOString();

  if (!isConfigured || !supabase) return;

  try {
    const { data: balRows } = await supabase.from('agent_balances').select('balance');
    const totalBrdg = (balRows || []).reduce((s, r) => s + (r.balance || 0), 0);
    state.stages.aoe.economy_value = totalBrdg;
  } catch (_) {}
}

// ── Main Tick ────────────────────────────────────────────────────────────────

async function stageActivation() {
  state.stages.activation.runs++;
  state.stages.activation.last_run = new Date().toISOString();
  try {
    const activation = require('./revenue-activation');
    const result = await activation.processDueTouches(15);
    const sent = result?.touched || 0;
    state.stages.activation.touches_sent += sent;
    log('activation', `Processed ${sent} due touches`);
  } catch (e) {
    log('activation', 'Stage error: ' + e.message);
  }
}

async function stageLifecycle() {
  state.stages.lifecycle.runs++;
  state.stages.lifecycle.last_run = new Date().toISOString();
  try {
    const lifecycle = require('./lifecycle-engine');
    const result = await lifecycle.processActiveSubscribers(10);
    const count = result?.processed || 0;
    state.stages.lifecycle.users_processed += count;
    log('lifecycle', `Lifecycle processed ${count} active subscribers`);
  } catch (e) {
    log('lifecycle', 'Stage error: ' + e.message);
  }
}

async function tick() {
  state.ticks++;

  try {
    const leads = await stageIntake();
    if (leads && leads.length > 0) {
      const { hot, warm } = stageQualify(leads);
      await Promise.all([
        stageNurture(warm),
        stageClose(hot),
      ]);
    }
    await stageAoeHealth();

    // Every 10th tick (~5min): process activation pipeline + subscriber lifecycle
    if (state.ticks % 10 === 0) {
      await stageActivation();
      await stageLifecycle();
    }
  } catch (e) {
    log('pipeline', 'Tick error: ' + e.message);
  }
}

async function reinvestTick() {
  try {
    await stageReinvest();
  } catch (e) {
    log('reinvest', 'Tick error: ' + e.message);
  }
}

async function abaasFeedTick() {
  try {
    await stageAbaasFeeder();
  } catch (e) {
    log('abaas', 'Feed tick error: ' + e.message);
  }
}

// ── Mount: wire routes + start all loops ─────────────────────────────────────

function mount(app, opts) {
  if (opts && opts.abaasPush) {
    _abaasPushFn = opts.abaasPush;
  }

  state.started_at = new Date().toISOString();

  // Start all pipeline loops
  setImmediate(tick);                                                         // run immediately on boot
  setInterval(tick,          PIPELINE_TICK_MS);   // 30s  — lead flow
  setInterval(reinvestTick,  REINVEST_TICK_MS);   // 5min — compounding reinvestment
  setInterval(abaasFeedTick, ABAAS_FEED_TICK_MS); // 15s  — ABAAS signals

  console.log('[ARP] Autonomous Revenue Pipeline ACTIVE — lead→nurture→close→pay→reinvest→compound');

  // Seed activation pipeline for all registered users (idempotent — safe to re-run)
  setImmediate(async () => {
    try {
      const activation = require('./revenue-activation');
      const result = await activation.seedActivationPipeline();
      console.log('[ARP:ACTIVATION] Pipeline seeded — ' + (result?.seeded || 0) + ' users');
    } catch (e) {
      console.log('[ARP:ACTIVATION] Seed skipped: ' + e.message);
    }
  });

  // ── API Endpoints ─────────────────────────────────────────────────────────

  // Full pipeline status — the live dashboard for the entire revenue organism
  app.get('/api/pipeline/status', (_req, res) => {
    res.json({
      ok: true,
      name: 'BRIDGE_AI_AUTONOMOUS_REVENUE_PIPELINE',
      active: true,
      started_at: state.started_at,
      ticks: state.ticks,
      stages: state.stages,
      economy_value_brdg: state.stages.aoe.economy_value,
    });
  });

  // Recent pipeline events log
  app.get('/api/pipeline/log', (_req, res) => {
    res.json({ ok: true, events: state.pipeline_log.slice(-50) });
  });

  // Force a manual pipeline tick (admin use)
  app.post('/api/pipeline/tick', async (_req, res) => {
    try {
      await tick();
      res.json({ ok: true, msg: 'Pipeline tick complete', ticks: state.ticks });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // Force reinvestment cycle (admin use)
  app.post('/api/pipeline/reinvest', async (_req, res) => {
    try {
      await reinvestTick();
      res.json({ ok: true, msg: 'Reinvestment cycle complete', stage: state.stages.reinvest });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // Full AOE + pipeline health view
  app.get('/api/aoe/economy', async (_req, res) => {
    try {
      const [balances, marketStats] = await Promise.all([
        ledger.getAllBalances().catch(() => []),
        market.getMarketStats().catch(() => ({})),
      ]);

      const totalBrdg = balances.reduce((s, r) => s + (r.balance || 0), 0);
      const topAgents = balances.sort((a, b) => (b.balance || 0) - (a.balance || 0)).slice(0, 10);

      res.json({
        ok: true,
        name: 'BRIDGE_AI_AGENT_OPERATING_ECONOMY',
        pipeline: {
          started_at: state.started_at,
          ticks: state.ticks,
          stages: state.stages,
        },
        economy: {
          total_brdg_circulating: totalBrdg,
          agent_count: balances.length,
          top_agents: topAgents.map(a => ({ id: a.agent_id, balance: a.balance, earned: a.earned_total })),
        },
        marketplace: marketStats,
        ts: new Date().toISOString(),
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });
}

module.exports = { mount, getState: () => ({ ...state }) };
