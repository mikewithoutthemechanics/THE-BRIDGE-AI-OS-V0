#!/usr/bin/env node

// =============================================================================
// GEMINI AFFILIATE TRACKING WRAPPER
// CLI tool for tracking referral events in the Bridge AI OS ecosystem
//
// Usage:
//   gemini-affiliate track-click --referral-code REF123 --ip 192.168.1.1 --url https://bridge-ai-os.com
//   gemini-affiliate track-signup --referral-code REF123 --user-id 456
//   gemini-affiliate track-conversion --referral-code REF123 --amount 99.99
//   gemini-affiliate get-metrics --referral-code REF123
// =============================================================================

const { Command } = require('commander');
const { Pool } = require('pg');
const crypto = require('crypto');

const program = new Command();

// Database connection
const pool = new Pool({
  connectionString: process.env.ECONOMY_DB_URL || 'postgresql://bridge_user:secure_password_123@localhost:5432/bridgeai_economy',
  max: 5,
  connectionTimeoutMillis: 5000,
});

const COMMISSION_RATE = parseFloat(process.env.AFFILIATE_COMMISSION_RATE || '0.25');

// Generate unique click ID
function generateClickId() {
  return 'click_' + crypto.randomBytes(8).toString('hex');
}

// Track affiliate click
async function trackClick(options) {
  const { referralCode, ip, userAgent, referrerUrl, landingPage, utmSource, utmMedium, utmCampaign, utmTerm, utmContent } = options;

  try {
    const clickId = generateClickId();
    const query = `
      INSERT INTO affiliate_clicks (
        referral_code, click_id, ip_address, user_agent, referrer_url,
        landing_page, utm_source, utm_medium, utm_campaign, utm_term, utm_content
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `;
    const values = [
      referralCode, clickId, ip, userAgent, referrerUrl,
      landingPage, utmSource, utmMedium, utmCampaign, utmTerm, utmContent
    ];

    await pool.query(query, values);
    console.log(`✅ Click tracked: ${clickId} for referral ${referralCode}`);

    // Also log as general event
    await pool.query(`
      INSERT INTO affiliate_events (referral_code, event_type, event_data, ip_address, user_agent, referrer_url)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [referralCode, 'click', { clickId, landingPage }, ip, userAgent, referrerUrl]);

    return { success: true, clickId };
  } catch (error) {
    console.error('❌ Failed to track click:', error.message);
    return { success: false, error: error.message };
  }
}

// Track affiliate signup
async function trackSignup(options) {
  const { referralCode, userId, ip, userAgent } = options;

  try {
    const query = `
      INSERT INTO affiliate_events (referral_code, event_type, event_data, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5)
    `;
    const values = [referralCode, 'signup', { userId }, ip, userAgent];

    await pool.query(query, values);
    console.log(`✅ Signup tracked for referral ${referralCode}, user ${userId}`);

    return { success: true };
  } catch (error) {
    console.error('❌ Failed to track signup:', error.message);
    return { success: false, error: error.message };
  }
}

// Track affiliate conversion/purchase
async function trackConversion(options) {
  const { referralCode, amount, clickId, ip, userAgent } = options;

  try {
    const commissionAmount = parseFloat(amount) * COMMISSION_RATE;

    // Insert conversion event
    const eventQuery = `
      INSERT INTO affiliate_events (referral_code, event_type, event_data, ip_address, user_agent, commission_amount)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `;
    const eventValues = [referralCode, 'conversion', { amount: parseFloat(amount), clickId }, ip, userAgent, commissionAmount];
    const eventResult = await pool.query(eventQuery, eventValues);
    const eventId = eventResult.rows[0].id;

    // Create commission record
    const commissionId = await pool.rpc('process_affiliate_commission', [referralCode, commissionAmount, eventId, clickId]);

    // Update click as converted
    if (clickId) {
      await pool.query(`
        UPDATE affiliate_clicks
        SET converted_at = CURRENT_TIMESTAMP, conversion_value = $1
        WHERE click_id = $2
      `, [parseFloat(amount), clickId]);
    }

    console.log(`✅ Conversion tracked: ${referralCode} earned $${commissionAmount.toFixed(2)} commission`);
    return { success: true, eventId, commissionId, commissionAmount };
  } catch (error) {
    console.error('❌ Failed to track conversion:', error.message);
    return { success: false, error: error.message };
  }
}

// Get affiliate metrics
async function getMetrics(referralCode) {
  try {
    const result = await pool.query('SELECT * FROM get_affiliate_metrics($1)', [referralCode]);
    const metrics = result.rows[0];

    console.log(`📊 Metrics for referral ${referralCode}:`);
    console.log(`   Clicks: ${metrics.total_clicks}`);
    console.log(`   Signups: ${metrics.total_signups}`);
    console.log(`   Conversions: ${metrics.total_conversions}`);
    console.log(`   Total Commission: $${metrics.total_commission}`);
    console.log(`   Available Balance: $${metrics.available_balance}`);
    console.log(`   Pending Balance: $${metrics.pending_balance}`);

    return { success: true, metrics };
  } catch (error) {
    console.error('❌ Failed to get metrics:', error.message);
    return { success: false, error: error.message };
  }
}

// Setup CLI commands
program
  .name('gemini-affiliate')
  .description('Gemini Affiliate Tracking Wrapper CLI')
  .version('1.0.0');

program
  .command('track-click')
  .description('Track an affiliate click')
  .requiredOption('-r, --referral-code <code>', 'Referral code')
  .option('-i, --ip <ip>', 'IP address')
  .option('-u, --user-agent <agent>', 'User agent string')
  .option('--referrer-url <url>', 'Referrer URL')
  .option('-l, --landing-page <page>', 'Landing page URL')
  .option('--utm-source <source>', 'UTM source')
  .option('--utm-medium <medium>', 'UTM medium')
  .option('--utm-campaign <campaign>', 'UTM campaign')
  .option('--utm-term <term>', 'UTM term')
  .option('--utm-content <content>', 'UTM content')
  .action(trackClick);

program
  .command('track-signup')
  .description('Track an affiliate signup')
  .requiredOption('-r, --referral-code <code>', 'Referral code')
  .requiredOption('--user-id <id>', 'User ID')
  .option('-i, --ip <ip>', 'IP address')
  .option('-u, --user-agent <agent>', 'User agent string')
  .action(trackSignup);

program
  .command('track-conversion')
  .description('Track an affiliate conversion/purchase')
  .requiredOption('-r, --referral-code <code>', 'Referral code')
  .requiredOption('-a, --amount <amount>', 'Purchase amount')
  .option('-c, --click-id <id>', 'Click ID to associate with conversion')
  .option('-i, --ip <ip>', 'IP address')
  .option('-u, --user-agent <agent>', 'User agent string')
  .action(trackConversion);

program
  .command('get-metrics')
  .description('Get affiliate metrics')
  .requiredOption('-r, --referral-code <code>', 'Referral code')
  .action(getMetrics);

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Cleanup on exit
process.on('exit', () => {
  pool.end();
});

// Parse CLI arguments
program.parse();