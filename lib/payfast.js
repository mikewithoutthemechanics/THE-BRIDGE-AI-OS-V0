/**
 * PayFast integration — signature generation + webhook verification.
 * Docs: https://developers.payfast.co.za/docs
 */

const crypto = require('crypto');

const SANDBOX_URL = 'https://sandbox.payfast.co.za/eng/process';
const LIVE_URL    = 'https://www.payfast.co.za/eng/process';

function isSandbox() {
  return process.env.PAYFAST_SANDBOX === 'true' || process.env.NODE_ENV !== 'production';
}

/**
 * Generate PayFast MD5 signature from payment data object.
 * Keys must be sorted alphabetically, empty/undefined values excluded.
 */
function generateSignature(data, passphrase) {
  const pairs = Object.keys(data)
    .filter(k => data[k] !== undefined && data[k] !== '' && data[k] !== null)
    .sort()
    .map(k => `${k}=${encodeURIComponent(String(data[k])).replace(/%20/g, '+')}`);

  let payload = pairs.join('&');
  if (passphrase) {
    payload += `&passphrase=${encodeURIComponent(passphrase).replace(/%20/g, '+')}`;
  }

  return crypto.createHash('md5').update(payload).digest('hex');
}

/**
 * Build a full PayFast payment URL for redirect.
 * Returns { url, paymentId } — redirect user to url.
 */
function buildPaymentUrl({ amount, email, itemName, firstName = 'Client', meta = '' }) {
  const merchantId  = process.env.PAYFAST_MERCHANT_ID  || '10000100';
  const merchantKey = process.env.PAYFAST_MERCHANT_KEY || '46f0cd694581a';
  const passphrase  = process.env.PAYFAST_PASSPHRASE   || '';
  const baseUrl     = process.env.NEXT_PUBLIC_BASE_URL  || 'https://aoe-unified-final.vercel.app';

  const paymentId = `txn_${Date.now()}`;

  const data = {
    merchant_id:   merchantId,
    merchant_key:  merchantKey,
    return_url:    `${baseUrl}/payment-success`,
    cancel_url:    `${baseUrl}/payment-cancel`,
    notify_url:    `${baseUrl}/api/payfast-webhook`,
    name_first:    firstName,
    email_address: email,
    m_payment_id:  paymentId,
    amount:        parseFloat(amount).toFixed(2),
    item_name:     itemName || 'AI-OS Subscription',
    custom_str1:   meta,
  };

  const signature = generateSignature(data, passphrase);
  const pfUrl = isSandbox() ? SANDBOX_URL : LIVE_URL;
  const qs = new URLSearchParams({ ...data, signature }).toString();

  return { url: `${pfUrl}?${qs}`, paymentId, sandbox: isSandbox() };
}

/**
 * Verify incoming PayFast ITN (webhook) signature.
 * Returns true if valid.
 */
function verifyWebhook(body, passphrase) {
  const received = body.signature;
  if (!received) return false;

  const data = { ...body };
  delete data.signature;

  const expected = generateSignature(data, passphrase || process.env.PAYFAST_PASSPHRASE || '');
  return received === expected;
}

module.exports = { generateSignature, buildPaymentUrl, verifyWebhook, isSandbox };
