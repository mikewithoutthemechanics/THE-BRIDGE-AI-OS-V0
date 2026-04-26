/**
 * BRIDGE AI OS -- Affiliate Engine
 *
 * Maps product categories to affiliate networks with tracking URLs.
 * Scans text for product mentions and injects affiliate links.
 * Tracks clicks for attribution reporting.
 *
 * Networks:
 *   WebWay Hosting   — 20% recurring
 *   Luno Crypto      — R150/signup
 *   ElevenLabs       — 22% recurring
 *   Cloudflare       — 15%
 *   DigitalOcean     — $25/referral
 */

'use strict';

const crypto = require('crypto');
const { supabase } = require('./supabase');

// ── Affiliate Network Definitions ──────────────────────────────────────────

const NETWORKS = {
  webway: {
    name: 'WebWay Hosting',
    base_url: 'https://www.webway.co.za',
    ref_param: 'ref',
    ref_id: process.env.AFFILIATE_WEBWAY_ID || 'bridgeai',
    commission_type: 'recurring',
    commission_rate: '20%',
  },
  luno: {
    name: 'Luno Crypto',
    base_url: 'https://www.luno.com/invite',
    ref_param: null, // ref ID is part of the path
    ref_id: process.env.AFFILIATE_LUNO_ID || 'BRIDGEAI',
    commission_type: 'per_signup',
    commission_rate: 'R150',
  },
  elevenlabs: {
    name: 'ElevenLabs',
    base_url: 'https://elevenlabs.io',
    ref_param: 'from',
    ref_id: process.env.AFFILIATE_ELEVENLABS_ID || 'bridgeai',
    commission_type: 'recurring',
    commission_rate: '22%',
  },
  cloudflare: {
    name: 'Cloudflare',
    base_url: 'https://www.cloudflare.com',
    ref_param: 'ref',
    ref_id: process.env.AFFILIATE_CLOUDFLARE_ID || 'bridgeai',
    commission_type: 'one_time',
    commission_rate: '15%',
  },
  digitalocean: {
    name: 'DigitalOcean',
    base_url: 'https://www.digitalocean.com',
    ref_param: 'refcode',
    ref_id: process.env.AFFILIATE_DO_ID || 'bridgeai',
    commission_type: 'per_referral',
    commission_rate: '$25',
  },
};

// ── Category-to-Network Mapping ────────────────────────────────────────────

const CATEGORY_MAP = {
  // Hosting
  hosting:        { network: 'webway',      path: '/hosting' },
  vps:            { network: 'webway',      path: '/vps' },
  'web-hosting':  { network: 'webway',      path: '/hosting' },
  domains:        { network: 'webway',      path: '/domains' },

  // Cloud / Infrastructure
  cloud:          { network: 'digitalocean', path: '/' },
  infrastructure: { network: 'digitalocean', path: '/' },
  droplets:       { network: 'digitalocean', path: '/products/droplets' },
  kubernetes:     { network: 'digitalocean', path: '/products/kubernetes' },

  // CDN / Security
  cdn:            { network: 'cloudflare',   path: '/cdn' },
  dns:            { network: 'cloudflare',   path: '/dns' },
  ddos:           { network: 'cloudflare',   path: '/ddos' },
  waf:            { network: 'cloudflare',   path: '/waf' },
  security:       { network: 'cloudflare',   path: '/' },

  // AI / Voice
  tts:            { network: 'elevenlabs',   path: '/' },
  'text-to-speech': { network: 'elevenlabs', path: '/' },
  'voice-ai':     { network: 'elevenlabs',   path: '/' },
  'voice-clone':  { network: 'elevenlabs',   path: '/' },
  'ai-voice':     { network: 'elevenlabs',   path: '/' },

  // Crypto
  crypto:         { network: 'luno',         path: '' },
  bitcoin:        { network: 'luno',         path: '' },
  ethereum:       { network: 'luno',         path: '' },
  exchange:       { network: 'luno',         path: '' },
  trading:        { network: 'luno',         path: '' },
};

// ── Product keyword patterns for text scanning ─────────────────────────────

