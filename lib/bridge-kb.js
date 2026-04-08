/**
 * Bridge AI OS — Knowledge Base + Sales Funnel System
 * Provides system prompts, lead qualification, and data capture
 * for the voice portal AI agent.
 */

'use strict';

// ── PRODUCT KNOWLEDGE BASE ──────────────────────────────────────────────────

const PRODUCT_KB = `
## Bridge AI OS — Product Knowledge

**Platform Overview:**
Bridge AI OS is an autonomous business platform with 35 AI agents that run your entire operation. It covers CRM, invoicing, quoting, ticketing, HR, compliance, and more — over 80 live API endpoints, all working together.

**AI Agents (35 total across 8 domains):**
- Sales: lead scoring, pipeline management, follow-ups, deal closing
- Marketing: content generation, SEO, social media, campaign automation
- Research: market analysis, competitor tracking, trend detection
- Legal: contract drafting, compliance checks, regulatory monitoring
- Finance: invoicing, expense tracking, treasury management, tax prep
- Development: code review, deployment, CI/CD, bug tracking
- Trading: quantitative signals, portfolio management, DeFi strategies
- Support: ticket routing, knowledge base, SLA management, escalation

**BRDG Token Economy:**
- Native token on Linea L2 (Ethereum Layer 2)
- Deflationary: 1% burn on every transaction
- Used for: platform payments, agent rewards, staking, governance
- UBI pool: 40% of treasury earnings distributed to token holders

**Payment Rails:**
- PayFast (ZAR — South African Rand)
- Paystack (NGN — Nigerian Naira)
- Crypto (ETH, USDT, BRDG on Linea L2)

**Pricing Plans:**
- Starter (Free): 50 contacts, 10 invoices/month, 5 AI tasks/day, basic CRM
- Pro (R499/month or ~$27/month): Unlimited contacts, 50 AI tasks/day, staking, full CRM, all integrations
- Enterprise (R2,499/month or ~$135/month): White-label, unlimited everything, dedicated agents, custom integrations, priority support, SLA guarantee

**Key Capabilities:**
- 1,266 skill modules across all domains
- Digital twins: AI replicas that learn your business personality and decision patterns
- Voice AI: natural conversation interface (what you are talking to right now)
- Real-time economy: live token trading, staking, liquidity pools
- Built for Africa, scaling globally
- Self-healing infrastructure with PM2 clustering

**Differentiators:**
- Not just a chatbot — a full autonomous business operating system
- Agents collaborate with each other and pay each other in BRDG tokens
- One platform replaces: CRM + invoicing + HR + legal + marketing + dev tools
- African-first pricing, global capability
- Token economy means your usage grows the ecosystem value
`.trim();

// ── SYSTEM PROMPT BUILDER ───────────────────────────────────────────────────

function getSystemPrompt(context = {}) {
  const exchangeCount = context.exchangeCount || 0;
  const leadScore = context.leadScore || 0;

  let closingGuidance = '';
  if (exchangeCount >= 4 && leadScore > 30) {
    closingGuidance = `

CLOSING GUIDANCE (exchange ${exchangeCount}, lead score ${leadScore}):
The conversation has progressed well. Start naturally guiding toward a specific plan recommendation. Use soft closes like:
- "Based on what you have described, the Pro plan would handle all of that. Would you like to try it?"
- "I can set that up for you right now — want me to take you to the sign-up page?"
- "We have a free Starter plan if you want to test it first. Shall I set that up?"
When the user shows clear interest or says yes, include [ROUTE:checkout] at the end of your response.`;
  }

  if (exchangeCount >= 6 && leadScore > 60) {
    closingGuidance = `

CLOSING GUIDANCE (exchange ${exchangeCount}, lead score ${leadScore}):
This is a qualified lead. Be direct but friendly about next steps:
- Recommend the specific plan that matches their needs
- Offer to set it up immediately
- If they hesitate, offer the free Starter plan as a no-risk entry point
When the user agrees or shows interest, include [ROUTE:checkout] at the end of your response.`;
  }

  return `You are Bridge, the AI business assistant for Bridge AI OS. You help businesses automate their operations with AI.

PERSONALITY:
- Warm, professional, and confident
- Speak like a knowledgeable business advisor, not a salesperson
- Keep responses concise (2-3 sentences max for voice)
- Use natural conversational language
- Be genuinely curious about their business

${PRODUCT_KB}

SALES BEHAVIOR:
1. Start by asking what business they run and what challenges they face
2. Listen for pain points: manual invoicing, no CRM, team management, lead tracking, scattered tools, compliance headaches
3. Match their pain points to specific Bridge AI features — be specific, not generic
4. After 3-4 exchanges, naturally suggest a plan that fits their needs
5. Use soft closes: "Would you like to try that for free?" or "I can set that up for you right now"
6. When the user shows clear buying interest or agrees, say something like "Great, I will take you to the sign-up page" and include [ROUTE:checkout] at the very end of your response
7. Never be pushy — if they are not ready, offer to answer more questions or suggest the free Starter plan
8. If they ask about pricing, give specific numbers (Starter free, Pro R499/mo, Enterprise R2,499/mo)
9. If they mention a competitor, acknowledge it respectfully and highlight what makes Bridge different (full OS vs single tool, token economy, African-first pricing)

IMPORTANT RULES:
- Never make up features that do not exist
- Never promise custom development timelines
- Always be honest about what the platform can and cannot do
- If you do not know something, say so and offer to connect them with the team
${closingGuidance}`.trim();
}

