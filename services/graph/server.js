'use strict';

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { imageToGraphFromPath } = require('./pipeline');

const PORT = Number(process.env.GRAPH_SERVICE_PORT || 7071);
const HOST = process.env.GRAPH_SERVICE_HOST || '127.0.0.1';
const MAX_BYTES = Number(process.env.GRAPH_MAX_BYTES || 10 * 1024 * 1024);
const INTERNAL_SECRET = process.env.BRIDGE_INTERNAL_SECRET || '';
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']);

if (!process.env.OPENAI_API_KEY) {
  console.error('[graph-service] OPENAI_API_KEY missing — refusing to start');
  process.exit(1);
}
if (!INTERNAL_SECRET) {
  console.error('[graph-service] BRIDGE_INTERNAL_SECRET missing — refusing to start');
  process.exit(1);
}

const upload = multer({
  dest: path.join(os.tmpdir(), 'bridge-graph'),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new Error(`unsupported mime: ${file.mimetype}`));
      return;
    }
    cb(null, true);
  }
});

const app = express();

app.use((req, res, next) => {
  if (req.path === '/healthz') return next();
  if (req.get('x-internal-secret') !== INTERNAL_SECRET) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  next();
});

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, service: 'graph', port: PORT });
});

app.post('/image-to-graph', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'no image field' });
  const tmpPath = req.file.path;
  try {
    const graph = await imageToGraphFromPath(tmpPath, req.file.mimetype);
    res.json({ ok: true, ...graph });
  } catch (err) {
    console.error('[graph-service]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  } finally {
    fs.unlink(tmpPath, () => {});
  }
});

app.use((err, _req, res, _next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ ok: false, error: 'image exceeds max size' });
  }
  res.status(400).json({ ok: false, error: err.message || 'bad request' });
});

app.listen(PORT, HOST, () => {
  console.log(`[graph-service] listening on http://${HOST}:${PORT} (max ${MAX_BYTES} bytes)`);
});
