'use strict';

/**
 * wordpress.js — WordPress REST API client for Bridge AI OS
 *
 * Pushes canonical content (50-apps, digital twin pages) to WordPress sites
 * hosted on DirectAdmin. Supports multi-domain sync across:
 *   - bridge-ai-os.com
 *   - gateway.ai-os.co.za
 *
 * Authentication: WordPress Application Passwords
 *   Set per-site env vars:
 *     WP_BRIDGE_AI_OS_URL        = https://bridge-ai-os.com
 *     WP_BRIDGE_AI_OS_USER       = admin
 *     WP_BRIDGE_AI_OS_APP_PASS   = xxxx xxxx xxxx xxxx xxxx xxxx
 *
 *     WP_GATEWAY_URL             = https://gateway.ai-os.co.za
 *     WP_GATEWAY_USER            = admin
 *     WP_GATEWAY_APP_PASS        = xxxx xxxx xxxx xxxx xxxx xxxx
 *
 * Generate app password: WP Admin → Users → Profile → Application Passwords
 *
 * Human-in-the-loop: sync writes are queued via /api/wordpress/sync
 * Read operations (list pages, get status) are autonomous.
 */

const path = require('path');
const fs   = require('fs');

const APPS_DATA_PATH = path.join(__dirname, '../data/50-applications.json');

// ── Site registry ─────────────────────────────────────────────────────────────
// Each site entry has: url, user, appPass derived from env
const SITES = {
  // WordPress.com hosted site — primary content layer
  'wordpress-com': {
    url:     () => process.env.WP_COM_URL      || 'https://public-api.wordpress.com/wp/v2/sites/bridgeaios.wordpress.com',
    user:    () => process.env.WP_COM_USER     || process.env.WP_USERNAME || '',
    appPass: () => process.env.WP_COM_APP_PASS || process.env.WP_APP_PASSWORD || '',
    slug:    '50-applications',
    apiBase: 'wpcom', // uses WordPress.com API base, not /wp-json/wp/v2
  },
  // Cloudflare Worker — WP REST API compatible (D1-backed, no PHP needed)
  'bridge-ai-os': {
    url:     () => process.env.WP_BRIDGE_AI_OS_URL     || 'https://bridge-wp-api.thebridgeaiagency.workers.dev',
    user:    () => process.env.WP_BRIDGE_AI_OS_USER    || 'bridge-brain',
    appPass: () => process.env.WP_BRIDGE_AI_OS_APP_PASS || 'bRiD Gx4i 0sAi 9kLm 2wQp 7nZv',
    slug:    '50-applications',
  },
  'gateway': {
    url:     () => process.env.WP_GATEWAY_URL           || 'https://bridge-wp-api.thebridgeaiagency.workers.dev',
    user:    () => process.env.WP_GATEWAY_USER          || 'bridge-brain',
    appPass: () => process.env.WP_GATEWAY_APP_PASS      || 'bRiD Gx4i 0sAi 9kLm 2wQp 7nZv',
    slug:    '50-applications',
  },
};

// ── Auth ──────────────────────────────────────────────────────────────────────

function basicAuth(user, appPass) {
  return 'Basic ' + Buffer.from(`${user}:${appPass}`).toString('base64');
}

function isConfigured(siteKey) {
  const s = SITES[siteKey];
  if (!s) return false;
  return !!(s.user() && s.appPass());
}

function getConfiguredSites() {
  return Object.keys(SITES).filter(isConfigured);
}

// ── REST client ───────────────────────────────────────────────────────────────

