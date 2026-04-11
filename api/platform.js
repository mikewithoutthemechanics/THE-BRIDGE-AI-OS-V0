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
const { supabase, isConfigured } = require('../lib/supabase');
const projects = require('../lib/projects');
const outputs = require('../lib/outputs');
const { runIntegration, listTargets } = require('../lib/integrations');
const userDb = require('../lib/user-identity');
const llm = require('../lib/llm-client');

// ── Auth helper ──────────────────────────────────────────────────────────────

async function requireUser(req) {
  let token = null;
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) token = authHeader.slice(7);
  if (!token && req.cookies?.bridge_token) token = req.cookies.bridge_token;
  if (!token && req.query?.token) token = req.query.token;
  if (!token) return null;
  return userDb.verifyAuthToken(token);
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

async function handlePlatform(req, res) {
  const url = req.url.replace(/\?.*$/, '');
  const method = req.method;

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
      const list = await projects.listProjects(user.id, { status: req.query.status });
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

    try {
      const result = await runIntegration(target, output, config);
      await outputs.markDelivered(outputId);

      // Post feedback to profile
      await recordFeedback(user.id, projectId || output.project_id, outputId, {
        success: true,
        latency: 0,
        usage: { target },
      }).catch(() => {});

      return res.json({ ok: true, result });
    } catch (err) {
      await outputs.markFailed(outputId, err.message);
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