const PRODUCT_PATTERNS = [
  { pattern: /\b(web\s*hosting|shared\s*hosting|vps|server\s*hosting|webway)\b/gi, category: 'hosting' },
  { pattern: /\b(digitalocean|droplet|digital\s*ocean)\b/gi, category: 'cloud' },
  { pattern: /\b(cloudflare|cdn|ddos\s*protection|waf)\b/gi, category: 'cdn' },
  { pattern: /\b(elevenlabs|eleven\s*labs|text[\s-]to[\s-]speech|voice\s*clone|tts|ai\s*voice)\b/gi, category: 'tts' },
  { pattern: /\b(luno|bitcoin|crypto\s*exchange|buy\s*bitcoin|buy\s*crypto)\b/gi, category: 'crypto' },
];

// ── In-memory fallback for click tracking ────────────────────────────────────
var memoryClicks = [];

// ── Core Functions ─────────────────────────────────────────────────────────

/**
 * Build an affiliate link for a given category and optional product.
 */
function getAffiliateLink(category, product) {
  var key = (category || '').toLowerCase().trim();
  var mapping = CATEGORY_MAP[key];
  if (!mapping) return null;

  var net = NETWORKS[mapping.network];
  if (!net) return null;

  var url;
  if (mapping.network === 'luno') {
    url = net.base_url + '/' + net.ref_id;
  } else if (net.ref_param) {
    var sep = mapping.path.includes('?') ? '&' : '?';
    url = net.base_url + mapping.path + sep + net.ref_param + '=' + net.ref_id;
  } else {
    url = net.base_url + mapping.path;
  }

  if (product) {
    var sep2 = url.includes('?') ? '&' : '?';
    url += sep2 + 'item=' + encodeURIComponent(product);
  }

  return {
    url: url,
    network: net.name,
    commission_type: net.commission_type,
    commission_rate: net.commission_rate,
  };
}

/**
 * Scan text for product mentions and append affiliate links.
 */
function injectAffiliateLinks(text) {
  if (!text || typeof text !== 'string') return text;

  var injected = {};
  var insertions = [];

  for (var i = 0; i < PRODUCT_PATTERNS.length; i++) {
    var entry = PRODUCT_PATTERNS[i];
    entry.pattern.lastIndex = 0;
    var match = entry.pattern.exec(text);
    if (match && !injected[entry.category]) {
      var link = getAffiliateLink(entry.category);
      if (link) {
        injected[entry.category] = true;
        insertions.push({
          pos: match.index + match[0].length,
          text: ' [' + link.network + ': ' + link.url + ']',
        });
      }
    }
  }

  insertions.sort(function (a, b) { return b.pos - a.pos; });
  var result = text;
  for (var j = 0; j < insertions.length; j++) {
    var ins = insertions[j];
    result = result.slice(0, ins.pos) + ins.text + result.slice(ins.pos);
  }

  return result;
}

/**
 * Record an affiliate link click for attribution (async — Supabase).
 */
async function trackClick(network, linkId) {
  var id = 'click_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
  var ts = new Date().toISOString();
  var netKey = (network || '').toLowerCase();

  if (supabase) {
    try {
      await supabase.from('affiliate_clicks').insert({
        id: id,
        network: netKey,
        link_id: linkId || '',
        category: '',
        clicked_at: ts,
      });
      return { recorded: true, id: id };
    } catch (_) {
      // Fall through to memory
    }
  }

  memoryClicks.push({ id: id, network: netKey, link_id: linkId || '', clicked_at: ts });
  return { recorded: true, id: id };
}

/**
 * Get click stats by network (async — Supabase).
 */
async function getClickStats() {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('affiliate_clicks')
        .select('network');
      if (!error && data) {
        var byNetwork = {};
        data.forEach(function (r) {
          byNetwork[r.network] = (byNetwork[r.network] || 0) + 1;
        });
        return { total: data.length, by_network: byNetwork };
      }
    } catch (_) {
      // Fall through
    }
  }
  var byNet = {};
  memoryClicks.forEach(function (c) {
    byNet[c.network] = (byNet[c.network] || 0) + 1;
  });
  return { total: memoryClicks.length, by_network: byNet };
}

// ── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  getAffiliateLink: getAffiliateLink,
  injectAffiliateLinks: injectAffiliateLinks,
  trackClick: trackClick,
  getClickStats: getClickStats,
  NETWORKS: NETWORKS,
  CATEGORY_MAP: CATEGORY_MAP,
};
