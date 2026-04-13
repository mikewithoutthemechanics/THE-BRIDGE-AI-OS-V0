/**
 * inject-meta.js — SEO meta tag injector
 *
 * Scans all HTML files in public/ and injects missing meta tags:
 *   - <meta name="description">
 *   - <link rel="canonical">
 *   - Open Graph tags
 *   - <meta name="robots">
 *
 * Run: node inject-meta.js
 * Also called from build-static.js automatically.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const BASE_URL   = 'https://go.ai-os.co.za';
const OG_IMAGE   = `${BASE_URL}/og-image.png`;
const PUBLIC_DIR = path.join(__dirname, 'public');

// Pages that should be excluded from indexing
const NO_INDEX = new Set([
  'admin.html', 'admin-command.html', 'admin-revenue.html', 'admin-sitemap.html',
  'admin-withdraw.html', 'view-logs.html', 'auth-callback.html', 'auth-dashboard.html',
  'admin-esim.html', 'activate.html', 'activation.html', 'offline.html',
  'payment-success.html', 'payment-cancel.html', '404.html',
]);

// Per-page descriptions for high-priority pages
const PAGE_META = {
  'home.html':             { desc: 'Bridge AI OS — 71 AI agents, CRM, invoicing, DeFi treasury and tokenised economy on Linea. Start free in 5 minutes.', canonical: '/home' },
  'pricing.html':          { desc: 'Bridge AI OS pricing — Starter R0/mo, Pro R499/mo, Enterprise R2,499/mo. Full AI agent workforce included on every plan.', canonical: '/pricing' },
  'checkout.html':         { desc: 'Subscribe to Bridge AI OS. Choose a plan and pay securely via PayFast.', canonical: '/checkout' },
  'marketplace.html':      { desc: 'AI task marketplace — post tasks, bid agents, dynamic pricing. 15% platform fee flows to treasury.', canonical: '/marketplace' },
  'tokenomics.html':       { desc: 'BRDG token — fixed 100M supply, 1% deflationary burn, deployed on Linea zkEVM L2. Full institutional tokenomics.', canonical: '/tokenomics' },
  'economy.html':          { desc: 'Bridge AI OS token economy — real-time BRDG distribution, reward pools, UBI, and DeFi treasury management.', canonical: '/economy' },
  'leads.html':            { desc: 'AI-powered leads pipeline — manage, score, and convert leads with intelligent automation and HITL approval gates.', canonical: '/leads' },
  'crm.html':              { desc: 'Bridge AI OS CRM — contacts, pipeline, campaigns, and AI-driven nurture sequences for closing deals faster.', canonical: '/crm' },
  'agents.html':           { desc: 'Deploy 71 specialised AI agents — sales, support, trading, legal, dev, and more. Each agent earns BRDG rewards.', canonical: '/agents' },
  'wallet.html':           { desc: 'Bridge AI OS wallet — manage BRDG tokens, ETH, and fiat balances. On-chain rewards, staking, and payouts.', canonical: '/wallet' },
  'defi.html':             { desc: 'Bridge AI OS DeFi — liquidity management, BRDG staking, yield strategies on Linea zkEVM L2.', canonical: '/defi' },
  'trading.html':          { desc: 'AI trading engine — autonomous market analysis and execution powered by Bridge AI OS on Linea.', canonical: '/trading' },
  'docs.html':             { desc: 'Bridge AI OS documentation — API reference, integration guides, agent SDK, and developer resources.', canonical: '/docs' },
  'join.html':             { desc: 'Join Bridge AI OS — create your account and start automating your business with 71 AI agents.', canonical: '/join' },
  'onboarding.html':       { desc: 'Get started with Bridge AI OS — quick setup wizard to configure your AI agents, CRM, and treasury.', canonical: '/onboarding' },
  'affiliate.html':        { desc: 'Bridge AI OS affiliate programme — earn 25 BRDG per referral. Grow the network, share the rewards.', canonical: '/affiliate' },
  'corporate.html':        { desc: 'Bridge AI OS for enterprise — custom AI agent deployment, dedicated infrastructure, and white-label options.', canonical: '/corporate' },
  'governance.html':       { desc: 'Bridge AI OS governance — BRDG token holders vote on protocol upgrades, treasury allocation, and platform policy.', canonical: '/governance' },
  'esim-pbx.html':         { desc: 'Bridge eSIM + PBX — global eSIM with virtual numbers in 50+ countries, AI-powered call management.', canonical: '/esim' },
  'ehsa-app.html':         { desc: 'EHSA Health — AI-driven health services automation on Bridge AI OS.', canonical: '/ehsa' },
  'hospital-home.html':    { desc: 'Hospital in a Box — full AI hospital management system on Bridge AI OS.', canonical: '/hospital' },
  'aurora-home.html':      { desc: 'Aurora Energy — AI-powered energy management and optimisation platform on Bridge AI OS.', canonical: '/aurora' },
  'ban-home.html':         { desc: 'BAN Task Engine — multi-objective AI task scoring and execution network.', canonical: '/ban' },
  'ubi-home.html':         { desc: 'Universal Basic Income via Bridge AI OS — BRDG-funded UBI distribution platform.', canonical: '/ubi' },
  'rootedearth-home.html': { desc: 'Rooted Earth — AI-powered agriculture and food systems on Bridge AI OS.', canonical: '/rootedearth' },
  'abaas.html':            { desc: 'Agent-as-a-Service — deploy specialised AI agents for sales, support, legal, and operations.', canonical: '/abaas' },
  'invoicing.html':        { desc: 'AI invoicing — generate, send, and track invoices automatically. Integrated with treasury and PayFast payments.', canonical: '/invoicing' },
  'legal.html':            { desc: 'Bridge AI OS legal documentation — terms of service, privacy policy, and token disclaimer.', canonical: '/legal' },
  'welcome.html':          { desc: 'Your Bridge AI OS dashboard — manage agents, view treasury, and access CRM, invoicing, and DeFi tools.', canonical: '/welcome' },
  'pricing.html':          { desc: 'Bridge AI OS pricing — Starter R0/mo, Pro R499/mo, Enterprise R2,499/mo. Full AI agent workforce on every plan.', canonical: '/pricing' },
};

function titleToDesc(title) {
  // Strip "— Bridge AI OS" suffix for cleaner descriptions
  const clean = title.replace(/\s*[—–-]\s*(Bridge AI OS.*)?$/i, '').trim();
  return `${clean} — Bridge AI OS. AI-powered business automation platform on Linea zkEVM.`;
}

function slugFromFile(filename) {
  return '/' + filename.replace('.html', '');
}

function processFile(filePath) {
  const filename = path.basename(filePath);

  // Skip files that don't need processing
  if (filename === 'index.html') return; // already has good meta
  if (!filePath.endsWith('.html')) return;

  let html = fs.readFileSync(filePath, 'utf-8');

  // Skip if already has description AND canonical
  const hasDesc      = html.includes('name="description"');
  const hasCanonical = html.includes('rel="canonical"');
  const hasOG        = html.includes('property="og:title"');

  if (hasDesc && hasCanonical && hasOG) return; // fully tagged

  // Extract title for fallback description
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title      = titleMatch ? titleMatch[1].trim() : filename.replace('.html', '');

  const pageMeta   = PAGE_META[filename] || {};
  const desc       = pageMeta.desc || titleToDesc(title);
  const canonical  = pageMeta.canonical ? `${BASE_URL}${pageMeta.canonical}` : `${BASE_URL}${slugFromFile(filename)}`;
  const noIndex    = NO_INDEX.has(filename);
  const robots     = noIndex ? 'noindex, nofollow' : 'index, follow';

  // Build injection block
  const inject = [];

  if (!hasDesc) {
    inject.push(`<meta name="description" content="${desc.replace(/"/g, '&quot;')}">`);
    inject.push(`<meta name="robots" content="${robots}">`);
  }

  if (!hasCanonical && !noIndex) {
    inject.push(`<link rel="canonical" href="${canonical}">`);
  }

  if (!hasOG && !noIndex) {
    inject.push(`<meta property="og:type" content="website">`);
    inject.push(`<meta property="og:url" content="${canonical}">`);
    inject.push(`<meta property="og:title" content="${title.replace(/"/g, '&quot;')}">`);
    inject.push(`<meta property="og:description" content="${desc.replace(/"/g, '&quot;')}">`);
    inject.push(`<meta property="og:image" content="${OG_IMAGE}">`);
    inject.push(`<meta property="og:site_name" content="Bridge AI OS">`);
    inject.push(`<meta name="twitter:card" content="summary_large_image">`);
    inject.push(`<meta name="twitter:title" content="${title.replace(/"/g, '&quot;')}">`);
    inject.push(`<meta name="twitter:description" content="${desc.replace(/"/g, '&quot;')}">`);
    inject.push(`<meta name="twitter:image" content="${OG_IMAGE}">`);
  }

  if (inject.length === 0) return;

  // Inject after <head> or after <meta charset> or after first <meta>
  const insertAfter = html.match(/<meta charset[^>]*>/i)
    || html.match(/<meta name="viewport"[^>]*>/i)
    || html.match(/<head[^>]*>/i);

  if (!insertAfter) {
    console.warn(`[inject-meta] No insertion point found in ${filename}`);
    return;
  }

  const insertionTag = insertAfter[0];
  const insertPos    = html.indexOf(insertionTag) + insertionTag.length;

  const newHtml = html.slice(0, insertPos) + '\n' + inject.join('\n') + '\n' + html.slice(insertPos);

  fs.writeFileSync(filePath, newHtml, 'utf-8');
  console.log(`[inject-meta] Tagged: ${filename} (+${inject.length} tags)`);
}

function run() {
  const files = fs.readdirSync(PUBLIC_DIR)
    .filter(f => f.endsWith('.html'))
    .map(f => path.join(PUBLIC_DIR, f));

  let count = 0;
  for (const f of files) {
    try {
      const before = fs.statSync(f).mtimeMs;
      processFile(f);
      if (fs.statSync(f).mtimeMs !== before) count++;
    } catch (e) {
      console.warn(`[inject-meta] Error on ${path.basename(f)}:`, e.message);
    }
  }
  console.log(`[inject-meta] Done — ${count} files updated, ${files.length - count} already complete.`);
}

run();
