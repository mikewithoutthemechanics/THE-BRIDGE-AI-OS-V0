// lib/oauth-google.js — Google OAuth 2.0 authorization-code flow, stdlib-only.
//
// Matches the zero-dep design of orchestra-server.js: no passport, no express,
// no session store. On successful callback we delegate session issuance to
// lib/session.js so the rest of the control plane recognizes the login.
//
// Flow:
//   1. GET /auth/google           -> build authorize URL, set signed state
//                                    cookie, 302 to accounts.google.com
//   2. GET /auth/google/callback  -> verify state, exchange code for tokens,
//                                    fetch userinfo, enforce super-admin
//                                    allowlist, issue bridge_admin_session.
//   3. GET /auth/logout           -> clear cookies, 302 to /.
//
// Required env:
//   GOOGLE_OAUTH_CLIENT_ID
//   GOOGLE_OAUTH_CLIENT_SECRET
//   GOOGLE_OAUTH_REDIRECT_URI   e.g. https://go.ai-os.co.za/auth/google/callback
//
// Optional:
//   GOOGLE_OAUTH_POST_LOGIN     path to redirect to after login (default /settings/admin)

const https  = require('https');
const crypto = require('crypto');
const session = require('./session');

const STATE_COOKIE = 'bridge_oauth_state';
const STATE_TTL_S  = 600;

function config(){
  return {
    clientId:     process.env.GOOGLE_OAUTH_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || '',
    redirectUri:  process.env.GOOGLE_OAUTH_REDIRECT_URI || '',
    postLogin:    process.env.GOOGLE_OAUTH_POST_LOGIN || '/settings/admin',
  };
}

function configured(){
  const c = config();
  return !!(c.clientId && c.clientSecret && c.redirectUri);
}

function stateSecret(adminToken){
  if (process.env.ORCHESTRA_SESSION_SECRET) return process.env.ORCHESTRA_SESSION_SECRET + ':oauth';
  if (adminToken) return 'bridge-oauth-v1-' + adminToken;
  if (!global.__BRIDGE_OAUTH_FALLBACK_SECRET){
    global.__BRIDGE_OAUTH_FALLBACK_SECRET = crypto.randomBytes(32).toString('hex');
  }
  return global.__BRIDGE_OAUTH_FALLBACK_SECRET;
}

function b64url(buf){
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

function signState(nonce, adminToken){
  const payload = b64url(JSON.stringify({ n: nonce, e: Math.floor(Date.now()/1000) + STATE_TTL_S }));
  const sig = b64url(crypto.createHmac('sha256', stateSecret(adminToken)).update(payload).digest());
  return payload + '.' + sig;
}

function verifyState(token, adminToken){
  if (!token || typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig     = token.slice(dot + 1);
  const expected = b64url(crypto.createHmac('sha256', stateSecret(adminToken)).update(payload).digest());
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload.replace(/-/g,'+').replace(/_/g,'/'), 'base64').toString('utf8'));
    if (Math.floor(Date.now()/1000) > data.e) return null;
    return data;
  } catch { return null; }
}

function writeJson(res, status, body, extraHeaders = {}){
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...extraHeaders });
  res.end(JSON.stringify(body));
}

function handleStart(req, res, { adminToken, secure }){
  if (!configured()){
    return writeJson(res, 503, {
      ok: false,
      error: 'oauth_not_configured',
      need: ['GOOGLE_OAUTH_CLIENT_ID','GOOGLE_OAUTH_CLIENT_SECRET','GOOGLE_OAUTH_REDIRECT_URI'],
    });
  }
  const c = config();
  const nonce = crypto.randomBytes(16).toString('hex');
  const state = signState(nonce, adminToken);
  const params = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: c.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  });
  const authorizeUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  const cookie = `${STATE_COOKIE}=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${STATE_TTL_S}${secure ? '; Secure' : ''}`;
  res.writeHead(302, { 'location': authorizeUrl, 'set-cookie': cookie, 'cache-control': 'no-store' });
  res.end();
}

