// settings-store.js — file-backed persistence for runtime settings
//
// Reads:  data/settings.runtime.json  (gitignored; created on first write)
// Writes: atomic (write-to-temp + rename) so a crash can't corrupt the store.
//
// This module is intentionally minimal and synchronous — the store is small
// (<< 1 MB) and the server is single-process. If the store ever grows past
// a few MB, swap this for the Postgres migration in db/migrations/001_settings.sql.

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const STORE_PATH = path.join(ROOT, 'data', 'settings.runtime.json');

const EMPTY_STORE = {
  version: 1,
  users: {},
  audit: []
};

function ensureDir(){
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function load(){
  try{
    ensureDir();
    if (!fs.existsSync(STORE_PATH)) return structuredClone(EMPTY_STORE);
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const obj = JSON.parse(raw);
    // Defensive: guarantee shape even if operator hand-edited the file.
    obj.users = obj.users || {};
    obj.audit = obj.audit || [];
    return obj;
  } catch(e){
    // Don't silently drop a corrupted store — surface it loudly.
    throw new Error(`settings-store: failed to load ${STORE_PATH}: ${e.message}`);
  }
}

function save(store){
  ensureDir();
  const tmp = STORE_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, STORE_PATH);
}

// Append an audit entry and trim to the retention limit.
function appendAudit(store, entry, maxEntries){
  const max = Number.isFinite(maxEntries) && maxEntries > 0 ? maxEntries : 10000;
  store.audit.push({
    ts: new Date().toISOString(),
    ...entry
  });
  if (store.audit.length > max){
    store.audit = store.audit.slice(-max);
  }
}

function isSuperAdmin(store, email){
  const u = store.users[String(email || '').toLowerCase()];
  return !!(u && u.tier === 'super_admin');
}

function listSuperAdmins(store){
  return Object.entries(store.users)
    .filter(([,u]) => u.tier === 'super_admin')
    .map(([email]) => email);
}

module.exports = {
  STORE_PATH,
  load,
  save,
  appendAudit,
  isSuperAdmin,
  listSuperAdmins,
};
