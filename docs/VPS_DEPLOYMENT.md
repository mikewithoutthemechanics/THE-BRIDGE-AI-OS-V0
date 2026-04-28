# Bridge AI OS — VPS deployment

This repo includes a **`web/` Vite frontend** and **`docker-compose.vps.yml`** to run:

- **`frontend`** — nginx serves the built SPA and proxies **`/health`** and **`/api/`** to the API container.
- **`bridge-api`** — Node entry (`launch.js`) on port **3000** inside the Docker network.

Official repository: [github.com/bridgeaios/THE-BRIDGE-AI-OS-V0](https://github.com/bridgeaios/THE-BRIDGE-AI-OS-V0).

## Prerequisites

- Ubuntu 22.04+ (or similar) on the VPS
- Docker Engine **24+** and Docker Compose **v2** (`docker compose`)
- Firewall: allow **80/tcp** (or whatever you set for `VPS_HTTP_PORT`)

## One-time setup

```bash
git clone https://github.com/bridgeaios/THE-BRIDGE-AI-OS-V0.git
cd THE-BRIDGE-AI-OS-V0
cp .env.example .env
# Optional: set VPS_HTTP_PORT=8080 in .env if port 80 is taken
```

## Build and run

From the repository root:

```bash
docker compose -f docker-compose.vps.yml up -d --build
```

- **Dashboard (SPA):** `http://YOUR_VPS_IP/` (or `http://YOUR_VPS_IP:VPS_HTTP_PORT/`)
- **Health (JSON, via nginx):** `http://YOUR_VPS_IP/health`
- The API is not published on the host by default; use nginx paths above or add a `ports` mapping to `bridge-api` for debugging.

## Local frontend only (no Docker)

```bash
npm run frontend:install
npm run frontend:build
# or during development:
npm run frontend:dev
```

With the API running on `localhost:3000`, Vite dev server proxies `/health` and `/api` (see `web/vite.config.js`).

## CI

Automation template is **`docs/ci/frontend-vps-ci.yml`** — copy it to **`.github/workflows/frontend-vps-ci.yml`** (or add via Actions UI). Pushing workflows via HTTPS requires a token with **`workflow`** scope.

```bash
( cd web && npm ci && npm run build )
docker compose -f docker-compose.vps.yml config
```

## Related

- **`docker/vps/Dockerfile.api`** + **`docker/vps/launch.js`** — minimal API image for `bridge-api` (independent of the repo root `Dockerfile` / `brain.js` stack)
- **`Dockerfile.frontend`** — multi-stage build: Vite → nginx
- **`nginx/nginx.vps.conf`** — SPA `try_files` + `proxy_pass` to `bridge-api:3000`
