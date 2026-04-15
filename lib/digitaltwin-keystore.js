'use strict';
/**
 * DIGITAL TWIN KEYSTORE
 * =====================
 * Custodial key-derivation layer for per-agent crypto wallets.
 *
 * Private keys are NEVER stored and NEVER exported.
 * They are derived deterministically from the master secret on demand.
 * Only this module touches raw key material; callers receive addresses,
 * signed payloads, or connected ethers.Wallet instances.
 *
 * Derivation:
 *   ETH/BRDG  →  HMAC-SHA256(master, "agent-eth-v1:<agentId>")   → 32-byte secp256k1 key
 *   BTC       →  HMAC-SHA256(master, "agent-btc-v1:<agentId>")   → 32-byte secp256k1 key
 *
 * Same master-secret chain as lib/eth-treasury.js (KF_MASTER).
 */

const crypto  = require('crypto');
const { ethers } = require('ethers');

const MIN_SECRET = 32;

// ── Master secret ─────────────────────────────────────────────────────────────
function _masterSecret() {
  const sources = [
    process.env.BRIDGE_SIWE_JWT_SECRET,
    process.env.BRIDGE_INTERNAL_SECRET,
    process.env.JWT_SECRET,
  ].filter(s => s && s.length >= MIN_SECRET);

  if (!sources.length) {
    throw new Error(
      '[digitaltwin-keystore] No valid master secret found. ' +
      'Set BRIDGE_SIWE_JWT_SECRET, BRIDGE_INTERNAL_SECRET, or JWT_SECRET (≥32 chars each).'
    );
  }
  return crypto.createHash('sha512').update(sources.join(':')).digest();
}

// secp256k1 curve order — derived key must be in [1, N-1]
const _SECP256K1_N = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');

// ── Key derivation (internal — not exported) ──────────────────────────────────
function _deriveKey(purpose, agentId) {
  const master = _masterSecret();
  // Append a counter so we can retry if the derived bytes fall outside [1, N-1].
  // The probability of needing even one retry is ~2^-128, so this is purely defensive.
  for (let counter = 0; ; counter++) {
    const suffix = counter === 0 ? agentId : `${agentId}:${counter}`;
    const key = crypto.createHmac('sha256', master)
      .update(`${purpose}:${suffix}`)
      .digest(); // 32 bytes
    const keyInt = BigInt('0x' + key.toString('hex'));
    if (keyInt > 0n && keyInt < _SECP256K1_N) return key;
  }
}

const _deriveEthKey = (agentId) => _deriveKey('agent-eth-v1', agentId);
const _deriveBtcKey = (agentId) => _deriveKey('agent-btc-v1', agentId);

// ── Pure-JS RIPEMD-160 ────────────────────────────────────────────────────────
// Used for BTC P2PKH address generation (hash160 = RIPEMD160(SHA256(pubKey))).
// This avoids dependency on OpenSSL legacy-provider in Node ≥ 18 + OpenSSL 3.
//
// Lookup tables: per the RIPEMD-160 specification
// https://homes.esat.kuleuven.be/~cosic/publications/article_317.pdf

const _RL = [ 0, 1, 2, 3, 4, 5, 6, 7, 8, 9,10,11,12,13,14,15,
              7, 4,13, 1,10, 6,15, 3,12, 0, 9, 5, 2,14,11, 8,
              3,10,14, 4, 9,15, 8, 1, 2, 7, 0, 6,13,11, 5,12,
              1, 9,11,10, 0, 8,12, 4,13, 3, 7,15,14, 5, 6, 2,
              4, 0, 5, 9, 7,12, 2,10,14, 1, 3, 8,11, 6,15,13 ];

const _RR = [ 5,14, 7, 0, 9, 2,11, 4,13, 6,15, 8, 1,10, 3,12,
              6,11, 3, 7, 0,13, 5,10,14,15, 8,12, 4, 9, 1, 2,
             15, 5, 1, 3, 7,14, 6, 9,11, 8,12, 2,10, 0, 4,13,
              8, 6, 4, 1, 3,11,15, 0, 5,12, 2,13, 9, 7,10,14,
             12,15,10, 4, 1, 5, 8, 7, 6, 2,13,14, 0, 3, 9,11 ];

