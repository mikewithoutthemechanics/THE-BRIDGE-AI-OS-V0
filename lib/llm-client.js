// =============================================================================
// BRIDGE AI OS — UNIFIED LLM CLIENT
// Provider fallback: Kilo (free) → Anthropic → OpenRouter → OpenAI
// Usage tracking, cost caps, error handling
// =============================================================================

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ── PROVIDER CONFIGS ────────────────────────────────────────────────────────
const PROVIDERS = {
  kilo: {
    name: 'Kilo Gateway (free)',
    baseUrl: 'https://api.kilo.ai/api/gateway',
    envKey: 'KILO_API_KEY',
    model: 'kilo-auto/free',
    maxTokens: 4096,
    costPer1kInput: 0,
    costPer1kOutput: 0,
  },
  anthropic: {
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    envKey: 'ANTHROPIC_API_KEY',
    model: 'claude-sonnet-4-20250514',
    maxTokens: 4096,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
  },
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api',
    envKey: 'OPENROUTER_API_KEY',
    model: 'anthropic/claude-sonnet-4-20250514',
    maxTokens: 4096,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
  },
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com',
    envKey: 'OPENAI_API_KEY',
    model: 'gpt-4o-mini',
    maxTokens: 4096,
    costPer1kInput: 0.00015,
    costPer1kOutput: 0.0006,
  },
};

// ── USAGE TRACKING ──────────────────────────────────────────────────────────
const USAGE_FILE = path.join(__dirname, '..', 'data', 'llm-usage.json');

let usage = {
  total_requests: 0,
  total_input_tokens: 0,
  total_output_tokens: 0,
  total_cost_usd: 0,
  daily_cost_usd: 0,
  daily_reset: new Date().toISOString().slice(0, 10),
  by_provider: {},
  errors: 0,
  last_request: null,
};

// Load persisted usage
try {
  if (fs.existsSync(USAGE_FILE)) {
    const saved = JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8'));
    usage = { ...usage, ...saved };
  }
} catch (_) { /* start fresh */ }

