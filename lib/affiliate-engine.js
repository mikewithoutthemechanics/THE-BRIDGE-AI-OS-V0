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

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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

// ── Click tracking store (SQLite if available, else in-memory) ─────────────

let _clickDb = null;
const CLICKS_DB_PATH = path.join(__dirname, '..', 'data', 'affiliate-clicks.db');

function clickDb() {
  if (_clickDb) return _clickDb;
  try {
    var Database = require('better-sqlite3');
    var dbDir = path.dirname(CLICKS_DB_PATH);
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
    _clickDb = new Database(CLICKS_DB_PATH);
    _clickDb.pragma('journal_mode = WAL');
    _clickDb.exec(
      'CREATE TABLE IF NOT EXISTS affiliate_clicks (' +
      '  id         TEXT PRIMARY KEY,' +
      '  network    TEXT NOT NULL,' +
      '  link_id    TEXT,' +
      '  category   TEXT,' +
      "  clicked_at TEXT NOT NULL DEFAULT (datetime('now'))" +
      ');' +
      'CREATE INDEX IF NOT EXISTS idx_clicks_network ON affiliate_clicks(network);'
    );
    return _clickDb;
  } catch (_) {
    // Fallback: no persistence
    return null;
  }
}

// In-memory fallback
var memoryClicks = [];

// ── Core Functions ─────────────────────────────────────────────────────────

/**
 * Build an affiliate link for a given category and optional product.
 *
 * @param {string} category - Product category (e.g. 'hosting', 'crypto', 'tts')
 * @param {string} [product] - Specific product name (used in item_name param)
 * @returns {{ url: string, network: string, commission_type: string, commission_rate: string }|null}
 */
function getAffiliateLink(category, product) {
  var key = (category || '').toLowerCase().trim();
  var mapping = CATEGORY_MAP[key];
  if (!mapping) return null;

  var net = NETWORKS[mapping.network];
  if (!net) return null;

  var url;
  if (mapping.network === 'luno') {
    // Luno uses path-based referral
    url = net.base_url + '/' + net.ref_id;
  } else if (net.ref_param) {
    var sep = mapping.path.includes('?') ? '&' : '?';
    url = net.base_url + mapping.path + sep + net.ref_param + '=' + net.ref_id;
  } else {
    url = net.base_url + mapping.path;
  }

  // Append product identifier if provided
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
 * Returns the original text with affiliate URLs appended after each mention.
 *
 * @param {string} text - Input text to scan
 * @returns {string} Text with affiliate links injected
 */
function injectAffiliateLinks(text) {
  if (!text || typeof text !== 'string') return text;

  var injected = {}; // Avoid duplicate injections per category
  var result = text;

  for (var i = 0; i < PRODUCT_PATTERNS.length; i++) {
    var entry = PRODUCT_PATTERNS[i];
    // Reset regex state
    entry.pattern.lastIndex = 0;
    var match = entry.pattern.exec(result);
    if (match && !injected[entry.category]) {
      var link = getAffiliateLink(entry.category);
      if (link) {
        injected[entry.category] = true;
        // Append link after the first match only
        var insertPos = match.index + match[0].length;
        var linkText = ' [' + link.network + ': ' + link.url + ']';
        result = result.slice(0, insertPos) + linkText + result.slice(insertPos);
      }
    }
  }

  return result;
}

/**
 * Record an affiliate link click for attribution.
 *
 * @param {string} network  - Network key (e.g. 'webway', 'luno')
 * @param {string} linkId   - Unique link identifier or URL slug
 * @returns {{ recorded: boolean, id: string }}
 */
function trackClick(network, linkId) {
  var id = 'click_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
  var ts = new Date().toISOString();
  var netKey = (network || '').toLowerCase();

  var db = clickDb();
  if (db) {
    try {
      db.prepare(
        'INSERT INTO affiliate_clicks (id, network, link_id, category, clicked_at) VALUES (?, ?, ?, ?, ?)'
      ).run(id, netKey, linkId || '', '', ts);
      return { recorded: true, id: id };
    } catch (_) {
      // Fall through to memory
    }
  }

  // In-memory fallback
  memoryClicks.push({ id: id, network: netKey, link_id: linkId || '', clicked_at: ts });
  return { recorded: true, id: id };
}

/**
 * Get click stats by network.
 * @returns {object} { total, by_network }
 */
function getClickStats() {
  var db = clickDb();
  if (db) {
    try {
      var total = db.prepare('SELECT COUNT(*) as c FROM affiliate_clicks').get().c;
      var rows = db.prepare('SELECT network, COUNT(*) as c FROM affiliate_clicks GROUP BY network').all();
      var byNetwork = {};
      rows.forEach(function (r) { byNetwork[r.network] = r.c; });
      return { total: total, by_network: byNetwork };
    } catch (_) {
      // Fall through
    }
  }
  // In-memory fallback
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