// ── LEAD QUALIFICATION ──────────────────────────────────────────────────────

function qualifyLead(conversation) {
  if (!Array.isArray(conversation) || conversation.length === 0) {
    return { score: 0, qualified: false, signals: [] };
  }

  let score = 0;
  const signals = [];
  const userMessages = conversation
    .filter(m => m.role === 'user')
    .map(m => (m.content || '').toLowerCase())
    .join(' ');

  // Mentioned a business (20 pts)
  const bizPatterns = /\b(my (business|company|startup|agency|firm|shop|store|practice|clinic|restaurant)|i (run|own|manage|operate|started|founded)|we (are|do|sell|provide|offer|build|make)|our (team|company|business|clients|customers))\b/;
  if (bizPatterns.test(userMessages)) {
    score += 20;
    signals.push('mentioned_business');
  }

  // Described a pain point (25 pts)
  const painPatterns = /\b(struggle|struggling|problem|issue|challenge|difficult|hard to|pain|waste time|manual|spreadsheet|scattered|disorganized|losing|can't track|no system|too many tools|inefficient|overhead|burnout|behind|falling behind|slow|tedious|error|mistakes)\b/;
  if (painPatterns.test(userMessages)) {
    score += 25;
    signals.push('described_pain_point');
  }

  // Asked about pricing (20 pts)
  const pricePatterns = /\b(price|pricing|cost|how much|affordable|budget|plan|subscription|free|trial|pay|payment|charge|fee|expensive|cheap|worth|value|roi|return on investment)\b/;
  if (pricePatterns.test(userMessages)) {
    score += 20;
    signals.push('asked_about_pricing');
  }

  // Showed interest in trial/signup (25 pts)
  const interestPatterns = /\b(try|sign up|signup|start|get started|interested|want to|set up|setup|demo|show me|let's go|sounds good|i'm in|yes|absolutely|definitely|sure|let's do it|ready|subscribe|register)\b/;
  if (interestPatterns.test(userMessages)) {
    score += 25;
    signals.push('showed_interest');
  }

  // Mentioned team size (10 pts)
  const teamPatterns = /\b(\d+\s*(people|employees|staff|team members|developers|agents|reps)|small team|large team|solo|just me|freelancer|solopreneur)\b/;
  if (teamPatterns.test(userMessages)) {
    score += 10;
    signals.push('mentioned_team_size');
  }

  return {
    score: Math.min(score, 100),
    qualified: score > 50,
    signals,
  };
}

// ── CLOSING PROMPT ──────────────────────────────────────────────────────────

function getClosingPrompt(leadScore) {
  if (leadScore >= 70) {
    return 'The user is highly interested. Recommend a specific plan and offer to set it up now. Include [ROUTE:checkout] when they agree.';
  }
  if (leadScore >= 50) {
    return 'The user is warming up. Summarize how Bridge solves their specific problems, then suggest the free Starter plan as a no-risk next step.';
  }
  if (leadScore >= 30) {
    return 'Keep building trust. Ask one more question about their business needs, then connect those needs to a specific Bridge feature.';
  }
  return 'Continue the conversation naturally. Learn more about their business before suggesting anything.';
}

// ── LEAD DATA CAPTURE ───────────────────────────────────────────────────────

function captureLeadData(conversation) {
  if (!Array.isArray(conversation) || conversation.length === 0) {
    return { name: null, email: null, company: null, industry: null, team_size: null, pain_points: [], budget_signals: [] };
  }

  const userText = conversation
    .filter(m => m.role === 'user')
    .map(m => m.content || '')
    .join(' ');

  const lower = userText.toLowerCase();

  // Extract email
  const emailMatch = userText.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
  const email = emailMatch ? emailMatch[0] : null;

  // Extract name (patterns like "I'm John", "my name is John", "this is John")
  const nameMatch = userText.match(/(?:(?:i'm|i am|my name is|this is|call me)\s+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
  const name = nameMatch ? nameMatch[1].trim() : null;

  // Extract company name
  const companyMatch = userText.match(/(?:(?:my company|our company|we are|i work at|i work for|company called|business called|called)\s+)([A-Z][\w\s&.-]+?)(?:\.|,|\s+and\s|\s+is\s|\s+we\s|$)/i);
  const company = companyMatch ? companyMatch[1].trim() : null;

  // Detect industry
  const industryMap = {
    'tech|software|saas|app|developer|coding|startup': 'technology',
    'retail|shop|store|ecommerce|e-commerce|selling|merchandise': 'retail',
    'restaurant|food|catering|kitchen|chef|dining': 'food_service',
    'health|medical|clinic|doctor|hospital|pharma|wellness': 'healthcare',
    'finance|banking|accounting|insurance|invest|trading': 'finance',
    'real estate|property|rental|landlord|housing': 'real_estate',
    'law|legal|attorney|lawyer|paralegal': 'legal',
    'marketing|agency|advertising|branding|media|pr|digital': 'marketing',
    'education|school|training|tutor|university|course|teaching': 'education',
    'construction|building|contractor|plumbing|electrical': 'construction',
    'logistics|shipping|transport|delivery|freight|supply chain': 'logistics',
    'consulting|advisory|consultant|coach': 'consulting',
    'agriculture|farming|farm|crop|livestock': 'agriculture',
    'manufacturing|factory|production|assembly': 'manufacturing',
  };

  let industry = null;
  for (const [patterns, ind] of Object.entries(industryMap)) {
    if (new RegExp(`\\b(${patterns})\\b`, 'i').test(lower)) {
      industry = ind;
      break;
    }
  }

  // Extract team size
  let team_size = null;
  const teamMatch = lower.match(/(\d+)\s*(people|employees|staff|team members|developers|person team)/);
  if (teamMatch) {
    team_size = parseInt(teamMatch[1], 10);
  } else if (/\b(just me|solo|freelancer|solopreneur|one.?man)\b/.test(lower)) {
    team_size = 1;
  } else if (/\bsmall team\b/.test(lower)) {
    team_size = 5; // estimate
  } else if (/\blarge team\b/.test(lower)) {
    team_size = 50; // estimate
  }

  // Detect pain points
  const pain_points = [];
  const painMap = {
    'invoice|invoicing|billing|payment tracking': 'manual_invoicing',
    'crm|contacts|customer management|lead tracking|pipeline': 'no_crm',
    'team|staff|employee|hr|hiring|payroll': 'team_management',
    'lead|leads|prospect|sales tracking': 'lead_tracking',
    'spreadsheet|excel|google sheets|manual tracking': 'spreadsheet_dependency',
    'compliance|regulation|audit|legal|gdpr|popi': 'compliance',
    'marketing|social media|content|seo': 'marketing_gaps',
    'support|tickets|customer service|helpdesk': 'support_management',
    'too many tools|scattered|disorganized|switching between': 'tool_fragmentation',
    'time|wasting time|slow|inefficient|tedious': 'time_waste',
  };

  for (const [patterns, point] of Object.entries(painMap)) {
    if (new RegExp(`\\b(${patterns})\\b`, 'i').test(lower)) {
      pain_points.push(point);
    }
  }

  // Budget signals
  const budget_signals = [];
  if (/\b(free|no budget|tight budget|can't afford|cheap)\b/.test(lower)) {
    budget_signals.push('budget_conscious');
  }
  if (/\b(enterprise|large|scale|unlimited|premium|white.?label)\b/.test(lower)) {
    budget_signals.push('enterprise_ready');
  }
  if (/\b(invest|roi|return|value|worth it|pay for quality)\b/.test(lower)) {
    budget_signals.push('value_oriented');
  }
  if (/\b(pricing|how much|cost|plan|subscription)\b/.test(lower)) {
    budget_signals.push('price_inquired');
  }

  return {
    name,
    email,
    company,
    industry,
    team_size,
    pain_points,
    budget_signals,
  };
}

module.exports = {
  getSystemPrompt,
  qualifyLead,
  getClosingPrompt,
  captureLeadData,
  PRODUCT_KB,
};