async function wpFetch(siteKey, endpoint, method = 'GET', body = null) {
  const s = SITES[siteKey];
  if (!s) throw new Error(`Unknown site: ${siteKey}`);
  const user    = s.user();
  const appPass = s.appPass();
  if (!user || !appPass) throw new Error(`${siteKey}: WP credentials not configured`);

  // WordPress.com uses a different API base than self-hosted
  const base = s.apiBase === 'wpcom'
    ? s.url().replace(/\/$/, '')                        // already full base
    : `${s.url().replace(/\/$/, '')}/wp-json/wp/v2`;   // self-hosted
  const url  = `${base}${endpoint}`;
  const opts = {
    method,
    headers: {
      'Authorization': basicAuth(user, appPass),
      'Content-Type':  'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const text = await res.text();

  if (!res.ok) throw new Error(`WP ${siteKey} ${method} ${endpoint} → ${res.status}: ${text.slice(0, 300)}`);

  try { return JSON.parse(text); }
  catch { return text; }
}

// ── Find or create page by slug ───────────────────────────────────────────────

async function findPageBySlug(siteKey, slug) {
  // WordPress.com forbids status=any — fall back to published only
  const s = SITES[siteKey];
  const query = s?.apiBase === 'wpcom'
    ? `/pages?slug=${slug}&per_page=1`
    : `/pages?slug=${slug}&status=any&per_page=1`;
  const pages = await wpFetch(siteKey, query);
  return Array.isArray(pages) && pages.length ? pages[0] : null;
}

// ── HTML renderer — converts 50-apps JSON to WP-compatible HTML ───────────────

function renderAppsHtml(data) {
  const { meta, categories, topDeployments, winFactors } = data;

  const catBlocks = categories.map(cat => {
    const rows = cat.apps.map(app => `
      <tr>
        <td><strong>#${app.id}</strong></td>
        <td>${app.title}</td>
        <td><strong>${app.market}</strong></td>
        <td>${app.tech.join(' · ')}</td>
      </tr>`).join('');

    return `
<h3>${cat.label} (${cat.range})</h3>
<table>
  <thead><tr><th>#</th><th>Application</th><th>Market Value</th><th>Tech Stack</th></tr></thead>
  <tbody>${rows}</tbody>
</table>`;
  }).join('\n');

  const topRows = topDeployments.map(d => `
    <tr><td><strong>${d.rank}</strong></td><td>${d.title}</td><td>${d.market}</td></tr>`).join('');

  return `<!-- Bridge AI OS — 50 Applications — Auto-synced ${new Date().toISOString()} -->
<div class="bridge-50-apps">

<h2>${meta.subtitle}</h2>
<p>${meta.description}</p>

${catBlocks}

<h2>Top 5 Deployments</h2>
<table>
  <thead><tr><th>Rank</th><th>Deployment</th><th>Market</th></tr></thead>
  <tbody>${topRows}</tbody>
</table>

<h2>Total Addressable Opportunity</h2>
<p><strong>${meta.totalAddressableMarket}</strong> — AI orchestration touches infrastructure, healthcare, finance, manufacturing, and consumer AI.</p>

<h2>Why Bridge AI OS Wins</h2>
<p>Architecture combines: ${winFactors.join(' · ')}. Most AI systems do one of these. Bridge AI OS does all simultaneously.</p>

<p><em>Sources: ${meta.sources.join(', ')} | Canonical: <a href="${meta.canonical}">${meta.canonical}</a></em></p>

</div>`;
}

// ── Sync a single site ────────────────────────────────────────────────────────

async function syncSite(siteKey) {
  if (!isConfigured(siteKey)) {
    return { ok: false, site: siteKey, error: 'Credentials not configured' };
  }

  const s    = SITES[siteKey];
  const data = JSON.parse(fs.readFileSync(APPS_DATA_PATH, 'utf8'));
  const html = renderAppsHtml(data);

  const pagePayload = {
    title:   data.meta.title,
    content: html,
    slug:    s.slug,
    status:  'publish',
  };

  const existing = await findPageBySlug(siteKey, s.slug);

  let result;
  if (existing) {
    result = await wpFetch(siteKey, `/pages/${existing.id}`, 'POST', pagePayload);
    return { ok: true, site: siteKey, action: 'updated', pageId: result.id, link: result.link };
  } else {
    result = await wpFetch(siteKey, '/pages', 'POST', pagePayload);
    return { ok: true, site: siteKey, action: 'created', pageId: result.id, link: result.link };
  }
}

// ── Sync all configured sites ─────────────────────────────────────────────────

async function syncAll() {
  const configured = getConfiguredSites();
  if (!configured.length) {
    return { ok: false, error: 'No WP sites configured — set WP_*_URL/USER/APP_PASS env vars' };
  }

  const results = await Promise.allSettled(configured.map(syncSite));
  const out = results.map((r, i) =>
    r.status === 'fulfilled' ? r.value : { ok: false, site: configured[i], error: r.reason?.message }
  );

  return { ok: out.every(r => r.ok), sites: out, ts: new Date().toISOString() };
}

// ── Status check (read-only) ──────────────────────────────────────────────────

async function getStatus() {
  const configured = getConfiguredSites();
  const checks = await Promise.allSettled(
    configured.map(async siteKey => {
      const s    = SITES[siteKey];
      const page = await findPageBySlug(siteKey, s.slug);
      return {
        site:      siteKey,
        url:       s.url(),
        configured: true,
        pageExists: !!page,
        pageLink:   page?.link || null,
        modified:   page?.modified || null,
      };
    })
  );

  return {
    configured: getConfiguredSites(),
    unconfigured: Object.keys(SITES).filter(k => !isConfigured(k)),
    sites: checks.map((r, i) =>
      r.status === 'fulfilled'
        ? r.value
        : { site: configured[i], configured: true, error: r.reason?.message }
    ),
  };
}

// ── Post management ───────────────────────────────────────────────────────────

/**
 * Create or update a WordPress post.
 * @param {string} siteKey
 * @param {object} opts  { title, content, status?, slug?, categories?, tags? }
 */
async function createPost(siteKey, opts) {
  const { title, content, status = 'publish', slug, categories, tags } = opts;
  if (!title || !content) throw new Error('title and content required');
  const payload = { title, content, status };
  if (slug)       payload.slug       = slug;
  if (categories) payload.categories = categories;
  if (tags)       payload.tags       = tags;
  const result = await wpFetch(siteKey, '/posts', 'POST', payload);
  return { ok: true, site: siteKey, postId: result.id, link: result.link, status: result.status };
}

/**
 * Update an existing post by ID.
 */
async function updatePost(siteKey, postId, opts) {
  const result = await wpFetch(siteKey, `/posts/${postId}`, 'POST', opts);
  return { ok: true, site: siteKey, postId: result.id, link: result.link };
}

/**
 * List recent posts.
 */
async function listPosts(siteKey, perPage = 10) {
  if (!isConfigured(siteKey)) return { ok: false, error: 'Not configured' };
  const posts = await wpFetch(siteKey, `/posts?per_page=${perPage}&context=edit`);
  return {
    ok: true, site: siteKey, count: posts.length,
    posts: posts.map(p => ({ id: p.id, title: p.title?.rendered, link: p.link, status: p.status, date: p.date })),
  };
}

/**
 * Push the 50-applications data as a post (not a page) to WordPress.com.
 * Useful for WordPress.com where page creation may require higher plan.
 */
async function syncAsPost(siteKey) {
  if (!isConfigured(siteKey)) return { ok: false, site: siteKey, error: 'Not configured' };
  const data = JSON.parse(fs.readFileSync(APPS_DATA_PATH, 'utf8'));
  const html = renderAppsHtml(data);
  return createPost(siteKey, {
    title:   data.meta.title,
    content: html,
    slug:    '50-applications',
    status:  'publish',
  });
}

// ── WordPress user management ─────────────────────────────────────────────────

/**
 * Create a WordPress user account.
 * Requires the WP app password to have "create_users" scope (Administrator role).
 *
 * @param {string} siteKey  - 'bridge-ai-os' | 'gateway'
 * @param {object} profile  - { username, email, password, firstName?, lastName?, role? }
 * role defaults to 'subscriber'. Other options: editor, author, contributor, administrator
 */
async function createWpUser(siteKey, profile) {
  const { username, email, password, firstName = '', lastName = '', role = 'subscriber' } = profile;
  if (!username || !email || !password) throw new Error('username, email, password required');

  const payload = {
    username,
    email,
    password,
    first_name: firstName,
    last_name:  lastName,
    roles:      [role],
  };

  const result = await wpFetch(siteKey, '/users', 'POST', payload);
  return {
    ok:       true,
    site:     siteKey,
    userId:   result.id,
    username: result.username,
    email:    result.email,
    role,
    link:     result.link,
  };
}

/**
 * List existing WordPress users.
 * @param {string} siteKey
 * @param {number} perPage  - max 100
 */
async function listWpUsers(siteKey, perPage = 50) {
  if (!isConfigured(siteKey)) return { ok: false, error: 'Not configured' };
  const users = await wpFetch(siteKey, `/users?per_page=${perPage}&context=edit`);
  return {
    ok:    true,
    site:  siteKey,
    count: users.length,
    users: users.map(u => ({ id: u.id, username: u.username, email: u.email, roles: u.roles })),
  };
}

/**
 * Batch-create WordPress profiles linked to Bridge AI OS email accounts.
 *
 * Provide an array of profile objects. Each profile needs:
 *   { username, email, password, role? }
 *
 * Typical Bridge AI OS profiles:
 *   - admin@bridge-ai-os.com  → administrator
 *   - content@bridge-ai-os.com → editor
 *   - support@bridge-ai-os.com → author
 *
 * @param {string}   siteKey  - 'bridge-ai-os' | 'gateway'
 * @param {object[]} profiles
 */
async function createBridgeWpProfiles(siteKey, profiles) {
  if (!isConfigured(siteKey)) {
    return { ok: false, site: siteKey, error: 'WP credentials not configured' };
  }

  const results = [];
  for (const profile of profiles) {
    try {
      const r = await createWpUser(siteKey, profile);
      results.push(r);
    } catch (e) {
      // Extract WP error message from JSON body if present
      let msg = e.message;
      try {
        const match = msg.match(/\d+: (.+)/);
        if (match) msg = match[1];
      } catch (_) {}
      results.push({ ok: false, site: siteKey, username: profile.username, email: profile.email, error: msg });
    }
  }

  return {
    ok:      results.every(r => r.ok),
    site:    siteKey,
    created: results.filter(r => r.ok).map(r => ({ username: r.username, email: r.email, role: r.role })),
    failed:  results.filter(r => !r.ok).map(r => ({ username: r.username, error: r.error })),
    results,
  };
}

// ── Export ────────────────────────────────────────────────────────────────────

module.exports = {
  syncAll, syncSite, syncAsPost,
  createPost, updatePost, listPosts,
  getStatus, getConfiguredSites, isConfigured,
  renderAppsHtml,
  createWpUser, listWpUsers, createBridgeWpProfiles,
  SITES,
};
