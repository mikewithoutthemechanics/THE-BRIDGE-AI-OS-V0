/**
 * Bridge WP API Worker
 * A WordPress REST API-compatible endpoint backed by Cloudflare D1.
 * Serves both bridge-ai-os.com and gateway.ai-os.co.za
 *
 * Compatible with lib/wordpress.js — responds to:
 *   GET  /wp-json/                          → discovery
 *   GET  /wp-json/wp/v2/users/me            → current user
 *   GET  /wp-json/wp/v2/pages               → list pages
 *   POST /wp-json/wp/v2/pages               → create/update page
 *   GET  /wp-json/wp/v2/pages?slug=X        → get page by slug
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function authError() {
  return new Response(JSON.stringify({ code: 'rest_forbidden', message: 'Invalid credentials', data: { status: 401 } }), {
    status: 401,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'WWW-Authenticate': 'Basic realm="WP API"' },
  });
}

async function verifyBasicAuth(request, db) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Basic ')) return false;
  const decoded = atob(auth.slice(6));
  const [login, pass] = decoded.split(':');
  if (!login || !pass) return false;

  const result = await db.prepare(
    `SELECT u.id FROM users u
     JOIN app_passwords ap ON ap.user_id = u.id
     WHERE u.login = ? AND ap.password_plain = ?`
  ).bind(login, pass).first();
  return !!result;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const db = env.DB;

    // ── Discovery ────────────────────────────────────────────────────────────
    if (path === '/wp-json/' || path === '/wp-json') {
      return json({
        name: 'Bridge AI OS',
        description: 'Bridge AI OS WordPress API',
        url: `https://${url.hostname}`,
        namespaces: ['wp/v2'],
        authentication: { 'application-passwords': { endpoints: { authorization: '/wp-admin/authorize-application.php' } } },
      });
    }

    // ── Current user ─────────────────────────────────────────────────────────
    if (path === '/wp-json/wp/v2/users/me') {
      if (!await verifyBasicAuth(request, db)) return authError();
      const user = await db.prepare('SELECT * FROM users WHERE login = ?').bind('bridge-brain').first();
      return json({
        id: user.id,
        username: user.login,
        name: user.display_name,
        email: user.email,
        roles: [user.role],
        capabilities: { administrator: true },
      });
    }

    // ── Pages ────────────────────────────────────────────────────────────────
    if (path === '/wp-json/wp/v2/pages') {
      if (request.method === 'GET') {
        const slug = url.searchParams.get('slug');
        if (slug) {
          const page = await db.prepare('SELECT * FROM pages WHERE slug = ?').bind(slug).first();
          if (!page) return json([], 200);
          return json([formatPage(page, url.hostname)]);
        }
        const { results } = await db.prepare('SELECT * FROM pages WHERE status = ? ORDER BY id DESC').bind('publish').all();
        return json(results.map(p => formatPage(p, url.hostname)));
      }

      if (request.method === 'POST') {
        if (!await verifyBasicAuth(request, db)) return authError();
        const body = await request.json();
        const slug = body.slug || slugify(body.title?.rendered || body.title || '');
        const title = body.title?.rendered || body.title || '';
        const content = body.content?.rendered || body.content || '';
        const status = body.status || 'publish';

        // Upsert by slug
        const existing = await db.prepare('SELECT id FROM pages WHERE slug = ?').bind(slug).first();
        if (existing) {
          await db.prepare(
            `UPDATE pages SET title = ?, content = ?, status = ?, updated_at = datetime('now') WHERE slug = ?`
          ).bind(title, content, status, slug).run();
          const updated = await db.prepare('SELECT * FROM pages WHERE slug = ?').bind(slug).first();
          return json(formatPage(updated, url.hostname), 200);
        } else {
          await db.prepare(
            'INSERT INTO pages (slug, title, content, status) VALUES (?, ?, ?, ?)'
          ).bind(slug, title, content, status).run();
          const created = await db.prepare('SELECT * FROM pages WHERE slug = ?').bind(slug).first();
          return json(formatPage(created, url.hostname), 201);
        }
      }
    }

    // ── Single page by ID ────────────────────────────────────────────────────
    const pageMatch = path.match(/^\/wp-json\/wp\/v2\/pages\/(\d+)$/);
    if (pageMatch) {
      const id = parseInt(pageMatch[1]);
      if (request.method === 'GET') {
        const page = await db.prepare('SELECT * FROM pages WHERE id = ?').bind(id).first();
        if (!page) return json({ code: 'rest_post_invalid_id', message: 'Invalid page ID', data: { status: 404 } }, 404);
        return json(formatPage(page, url.hostname));
      }
      if (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH') {
        if (!await verifyBasicAuth(request, db)) return authError();
        const body = await request.json();
        const title = body.title?.rendered || body.title;
        const content = body.content?.rendered || body.content;
        const status = body.status;
        if (title) await db.prepare(`UPDATE pages SET title = ?, updated_at = datetime('now') WHERE id = ?`).bind(title, id).run();
        if (content) await db.prepare(`UPDATE pages SET content = ?, updated_at = datetime('now') WHERE id = ?`).bind(content, id).run();
        if (status) await db.prepare(`UPDATE pages SET status = ?, updated_at = datetime('now') WHERE id = ?`).bind(status, id).run();
        const updated = await db.prepare('SELECT * FROM pages WHERE id = ?').bind(id).first();
        return json(formatPage(updated, url.hostname));
      }
    }

    // ── Application passwords list ───────────────────────────────────────────
    if (path.match(/^\/wp-json\/wp\/v2\/users\/\d+\/application-passwords$/)) {
      if (!await verifyBasicAuth(request, db)) return authError();
      const { results } = await db.prepare('SELECT id, name, created_at FROM app_passwords WHERE user_id = 1').all();
      return json(results.map(ap => ({ uuid: ap.id, name: ap.name, created: ap.created_at })));
    }

    // ── 404 ──────────────────────────────────────────────────────────────────
    return json({ code: 'rest_no_route', message: 'No route was found matching the URL and request method.', data: { status: 404 } }, 404);
  }
};

function formatPage(page, hostname) {
  return {
    id: page.id,
    slug: page.slug,
    status: page.status,
    link: `https://${hostname}/${page.slug}/`,
    title: { rendered: page.title || '' },
    content: { rendered: page.content || '', protected: false },
    date: page.created_at,
    modified: page.updated_at,
    type: 'page',
  };
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
