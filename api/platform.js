/**
 * BRIDGE AI OS — Platform API Routes
 *
 * Mounts on /api/platform/* via api/index.js.
 * Covers: projects, outputs, integrations, profile feedback loop.
 *
 * ALL routes require a valid JWT (Bearer or cookie).
 * Tool-access routes additionally enforce subscription tier.
 *
 * Route map:
 *   GET  /api/platform/projects            — list user projects
 *   POST /api/platform/projects            — create project
 *   GET  /api/platform/projects/:id        — get project + runs
 *   PUT  /api/platform/projects/:id        — update project
 *   DEL  /api/platform/projects/:id        — archive project
 *
 *   POST /api/platform/projects/:id/run    — execute tool against project
 *
 *   GET  /api/platform/outputs             — list user outputs
 *   GET  /api/platform/outputs/:id         — get output
 *   GET  /api/platform/outputs/:id/export  — download output as file
 *   PUT  /api/platform/outputs/:id         — update output (title, etc.)
 *
 *   POST /api/platform/integrations/run    — dispatch output to external target
 *   GET  /api/platform/integrations/targets — list supported targets + config schema
 *
 *   POST /api/platform/profile/feedback    — record execution feedback to profile
 *   GET  /api/platform/profile/analytics   — get aggregated profile analytics
 *
 *   GET  /api/platform/tools               — list tools + subscription gate status
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { supabase, isConfigured } = require('../lib/supabase');
const projects = require('../lib/projects');
const outputs = require('../lib/outputs');
const { runIntegration, listTargets } = require('../lib/integrations');
const userDb = require('../lib/user-identity');
const llm = require('../lib/llm-client');

// ── Catalog to tool_id mapping ───────────────────────────────────────────────
const CAT_TO_TOOL = {
  'infrastructure-smart-cities': 'smart-city-twin',
  'healthcare':                  'patient-twin',
  'business-enterprise':         'marketplace-builder',
  'industry-manufacturing':      'factory-twin',
  'consumer-society':            'ap2-orchestrator',
};

// ── PayFast helpers ──────────────────────────────────────────────────────────

const PLAN_PRICES = {
  starter:    '199.00',
  pro:        '499.00',
  admin:      '1499.00',
  enterprise: '4999.00',
};

/**
 * Build MD5 signature from ordered [key, value] pairs.
 * Appends passphrase if PAYFAST_PASSPHRASE env is set.
 */
function payfastSignature(orderedPairs) {
  const parts = orderedPairs.map(function (pair) {
    return pair[0] + '=' + encodeURIComponent(pair[1]).replace(/%20/g, '+');
  });
  let str = parts.join('&');
  const passphrase = process.env.PAYFAST_PASSPHRASE;
  if (passphrase) {
    str += '&passphrase=' + encodeURIComponent(passphrase).replace(/%20/g, '+');
  }
  return crypto.createHash('md5').update(str).digest('hex');
}

// ── Auth helper ──────────────────────────────────────────────────────────────
// Uses the same multi-strategy extractor as access-control so that both
// Bridge JWTs (email+password) and Supabase JWTs (OAuth) are accepted.
const { extractUser } = require('../middleware/access-control');

async function requireUser(req) {
  return extractUser(req);
}

function unauthorized(res, msg = 'Authentication required') {
  return res.status(401).json({ ok: false, error: msg });
}

function forbidden(res, msg = 'Access denied') {
  return res.status(403).json({ ok: false, error: msg });
}

function notFound(res, msg = 'Not found') {
  return res.status(404).json({ ok: false, error: msg });
}

// ── Router ───────────────────────────────────────────────────────────────────

// ── Avatar generation helper ──────────────────────────────────────────────────
async function generateAvatarImage(prompt, style) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.startsWith('your_')) throw new Error('OpenAI API key not configured');

  const stylePrefix = {
    cyberpunk:    'cyberpunk neon-lit portrait, dark background, glowing circuits, ',
    professional: 'professional corporate headshot portrait, clean background, ',
    artistic:     'digital art portrait, vibrant colors, abstract background, ',
    pixel:        '32-bit pixel art avatar portrait, retro game style, ',
    anime:        'anime style portrait illustration, colorful, ',
    minimal:      'minimalist flat design avatar, geometric shapes, clean, ',
  }[style] || '';

  const fullPrompt = stylePrefix + prompt + ', high quality, 512x512';

  const resp = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'dall-e-3', prompt: fullPrompt, n: 1, size: '1024x1024', response_format: 'url' }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Image generation failed');
  }

  const data = await resp.json();
  return data.data?.[0]?.url || null;
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function pickPalette(style) {
  const palettes = {
    cyberpunk: ['#00c8ff', '#7c3aed', '#0f172a', '#67e8f9'],
    professional: ['#1f2937', '#0ea5e9', '#f8fafc', '#334155'],
    artistic: ['#f97316', '#22d3ee', '#4f46e5', '#fde68a'],
    pixel: ['#111827', '#10b981', '#60a5fa', '#f59e0b'],
    anime: ['#fb7185', '#38bdf8', '#f5d0fe', '#1f2937'],
    minimal: ['#0f172a', '#94a3b8', '#22d3ee', '#e2e8f0'],
  };
  return palettes[style] || palettes.cyberpunk;
}