function httpsPostForm(host, path, form){
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(form).toString();
    const req = https.request({
      host, port: 443, method: 'POST', path,
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'content-length': Buffer.byteLength(body),
        'accept': 'application/json',
      },
      timeout: 8000,
    }, r => {
      const chunks = [];
      r.on('data', d => chunks.push(d));
      r.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        try { resolve({ status: r.statusCode, json: JSON.parse(raw), raw }); }
        catch { resolve({ status: r.statusCode, json: null, raw }); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('google_token_timeout')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function httpsGet(host, path, headers){
  return new Promise((resolve, reject) => {
    const req = https.request({ host, port: 443, method: 'GET', path, headers, timeout: 8000 }, r => {
      const chunks = [];
      r.on('data', d => chunks.push(d));
      r.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        try { resolve({ status: r.statusCode, json: JSON.parse(raw), raw }); }
        catch { resolve({ status: r.statusCode, json: null, raw }); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('google_userinfo_timeout')));
    req.on('error', reject);
    req.end();
  });
}

async function handleCallback(req, res, { adminToken, secure, store }){
  if (!configured()){
    return writeJson(res, 503, { ok: false, error: 'oauth_not_configured' });
  }
  const c = config();
  const url = new URL(req.url, `http://${req.headers.host || 'local'}`);
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');
  const oauthErr = url.searchParams.get('error');
  if (oauthErr){
    return writeJson(res, 400, { ok: false, error: 'google_denied', detail: oauthErr });
  }
  if (!code || !returnedState){
    return writeJson(res, 400, { ok: false, error: 'missing_code_or_state' });
  }

  // state CSRF — cookie-issued state must equal returned state, and must verify.
  const cookies = session.parseCookies(req);
  const cookieState = cookies[STATE_COOKIE];
  if (!cookieState || cookieState !== returnedState){
    return writeJson(res, 400, { ok: false, error: 'state_mismatch' });
  }
  if (!verifyState(returnedState, adminToken)){
    return writeJson(res, 400, { ok: false, error: 'state_invalid_or_expired' });
  }

  // exchange code for tokens
  let tokenRes;
  try {
    tokenRes = await httpsPostForm('oauth2.googleapis.com', '/token', {
      code,
      client_id: c.clientId,
      client_secret: c.clientSecret,
      redirect_uri: c.redirectUri,
      grant_type: 'authorization_code',
    });
  } catch(e){
    return writeJson(res, 502, { ok: false, error: 'token_exchange_failed', detail: String(e.message || e) });
  }
  if (tokenRes.status !== 200 || !tokenRes.json || !tokenRes.json.access_token){
    return writeJson(res, 502, { ok: false, error: 'token_exchange_rejected', status: tokenRes.status, detail: tokenRes.json || tokenRes.raw });
  }

  // fetch userinfo (openid scope gives email + verified flag)
  let infoRes;
  try {
    infoRes = await httpsGet('openidconnect.googleapis.com', '/v1/userinfo', {
      authorization: 'Bearer ' + tokenRes.json.access_token,
      accept: 'application/json',
    });
  } catch(e){
    return writeJson(res, 502, { ok: false, error: 'userinfo_failed', detail: String(e.message || e) });
  }
  if (infoRes.status !== 200 || !infoRes.json || !infoRes.json.email){
    return writeJson(res, 502, { ok: false, error: 'userinfo_rejected', status: infoRes.status });
  }
  if (infoRes.json.email_verified === false){
    return writeJson(res, 403, { ok: false, error: 'email_unverified' });
  }

  const email = String(infoRes.json.email).toLowerCase().trim();

  // super-admin allowlist — identical gate to POST /settings/session.
  // Anyone outside the allowlist is rejected: Google auth proves identity,
  // store.users[].tier === 'super_admin' grants control-plane access.
  if (store){
    const s = store.load();
    if (!store.isSuperAdmin(s, email)){
      return writeJson(res, 403, { ok: false, error: 'not_super_admin', actor: email });
    }
    try {
      store.appendAudit(s, { actor: email, action: 'session_issued_google_oauth', target: email });
      store.save(s);
    } catch { /* audit failure is non-fatal */ }
  }

  const issued = session.issueSession({ email, adminToken, secure });
  const clearState = `${STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  res.writeHead(302, {
    'location': c.postLogin,
    'set-cookie': [...issued.cookies, clearState],
    'cache-control': 'no-store',
  });
  res.end();
}

function handleLogout(req, res){
  const clearState = `${STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  res.writeHead(302, {
    'location': '/',
    'set-cookie': [...session.clearSession(), clearState],
    'cache-control': 'no-store',
  });
  res.end();
}

module.exports = {
  configured,
  handleStart,
  handleCallback,
  handleLogout,
};