const _SL = [11,14,15,12, 5, 8, 7, 9,11,13,14,15, 6, 7, 9, 8,
              7, 6, 8,13,11, 9, 7,15, 7,12,15, 9,11, 7,13,12,
             11,13, 6, 7,14, 9,13,15,14, 8,13, 6, 5,12, 7, 5,
             11,12,14,15,14,15, 9, 8, 9,14, 5, 6, 8, 6, 5,12,
              9,15, 5,11, 6, 8,13,12, 5,12,13,14,11, 8, 5, 6 ];

const _SR = [ 8, 9, 9,11,13,15,15, 5, 7, 7, 8,11,14,14,12, 6,
              9,13,15, 7,12, 8, 9,11, 7, 7,12, 7, 6,15,13,11,
              9, 7,15,11, 8, 6, 6,14,12,13, 5,14,13,13, 7, 5,
             15, 5, 8,11,14,14, 6,14, 6, 9,12, 9,12, 5,15, 8,
              8, 5,12, 9,12, 5,14, 6, 8,13, 6, 5,15,13,11,11 ];

const _KL = [0x00000000, 0x5A827999, 0x6ED9EBA1, 0x8F1BBCDC, 0xA953FD4E];
const _KR = [0x50A28BE6, 0x5C4DD124, 0x6D703EF3, 0x7A6D76E9, 0x00000000];

function _f(j, x, y, z) {
  if (j < 16) return (x ^ y ^ z) >>> 0;
  if (j < 32) return ((x & y) | (~x & z)) >>> 0;
  if (j < 48) return ((x | ~y) ^ z) >>> 0;
  if (j < 64) return ((x & z) | (y & ~z)) >>> 0;
  return (x ^ (y | ~z)) >>> 0;
}

function _rol32(n, d) {
  n = n >>> 0;
  return ((n << d) | (n >>> (32 - d))) >>> 0;
}

function _ripemd160(data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const l   = buf.length;
  const bitLen = l * 8;

  // Pad to 56 mod 64 bytes, then append 8-byte LE length
  const pad = 64 - ((l + 9) % 64 || 64);
  const padded = Buffer.alloc(l + 1 + pad + 8, 0);
  buf.copy(padded);
  padded[l] = 0x80;
  padded.writeUInt32LE((bitLen) >>> 0,                       padded.length - 8);
  padded.writeUInt32LE((Math.floor(bitLen / 0x100000000)) >>> 0, padded.length - 4);

  let h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE,
      h3 = 0x10325476, h4 = 0xC3D2E1F0;

  for (let i = 0; i < padded.length; i += 64) {
    const X = new Uint32Array(16);
    for (let j = 0; j < 16; j++) X[j] = padded.readUInt32LE(i + j * 4);

    let al = h0, bl = h1, cl = h2, dl = h3, el = h4;
    let ar = h0, br = h1, cr = h2, dr = h3, er = h4;

    for (let j = 0; j < 80; j++) {
      const rnd = Math.floor(j / 16);
      let T;

      // Left round
      T = (_rol32((al + _f(j, bl, cl, dl) + X[_RL[j]] + _KL[rnd]) >>> 0, _SL[j]) + el) >>> 0;
      al = el; el = dl; dl = _rol32(cl, 10); cl = bl; bl = T;

      // Right round
      T = (_rol32((ar + _f(79 - j, br, cr, dr) + X[_RR[j]] + _KR[rnd]) >>> 0, _SR[j]) + er) >>> 0;
      ar = er; er = dr; dr = _rol32(cr, 10); cr = br; br = T;
    }

    const T = (h1 + cl + dr) >>> 0;
    h1 = (h2 + dl + er) >>> 0;
    h2 = (h3 + el + ar) >>> 0;
    h3 = (h4 + al + br) >>> 0;
    h4 = (h0 + bl + cr) >>> 0;
    h0 = T;
  }

  const out = Buffer.alloc(20);
  out.writeUInt32LE(h0, 0); out.writeUInt32LE(h1, 4);
  out.writeUInt32LE(h2, 8); out.writeUInt32LE(h3, 12);
  out.writeUInt32LE(h4, 16);
  return out;
}

// ── Base58Check encoding (for BTC addresses) ──────────────────────────────────
const _B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function _base58Encode(buf) {
  let num    = BigInt('0x' + buf.toString('hex'));
  let result = '';
  while (num > 0n) {
    result = _B58[Number(num % 58n)] + result;
    num    = num / 58n;
  }
  for (let i = 0; i < buf.length && buf[i] === 0; i++) result = '1' + result;
  return result;
}

