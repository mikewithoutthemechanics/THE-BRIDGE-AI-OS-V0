// =============================================================================
// BRIDGE AI OS — TELEGRAM BOT
// Telegram interface for Bridge AI: LLM queries, BRDG economy, subscriptions
// =============================================================================

'use strict';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// ── Graceful requires (modules may not be available) ────────────────────────
let llmClient = null;
let brdgChain = null;
let agentLedger = null;

try { llmClient = require('./llm-client'); } catch (_) {
  console.warn('[TELEGRAM] llm-client not available — /ask will return stub responses');
}
try { brdgChain = require('./brdg-chain'); } catch (_) {
  console.warn('[TELEGRAM] brdg-chain not available — /token will return stub data');
}
try { agentLedger = require('./agent-ledger'); } catch (_) {
  console.warn('[TELEGRAM] agent-ledger not available — /balance will return stub data');
}

// ── Rate limiter: 10 messages/minute per user ───────────────────────────────
const rateBuckets = new Map();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

function isRateLimited(userId) {
  const now = Date.now();
  let bucket = rateBuckets.get(userId);
  if (!bucket) {
    bucket = [];
    rateBuckets.set(userId, bucket);
  }
  // Evict old timestamps
  while (bucket.length && bucket[0] <= now - RATE_WINDOW_MS) bucket.shift();
  if (bucket.length >= RATE_LIMIT) return true;
  bucket.push(now);
  return false;
}

// Periodic cleanup of stale buckets (every 5 min)
const _cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [uid, bucket] of rateBuckets) {
    while (bucket.length && bucket[0] <= now - RATE_WINDOW_MS) bucket.shift();
    if (!bucket.length) rateBuckets.delete(uid);
  }
}, 300_000);
if (_cleanupInterval.unref) _cleanupInterval.unref();

// ── Message counter ─────────────────────────────────────────────────────────
let messageCount = 0;
const startTime = Date.now();

// ── Subscription plans ──────────────────────────────────────────────────────
const PLANS = [
  { name: 'Free',       price: 'R0/mo',    brdg: 100,    features: 'Basic AI queries, 50 msgs/day' },
  { name: 'Starter',    price: 'R99/mo',    brdg: 2500,   features: 'Priority AI, 500 msgs/day, agent access' },
  { name: 'Pro',        price: 'R299/mo',   brdg: 10000,  features: 'Unlimited AI, all agents, task marketplace' },
  { name: 'Enterprise', price: 'R999/mo',   brdg: 50000,  features: 'Custom agents, SLA, dedicated support' },
];

// ── Helpers ─────────────────────────────────────────────────────────────────
function username(msg) {
  return msg.from?.username ? `@${msg.from.username}` : `user:${msg.from?.id || 'unknown'}`;
}

function log(msg, text) {
  console.log(`[TELEGRAM] ${username(msg)}: ${text}`);
}

// ── Bot setup ───────────────────────────────────────────────────────────────
let bot = null;
let botInfo = null;

