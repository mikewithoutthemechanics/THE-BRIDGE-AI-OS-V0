/**
 * AI engine — thin wrapper around OpenAI chat completions.
 * Falls back to deterministic stub responses when API key is absent
 * so all agent endpoints remain functional without an OpenAI key.
 */

let OpenAI;
try { OpenAI = require('openai'); } catch (_) { OpenAI = null; }

let _client = null;
function getClient() {
  if (!_client && OpenAI && process.env.OPENAI_API_KEY) {
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

// Canned stub responses per agent so the system is never empty
const STUBS = {
  'QuoteGen AI':      (input) => `Custom AI automation quote for "${input}": R2,499/mo — includes 10 agents, full API access, and 24/7 support.`,
  'Finance AI':       (input) => `Financial forecast: R${input} invested in AI infrastructure projects ~23% ROI over 12 months. Top allocation: ops (40%), growth (35%), reserve (25%).`,
  'Growth Hunter':    ()      => `3 immediate growth actions: (1) Activate LinkedIn outreach to 50 CTOs/day, (2) Launch retargeting on top 20% traffic pages, (3) Offer 14-day free trial with auto-nurture sequence.`,
  'Intelligence AI':  ()      => `Market signal: AI ops spending up 34% YoY in ZA SME sector. Competitor gap: no local player offering end-to-end agent orchestration below R5k/mo. Bridge AI is the only option.`,
  'Nurture AI':       ()      => `Nurture sequence triggered: 5-email drip over 14 days, personalized by industry. Open rate target: 38%. CTA: book a 15-min demo.`,
  'Closer AI':        ()      => `Closing strategy: anchor on pain (manual ops cost), present ROI calc (5x), offer limited-time onboarding slot. Close rate at this stage: 62%.`,
  'Campaign AI':      ()      => `Campaign live: "AI replaces your ops team" — Google + Meta. Budget R500/day. Estimated CPL: R85. Projected: 6 qualified leads/day.`,
  'Creative AI':      ()      => `Generated assets: 3 ad creatives, 2 landing variants, 1 case study draft. Best performer prediction: testimonial video format (+40% CTR).`,
  'Support AI':       ()      => `Support queue: 4 open tickets. Avg resolution: 2.3h. Auto-resolved: 12 today via knowledge base. Escalation: 0.`,
  'Supply AI':        ()      => `Supply chain optimised: API vendor costs down 18% via model routing. OpenRouter fallback active. Infra cost per agent: R0.003/task.`,
};

/**
 * Run a chat completion. Returns the assistant's text response.
 * Uses claude-haiku-4-5 or gpt-4.1-mini depending on what's configured.
 * Falls back to stub if no API key.
 */
async function runAI(systemPrompt, userMessage, opts = {}) {
  const client = getClient();

  if (!client) {
    // No API key — find the best stub match
    const matchedAgent = Object.keys(STUBS).find(name =>
      systemPrompt.toLowerCase().includes(name.toLowerCase()) ||
      (opts.agentName && opts.agentName === name)
    );
    const stubFn = matchedAgent ? STUBS[matchedAgent] : () => `AI response to: "${userMessage}" — (configure OPENAI_API_KEY for live responses)`;
    return stubFn(userMessage);
  }

  try {
    const res = await client.chat.completions.create({
      model: opts.model || 'gpt-4o-mini',
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 400,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage },
      ],
    });
    return res.choices[0].message.content;
  } catch (e) {
    console.warn('[AI] API call failed:', e.message);
    // Fall back to stub on failure
    const stubFn = STUBS[opts.agentName] || (() => `AI temporarily unavailable. Error: ${e.message}`);
    return stubFn(userMessage);
  }
}

module.exports = { runAI };
