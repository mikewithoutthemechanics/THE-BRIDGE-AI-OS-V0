#!/usr/bin/env node
'use strict';

/**
 * seed-affiliates.js — one-off seed for the reconciled affiliates table
 *
 * Run AFTER 20260420100000_affiliate_program_reconciliation.sql is applied.
 *
 *   node scripts/seed-affiliates.js           # upsert all seed rows
 *   node scripts/seed-affiliates.js --dry     # print what would be inserted, don't write
 *   node scripts/seed-affiliates.js --purge   # delete rows that match SEED_TAG before re-seeding
 *
 * Idempotent: relies on UNIQUE (company_id, referral_code) index from the
 * reconciliation migration. Re-running does ON CONFLICT DO NOTHING.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SENSITIVE ROWS FLAGGED (present at owner's explicit request):
 *   • NINJA PROSTITUTES     — exposed via public /api/affiliate/leaderboard
 *   • CLAUDE, ANTHROPIC,    — trademark exposure on same public endpoint
 *     GOOGLE
 * To strip them before running: `node scripts/seed-affiliates.js --safe`
 *   (omits any row where meta.sensitive === true)
 * ─────────────────────────────────────────────────────────────────────────
 */

require('dotenv').config({ override: false });

const { supabase, isConfigured } = require('../lib/supabase');
const ledger = require('../lib/agent-ledger');

const DEFAULT_COMPANY = '00000000-0000-0000-0000-000000000001';
const SEED_TAG = 'reconciliation-2026-04-20';

// ── BRDG wallet seed amounts by category ──────────────────────────────────
// Convention for affiliate wallet IDs is `affiliate_{uuid}` (matches
// autonomous-pipeline.js:375 which credits commission to this namespace).
// Prime Agents keep their existing prime-* wallets (100k BRDG each from
// agent-ledger.js SEED_AMOUNTS.prime_csuite) — we don't re-fund them here.
const BRDG_SEED = {
  agent:  0,      // already funded as prime-* wallets
  person: 1000,
  seed:   1000,   // original brain.js entries
  brand:  2500,
  domain: 5000,
};

const args = new Set(process.argv.slice(2));
const DRY   = args.has('--dry');
const PURGE = args.has('--purge');
const SAFE  = args.has('--safe');

