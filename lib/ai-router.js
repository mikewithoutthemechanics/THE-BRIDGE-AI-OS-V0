let dotenvPath;
try {
  require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
} catch (_) {}

const OR_KEY = process.env.OPENROUTER_API_KEY || '';
const OA_KEY = process.env.OPENAI_API_KEY || '';

const PROVIDERS = {
  free: { url: 'https://openrouter.ai/api/v1/chat/completions', key: OR_KEY, model: 'nousresearch/hermes-3-llama-3.1-405b:free' },
  standard: { url: 'https://openrouter.ai/api/v1/chat/completions', key: OR_KEY, model: 'anthropic/claude-3-haiku' },
  premium: { url: 'https://api.openai.com/v1/chat/completions', key: OA_KEY, model: 'gpt-4o-mini' }
};

async function route(prompt, tier = 'free') {
  const provider = PROVIDERS[tier] || PROVIDERS.free;

  if (!provider.key) {
    return { ok: false, error: `No API key configured for tier "${tier}"`, tier };
  }

  try {
    // Use native fetch (Node 18+) or fall back to axios
    let responseData;
    if (typeof fetch === 'function') {
      const resp = await fetch(provider.url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${provider.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: provider.model, messages: [{ role: 'user', content: prompt }], max_tokens: 500 }),
        signal: AbortSignal.timeout(30000),
      });
      responseData = await resp.json();
    } else {
      // Fallback to axios if available
      const axios = require('axios');
      const resp = await axios.post(provider.url, {
        model: provider.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500
      }, { headers: { 'Authorization': `Bearer ${provider.key}`, 'Content-Type': 'application/json' }, timeout: 30000 });
      responseData = resp.data;
    }

    if (responseData.choices && responseData.choices[0]) {
      return { ok: true, response: responseData.choices[0].message.content, model: provider.model, tier };
    }
    return { ok: false, error: responseData.error?.message || 'No choices returned', tier };
  } catch(err) {
    // Fallback to free tier
    if (tier !== 'free') return route(prompt, 'free');
    return { ok: false, error: err.message, tier };
  }
}

module.exports = { route };