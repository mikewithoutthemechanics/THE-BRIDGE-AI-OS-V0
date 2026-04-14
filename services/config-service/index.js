const express = require('express');
const db = require('./db');
const app = express();
app.use(express.json({ limit: '256kb' }));
app.get('/health', (_q, r) => r.json({ ok: true, service: 'config-service' }));
app.get('/config/:service', (q, r) => {
  const row = db.getLatest(q.params.service);
  if (!row) return r.status(404).json({ error: 'not found' });
  r.json({ service: row.service, version: row.version, payload: JSON.parse(row.payload) });
});
app.post('/config/:service', (q, r) => {
  if (!q.body || typeof q.body !== 'object') return r.status(400).json({ error: 'json body required' });
  const v = db.createVersion(q.params.service, q.body, q.headers['x-author'] || 'system');
  r.status(201).json({ service: q.params.service, version: v });
});
app.post('/config/:service/report', (q, r) => {
  const { instance, effective } = q.body || {};
  if (!instance || !effective) return r.status(400).json({ error: 'instance+effective required' });
  db.reportRuntime(q.params.service, instance, effective);
  r.json({ ok: true });
});
const PORT = process.env.CONFIG_PORT || 4010;
app.listen(PORT, '127.0.0.1', () => console.log('[config-service] 127.0.0.1:' + PORT));