// ── BTC P2PKH address from raw 32-byte private key ───────────────────────────
function _btcAddress(privKeyBytes) {
  // Compressed secp256k1 public key via ethers.SigningKey
  const sk     = new ethers.SigningKey('0x' + privKeyBytes.toString('hex'));
  const pubHex = sk.compressedPublicKey.slice(2); // strip 0x
  const pub    = Buffer.from(pubHex, 'hex');       // 33 bytes

  // hash160 = RIPEMD160(SHA256(pubKey))
  const sha256d = crypto.createHash('sha256').update(pub).digest();
  let hash160;
  try {
    hash160 = crypto.createHash('ripemd160').update(sha256d).digest();
  } catch (_) {
    // OpenSSL 3 strict-FIPS fallback → pure-JS implementation
    hash160 = _ripemd160(sha256d);
  }

  // Version byte 0x00 = mainnet P2PKH
  const versioned = Buffer.concat([Buffer.from([0x00]), hash160]);
  const checksum  = crypto.createHash('sha256')
    .update(crypto.createHash('sha256').update(versioned).digest())
    .digest()
    .slice(0, 4);

  return _base58Encode(Buffer.concat([versioned, checksum]));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * ETH/Linea address for an agent (safe to expose; ERC-20 BRDG uses same address).
 * @param {string} agentId
 * @returns {string} checksummed 0x address
 */
function getEthAddress(agentId) {
  const key    = _deriveEthKey(agentId);
  const wallet = new ethers.Wallet('0x' + key.toString('hex'));
  return wallet.address;
}

/**
 * Bitcoin mainnet P2PKH address for an agent.
 * @param {string} agentId
 * @returns {string} Base58Check address (starts with "1")
 */
function getBtcAddress(agentId) {
  return _btcAddress(_deriveBtcKey(agentId));
}

/**
 * All three addresses for an agent — no key material included.
 * @param {string} agentId
 * @returns {{ agentId, eth, brdg, btc, network }}
 */
function getAddresses(agentId) {
  const eth = getEthAddress(agentId);
  return {
    agentId,
    eth,
    brdg:    eth,          // BRDG is an ERC-20 on Linea — same address as ETH
    btc:     getBtcAddress(agentId),
    network: {
      eth:  'linea-mainnet',
      brdg: 'linea-mainnet',
      btc:  'bitcoin-mainnet',
    },
  };
}

/**
 * A restricted signing interface for an agent's ETH wallet.
 * Only signing/broadcast methods are exposed — the private key is never surfaced.
 * @typedef {Object} RestrictedWallet
 * @property {string} address
 * @property {function(string|Uint8Array): Promise<string>} signMessage
 * @property {function(object): Promise<string>} signTransaction
 * @property {function(object): Promise<import('ethers').TransactionResponse>} sendTransaction
 * @property {import('ethers').Provider|null} provider
 */

/**
 * Returns a restricted signing interface for the agent's ETH identity on Linea.
 * The underlying ethers.Wallet (and its private key) is kept inside the closure
 * and is not reachable by callers.
 * @param {string} agentId
 * @returns {RestrictedWallet}
 */
function getEthWallet(agentId) {
  const key      = _deriveEthKey(agentId);
  const provider = require('./treasury').getProvider();
  const wallet   = new ethers.Wallet('0x' + key.toString('hex'), provider);
  // Return only the methods callers legitimately need; privateKey is not included.
  return {
    address:         wallet.address,
    provider:        wallet.provider,
    signMessage:     (message) => wallet.signMessage(message),
    signTransaction: (tx)      => wallet.signTransaction(tx),
    sendTransaction: (tx)      => wallet.sendTransaction(tx),
  };
}

/**
 * Sign an arbitrary message as the agent's ETH identity (EIP-191).
 * @param {string} agentId
 * @param {string|Uint8Array} message
 * @returns {Promise<string>} hex signature
 */
async function signMessage(agentId, message) {
  return getEthWallet(agentId).signMessage(message);
}

module.exports = { getAddresses, getEthAddress, getBtcAddress, getEthWallet, signMessage };
// _deriveEthKey / _deriveBtcKey are intentionally NOT exported.
