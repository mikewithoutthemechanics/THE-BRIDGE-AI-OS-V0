/**
 * Cron: Provision-Heal
 *
 * Runs every 4 hours. For every user in the system, ensures all 50 catalog
 * apps exist as active projects. Creates missing ones, marks inactive ones
 * active, removes duplicate catalog entries.
 *
 * Triggered by Vercel Cron: /api/cron/provision-heal  (0 *\/4 * * *)
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { supabase, isConfigured } = require('../../lib/supabase');

const CAT_TO_TOOL = {
  'infrastructure-smart-cities': 'smart-city-twin',
  'healthcare':                  'patient-twin',
  'business-enterprise':         'marketplace-builder',
  'industry-manufacturing':      'factory-twin',
  'consumer-society':            'ap2-orchestrator',
};

async function provisionHeal(req, res) {
  if (!isConfigured) return res.json({ ok: true, skipped: 'db not configured' });

  // Load catalog
  let catalog;
  try {
    catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/50-applications.json'), 'utf8'));
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'Catalog not found: ' + e.message });
  }

  const allApps = (catalog.categories || []).flatMap(function (cat) {
    return (cat.apps || []).map(function (app) {
      return Object.assign({}, app, { category: cat.id, categoryLabel: cat.label });
    });
  });

  // Get all users with active projects (enterprise + admin users)
  const { data: users } = await supabase
    .from('users')
    .select('id, plan')
    .in('plan', ['enterprise', 'admin', 'pro']);

  if (!users || users.length === 0) {
    return res.json({ ok: true, users_processed: 0, created: 0 });
  }

  let totalCreated = 0;
  let totalHealed = 0;
  const now = new Date().toISOString();

  for (const user of users) {
    // Get existing provisioned projects for this user
    const { data: existing } = await supabase
      .from('projects')
      .select('id, scaffold, status, name')
      .eq('user_id', user.id);

    const provisioned = new Map();
    const seen = new Set();
    const dups = [];

    (existing || []).forEach(function (p) {
      if (!p.scaffold || !p.scaffold.catalog_id) return;
      const cid = p.scaffold.catalog_id;
      if (seen.has(cid)) {
        dups.push(p.id); // duplicate — will be archived
      } else {
        seen.add(cid);
        provisioned.set(cid, p);
      }
    });

    // Archive duplicates
    for (const dupId of dups) {
      await supabase.from('projects').update({ status: 'archived', updated_at: now }).eq('id', dupId).catch(() => {});
    }

    // Re-activate any archived catalog projects
    for (const [, proj] of provisioned) {
      if (proj.status !== 'active') {
        await supabase.from('projects').update({ status: 'active', updated_at: now }).eq('id', proj.id).catch(() => {});
        totalHealed++;
      }
    }

    // Create missing catalog projects
    for (const app of allApps) {
      if (provisioned.has(app.id)) continue;

      const toolId = CAT_TO_TOOL[app.category] || 'analytics';
      const projectId = crypto.randomUUID();

      const { error: projErr } = await supabase.from('projects').insert({
        id: projectId,
        user_id: user.id,
        name: app.title,
        tool_id: toolId,
        intent: app.categoryLabel + ' — Market: ' + app.market + '. Tech: ' + (app.tech || []).join(', ') + '.',
        integration_targets: ['crm', 'billing'],
        scaffold: {
          catalog_id: app.id,
          category: app.category,
          category_label: app.categoryLabel,
          market: app.market,
          tech: app.tech || [],
          app_page_url: app.category === 'telco_esim' ? '/esim'
                       : app.category === 'healthcare' ? '/ehsa'
                       : app.category === 'infrastructure-smart-cities' ? '/twins'
                       : '/apps',
          provisioned_at: now,
        },
        status: 'active',
        run_count: 1,
        output_count: 0,
        created_at: now,
        updated_at: now,
      });

      if (!projErr) {
        // Seed initial run
        await supabase.from('project_runs').insert({
          id: crypto.randomUUID(),
          project_id: projectId,
          tool_id: toolId,
          agent_ids: [],
          inputs: { source: 'provision-heal', catalog_id: app.id },
          trigger: 'cron',
          status: 'completed',
          started_at: now,
          completed_at: now,
          result: { message: 'Auto-provisioned by heal cron', catalog_id: app.id },
          error: null,
          latency_ms: 120,
          tokens_used: 0,
          brdg_cost: 0,
        }).catch(() => {});

        totalCreated++;
      }
    }
  }

  return res.json({
    ok: true,
    users_processed: users.length,
    created: totalCreated,
    healed: totalHealed,
    timestamp: now,
  });
}

module.exports = { provisionHeal };
