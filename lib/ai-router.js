const axios = require('axios');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const OR_KEY = process.env.OPENROUTER_API_KEY || '';
const OA_KEY = process.env.OPENAI_API_KEY || '';

const PROVIDERS = {
  free: { url: 'https://openrouter.ai/api/v1/chat/completions', key: OR_KEY, model: 'nousresearch/hermes-3-llama-3.1-405b:free' },
  standard: { url: 'https://openrouter.ai/api/v1/chat/completions', key: OR_KEY, model: 'anthropic/claude-3-haiku' },
  premium: { url: 'https://api.openai.com/v1/chat/completions', key: OA_KEY, model: 'gpt-4o-mini' }
};

async function route(prompt, tier = 'free') {
  const provider = PROVIDERS[tier] || PROVIDERS.free;
  try {
    const resp = await axios.post(provider.url, {
      model: provider.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500
    }, { headers: { 'Authorization': `Bearer ${provider.key}`, 'Content-Type': 'application/json' }, timeout: 30000 });
    return { ok: true, response: resp.data.choices[0].message.content, model: provider.model, tier };
  } catch(err) {
    // Fallback to free tier
    if (tier !== 'free') return route(prompt, 'free');
    return { ok: false, error: err.message, tier };
  }
}

module.exports = { route };
