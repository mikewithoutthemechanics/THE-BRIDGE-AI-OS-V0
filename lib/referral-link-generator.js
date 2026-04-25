// =============================================================================
// REFERRAL LINK GENERATION SYSTEM
// Creates unique referral links with tracking
//
// Usage:
//   node generate-referral-link.js --user-id 123 --base-url https://bridge-ai-os.com
// =============================================================================

const crypto = require('crypto');

function generateReferralCode(userId) {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(4).toString('hex');
  const hash = crypto.createHash('md5').update(`${userId}-${timestamp}-${random}`).digest('hex').substring(0, 8).toUpperCase();
  return `REF-${hash}`;
}

function generateReferralLink(baseUrl, referralCode, options = {}) {
  const url = new URL(baseUrl);
  url.searchParams.set('ref', referralCode);

  // Add UTM parameters if provided
  if (options.utmSource) url.searchParams.set('utm_source', options.utmSource);
  if (options.utmMedium) url.searchParams.set('utm_medium', options.utmMedium);
  if (options.utmCampaign) url.searchParams.set('utm_campaign', options.utmCampaign);

  return url.toString();
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const userId = args.find(arg => arg.startsWith('--user-id='))?.split('=')[1];
  const baseUrl = args.find(arg => arg.startsWith('--base-url='))?.split('=')[1] || 'https://bridge-ai-os.com';

  if (!userId) {
    console.error('Usage: node generate-referral-link.js --user-id=123 [--base-url=https://bridge-ai-os.com]');
    process.exit(1);
  }

  const referralCode = generateReferralCode(userId);
  const referralLink = generateReferralLink(baseUrl, referralCode, {
    utmSource: 'affiliate',
    utmMedium: 'referral',
    utmCampaign: 'partner-program'
  });

  console.log(`Referral Code: ${referralCode}`);
  console.log(`Referral Link: ${referralLink}`);
}

module.exports = { generateReferralCode, generateReferralLink };