// ── Seed catalogue ─────────────────────────────────────────────────────────
// category drives default tier + meta so the portal can filter/segment.
//   seed    — original brain.js in-memory rows (preserved for continuity)
//   agent   — AI agent identities (Prime Agents, etc.)
//   person  — human affiliates
//   brand   — organization / product brand
//   domain  — domain-level affiliates (tracking sub-sites)
const SEEDS = [
  // ── Original brain.js Map entries ─────────────────────────────────
  { name: 'Marvin',           code: 'AFF-MARVIN',       category: 'person', tier: 'gold',     referrals: 45,  conversions: 16 },
  { name: 'Ryan',             code: 'AFF-RYAN',         category: 'person', tier: 'platinum', referrals: 128, conversions: 45 },
  { name: 'Supac',            code: 'AFF-SUPAC',        category: 'person', tier: 'bronze',   referrals: 12,  conversions: 4  },
  { name: 'Bridge Team',      code: 'AFF-BRIDGE-TEAM',  category: 'brand',  tier: 'diamond',  referrals: 230, conversions: 81 },
  { name: 'EHSA Ops',         code: 'AFF-EHSA-OPS',     category: 'brand',  tier: 'silver',   referrals: 67,  conversions: 23 },

  // ── Brands / organizations ────────────────────────────────────────
  { name: 'Bridge EHSA',         code: 'AFF-BRIDGE-EHSA',    category: 'brand' },
  { name: 'Empeleni',            code: 'AFF-EMPELENI',       category: 'brand' },
  { name: 'ABAAS',               code: 'AFF-ABAAS',          category: 'brand' },
  { name: 'AOE',                 code: 'AFF-AOE',            category: 'brand' },
  { name: 'Supasoloc',           code: 'AFF-SUPASOLOC',      category: 'brand' },
  { name: 'Agentcy',             code: 'AFF-AGENTCY',        category: 'brand' },
  { name: 'Hospital in a Box',   code: 'AFF-HOSPITAL-BOX',   category: 'brand' },
  { name: 'Supaco.ai-Mosie',     code: 'AFF-SUPACO-MOSIE',   category: 'brand' },
  // AID and Rooted Earth are existing products (see public/aid-home.html,
  // public/rootedearth-home.html, gateway.js:3570-3635). Stox / NEA / MAX
  // / Community Upliftment are new brand affiliates per owner request.
  { name: 'AID',                 code: 'AFF-AID',            category: 'brand', meta_extra: { home: '/aid-home.html', subdomain: 'aid.ai-os.co.za' } },
  { name: 'Rooted Earth',        code: 'AFF-ROOTED-EARTH',   category: 'brand', meta_extra: { home: '/rootedearth-home.html', subdomain: 'rootedearth.ai-os.co.za' } },
  { name: 'Stox',                code: 'AFF-STOX',           category: 'brand' },
  { name: 'Community Upliftment',code: 'AFF-COMMUNITY-UP',   category: 'brand' },
  { name: 'NEA',                 code: 'AFF-NEA',            category: 'brand' },
  { name: 'Max',                 code: 'AFF-MAX',            category: 'brand' },
  // Sub-affiliates of the above (Stox, AID, Community Upliftment, Rooted
  // Earth, NEA, Max) should be added here with parent_code set to the
  // parent's referral_code — the seeder will resolve parent_code → UUID
  // and populate parent_affiliate_id. Empty list for now.
  //   example: { name: 'Sub X', code: 'AFF-SUB-X', category: 'person', parent_code: 'AFF-STOX' },

  // ── Prime Agents (from lib/agent-registry.js) ─────────────────────
  // Aurora appears only once (deduped — user listed it explicitly AND
  // it's in the prime agent roster).
  { name: 'Aurora',           code: 'AFF-AURORA',       category: 'agent',  meta_extra: { agent_id: 'prime-aurora',   role: 'revenue_orchestrator' } },
  { name: 'Atlas',            code: 'AFF-ATLAS',        category: 'agent',  meta_extra: { agent_id: 'prime-atlas',    role: 'infrastructure_orchestrator' } },
  { name: 'Vega',             code: 'AFF-VEGA',         category: 'agent',  meta_extra: { agent_id: 'prime-vega',     role: 'intelligence_orchestrator' } },
  { name: 'Omega',            code: 'AFF-OMEGA',        category: 'agent',  meta_extra: { agent_id: 'prime-omega',    role: 'operations_orchestrator' } },
  { name: 'Halo',             code: 'AFF-HALO',         category: 'agent',  meta_extra: { agent_id: 'prime-halo',     role: 'experience_orchestrator' } },
  { name: 'Nexus',            code: 'AFF-NEXUS',        category: 'agent',  meta_extra: { agent_id: 'prime-nexus',    role: 'commerce_orchestrator' } },
  { name: 'Sentinel',         code: 'AFF-SENTINEL',     category: 'agent',  meta_extra: { agent_id: 'prime-sentinel', role: 'security_orchestrator' } },

  // ── People ────────────────────────────────────────────────────────
  // Note: RYAN (above) and RYAN PAUL COWAN are likely the same person
  // (ryanpcowan@gmail.com, superadmin). Kept as separate rows per the
  // owner's explicit request — dedupe with a DELETE if desired.
  { name: 'Taurus',           code: 'AFF-TAURUS',       category: 'person' },
  { name: 'Mike Kidd',        code: 'AFF-MIKE-KIDD',    category: 'person' },
  { name: 'Megan Renald',     code: 'AFF-MEGAN-RENALD', category: 'person' },
  { name: 'Bongs',            code: 'AFF-BONGS',        category: 'person' },
  { name: 'Mbongemi',         code: 'AFF-MBONGEMI',     category: 'person' },
  { name: 'Paul Cowan',       code: 'AFF-PAUL-COWAN',   category: 'person' },
  { name: 'Ryan Paul Cowan',  code: 'AFF-RPC',          category: 'person', meta_extra: { likely_duplicate_of: 'AFF-RYAN' } },
  { name: 'Supac Cowan',      code: 'AFF-SUPAC-COWAN',  category: 'person', meta_extra: { likely_duplicate_of: 'AFF-SUPAC' } },

  // ── Domains ───────────────────────────────────────────────────────
  { name: 'ai-os.co.za',      code: 'AFF-AI-OS-COZA',   category: 'domain', meta_extra: { domain: 'ai-os.co.za' } },
  { name: 'go.ai-os.co.za',   code: 'AFF-GO-AI-OS',     category: 'domain', meta_extra: { domain: 'go.ai-os.co.za' } },

  // ── Sensitive — flagged for owner review ──────────────────────────
  // These will appear on the PUBLIC /api/affiliate/leaderboard endpoint.
  { name: 'Ninja Prostitutes', code: 'AFF-NINJA',       category: 'brand',  sensitive: true, meta_extra: { flag: 'public_exposure_warning' } },
  { name: 'Claude',            code: 'AFF-CLAUDE',      category: 'brand',  sensitive: true, meta_extra: { flag: 'trademark_exposure' } },
  { name: 'Anthropic',         code: 'AFF-ANTHROPIC',   category: 'brand',  sensitive: true, meta_extra: { flag: 'trademark_exposure' } },
  { name: 'Google',            code: 'AFF-GOOGLE',      category: 'brand',  sensitive: true, meta_extra: { flag: 'trademark_exposure' } },
];

