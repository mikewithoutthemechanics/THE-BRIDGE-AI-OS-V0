# Bridge AI OS — VPS deployment

Upstream repo: [github.com/bridgeaios/THE-BRIDGE-AI-OS-V0](https://github.com/bridgeaios/THE-BRIDGE-AI-OS-V0).

There are **two** VPS-related setups in that monorepo — do not mix them up:

---

## A) Canonical production deploy (GitHub Actions → SSH → PM2)

This is the **existing** automate path wired to CI.

| Piece | Location / meaning |
|--------|---------------------|
| **Workflow** | [`.github/workflows/deploy-vps.yml`](https://github.com/bridgeaios/THE-BRIDGE-AI-OS-V0/blob/main/.github/workflows/deploy-vps.yml) |
| **GitHub secrets** | **`VPS_HOST`**, **`VPS_USER`**, **`VPS_PASSWORD`** (SSH), **`GH_PAT`** (clone/pull), optional **`VPS_ENV_BLOB`** (base64 env injection) |
| **Server checkout** | `DEPLOY_DIR=/var/www/bridgeai` — matches **`VPS_HOST`** / **`REPO_PATH`** in [`.env.example`](https://github.com/bridgeaios/THE-BRIDGE-AI-OS-V0/blob/main/.env.example) (`REPO_PATH=/var/www/bridgeai`) |
| **Frontend build on VPS** | **`frontend/`** (root app), *not* `web/` |
| **Runtime** | `npm install` at repo root, **`pm2 restart`** services (`bridge-gateway`, `super-brain`, `unified-server`, etc.), optional **`scripts/update-nginx.sh`**, **`certbot`** for TLS domains |

Flow: Actions builds/lints **`frontend/`** on the runner for validation, then SSH runs `git fetch` + `reset --hard origin/main`, rebuilds **`frontend/`** on the server, merges secrets into `.env`, restarts PM2, updates nginx/TLS.

---

## B) Docker-only stack (`web/` + `docker-compose.vps.yml`)

Self-contained Compose for a **minimal** SPA + **`bridge-api`** (no PM2 — uses containers only).

Compose services:

| Service name in YAML | Purpose |
|----------------------|---------|
| **`frontend`** | **Container** — nginx alpine, built from **`Dockerfile.frontend`** (sources **`web/dist`**) |
| **`bridge-api`** | **Container** — Node **`docker/vps/launch.js`** on port **3000** on the Docker network |

Files:

- **`docker-compose.vps.yml`** — published host port **`VPS_HTTP_PORT`** (default **80**) → nginx **80**
- **`docker/vps/Dockerfile.api`** + **`docker/vps/launch.js`**
- **`Dockerfile.frontend`**, **`nginx/nginx.vps.conf`** — SPA + proxy **`/health`**, **`/api/`** → `bridge-api:3000`

### Prerequisites (Docker path only)

- Docker Engine **24+** and Docker Compose **v2**
- Firewall: **`VPS_HTTP_PORT`** (often **80**)

### Setup

```bash
git clone https://github.com/bridgeaios/THE-BRIDGE-AI-OS-V0.git
cd THE-BRIDGE-AI-OS-V0
cp .env.example .env   # optional: VPS_HTTP_PORT=8080 if 80 is busy
docker compose -f docker-compose.vps.yml up -d --build
```

**URLs:** `http://YOUR_VPS_IP/` (SPA), **`/health`** (JSON via nginx).

### Local **`web/`** only (no Docker)

```bash
npm run frontend:install
npm run frontend:build
npm run frontend:dev    # proxies /health → localhost:3000 (see web/vite.config.js)
```

---

## CI template (Docker **`web/`** stack)

Copy **`docs/ci/frontend-vps-ci.yml`** → **`.github/workflows/frontend-vps-ci.yml`** if your PAT has **`workflow`** scope (HTTPS push restriction).

Equivalent locally:

```bash
( cd web && npm ci && npm run build )
docker compose -f docker-compose.vps.yml config
```

---

## Related scripts (monorepo)

Other VPS helpers may exist beside CI — e.g. **`scripts/deploy_vps.sh`**, **`deploy-to-vps.sh`**, **`VPS-DEPLOYMENT-README.md`** — read those before changing production SSH or paths.
