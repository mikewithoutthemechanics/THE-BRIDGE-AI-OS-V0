const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, 'config.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS config_sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service TEXT NOT NULL, version INTEGER NOT NULL,
    payload TEXT NOT NULL, author TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    UNIQUE(service, version)
  );
  CREATE TABLE IF NOT EXISTS runtime_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service TEXT NOT NULL, instance TEXT NOT NULL,
    effective_config TEXT NOT NULL,
    reported_at INTEGER DEFAULT (strftime('%s','now'))
  );
`);
module.exports = {
  getLatest: (s) => db.prepare('SELECT * FROM config_sets WHERE service=? ORDER BY version DESC LIMIT 1').get(s),
  createVersion: (s, p, a) => {
    const row = db.prepare('SELECT MAX(version) v FROM config_sets WHERE service=?').get(s);
    const n = (row?.v || 0) + 1;
    db.prepare('INSERT INTO config_sets (service,version,payload,author) VALUES (?,?,?,?)').run(s, n, JSON.stringify(p), a || 'system');
    return n;
  },
  reportRuntime: (s, i, e) => db.prepare('INSERT INTO runtime_reports (service,instance,effective_config) VALUES (?,?,?)').run(s, i, JSON.stringify(e)),
  latestRuntime: (s) => db.prepare('SELECT * FROM runtime_reports WHERE service=? ORDER BY reported_at DESC LIMIT 50').all(s),
  allServices: () => db.prepare('SELECT DISTINCT service FROM config_sets').all().map(r => r.service),
};
