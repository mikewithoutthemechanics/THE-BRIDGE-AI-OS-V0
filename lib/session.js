// lib/session.js — signed-cookie admin session for the Bridge AI OS control plane.
//
// Design:
//   - Session cookie `bridge_admin_session` is HttpOnly + signed HMAC-SHA256.
//     Encodes {email, exp}. Browser cannot read; JS cannot exfiltrate.
//   - CSRF cookie `bridge_csrf` is readable by JS (same origin). Frontend
//     mirrors it into an `X-CSRF-Token` header on state-changing requests —
//     classic double-submit pattern. Attacker cross-origin can't forge the
//     header because SameSite=Strict prevents the session cookie from going
//     along with a cross-site request in the first place.
//   - Secret derivation: ORCHESTRA_SESSION_SECRET wins, else derived from
//     ORCHESTRA_ADMIN_TOKEN, else a random per-boot fallback (sessions die
//     on restart — acceptable, operator just re-logs-in).

const crypto = require('crypto');

const COOKIE_SESSION = 'bridge_admin_session';
const COOKIE_CSRF    = 'bridge_csrf';
const DEFAULT_TTL_S  = 3600;

function getSecret(adminToken){
  if (process.env.ORCHESTRA_SESSION_SECRET) return process.env.ORCHESTRA_SESSION_SECRET;
  if (adminToken) return 'bridge-os-session-v1-' + adminToken;
  if (!global.__BRIDGE_SESSION_FALLBACK_SECRET){
    global.__BRIDGE_SESSION_FALLBACK_SECRET = crypto.randomBytes(32).toString('hex');
  }
  return global.__BRIDGE_SESSION_FALLBACK_SECRET;
}

function b64url(buf){
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function b64urlDecode(s){
  s = String(s).replace(/-/g,'+').replace(/_/g,'/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}

function sign(payload, secret){
  return b64url(crypto.createHmac('sha256', secret).update(payload).digest());
}

function encodeSession({ email, exp }, secret){
  const payload = b64url(JSON.stringify({ email, exp }));
  return payload + '.' + sign(payload, secret);
}

function decodeSession(cookie, secret){
  if (!cookie || typeof cookie !== 'string') return null;
  const dot = cookie.indexOf('.');
  if (dot < 0) return null;
  const payload = cookie.slice(0, dot);
  const sig     = cookie.slice(dot + 1);
  if (!payload || !sig) return null;
  const expected = sign(payload, secret);
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(b64urlDecode(payload).toString('utf8'));
    if (!data.email || !data.exp) return null;
    if (Date.now() >= data.exp * 1000) return null;
    return data;
  } catch { return null; }
}

function parseCookies(req){
  const h = req.headers.cookie;
  if (!h) return {};
  const out = {};
  for (const part of String(h).split(';')){
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function issueSession({ email, adminToken, ttlSec, secure }){
  const ttl = ttlSec || DEFAULT_TTL_S;
  const exp = Math.floor(Date.now()/1000) + ttl;
  const token = encodeSession({ email, exp }, getSecret(adminToken));
  const csrf  = crypto.randomBytes(16).toString('hex');
  const secureFlag = secure ? '; Secure' : '';
  const cookies = [
    `${COOKIE_SESSION}=${token}; Path=/; HttpOnly; SameSite=Strict${secureFlag}; Max-Age=${ttl}`,
    `${COOKIE_CSRF}=${csrf}; Path=/; SameSite=Strict${secureFlag}; Max-Age=${ttl}`,
  ];
  return { cookies, csrf, exp, email };
}

function clearSession(){
  return [
    `${COOKIE_SESSION}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`,
    `${COOKIE_CSRF}=; Path=/; SameSite=Strict; Max-Age=0`,
  ];
}

function verifySession(req, adminToken){
  const c = parseCookies(req);
  return decodeSession(c[COOKIE_SESSION], getSecret(adminToken));
}

function verifyCsrf(req){
  const c = parseCookies(req);
  const headerVal = req.headers['x-csrf-token'];
  if (!c[COOKIE_CSRF] || !headerVal) return false;
  const a = Buffer.from(c[COOKIE_CSRF]);
  const b = Buffer.from(String(headerVal));
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(a, b); } catch { return false; }
}

module.exports = {
  COOKIE_SESSION, COOKIE_CSRF, DEFAULT_TTL_S,
  issueSession, clearSession, verifySession, verifyCsrf, parseCookies,
};