// ── Tier commission map (mirrors AFF_TIERS in brain.js) ───────────────────
const TIER_COMMISSION = {
  starter:  10,
  bronze:   15,
  silver:   20,
  gold:     25,
  platinum: 30,
  diamond:  35,
};

function buildRow(seed) {
  const tier = seed.tier || 'starter';
  const referrals = seed.referrals || 0;
  const conversions = seed.conversions || 0;
  // Derive a sensible `earned` if tier/referrals are seeded (mirrors brain.js seeding logic).
  const earned = referrals > 0
    ? +(referrals * 25 * (TIER_COMMISSION[tier] / 100)).toFixed(2)
    : 0;

  return {
    company_id:        DEFAULT_COMPANY,
    name:              seed.name,
    email:             null,
    code:              seed.code,
    referral_code:     seed.code,
    tier,
    commission_pct:    TIER_COMMISSION[tier] || 10,
    clicks:            referrals * 7 || 0,
    signups:           referrals || 0,
    conversions,
    revenue:           earned * 5,
    earned,
    paid_out:          +(earned * 0.8).toFixed(2),
    status:            'active',
    meta: {
      seed_tag:  SEED_TAG,
      category:  seed.category,
      sensitive: !!seed.sensitive,
      ...(seed.meta_extra || {}),
    },
  };
}