function saveUsage() {
  try {
    const dir = path.dirname(USAGE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(USAGE_FILE, JSON.stringify(usage, null, 2));
  } catch (_) { /* non-critical */ }
}

function resetDailyIfNeeded() {
  const today = new Date().toISOString().slice(0, 10);
  if (usage.daily_reset !== today) {
    usage.daily_cost_usd = 0;
    usage.daily_reset = today;
  }
}

// ── COST CAPS ───────────────────────────────────────────────────────────────
const COST_CAPS = {
  daily_usd: parseFloat(process.env.LLM_DAILY_CAP_USD || '5.00'),
  monthly_usd: parseFloat(process.env.LLM_MONTHLY_CAP_USD || '100.00'),
  per_request_max_tokens: parseInt(process.env.LLM_MAX_TOKENS || '4096', 10),
};

// ── PROVIDER AVAILABILITY ───────────────────────────────────────────────────
function getAvailableProviders() {
  const order = (process.env.LLM_PROVIDER_ORDER || 'kilo,anthropic,openrouter,openai').split(',').map(s => s.trim());
  return order.filter(id => {
    const p = PROVIDERS[id];
    return p && process.env[p.envKey] && process.env[p.envKey].length > 10;
  });
}

// ── HTTP REQUEST HELPER ─────────────────────────────────────────────────────
function httpPost(url, headers, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const data = JSON.stringify(body);
    const req = mod.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: 30000,
    }, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(buf) }); }
        catch (e) { reject(new Error(`Invalid JSON from ${parsed.hostname}: ${buf.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('LLM request timeout')); });
    req.write(data);
    req.end();
  });
}

// ── PROVIDER-SPECIFIC CALLERS ───────────────────────────────────────────────

async function callKilo(apiKey, prompt, opts = {}) {
  const model = opts.model || PROVIDERS.kilo.model;
  const maxTokens = Math.min(opts.maxTokens || PROVIDERS.kilo.maxTokens, COST_CAPS.per_request_max_tokens);
  const res = await httpPost('https://api.kilo.ai/api/gateway/chat/completions', {
    'Authorization': `Bearer ${apiKey}`,
  }, {
    model,
    max_tokens: maxTokens,
    messages: [
      ...(opts.system ? [{ role: 'system', content: opts.system }] : []),
      { role: 'user', content: prompt },
    ],
  });

  if (res.status !== 200) throw new Error(`Kilo ${res.status}: ${JSON.stringify(res.data)}`);
  const d = res.data;
  const choice = d.choices?.[0];
  return {
    text: choice?.message?.content || '',
    input_tokens: d.usage?.prompt_tokens || 0,
    output_tokens: d.usage?.completion_tokens || 0,
    model: d.model || model,
    provider: 'kilo',
  };
}

async function callAnthropic(apiKey, prompt, opts = {}) {
  const model = opts.model || PROVIDERS.anthropic.model;
  const maxTokens = Math.min(opts.maxTokens || PROVIDERS.anthropic.maxTokens, COST_CAPS.per_request_max_tokens);
  const res = await httpPost('https://api.anthropic.com/v1/messages', {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  }, {
    model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
    ...(opts.system ? { system: opts.system } : {}),
  });

  if (res.status !== 200) throw new Error(`Anthropic ${res.status}: ${JSON.stringify(res.data)}`);
  const d = res.data;
  return {
    text: d.content?.[0]?.text || '',
    input_tokens: d.usage?.input_tokens || 0,
    output_tokens: d.usage?.output_tokens || 0,
    model: d.model,
    provider: 'anthropic',
  };
}

async function callOpenRouter(apiKey, prompt, opts = {}) {
  const model = opts.model || PROVIDERS.openrouter.model;
  const maxTokens = Math.min(opts.maxTokens || PROVIDERS.openrouter.maxTokens, COST_CAPS.per_request_max_tokens);
  const res = await httpPost('https://openrouter.ai/api/v1/chat/completions', {
    'Authorization': `Bearer ${apiKey}`,
    'HTTP-Referer': 'https://go.ai-os.co.za',
    'X-Title': 'Bridge AI OS',
  }, {
    model,
    max_tokens: maxTokens,
    messages: [
      ...(opts.system ? [{ role: 'system', content: opts.system }] : []),
      { role: 'user', content: prompt },
    ],
  });

  if (res.status !== 200) throw new Error(`OpenRouter ${res.status}: ${JSON.stringify(res.data)}`);
  const d = res.data;
  const choice = d.choices?.[0];
  return {
    text: choice?.message?.content || '',
    input_tokens: d.usage?.prompt_tokens || 0,
    output_tokens: d.usage?.completion_tokens || 0,
    model: d.model,
    provider: 'openrouter',
  };
}

async function callOpenAI(apiKey, prompt, opts = {}) {
  const model = opts.model || PROVIDERS.openai.model;
  const maxTokens = Math.min(opts.maxTokens || PROVIDERS.openai.maxTokens, COST_CAPS.per_request_max_tokens);
  const res = await httpPost('https://api.openai.com/v1/chat/completions', {
    'Authorization': `Bearer ${apiKey}`,
  }, {
    model,
    max_tokens: maxTokens,
    messages: [
      ...(opts.system ? [{ role: 'system', content: opts.system }] : []),
      { role: 'user', content: prompt },
    ],
  });

  if (res.status !== 200) throw new Error(`OpenAI ${res.status}: ${JSON.stringify(res.data)}`);
  const d = res.data;
  const choice = d.choices?.[0];
  return {
    text: choice?.message?.content || '',
    input_tokens: d.usage?.prompt_tokens || 0,
    output_tokens: d.usage?.completion_tokens || 0,
    model: d.model,
    provider: 'openai',
  };
}

const CALLERS = { kilo: callKilo, anthropic: callAnthropic, openrouter: callOpenRouter, openai: callOpenAI };

// ── MAIN INFERENCE FUNCTION ─────────────────────────────────────────────────

/**
 * Call LLM with automatic provider fallback and cost tracking.
 *
 * @param {string} prompt - The user prompt
 * @param {object} opts - { system, model, maxTokens, provider }
 * @returns {{ text, input_tokens, output_tokens, model, provider, cost_usd }}
 */
async function infer(prompt, opts = {}) {
  resetDailyIfNeeded();

  // Cost cap check
  if (usage.daily_cost_usd >= COST_CAPS.daily_usd) {
    throw new Error(`Daily LLM cost cap reached ($${COST_CAPS.daily_usd}). Reset at midnight UTC.`);
  }

  const providers = opts.provider ? [opts.provider] : getAvailableProviders();

  if (providers.length === 0) {
    throw new Error('No LLM providers configured. Set ANTHROPIC_API_KEY, OPENROUTER_API_KEY, or OPENAI_API_KEY.');
  }

  let lastError;
  for (const providerId of providers) {
    const provider = PROVIDERS[providerId];
    const caller = CALLERS[providerId];
    if (!provider || !caller) continue;

    const apiKey = process.env[provider.envKey];
    if (!apiKey) continue;

    try {
      const result = await caller(apiKey, prompt, opts);

      // Track cost
      const costIn = (result.input_tokens / 1000) * provider.costPer1kInput;
      const costOut = (result.output_tokens / 1000) * provider.costPer1kOutput;
      const totalCost = costIn + costOut;

      usage.total_requests++;
      usage.total_input_tokens += result.input_tokens;
      usage.total_output_tokens += result.output_tokens;
      usage.total_cost_usd += totalCost;
      usage.daily_cost_usd += totalCost;
      usage.last_request = new Date().toISOString();
      usage.by_provider[providerId] = (usage.by_provider[providerId] || 0) + 1;

      saveUsage();

      return { ...result, cost_usd: +totalCost.toFixed(6) };
    } catch (err) {
      lastError = err;
      usage.errors++;
      console.error(`[LLM] ${provider.name} failed: ${err.message}`);
    }
  }

  throw lastError || new Error('All LLM providers failed');
}

// ── EXPORTS ─────────────────────────────────────────────────────────────────
module.exports = {
  infer,
  getUsage: () => ({ ...usage }),
  getProviders: () => getAvailableProviders().map(id => ({ id, name: PROVIDERS[id].name, model: PROVIDERS[id].model })),
  getCaps: () => ({ ...COST_CAPS }),
  PROVIDERS,
};
