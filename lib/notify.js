/**
 * Notification layer — Telegram alerts for key system events.
 * Fails silently: a notification failure never breaks the payment flow.
 *
 * Env vars:
 *   TELEGRAM_BOT_TOKEN  — from @BotFather
 *   TELEGRAM_CHAT_ID    — your chat or channel ID
 */

const TELEGRAM_API = 'https://api.telegram.org';

async function sendTelegram(text) {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return; // not configured, skip silently

  try {
    await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
  } catch (e) {
    console.warn('[NOTIFY] Telegram failed:', e.message);
  }
}

// ── Pre-built alert types ────────────────────────────────────────────────────

function alertPayment({ amount, source, balance }) {
  return sendTelegram(
    `💰 <b>Payment received</b>\n` +
    `Amount: R${amount}\n` +
    `Source: ${source || 'PayFast'}\n` +
    `New balance: R${Math.round(balance).toLocaleString()}`
  );
}

function alertAgentRun({ agentName, success }) {
  return sendTelegram(
    `🤖 <b>Agent ${success ? 'completed' : 'failed'}</b>: ${agentName}`
  );
}

function alertError({ context, message }) {
  return sendTelegram(
    `🚨 <b>Error</b> [${context}]\n${message}`
  );
}

function alertSystemEvent(message) {
  return sendTelegram(`⚡ <b>Bridge AI-OS</b>\n${message}`);
}

module.exports = { sendTelegram, alertPayment, alertAgentRun, alertError, alertSystemEvent };
