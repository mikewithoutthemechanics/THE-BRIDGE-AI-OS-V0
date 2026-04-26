// =============================================================================
// BRIDGE AI OS — TELEGRAM ROUTES
// Webhook endpoint, status, and webhook configuration
// =============================================================================

'use strict';

const telegramBot = require('./telegram-bot');
const { validate } = require('./validation');

function registerTelegramRoutes(app) {

  // ── POST /api/telegram/webhook — Telegram sends updates here ────────────
  app.post('/api/telegram/webhook', [validate.telegramWebhook], (req, res) => {
    try {
      telegramBot.processUpdate(req.body);
      res.sendStatus(200);
    } catch (err) {
      console.error(`[TELEGRAM] Webhook error: ${err.message}`);
      res.sendStatus(200); // Always 200 to Telegram to prevent retries
    }
  });

  // ── GET /api/telegram/status — Bot health check ─────────────────────────
  app.get('/api/telegram/status', (_req, res) => {
    const status = telegramBot.getStatus();
    res.json({ ok: true, telegram: status });
  });

  // ── POST /api/telegram/set-webhook — Configure webhook URL (admin) ──────
  app.post('/api/telegram/set-webhook', [validate.telegramSetWebhook], async (req, res) => {
    // Admin auth via x-bridge-secret header
    const secret = req.headers['x-bridge-secret'];
    if (!secret || secret !== process.env.BRIDGE_INTERNAL_SECRET) {
      return res.status(403).json({ ok: false, error: 'Admin secret required' });
    }

    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ ok: false, error: 'Missing "url" in request body' });
    }

    if (!telegramBot.bot) {
      return res.status(503).json({ ok: false, error: 'Telegram bot not initialized (check TELEGRAM_BOT_TOKEN)' });
    }

    try {
      const result = await telegramBot.bot.setWebHook(url);
      console.log(`[TELEGRAM] Webhook set to: ${url}`);
      res.json({ ok: true, webhookUrl: url, result });
    } catch (err) {
      console.error(`[TELEGRAM] Set webhook error: ${err.message}`);
      res.status(500).json({ ok: false, error: err.message });
    }
  });
}

module.exports = { registerTelegramRoutes };