async function main() {
  if (!isConfigured || !supabase) {
    console.error('[SEED] Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY.');
    process.exit(1);
  }

  const pool = SAFE ? SEEDS.filter(s => !s.sensitive) : SEEDS;
  const rows = pool.map(buildRow);

  console.log(`[SEED] seed_tag=${SEED_TAG}  rows=${rows.length}  safe=${SAFE}  dry=${DRY}  purge=${PURGE}`);

  if (PURGE && !DRY) {
    const { error } = await supabase
      .from('affiliates')
      .delete()
      .eq('company_id', DEFAULT_COMPANY)
      .contains('meta', { seed_tag: SEED_TAG });
    if (error) {
      console.error('[SEED] Purge failed:', error.message);
      process.exit(1);
    }
    console.log('[SEED] Purged prior seed rows.');
  }

  if (DRY) {
    console.log(JSON.stringify(rows, null, 2));
    console.log(`[SEED] DRY RUN — no rows written. ${rows.length} would be upserted.`);
    return;
  }

  // Upsert keyed on (company_id, referral_code). The UNIQUE index guarantees
  // idempotence without requiring us to pre-fetch existing rows.
  const { data, error } = await supabase
    .from('affiliates')
    .upsert(rows, {
      onConflict: 'company_id,referral_code',
      ignoreDuplicates: false,  // update mutable fields (tier, earned) on re-run
    })
    .select('id, name, referral_code, tier, meta');

  if (error) {
    console.error('[SEED] Upsert failed:', error.message);
    console.error('[SEED] Hint: did you apply 20260420100000_affiliate_program_reconciliation.sql first? '
      + 'The UNIQUE index uq_affiliates_company_code is required.');
    process.exit(1);
  }

  console.log(`[SEED] ✓ ${data?.length || 0} affiliates upserted.`);
  console.table((data || []).map(r => ({ code: r.referral_code, name: r.name, tier: r.tier })));

  // ── Resolve parent_code → parent_affiliate_id ────────────────────────
  // Lets future sub-affiliate seeds set `parent_code: 'AFF-STOX'` and have
  // the UUID linked automatically.
  const codeToUuid = Object.fromEntries((data || []).map(r => [r.referral_code, r.id]));
  const parentUpdates = pool
    .filter(s => s.parent_code && codeToUuid[s.parent_code] && codeToUuid[s.code])
    .map(s => ({ id: codeToUuid[s.code], parent_affiliate_id: codeToUuid[s.parent_code] }));

  if (parentUpdates.length) {
    for (const u of parentUpdates) {
      await supabase.from('affiliates')
        .update({ parent_affiliate_id: u.parent_affiliate_id })
        .eq('id', u.id);
    }
    console.log(`[SEED] ✓ Linked ${parentUpdates.length} sub-affiliate parent_affiliate_id FKs.`);
  }

  // ── BRDG wallet allocation ──────────────────────────────────────────
  // Convention: wallet id = `affiliate_{uuid}` (matches autonomous-pipeline.js).
  // Idempotent via the agent_transactions log — we check for a prior
  // `affiliate_genesis` tx to the same wallet before crediting.
  let fundedCount = 0;
  let bootstrapBrdg = 0;
  let skippedCount = 0;
  const byCategory = {};

  for (let i = 0; i < (data || []).length; i++) {
    const row = data[i];
    const seed = pool.find(p => p.code === row.referral_code);
    if (!seed) continue;
    const category = seed.category;
    const amount = BRDG_SEED[category] ?? 0;
    byCategory[category] = (byCategory[category] || 0) + 1;

    if (amount <= 0) {
      skippedCount++;
      continue;
    }

    const walletId = `affiliate_${row.id}`;

    // Idempotence: skip if genesis tx already exists for this wallet.
    const { data: existingTx } = await supabase
      .from('agent_transactions')
      .select('id')
      .eq('to_agent', walletId)
      .eq('type', 'affiliate_genesis')
      .limit(1)
      .maybeSingle();

    if (existingTx) {
      skippedCount++;
      continue;
    }

    try {
      await ledger.credit(
        walletId,
        amount,
        'affiliate_genesis',
        `Genesis wallet for ${row.name} (${row.referral_code})`,
      );
      fundedCount++;
      bootstrapBrdg += amount;
    } catch (e) {
      console.warn(`[SEED] BRDG credit failed for ${row.referral_code}: ${e.message}`);
    }
  }

  console.log('');
  console.log(`[SEED] ✓ BRDG wallets: funded=${fundedCount}  skipped=${skippedCount}  total_brdg=${bootstrapBrdg.toLocaleString()}`);
  console.log(`[SEED]   by category: ${JSON.stringify(byCategory)}`);

  // ── Auto-provision kiosks (unpublished) ─────────────────────────────
  // One kiosk per affiliate, is_published=false. The affiliate toggles
  // publish from the portal once they're ready.
  const kiosks = (data || []).map(row => ({
    affiliate_id:    row.id,
    company_id:      DEFAULT_COMPANY,
    slug:            row.referral_code.toLowerCase().replace(/^aff-/, ''),
    title:           `${row.name}'s Kiosk`,
    tagline:         null,
    theme:           'default',
    default_currency: 'ZAR',
    accepts_brdg:    true,
    accepts_zar:     true,
    is_published:    false,
    metadata:        { seed_tag: SEED_TAG, auto_provisioned: true },
  }));

  const { data: kioskData, error: kioskErr } = await supabase
    .from('affiliate_kiosks')
    .upsert(kiosks, { onConflict: 'affiliate_id', ignoreDuplicates: true })
    .select('id, slug, affiliate_id');

  if (kioskErr) {
    console.warn('[SEED] Kiosk provision failed:', kioskErr.message);
    console.warn('[SEED] Hint: did you apply 20260420110000_affiliate_kiosk_marketplace.sql?');
  } else {
    console.log(`[SEED] ✓ ${kioskData?.length || 0} kiosks auto-provisioned (all unpublished).`);
  }

  if (!SAFE) {
    const sensitive = rows.filter(r => r.meta.sensitive);
    if (sensitive.length) {
      console.warn('');
      console.warn('⚠️  Seeded %d SENSITIVE rows (visible on public /api/affiliate/leaderboard):', sensitive.length);
      sensitive.forEach(r => console.warn('    %s — %s', r.referral_code, r.name));
      console.warn('   Re-run with --safe to omit them, or delete with:');
      console.warn("   DELETE FROM affiliates WHERE company_id = '%s' AND meta->>'flag' IS NOT NULL;", DEFAULT_COMPANY);
    }
  }
}

main().catch(err => {
  console.error('[SEED] Fatal:', err);
  process.exit(1);
});
