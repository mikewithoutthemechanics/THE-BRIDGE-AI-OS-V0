// =============================================================================
// BRIDGE AI OS — 3-TIER COGNITION ROUTER
// Port: 8080 (mounted on gateway)
// Routes AI requests based on complexity scoring:
//   Tier 0 – KILL SWITCH   : blocked patterns
//   Tier 1 – REFLEX        : simple requests, no LLM, ~50ms
//   Tier 2 – STRUCTURED    : moderate complexity, Gemini Flash, ~500ms
//   Tier 3 – GOD MODE      : high complexity, Claude 3.5 Sonnet, ~5s
// =============================================================================

const express = require('express');
const router = express.Router();
const llmClient = require('../lib/llm-client');

// ── COMPLEXITY SCORING ────────────────────────────────────────────────────────
function computeComplexity(prompt) {
  if (!prompt) return 0;
  const lower = prompt.toLowerCase();

  // Reflex markers (Tier 1) — immediate low complexity
  const reflexMarkers = ['icon', 'svg', 'image', 'thumbnail', 'logo', 'favicon', 'screenshot'];
  for (const marker of reflexMarkers) {
    if (lower.includes(marker)) return 0.1;
  }

  // Base score from length (0–1) — assume 200 chars ~ score 1
  const len = prompt.length;
  let score = Math.min(1, len / 200);

  // Complex keywords increase score
  const complexWords = [
    'analyze', 'research', 'explain', 'compare', 'evaluate', 'summarize',
    'generate', 'create', 'write', 'develop', 'design', 'plan', 'strategy',
    'optimization', 'improve', 'recommend', 'assess', 'predict', 'forecast',
    'integrate', 'architect', 'refactor', 'optimize', 'investigate', 'diagnose',
    'troubleshoot', 'debug', 'audit', 'review', 'strategy', 'roadmap', 'blueprint'
  ];
  for (const word of complexWords) {
    if (lower.includes(word)) score += 0.15;
  }

  // Very long prompts also increase score
  if (len > 500) score += 0.2;
  if (len > 1000) score += 0.3;

  return Math.min(1, Math.max(0, score));
}

// ── KILL SWITCH ───────────────────────────────────────────────────────────────
function isKillSwitch(prompt) {
  if (!prompt) return false;
  const lower = prompt.toLowerCase();
  const blocked = [
    'rm -rf', 'del /f', 'format c:', 'shutdown', 'reboot', 'drop table',
    'delete from', 'truncate table', 'exec(', 'eval(',
    // add more dangerous patterns as needed
  ];
  return blocked.some(pattern => lower.includes(pattern));
}

// ── REFLEX HANDLER ────────────────────────────────────────────────────────────
function handleReflex(prompt) {
  const lower = prompt.toLowerCase();
  // SVG icon request → return a tiny default SVG
  if (lower.includes('icon') || lower.includes('svg')) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <rect width="64" height="64" fill="#00ff9c"/>
      <text x="32" y="40" font-size="24" text-anchor="middle" fill="#000">i</text>
    </svg>`;
    return { ok: true, text: svg, provider: 'reflex-svg', tier: 1 };
  }
  // Simple echo-style response for other reflex queries
  const short = prompt.substring(0, 150);
  return { ok: true, text: `Reflex: ${short}`, provider: 'reflex-echo', tier: 1 };
}

// ── TIERED LLM CALL ───────────────────────────────────────────────────────────
async function callLLM(prompt, tier, score) {
  const start = Date.now();
  let model, maxLatency;

  if (tier === 2) {
    model = 'google/gemini-flash-1.5';
    maxLatency = 500;
  } else if (tier === 3) {
    model = 'anthropic/claude-3.5-sonnet';
    maxLatency = 5000;
  } else {
    throw new Error('Invalid tier for LLM call');
  }

  // Call OpenRouter with timeout
  const result = await Promise.race([
    llmClient.infer(prompt, { provider: 'openrouter', model }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('LLM timeout')), maxLatency))
  ]);

  const latency = Date.now() - start;
  return { ...result, tier, score, latency_ms: latency };
}

// ── ROUTES ────────────────────────────────────────────────────────────────────

// GET /ai/tier-check?prompt=... → complexity analysis without LLM call
router.get('/tier-check', (req, res) => {
  const { prompt } = req.query;
  if (prompt === undefined) {
    return res.status(400).json({ error: 'prompt query parameter required' });
  }
  const score = computeComplexity(prompt);
  let tier, tierName, model, maxLatency;
  if (score < 0.3) {
    tier = 1; tierName = 'REFLEX'; model = null; maxLatency = 50;
  } else if (score <= 0.7) {
    tier = 2; tierName = 'STRUCTURED'; model = 'google/gemini-flash-1.5'; maxLatency = 500;
  } else {
    tier = 3; tierName = 'GOD MODE'; model = 'anthropic/claude-3.5-sonnet'; maxLatency = 5000;
  }
  res.json({ prompt, score, tier, tierName, model, maxLatency });
});

// POST /ai → main AI endpoint with tiered routing
router.post('/ai', async (req, res) => {
  const { prompt } = req.body || {};
  if (!prompt) {
    return res.status(400).json({ error: 'prompt required' });
  }

  // Kill-switch: block dangerous patterns
  if (isKillSwitch(prompt)) {
    return res.status(403).json({
      error: 'Request blocked by kill switch',
      tier: 0,
      tierName: 'KILL SWITCH',
      latency_ms: Date.now() - start
    });
  }

  const start = Date.now();
  const score = computeComplexity(prompt);
  let tier, tierName;

  if (score < 0.3) {
    // Tier 1 — REFLEX (no LLM)
    tier = 1; tierName = 'REFLEX';
    const result = handleReflex(prompt);
    const latency = Date.now() - start;
    res.json({ ...result, score, tier, tierName, latency_ms: latency });
  } else if (score <= 0.7) {
    // Tier 2 — STRUCTURED (Gemini Flash)
    tier = 2; tierName = 'STRUCTURED';
    try {
      const result = await callLLM(prompt, tier, score);
      res.json(result);
    } catch (err) {
      // Fallback to reflex on error
      const fallback = handleReflex(prompt);
      const latency = Date.now() - start;
      res.json({ ...fallback, error: err.message, score, tier, tierName, latency_ms: latency, fallback: true });
    }
  } else {
    // Tier 3 — GOD MODE (Claude 3.5 Sonnet)
    tier = 3; tierName = 'GOD MODE';
    try {
      const result = await callLLM(prompt, tier, score);
      res.json(result);
    } catch (err) {
      // Fallback: try structured tier first, then reflex
      try {
        const fallbackResult = await callLLM(prompt, 2, 0.5);
        res.json({ ...fallbackResult, error: err.message, fallback_from: 'claude', score, tier: 3, tierName, fallback: true });
      } catch (e2) {
        const reflex = handleReflex(prompt);
        const latency = Date.now() - start;
        res.json({ ...reflex, error: e2.message, score, tier, tierName, latency_ms: latency, fallback: true });
      }
    }
  }
});

module.exports = router;