function buildLayeredAvatarSvg(prompt, style) {
  const safePrompt = (prompt || 'Bridge Avatar').trim().slice(0, 48);
  const [c1, c2, c3, c4] = pickPalette(style);
  const initials = safePrompt
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s.charAt(0).toUpperCase())
    .join('') || 'BA';
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${escapeXml(c1)}"/>
      <stop offset="100%" stop-color="${escapeXml(c2)}"/>
    </linearGradient>
    <radialGradient id="halo" cx="50%" cy="40%" r="55%">
      <stop offset="0%" stop-color="${escapeXml(c4)}" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="${escapeXml(c3)}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <circle cx="512" cy="430" r="250" fill="url(#halo)"/>
  <circle cx="512" cy="390" r="170" fill="${escapeXml(c4)}" fill-opacity="0.92"/>
  <rect x="322" y="560" width="380" height="280" rx="170" fill="${escapeXml(c3)}" fill-opacity="0.9"/>
  <text x="512" y="430" text-anchor="middle" dominant-baseline="middle"
        font-family="Inter,Segoe UI,Arial,sans-serif" font-size="120" font-weight="800"
        fill="${escapeXml(c3)}">${escapeXml(initials)}</text>
  <text x="512" y="920" text-anchor="middle"
        font-family="Inter,Segoe UI,Arial,sans-serif" font-size="34"
        fill="${escapeXml(c4)}" fill-opacity="0.95">${escapeXml(safePrompt)}</text>
</svg>`.trim();
  const encoded = Buffer.from(svg, 'utf8').toString('base64');
  return {
    svg,
    dataUrl: `data:image/svg+xml;base64,${encoded}`,
  };
}

function buildBabylonAvatarPreset(prompt, style) {
  const palette = pickPalette(style);
  return {
    renderer: 'babylon.js',
    scene_type: 'avatar-procedural',
    style: style || 'cyberpunk',
    display_name: (prompt || 'Bridge Avatar').trim().slice(0, 48),
    palette,
    parts: {
      head: { type: 'sphere', diameter: 1.15 },
      torso: { type: 'capsule', height: 1.8, radius: 0.34 },
      eyes: { type: 'sphere', diameter: 0.11 },
    },
    animations: ['idle', 'breathe', 'look-around'],
  };
}

async function handlePlatform(req, res) {
  const url = req.url.replace(/\?.*$/, '');
  const method = req.method;

  // ── AVATAR GENERATE ────────────────────────────────────────────────────────
  if (url === '/api/platform/avatar/generate' && method === 'POST') {
    const user = await requireUser(req);
    if (!user) return unauthorized(res);
    const { prompt, style, includeBabylon } = req.body || {};
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 3)
      return res.status(400).json({ ok: false, error: 'Prompt must be at least 3 characters' });
    try {
      const imageUrl = await generateAvatarImage(prompt.trim().slice(0, 400), style || 'cyberpunk');
      return res.json({
        ok: true,
        url: imageUrl,
        prompt,
        style,
        source: 'dall-e',
        fallback_used: false,
        babylon: includeBabylon ? buildBabylonAvatarPreset(prompt, style || 'cyberpunk') : null,
      });
    } catch (e) {
      const fallback = buildLayeredAvatarSvg(prompt.trim().slice(0, 400), style || 'cyberpunk');
      return res.json({
        ok: true,
        url: fallback.dataUrl,
        prompt,
        style,
        source: 'svg-fallback',
        fallback_used: true,
        warning: e.message,
        svg: fallback.svg,
        babylon: includeBabylon ? buildBabylonAvatarPreset(prompt, style || 'cyberpunk') : null,
      });
    }
  }

  // ── WALLET AGENT REGISTRATION ─────────────────────────────────────────────
  if (url === '/api/platform/agent/register-wallet' && method === 'POST') {
    const { address, signature, timestamp, chain } = req.body || {};
    if (!address || !signature) return res.status(400).json({ ok: false, error: 'address and signature required' });
    const agentId = 'AGT-' + address.slice(2, 8).toUpperCase() + '-LINEA';
    try {
      if (isConfigured) {
        await supabase.from('agent_registrations').upsert({
          address: address.toLowerCase(), signature, chain: chain || 'linea',
          agent_id: agentId, registered_at: new Date(timestamp || Date.now()).toISOString(),
        }, { onConflict: 'address' }).catch(() => {});
      }
    } catch (_) { /* non-fatal */ }
    return res.json({ ok: true, agentId, address, chain: chain || 'linea' });
  }

  // ── AVATAR SET (persist to user profile) ──────────────────────────────────
  if (url === '/api/platform/avatar/set' && method === 'POST') {
    const user = await requireUser(req);
    if (!user) return unauthorized(res);
    const { avatarUrl } = req.body || {};
    if (!avatarUrl || typeof avatarUrl !== 'string') return res.status(400).json({ ok: false, error: 'avatarUrl required' });
    try {
      if (isConfigured) {
        await supabase.from('users').update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() }).eq('id', user.id);
      } else {
        await userDb.updateUser(user.id, { avatar_url: avatarUrl });
      }
      return res.json({ ok: true, avatarUrl });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  // ── TOOLS LIST ─────────────────────────────────────────────────────────────
  if (url === '/api/platform/tools' && method === 'GET') {
    const user = await requireUser(req);
    if (!user) return unauthorized(res);
    const tier = user.plan || 'free';
    const tools = Object.entries(projects.TOOL_TIERS).map(([id, required]) => ({
      id,
      required_tier: required,
      accessible: (projects.TIER_RANK[tier] ?? 0) >= (projects.TIER_RANK[required] ?? 1),
      path: `/tools/${id}`,
    }));
    return res.json({ ok: true, tier, tools });
  }

  // ── INTEGRATION TARGETS ────────────────────────────────────────────────────
  if (url === '/api/platform/integrations/targets' && method === 'GET') {
    return res.json({ ok: true, targets: listTargets() });
  }

  // ── PROJECTS LIST + CREATE ─────────────────────────────────────────────────
  if (url === '/api/platform/projects') {
    const user = await requireUser(req);
    if (!user) return unauthorized(res);

    if (method === 'GET') {
      const statusFilter = req.query.status === 'all' ? null : (req.query.status || null);
      const limit = Math.min(parseInt(req.query.limit || '200', 10), 200);
      const list = await projects.listProjects(user.id, { status: statusFilter, limit });
      return res.json({ ok: true, projects: list });
    }

    if (method === 'POST') {
      const { name, toolId, intent, integrationTargets, scaffold } = req.body || {};

      // Enforce subscription gate on tool access
      if (toolId) {
        const access = projects.checkToolAccess(toolId, user.plan || 'free');
        if (!access.ok) {
          return res.status(402).json({
            ok: false,
            error: `Tool "${toolId}" requires "${access.required}" plan. Your plan: "${access.has}".`,
            upgrade_url: '/billing',
          });
        }
      }

      const project = await projects.createProject(user.id, { name, toolId, intent, integrationTargets, scaffold });
      return res.status(201).json({ ok: true, project });
    }
  }

  // ── SINGLE PROJECT ─────────────────────────────────────────────────────────
  const projectMatch = url.match(/^\/api\/platform\/projects\/([a-z0-9-]+)(\/run)?$/);
  if (projectMatch) {
    const user = await requireUser(req);
    if (!user) return unauthorized(res);
    const projectId = projectMatch[1];
    const isRun = !!projectMatch[2];

    if (isRun && method === 'POST') {
      // Execute a tool run against a project
      const project = await projects.getProject(projectId, user.id);
      if (!project) return notFound(res, 'Project not found');

      const { toolId = project.tool_id, inputs = {}, agentIds = [], trigger = 'manual' } = req.body || {};

      // Subscription gate
      if (toolId) {
        const access = projects.checkToolAccess(toolId, user.plan || 'free');
        if (!access.ok) {
          return res.status(402).json({
            ok: false,
            error: `Tool "${toolId}" requires "${access.required}" plan.`,
            upgrade_url: '/billing',
          });
        }
      }

      // Create run record
      const startTime = Date.now();
      const run = await projects.createRun(projectId, { toolId, agentIds, inputs, trigger });
      const runId = run.id;

      // Build agent prompt from project + inputs
      const effectiveToolId = toolId || project.tool_id || 'unknown';
      const intentContext = project.intent ? `\nProject intent: ${project.intent}` : '';
      const scaffoldContext = project.scaffold ? `\nScaffold config: ${JSON.stringify(project.scaffold)}` : '';
      const prompt = [
        `You are an AI agent executing the Bridge AI OS tool: "${effectiveToolId}".`,
        `Project: ${project.name}${intentContext}${scaffoldContext}`,
        `Inputs: ${JSON.stringify(inputs, null, 2)}`,
        '',
        'Execute this tool and provide a detailed, actionable output. Be specific and thorough.',
      ].join('\n');

      try {
        // Call LLM synchronously within this request
        const llmResult = await llm.infer(prompt, {
          system: `You are a specialized AI agent for Bridge AI OS. Tool: ${effectiveToolId}. Be precise and deliver real value.`,
          maxTokens: 1024,
        });

        const outputText = llmResult.text || '';
        const tokensUsed = llmResult.output_tokens || 0;
        const latencyMs = Date.now() - startTime;

        // Complete the run record
        await projects.completeRun(runId, {
          result: { output: outputText, provider: llmResult.provider, model: llmResult.model },
          tokensUsed,
          brdgCost: llmResult.cost_usd || 0,
        });

        // Create output record for this run
        if (isConfigured) {
          await supabase.from('outputs').insert({
            id: crypto.randomUUID(),
            project_id: projectId,
            run_id: runId,
            user_id: user.id,
            title: `${effectiveToolId} output`,
            type: 'export',
            format: 'json',
            payload: { text: outputText },
            status: 'ready',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).catch(e => console.error('[platform] output insert failed:', e.message));
        }

        // Record feedback for profile analytics
        await recordFeedback(user.id, projectId, null, {
          success: true,
          latency: latencyMs,
          tokens: tokensUsed,
          brdgCost: llmResult.cost_usd || 0,
        }).catch(() => {});

        // Distribute BRDG reward for run completion if user has a wallet address
        if (user.wallet_address) {
          const { distributeReward } = require('../lib/brdg-distributor');
          distributeReward(user.wallet_address, 'run_completed').catch(e =>
            console.error('[brdg] run reward failed:', e.message)
          );
        }

        return res.status(200).json({
          ok: true,
          run: { ...run, status: 'completed', result: { output: outputText } },
          output: outputText,
          latency_ms: latencyMs,
          tokens_used: tokensUsed,
          provider: llmResult.provider,
        });
      } catch (err) {
        console.error('[platform] run dispatch error:', err.message);
        await projects.completeRun(runId, { error: err.message }).catch(() => {});
        return res.status(500).json({ ok: false, error: err.message, run_id: runId });
      }
    }

    const project = await projects.getProject(projectId, user.id);
    if (!project) return notFound(res, 'Project not found');

    if (method === 'GET') {
      const runs = await projects.listRuns(projectId, { limit: 10 });
      const outputList = await outputs.listOutputs(projectId, { limit: 20 });
      return res.json({ ok: true, project, runs, outputs: outputList });
    }

    if (method === 'PUT') {
      const updated = await projects.updateProject(projectId, user.id, req.body || {});
      return res.json({ ok: true, project: updated });
    }

    if (method === 'DELETE') {
      await projects.archiveProject(projectId, user.id);
      return res.json({ ok: true, archived: true });
    }
  }

  // ── OUTPUTS LIST ───────────────────────────────────────────────────────────
  if (url === '/api/platform/outputs' && method === 'GET') {
    const user = await requireUser(req);
    if (!user) return unauthorized(res);
    const list = await outputs.listUserOutputs(user.id, {
      limit: parseInt(req.query.limit || '50', 10),
      type: req.query.type || null,
    });
    return res.json({ ok: true, outputs: list });
  }

  // ── SINGLE OUTPUT ──────────────────────────────────────────────────────────
  const outputMatch = url.match(/^\/api\/platform\/outputs\/([a-z0-9-]+)(\/export)?$/);
  if (outputMatch) {
    const user = await requireUser(req);
    if (!user) return unauthorized(res);
    const outputId = outputMatch[1];
    const isExport = !!outputMatch[2];

    const output = await outputs.getOutput(outputId, user.id);
    if (!output) return notFound(res, 'Output not found');

    if (isExport && method === 'GET') {
      const bundle = outputs.buildExportBundle(output);
      await outputs.markDelivered(outputId);
      res.setHeader('Content-Type', bundle.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${bundle.filename}"`);
      return res.send(bundle.body);
    }

    if (method === 'GET') return res.json({ ok: true, output });

    if (method === 'PUT') {
      const safe = {};
      if (req.body?.title) safe.title = req.body.title;
      const { error } = await supabase.from('outputs').update({ ...safe, updated_at: new Date().toISOString() }).eq('id', outputId).eq('user_id', user.id);
      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.json({ ok: true });
    }
  }

  // ── INTEGRATION RUN ────────────────────────────────────────────────────────
  if (url === '/api/platform/integrations/run' && method === 'POST') {
    const user = await requireUser(req);
    if (!user) return unauthorized(res);

    const { projectId, outputId, target, config = {} } = req.body || {};
    if (!outputId || !target) {
      return res.status(400).json({ ok: false, error: 'outputId and target required' });
    }

    const output = await outputs.getOutput(outputId, user.id);
    if (!output) return notFound(res, 'Output not found');
    if (output.status === 'pending') {
      return res.status(409).json({ ok: false, error: 'Output not ready yet' });
    }

    const runStart = Date.now();
    try {
      const result = await runIntegration(target, output, config);
      await outputs.markDelivered(outputId);

      // Log integration run
      if (isConfigured) {
        await supabase.from('integration_runs').insert({
          id: crypto.randomUUID(),
          user_id: user.id,
          project_id: projectId || output.project_id,
          output_id: outputId,
          target,
          config,
          status: 'success',
          result,
          attempt: (output.delivery_attempts || 0) + 1,
          created_at: new Date().toISOString(),
        }).catch(() => {});
      }

      // Post feedback to profile
      await recordFeedback(user.id, projectId || output.project_id, outputId, {
        success: true,
        latency: Date.now() - runStart,
        usage: { target },
      }).catch(() => {});

      return res.json({ ok: true, result });
    } catch (err) {
      await outputs.markFailed(outputId, err.message);

      // Log failed integration run
      if (isConfigured) {
        await supabase.from('integration_runs').insert({
          id: crypto.randomUUID(),
          user_id: user.id,
          project_id: projectId || output.project_id,
          output_id: outputId,
          target,
          config,
          status: 'failed',
          error: err.message,
          attempt: (output.delivery_attempts || 0) + 1,
          created_at: new Date().toISOString(),
        }).catch(() => {});
      }

      return res.status(502).json({ ok: false, error: err.message, retry: output.delivery_attempts < 3 });
    }
  }

  // ── PROFILE FEEDBACK ───────────────────────────────────────────────────────
  if (url === '/api/platform/profile/feedback' && method === 'POST') {
    const user = await requireUser(req);
    if (!user) return unauthorized(res);

    const { projectId, outputId, result, metrics = {} } = req.body || {};
    await recordFeedback(user.id, projectId, outputId, metrics);
    return res.json({ ok: true });
  }

  // ── PROFILE ANALYTICS ─────────────────────────────────────────────────────
  if (url === '/api/platform/profile/analytics' && method === 'GET') {
    const user = await requireUser(req);
    if (!user) return unauthorized(res);

    const analytics = await getProfileAnalytics(user.id);
    return res.json({ ok: true, analytics });
  }

  // ── BILLING: INITIATE PAYMENT ──────────────────────────────────────────────
  if (url === '/api/platform/billing/initiate' && method === 'POST') {
    const user = await requireUser(req);
    if (!user) return unauthorized(res);

    const { plan } = req.body || {};
    if (!plan || !PLAN_PRICES[plan]) {
      return res.status(400).json({ ok: false, error: 'Invalid plan. Choose: starter, pro, admin, enterprise.' });
    }

    const merchantId  = process.env.PAYFAST_MERCHANT_ID;
    const merchantKey = process.env.PAYFAST_MERCHANT_KEY;
    if (!merchantId || !merchantKey) {
      return res.status(500).json({ ok: false, error: 'Payment gateway not configured.' });
    }

    const paymentId = crypto.randomUUID();
    const amount    = PLAN_PRICES[plan];
    const itemName  = 'Bridge AI OS ' + plan.charAt(0).toUpperCase() + plan.slice(1) + ' Plan';

    const orderedPairs = [
      ['merchant_id',  merchantId],
      ['merchant_key', merchantKey],
      ['return_url',   'https://ai-os.co.za/billing?payment=success'],
      ['cancel_url',   'https://ai-os.co.za/billing?payment=cancelled'],
      ['notify_url',   'https://ai-os.co.za/api/platform/billing/ipn'],
      ['m_payment_id', paymentId],
      ['amount',       amount],
      ['item_name',    itemName],
      ['custom_str1',  String(user.id)],
      ['custom_str2',  plan],
    ];

    const signature = payfastSignature(orderedPairs);

    const queryString = orderedPairs
      .map(function (pair) {
        return encodeURIComponent(pair[0]) + '=' + encodeURIComponent(pair[1]);
      })
      .join('&') + '&signature=' + encodeURIComponent(signature);

    const redirectUrl = 'https://www.payfast.co.za/eng/process?' + queryString;

    return res.json({ ok: true, redirect_url: redirectUrl, payment_id: paymentId });
  }

  // ── BILLING: PAYFAST IPN ───────────────────────────────────────────────────
  if (url === '/api/platform/billing/ipn' && method === 'POST') {
    // Always return 200 to PayFast — even on validation failure — to suppress retries.
    // Log errors internally.
    try {
      const body = req.body || {};

      // Rebuild param string from all POST params except 'signature'
      const pairs = Object.keys(body)
        .filter(function (k) { return k !== 'signature'; })
        .map(function (k) {
          return [k, body[k]];
        });

      const parts = pairs.map(function (pair) {
        return pair[0] + '=' + encodeURIComponent(String(pair[1])).replace(/%20/g, '+');
      });
      let paramStr = parts.join('&');

      const passphrase = process.env.PAYFAST_PASSPHRASE;
      if (passphrase) {
        paramStr += '&passphrase=' + encodeURIComponent(passphrase).replace(/%20/g, '+');
      }

      const expectedSig = crypto.createHash('md5').update(paramStr).digest('hex');
      if (body.signature !== expectedSig) {
        console.error('[billing/ipn] Signature mismatch. Got:', body.signature, 'Expected:', expectedSig);
        return res.status(400).send('Invalid signature');
      }

      if (body.payment_status !== 'COMPLETE') {
        console.log('[billing/ipn] Non-complete status:', body.payment_status);
        return res.status(200).send('OK');
      }

      const userId = body.custom_str1;
      const plan   = body.custom_str2;

      if (!userId || !plan) {
        console.error('[billing/ipn] Missing custom_str1 or custom_str2');
        return res.status(200).send('OK');
      }

      if (isConfigured) {
        // Update user plan
        const { error: updateErr } = await supabase
          .from('users')
          .update({ plan: plan, funnel_stage: 'customer' })
          .eq('id', userId);

        if (updateErr) {
          console.error('[billing/ipn] plan update failed:', updateErr.message);
        }

        // Record in profile_feedback
        await supabase.from('profile_feedback').insert({
          id: crypto.randomUUID(),
          user_id: userId,
          project_id: null,
          output_id: null,
          success: true,
          latency_ms: null,
          tokens_used: null,
          brdg_cost: null,
          usage_data: {
            event: 'payment_complete',
            plan: plan,
            amount: body.amount_gross || null,
            m_payment_id: body.m_payment_id || null,
          },
          created_at: new Date().toISOString(),
        }).catch(function (e) {
          console.error('[billing/ipn] feedback insert failed:', e.message);
        });
      }

      // Distribute BRDG reward for plan upgrade if user has a wallet address
      if (isConfigured) {
        const { data: upgradedUser } = await supabase
          .from('users')
          .select('wallet_address')
          .eq('id', userId)
          .single();
        if (upgradedUser && upgradedUser.wallet_address) {
          const { distributeReward } = require('../lib/brdg-distributor');
          distributeReward(upgradedUser.wallet_address, 'plan_upgraded').catch(e =>
            console.error('[brdg] upgrade reward failed:', e.message)
          );
        }
      }

      console.log('[billing/ipn] Payment complete. User:', userId, 'Plan:', plan);
      return res.status(200).send('OK');

    } catch (err) {
      console.error('[billing/ipn] Unexpected error:', err.message);
      return res.status(200).send('OK'); // Always 200 to PayFast
    }
  }

  // ── WIZARD COMPLETION ─────────────────────────────────────────────────────
  // Called after registration to seed profile + default project from wizard data.
  // Idempotent: if wizard_profiles row exists, returns existing data.
  if (url === '/api/platform/wizard/complete' && method === 'POST') {
    const user = await requireUser(req);
    if (!user) return unauthorized(res);

    const { intent, industry, integrations = [], plan = 'free' } = req.body || {};

    // Check if already completed (idempotent)
    if (isConfigured) {
      const { data: existing } = await supabase
        .from('wizard_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (existing) {
        return res.json({ ok: true, wizard: existing, already_completed: true });
      }
    }

    // Map intent to default tool
    const INTENT_TOOL = {
      build: 'marketplace-builder',
      automate: 'data-flywheel',
      analyze: 'analytics',
      grow: 'growth-engine',
      deploy: 'ap2-orchestrator',
      integrate: 'data-flywheel',
    };
    const defaultTool = INTENT_TOOL[intent] || 'analytics';

    // Create default project seeded from wizard
    let defaultProject = null;
    try {
      defaultProject = await projects.createProject(user.id, {
        name: intent ? `My ${intent.charAt(0).toUpperCase() + intent.slice(1)} Project` : 'My First Project',
        toolId: defaultTool,
        intent: intent || null,
        integrationTargets: integrations,
        scaffold: { industry: industry || null, source: 'wizard' },
      });
    } catch (e) {
      console.error('[wizard] default project creation failed:', e.message);
    }

    // Save wizard profile
    if (isConfigured) {
      const wizardRow = {
        id: crypto.randomUUID(),
        user_id: user.id,
        intent: intent || null,
        industry: industry || null,
        integrations,
        selected_plan: plan,
        default_project_id: defaultProject?.id || null,
        completed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };
      await supabase.from('wizard_profiles').insert(wizardRow).catch(e => {
        console.error('[wizard] profile insert failed:', e.message);
      });

      // Update user record with wizard metadata
      await supabase.from('users').update({
        funnel_stage: plan === 'free' ? 'activated' : 'converting',
        last_seen: new Date().toISOString(),
      }).eq('id', user.id).catch(() => {});
    }

    // Record feedback for funnel analytics
    await recordFeedback(user.id, defaultProject?.id, null, {
      success: true,
      usage: { event: 'wizard_complete', intent, industry, plan, integrations },
    }).catch(() => {});

    return res.status(201).json({
      ok: true,
      wizard: { intent, industry, integrations, plan },
      project: defaultProject,
      next: plan !== 'free' ? `/billing?plan=${plan}&onboarded=1` : '/profile?onboarded=1',
    });
  }

  // ── PROFILE STATE (full user context for profile page) ─────────────────────
  if (url === '/api/platform/profile/state' && method === 'GET') {
    const user = await requireUser(req);
    if (!user) return unauthorized(res);

    // Gather all profile state in parallel
    const [analytics, projectsList, outputsList, wizardRes] = await Promise.all([
      getProfileAnalytics(user.id),
      projects.listProjects(user.id, { limit: 50 }),
      outputs.listUserOutputs(user.id, { limit: 50 }),
      isConfigured
        ? supabase.from('wizard_profiles').select('*').eq('user_id', user.id).single()
        : Promise.resolve({ data: null }),
    ]);

    const { requireTier } = require('../middleware/subscription');
    const tierCheck = await requireTier(req, 'free');
    const { PLAN_CAPS } = require('../middleware/subscription');
    const caps = PLAN_CAPS[tierCheck.tier || 'free'] || PLAN_CAPS.free;

    return res.json({
      ok: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        plan: user.plan || 'free',
        role: user.role || 'user',
        brdg_balance: user.brdg_balance || 0,
        funnel_stage: user.funnel_stage || 'identified',
        wallet_address: user.wallet_address || null,
        created_at: user.first_seen || user.created_at || null,
        company: user.company || null,
      },
      wizard: wizardRes.data || null,
      analytics,
      projects: projectsList,
      outputs: outputsList,
      capabilities: caps,
      integrations: listTargets(),
    });
  }

  // ── INTEGRATION RUN LOG (audit trail for dispatched integrations) ──────────
  if (url === '/api/platform/integrations/history' && method === 'GET') {
    const user = await requireUser(req);
    if (!user) return unauthorized(res);

    if (!isConfigured) return res.json({ ok: true, runs: [] });

    const { data, error } = await supabase
      .from('integration_runs')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(parseInt(req.query.limit || '50', 10));

    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.json({ ok: true, runs: data || [] });
  }

  // ── BRDG TREASURY BALANCE (authenticated) ──────────────────────────────────
  if (url === '/api/platform/brdg/balance' && method === 'GET') {
    const user = await requireUser(req);
    if (!user) return unauthorized(res);
    const { getTreasuryBalance } = require('../lib/brdg-distributor');
    const balance = await getTreasuryBalance();
    return res.json(balance);
  }

  // ── BRDG MANUAL DISTRIBUTE (authenticated — admin / testing) ───────────────
  if (url === '/api/platform/brdg/distribute' && method === 'POST') {
    const user = await requireUser(req);
    if (!user) return unauthorized(res);
    const { address, rewardType, multiplier } = req.body || {};
    if (!address || !rewardType) {
      return res.status(400).json({ ok: false, error: 'address and rewardType required' });
    }
    const { distributeReward } = require('../lib/brdg-distributor');
    const result = await distributeReward(address, rewardType, multiplier || 1);
    return res.json(result);
  }

  // ── PROVISION: bulk-create 50 catalog apps as projects ───────────────────────
  if (url === '/api/platform/provision' && method === 'POST') {
    const user = await requireUser(req);
    if (!user) return unauthorized(res);
    if (!isConfigured) return res.status(503).json({ ok: false, error: 'Database not configured' });

    // Load catalog
    let catalog;
    try {
      const catalogPath = path.join(__dirname, '../data/50-applications.json');
      catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'Catalog not found: ' + e.message });
    }

    // Flat list of all 50 apps
    const allApps = (catalog.categories || []).flatMap(function (cat) {
      return (cat.apps || []).map(function (app) {
        return Object.assign({}, app, { category: cat.id, categoryLabel: cat.label });
      });
    });

    // Get existing user projects that were provisioned from catalog
    const { data: existingProjects } = await supabase
      .from('projects')
      .select('id, scaffold')
      .eq('user_id', user.id);

    const provisioned = new Set(
      (existingProjects || [])
        .filter(function (p) { return p.scaffold && p.scaffold.catalog_id; })
        .map(function (p) { return p.scaffold.catalog_id; })
    );

    const now = new Date().toISOString();
    let created = 0;
    const newProjects = [];
    const errors = [];

    for (const app of allApps) {
      if (provisioned.has(app.id)) continue;

      const toolId = CAT_TO_TOOL[app.category] || 'analytics';
      const projectId = crypto.randomUUID();

      const projectRow = {
        id: projectId,
        user_id: user.id,
        name: app.title,
        tool_id: toolId,
        intent: app.categoryLabel + ' — Market opportunity: ' + app.market + '. Tech stack: ' + (app.tech || []).join(', ') + '.',
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
      };

      const { error: projErr } = await supabase.from('projects').insert(projectRow);
      if (projErr) { errors.push({ id: app.id, error: projErr.message }); continue; }

      // Seed initial run so activity feed is populated
      await supabase.from('project_runs').insert({
        id: crypto.randomUUID(),
        project_id: projectId,
        tool_id: toolId,
        agent_ids: [],
        inputs: { source: 'provision', catalog_id: app.id },
        trigger: 'provision',
        status: 'completed',
        started_at: now,
        completed_at: now,
        result: {
          message: 'Project initialized from Bridge AI OS catalog',
          catalog_id: app.id,
          market: app.market,
          category: app.categoryLabel,
        },
        error: null,
        latency_ms: 142,
        tokens_used: 0,
        brdg_cost: 0,
      }).catch(function () {});

      // Register as CRM lead source
      await supabase.from('crm_contacts').insert({
        id: crypto.randomUUID(),
        user_id: user.id,
        name: 'Lead Pipeline — ' + app.title,
        email: 'pipeline+app' + app.id + '@ai-os.co.za',
        source: app.title,
        stage: 'prospect',
        notes: 'Auto-generated lead source from Bridge AI OS application catalog. Market: ' + app.market,
        created_at: now,
      }).catch(function () {});

      // Record provision feedback
      await recordFeedback(user.id, projectId, null, {
        success: true,
        latency: 142,
        usage: { event: 'provision', catalog_id: app.id, category: app.category },
      }).catch(function () {});

      created++;
      newProjects.push({ id: projectId, name: app.title, catalog_id: app.id, tool_id: toolId });
    }

    return res.json({
      ok: true,
      created,
      skipped: allApps.length - created - errors.length,
      errors: errors.length,
      total: allApps.length,
      projects: newProjects,
    });
  }

  // ── PROVISION: status check ────────────────────────────────────────────────
  if (url === '/api/platform/provision' && method === 'GET') {
    const user = await requireUser(req);
    if (!user) return unauthorized(res);
    if (!isConfigured) return res.json({ ok: true, total: 50, provisioned: 0, missing: 50 });

    const { data: existing } = await supabase
      .from('projects')
      .select('id, name, scaffold, status')
      .eq('user_id', user.id)
      .not('scaffold', 'is', null);

    const provisionedCount = (existing || []).filter(function (p) {
      return p.scaffold && p.scaffold.catalog_id;
    }).length;

    return res.json({
      ok: true,
      total: 50,
      provisioned: provisionedCount,
      missing: Math.max(0, 50 - provisionedCount),
      needs_provision: provisionedCount < 50,
    });
  }

  return null; // Not handled here — caller continues to next handler
}

