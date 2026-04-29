/**
 * Cron Job Routes
 * API endpoints for scheduled tasks (reward distribution, cleanup, etc)
 */

'use strict';

const { Router } = require('express');
const distributeRewardsCron = require('./distribute-rewards');
const { provisionHeal } = require('./provision-heal');
let corporateEngine = null;
try { corporateEngine = require('./corporate-engine'); } catch (e) { console.warn('[CRON] corporate-engine unavailable:', e.message); }

module.exports = function setupCronRoutes(app) {
  const router = Router();

  router.post('/distribute-rewards', distributeRewardsCron);

  // Provision-heal: runs every 4h to ensure all 50 catalog apps exist per user
  router.get('/provision-heal',  function (req, res) { return provisionHeal(req, res); });
  router.post('/provision-heal', function (req, res) { return provisionHeal(req, res); });

  // Corporate Autonomous Engine — runs every 1 minute
  // Generates leads, quotes, invoices, tickets, heals stuck workflows
  if (corporateEngine) {
    router.get('/corporate-engine',  corporateEngine);
    router.post('/corporate-engine', corporateEngine);
  }

  // Optionally: GET for health check
  router.get('/health', function (req, res) {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  return router;
};
