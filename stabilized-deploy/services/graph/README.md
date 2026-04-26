# bridge-graph-service

Isolated image → graph extraction service. Runs out-of-process from the main gateway so OpenAI calls and image I/O don't block the request path.

## Run

```bash
cd services/graph
npm install
cp .env.example .env   # fill in OPENAI_API_KEY + BRIDGE_INTERNAL_SECRET
npm start
```

Binds to `127.0.0.1:7071` by default — not reachable from outside the host.

## Endpoints

### `GET /healthz`
Unauthenticated. Returns `{ ok: true, service: "graph", port }`.

### `POST /image-to-graph`
Authenticated via `X-Internal-Secret: <BRIDGE_INTERNAL_SECRET>`.
Multipart body with field name `image`. Max 10 MB. Allowed MIMEs: `png jpeg webp gif svg+xml`.

Response:
```json
{
  "ok": true,
  "nodes": [{ "id": "decode", "label": "Decode", "type": "process" }],
  "edges": [{ "from": "decode", "to": "parse", "label": "next" }],
  "semantic": {
    "node_count": 2,
    "edge_count": 1,
    "density": 0.5,
    "extracted_at": "2026-04-19T21:35:00.000Z"
  }
}
```

## Gateway integration

In your main Express gateway (`C:/aoe-unified-final/server.js`), add a reverse-proxy route **before** the BRAIN catch-all and **after** the auth middleware. Also add `/api/graph` to the auth allowlist.

```js
// near other lib imports
const { createProxyMiddleware } = require('http-proxy-middleware');

// with other app.use(...) mounts, BEFORE the BRAIN catch-all:
app.use('/api/graph', createProxyMiddleware({
  target: 'http://127.0.0.1:7071',
  changeOrigin: false,
  pathRewrite: { '^/api/graph': '' },
  onProxyReq: (proxyReq) => {
    // inject the internal secret so the graph service accepts the call
    proxyReq.setHeader('x-internal-secret', process.env.BRIDGE_INTERNAL_SECRET);
  }
}));
```

And at the auth allowlist (memory notes this is ~line 950 of `server.js`), add `/api/graph` to the prefix set so the global middleware lets it through to your user-auth layer (which still runs before the proxy mount above).

## PM2

```
pm2 start services/graph/server.js --name graph-service --cwd /root/aoe-unified-final-main
pm2 save
```

## Invariants

- `OPENAI_API_KEY` and `BRIDGE_INTERNAL_SECRET` required at boot — process exits if missing.
- Temp files written to OS tmp and deleted in `finally`.
- OpenAI output is validated by JSON schema — no fragile line parsing.