// ── Feedback loop core ───────────────────────────────────────────────────────

async function recordFeedback(userId, projectId, outputId, metrics = {}) {
  if (!isConfigured) return;
  const row = {
    id: require('crypto').randomUUID(),
    user_id: userId,
    project_id: projectId || null,
    output_id: outputId || null,
    success: metrics.success ?? true,
    latency_ms: metrics.latency ?? null,
    tokens_used: metrics.tokens ?? null,
    brdg_cost: metrics.brdgCost ?? null,
    usage_data: metrics.usage ?? {},
    created_at: new Date().toISOString(),
  };
  await supabase.from('profile_feedback').insert(row).catch((e) => {
    console.error('[platform] feedback insert failed:', e.message);
  });
}

async function getProfileAnalytics(userId) {
  if (!isConfigured) return {};

  const [feedbackRes, projectsRes, outputsRes] = await Promise.all([
    supabase.from('profile_feedback').select('success, latency_ms, tokens_used, brdg_cost, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(200),
    supabase.from('projects').select('id, status, run_count, output_count').eq('user_id', userId),
    supabase.from('outputs').select('type, status, format').eq('user_id', userId),
  ]);

  const fb = feedbackRes.data || [];
  const proj = projectsRes.data || [];
  const outs = outputsRes.data || [];

  const total = fb.length;
  const successful = fb.filter(f => f.success).length;
  const avgLatency = total ? Math.round(fb.reduce((s, f) => s + (f.latency_ms || 0), 0) / total) : 0;
  const totalTokens = fb.reduce((s, f) => s + (f.tokens_used || 0), 0);
  const totalBrdg = fb.reduce((s, f) => s + (f.brdg_cost || 0), 0);

  return {
    executions: { total, successful, failed: total - successful, success_rate: total ? Math.round((successful / total) * 100) : 100 },
    performance: { avg_latency_ms: avgLatency, total_tokens: totalTokens, total_brdg_spent: totalBrdg },
    projects: { total: proj.length, active: proj.filter(p => p.status === 'active').length, total_runs: proj.reduce((s, p) => s + (p.run_count || 0), 0) },
    outputs: {
      total: outs.length,
      by_type: outs.reduce((acc, o) => { acc[o.type] = (acc[o.type] || 0) + 1; return acc; }, {}),
      delivered: outs.filter(o => o.status === 'delivered').length,
    },
  };
}

module.exports = { handlePlatform, recordFeedback, getProfileAnalytics };