function createBot() {
  if (!BOT_TOKEN) {
    console.warn('[TELEGRAM] TELEGRAM_BOT_TOKEN not set — bot disabled');
    return null;
  }

  let TelegramBot;
  try {
    TelegramBot = require('node-telegram-bot-api');
  } catch (_) {
    console.error('[TELEGRAM] node-telegram-bot-api not installed — run: npm i node-telegram-bot-api');
    return null;
  }

  // Create bot in webhook mode (no polling) — webhook set via routes
  bot = new TelegramBot(BOT_TOKEN, { polling: false });

  // Cache bot info
  bot.getMe().then(info => {
    botInfo = info;
    console.log(`[TELEGRAM] Bot ready: @${info.username} (${info.first_name})`);
  }).catch(err => {
    console.warn(`[TELEGRAM] Could not fetch bot info: ${err.message}`);
  });

  // ── /start ──────────────────────────────────────────────────────────────
  bot.onText(/\/start/, (msg) => {
    log(msg, '/start');
    messageCount++;
    const welcome = [
      `Welcome to *Bridge AI OS*, ${msg.from?.first_name || 'friend'}!`,
      '',
      'Bridge AI is a multi-agent AI operating system with its own on-chain economy powered by the BRDG token on Linea.',
      '',
      'What I can do:',
      '  /ask <question> — Ask the AI anything',
      '  /balance — BRDG economy stats',
      '  /plans — Subscription plans & pricing',
      '  /token — BRDG token info (on-chain)',
      '  /help — All commands',
      '',
      'Or just type a message and I will answer using Bridge AI inference.',
    ].join('\n');
    bot.sendMessage(msg.chat.id, welcome, { parse_mode: 'Markdown' });
  });

  // ── /help ───────────────────────────────────────────────────────────────
  bot.onText(/\/help/, (msg) => {
    log(msg, '/help');
    messageCount++;
    const help = [
      '*Bridge AI OS — Commands*',
      '',
      '/start — Welcome & introduction',
      '/ask <question> — Ask the AI a question',
      '/balance — BRDG economy stats (circulating, burned, agents)',
      '/plans — Subscription plans with prices',
      '/token — BRDG token info (address, supply, burned)',
      '/help — This help message',
      '',
      'You can also just type any message to chat with Bridge AI.',
    ].join('\n');
    bot.sendMessage(msg.chat.id, help, { parse_mode: 'Markdown' });
  });

  // ── /ask <question> ─────────────────────────────────────────────────────
  bot.onText(/\/ask\s+(.+)/s, async (msg, match) => {
    const question = match[1].trim();
    log(msg, `/ask ${question.slice(0, 80)}...`);
    messageCount++;

    if (isRateLimited(msg.from?.id)) {
      bot.sendMessage(msg.chat.id, 'Rate limit reached (10 messages/minute). Please wait a moment.');
      return;
    }

    if (!llmClient) {
      bot.sendMessage(msg.chat.id, 'LLM inference is currently unavailable. Please try again later.');
      return;
    }

    try {
      bot.sendChatAction(msg.chat.id, 'typing');
      const result = await llmClient.infer(question, {
        systemPrompt: 'You are Bridge AI, a helpful AI assistant from the Bridge AI OS multi-agent platform. Keep answers concise for Telegram.',
        maxTokens: 1024,
      });
      const answer = typeof result === 'string' ? result : (result.text || result.content || JSON.stringify(result));
      bot.sendMessage(msg.chat.id, answer, { parse_mode: 'Markdown' }).catch(() => {
        // Retry without Markdown if parsing fails
        bot.sendMessage(msg.chat.id, answer);
      });
    } catch (err) {
      console.error(`[TELEGRAM] LLM error: ${err.message}`);
      bot.sendMessage(msg.chat.id, `Sorry, inference failed: ${err.message}`);
    }
  });

  // ── /balance ────────────────────────────────────────────────────────────
  bot.onText(/\/balance/, async (msg) => {
    log(msg, '/balance');
    messageCount++;

    if (!agentLedger) {
      bot.sendMessage(msg.chat.id, 'Economy ledger is currently unavailable.');
      return;
    }

    try {
      const balances = typeof agentLedger.getAllBalances === 'function'
        ? await agentLedger.getAllBalances()
        : [];
      const leaderboard = typeof agentLedger.getLeaderboard === 'function'
        ? await agentLedger.getLeaderboard(5)
        : balances.slice(0, 5);

      let totalCirculating = 0;
      let totalBurned = 0;
      let agentCount = 0;

      if (Array.isArray(balances)) {
        agentCount = balances.length;
        for (const b of balances) {
          totalCirculating += (b.balance || b.amount || 0);
        }
      }

      if (typeof agentLedger.getSystemStats === 'function') {
        const stats = await agentLedger.getSystemStats();
        totalBurned = stats.totalBurned || 0;
        if (stats.totalCirculating) totalCirculating = stats.totalCirculating;
      }

      const lines = [
        '*BRDG Economy Stats*',
        '',
        `Agents: ${agentCount}`,
        `Total Circulating: ${totalCirculating.toLocaleString()} BRDG`,
        `Total Burned: ${totalBurned.toLocaleString()} BRDG`,
        '',
        '*Top Agents:*',
      ];

      const top = Array.isArray(leaderboard) ? leaderboard : [];
      for (const a of top.slice(0, 5)) {
        const name = a.agentId || a.agent_id || a.name || 'unknown';
        const bal = a.balance || a.amount || 0;
        lines.push(`  ${name}: ${bal.toLocaleString()} BRDG`);
      }

      bot.sendMessage(msg.chat.id, lines.join('\n'), { parse_mode: 'Markdown' });
    } catch (err) {
      console.error(`[TELEGRAM] Balance error: ${err.message}`);
      bot.sendMessage(msg.chat.id, 'Failed to fetch economy stats.');
    }
  });

  // ── /plans ──────────────────────────────────────────────────────────────
  bot.onText(/\/plans/, (msg) => {
    log(msg, '/plans');
    messageCount++;

    const lines = ['*Bridge AI OS — Subscription Plans*', ''];
    for (const p of PLANS) {
      lines.push(`*${p.name}* — ${p.price}`);
      lines.push(`  ${p.brdg.toLocaleString()} BRDG/month`);
      lines.push(`  ${p.features}`);
      lines.push('');
    }
    lines.push('Visit https://bridge.supaclaw.com to subscribe.');
    bot.sendMessage(msg.chat.id, lines.join('\n'), { parse_mode: 'Markdown' });
  });

  // ── /token ──────────────────────────────────────────────────────────────
  bot.onText(/\/token/, async (msg) => {
    log(msg, '/token');
    messageCount++;

    const lines = ['*BRDG Token Info*', ''];

    if (!brdgChain) {
      lines.push('On-chain data unavailable.');
      lines.push('');
      lines.push(`Contract: \`0x5f0541302bd4fC672018b07a35FA5f294A322947\``);
      lines.push('Chain: Linea Mainnet (59144)');
      bot.sendMessage(msg.chat.id, lines.join('\n'), { parse_mode: 'Markdown' });
      return;
    }

    try {
      const stats = await brdgChain.getTokenStats();
      lines.push(`Name: ${stats.name || 'BRDG'}`);
      lines.push(`Symbol: ${stats.symbol || 'BRDG'}`);
      lines.push(`Contract: \`${brdgChain.BRDG_ADDRESS}\``);
      lines.push(`Chain: Linea Mainnet (59144)`);
      lines.push('');
      lines.push(`Total Supply: ${stats.totalSupply || 'N/A'}`);
      lines.push(`Max Supply: ${stats.maxSupply || 'N/A'}`);
      lines.push(`Total Burned: ${stats.totalBurned || '0'}`);
      lines.push(`Burn Rate: ${stats.burnBps ? `${stats.burnBps / 100}%` : 'N/A'}`);
      bot.sendMessage(msg.chat.id, lines.join('\n'), { parse_mode: 'Markdown' });
    } catch (err) {
      console.error(`[TELEGRAM] Token error: ${err.message}`);
      lines.push('Failed to fetch on-chain data.');
      lines.push(`Contract: \`${brdgChain.BRDG_ADDRESS}\``);
      bot.sendMessage(msg.chat.id, lines.join('\n'), { parse_mode: 'Markdown' });
    }
  });

  // ── Plain text handler (LLM queries) ────────────────────────────────────
  bot.on('message', async (msg) => {
    // Skip commands (already handled above)
    if (msg.text && msg.text.startsWith('/')) return;
    if (!msg.text) return;

    log(msg, msg.text.slice(0, 80));
    messageCount++;

    if (isRateLimited(msg.from?.id)) {
      bot.sendMessage(msg.chat.id, 'Rate limit reached (10 messages/minute). Please wait a moment.');
      return;
    }

    if (!llmClient) {
      bot.sendMessage(msg.chat.id, 'LLM inference is currently unavailable. Please try again later.');
      return;
    }

    try {
      bot.sendChatAction(msg.chat.id, 'typing');
      const result = await llmClient.infer(msg.text, {
        systemPrompt: 'You are Bridge AI, a helpful AI assistant from the Bridge AI OS multi-agent platform. Keep answers concise for Telegram.',
        maxTokens: 1024,
      });
      const answer = typeof result === 'string' ? result : (result.text || result.content || JSON.stringify(result));
      bot.sendMessage(msg.chat.id, answer, { parse_mode: 'Markdown' }).catch(() => {
        bot.sendMessage(msg.chat.id, answer);
      });
    } catch (err) {
      console.error(`[TELEGRAM] LLM error: ${err.message}`);
      bot.sendMessage(msg.chat.id, `Sorry, inference failed: ${err.message}`);
    }
  });

  return bot;
}

// ── Module exports ──────────────────────────────────────────────────────────
// If no token, export stubs that log warnings
if (!BOT_TOKEN) {
  module.exports = {
    bot: null,
    createBot: () => { console.warn('[TELEGRAM] No TELEGRAM_BOT_TOKEN — bot not created'); return null; },
    processUpdate: () => { console.warn('[TELEGRAM] No TELEGRAM_BOT_TOKEN — update ignored'); },
    getStatus: () => ({ running: false, reason: 'TELEGRAM_BOT_TOKEN not set' }),
  };
} else {
  const instance = createBot();
  module.exports = {
    bot: instance,
    createBot,
    processUpdate: (update) => {
      if (instance) instance.processUpdate(update);
    },
    getStatus: () => ({
      running: !!instance,
      username: botInfo?.username || null,
      messageCount,
      uptimeMs: Date.now() - startTime,
      rateLimitPerMinute: RATE_LIMIT,
    }),
  };
}
