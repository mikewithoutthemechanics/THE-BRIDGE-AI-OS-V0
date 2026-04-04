# FULL SYSTEM AUDIT — BridgeAI Ecosystem
**Date:** 2026-04-01 | **Owner:** Supas (ryanehsacoza) | **Status:** Live

---

## I. DRIVE INVENTORY & STORAGE ALLOCATION

### **C: Drive (Windows System + Project Root)**
Primary development and system drive. **~500GB+ occupied**

#### Tier 1: Git Repos (Primary Development)
```
c:\
├── .git/ (main repo)
├── .claude/ (Claude Code settings & memory)
├── aoe-unified-final/ ⭐ ACTIVE
│   ├── deploy-vps.sh (VPS deployment script)
│   ├── docker-compose.yml (containerization)
│   ├── package.json (Node.js services)
│   ├── brain.js (125KB — core AI orchestrator)
│   ├── gateway.js (40KB — public API gateway)
│   ├── auth.js (auth microservice)
│   ├── server.js (44KB — main server)
│   ├── ecosystem.config.js (PM2 config)
│   └── cloudflared/ (Cloudflare tunnel config)
│
├── bridge/ (legacy, minimal)
├── bridge-state-authority/ (state machine service)
├── bridge-ubi/ (UBI pilot)
├── bridge_local/ (local testing)
├── bridgeos/ (OS-level integration)
│
└── BridgeAI/ (local mirror)
    ├── BRIDGE_AI_OS/ (docs & releases)
    ├── BridgeAudit/ (audit logs)
    └── BridgeLife/ (health integration)
```

#### Tier 2: Infrastructure & Tools
```
c:\
├── Program Files/ (Node, Python, VSCode, Git, etc.)
├── Program Files (x86)/ (32-bit utilities)
├── ProgramData/ (Windows services, app data)
└── Windows/ (system files)
```

#### Tier 3: Project Documentation
```
c:\aoe-unified-final\
├── SYSTEM-GUIDE.md (this file predecessor)
├── DEPLOYMENT_CHECKLIST.md
├── CLOUD_ARCHITECTURE.md
├── CLOUD_SETUP.md
├── SUPADASH_*.md (20+ setup guides)
├── CONSOLIDATION_PLAN.md
├── DISTRIBUTED_ORCHESTRATION.md
└── 50+ procedural docs
```

**Key Files on C:**
- `.env` (550 bytes — encrypted references only)
- `users.db` (SQLite user sessions — upload to VPS during deploy)
- Port assignment config: `port-assignments.json`

---

### **E: Drive (Primary Development & Microservices)**
Development workstation. **~200GB occupied**

#### Tier 1: BridgeAI Ecosystem (Active)
```
E:\
├── BridgeAI/ ⭐⭐ MAIN STACK
│   ├── BridgeLiveWall/ ⭐⭐⭐ PRIMARY SERVICE
│   │   ├── backend/
│   │   │   ├── app/
│   │   │   │   ├── routes/
│   │   │   │   │   ├── charts.py
│   │   │   │   │   ├── controlplane.py
│   │   │   │   │   ├── observability.py
│   │   │   │   │   └── webhooks.py
│   │   │   │   ├── services/ (business logic layer)
│   │   │   │   ├── middleware/ (request/response handlers)
│   │   │   │   ├── core/ (abstractions)
│   │   │   │   ├── models/ (data models)
│   │   │   │   ├── defi/ (payment/token logic)
│   │   │   │   ├── domains/ (domain-specific modules)
│   │   │   │   ├── memory/ (agent memory system)
│   │   │   │   ├── orchestration/ (workflow engine)
│   │   │   │   └── websockets/ (real-time events)
│   │   │   └── main.py (FastAPI entry point)
│   │   │
│   │   ├── frontend/ (React/TypeScript)
│   │   │   ├── index.html (3D Digital Twin UI)
│   │   │   ├── login.html (SIWE/JWT auth)
│   │   │   ├── dashboard.html (user overview)
│   │   │   ├── admin.html (admin panel)
│   │   │   ├── controlplane.html (system control)
│   │   │   ├── crm.html (customer management)
│   │   │   ├── leads.html (lead tracking)
│   │   │   └── [9 additional UI modules]
│   │   │
│   │   └── .env (FastAPI config & secrets)
│   │
│   ├── svg-engine/ (Python skill system)
│   │   ├── core/ (component base)
│   │   ├── skills/ (1,266+ skill modules)
│   │   ├── api/ (skill API layer)
│   │   └── teaching/ (educational materials)
│   │
│   ├── FullStack/ (Node.js services)
│   ├── service-registry.json (7 services defined)
│   ├── env-unified-index.json (config audit)
│   ├── SYSTEM-GUIDE.md (36KB user guide)
│   ├── STARTUP-CHECKLIST.md (bootstrap sequence)
│   ├── MASTER.xlsx (project tracker)
│   └── [10+ documentation files]
│
├── BridgeLiveWall/ (symlink: → E:\BridgeAI\BridgeLiveWall)
├── FullStack/
├── svg-engine/
│
└── [AAA, SVG's, node7/ — archived/test services]
```

**E: Drive Database State**
```
E:\BridgeAI\BridgeLiveWall\.bridge-state\
├── defi.db (SQLite — DeFi transactions, token state)
├── users.db (SQLite — authentication state)
└── [session files, cached state]
```

---

### **D: Drive (Archive & Alternative Implementations)**
Development archive & iteration history. **~100GB+ occupied**

#### Tier 1: Previous Generation Releases
```
D:\
├── BAIOS-V1/ (v1 bootstrap, archived)
├── BAIOS-V1_BACKUP/ (backup copy)
├── AI-OS-V1/ (v1 iteration)
├── bridge-ai-os/ (previous main stack)
├── BRIDGE/ (prior attempt)
├── BridgeAI/ (archive copy)
│
└── [50+ backup directories from prior iterations]
```

#### Tier 2: Archive & Documentation
```
D:\
├── BridgeAI_APPROVAL_INBOX/ (decision artifacts)
├── BridgeAI_Archives/ (historical builds)
├── BridgeAI_WITNESS/ (audit trails)
├── BRIDGE_AI_OS_DEPLOY_ARCHIVE.zip (full snapshot v1.0)
├── DOCKER_CLEANUP_QUICK_START.md
├── BOOTSTRAP_INTELLIGENCE_INTEGRATION.md
└── [30+ procedural/architectural docs]
```

#### Tier 3: Config & Environment Files
```
D:\
├── .env (encrypted fallback env)
├── .env.unified (28KB master config reference)
├── [various .env files from different stacks]
└── BAIOS-V1\
    └── infra\
        └── whatsapp.env (WhatsApp integration config)
```

**Notable:** D: contains previous architecture iterations. C: and E: are the active deployment targets.

---

## II. VPS INFRASTRUCTURE — `go.ai-os.co.za`

### **Host Details**
- **Provider:** Webway VPS
- **IP Addresses:** 
  - Primary: `102.208.231.53`
  - Secondary: `102.208.228.44`
- **Deployment Path:** `/var/www/bridgeai/`
- **Domain:** `go.ai-os.co.za` (production, always-on backend)
- **OS:** Ubuntu 20.04 LTS or later

### **VPS Services Running**
| Service | Port | Status | Command | PM2 App |
|---------|------|--------|---------|---------|
| Frontend (React) | 3000 | Deployed | PM2 | system |
| Monitor/API | 3001 | Deployed | PM2 | monitor |
| **Nginx (reverse proxy)** | 80, 443 | Active | systemd | N/A |
| PM2 Daemon | — | Active | systemd | N/A |

### **VPS Configuration Files**
Located on VPS at:
```
/var/www/bridgeai/
├── .env (production environment — manually uploaded)
├── users.db (user session database)
├── ecosystem.config.js (PM2 app configuration)
├── [all project files synced via rsync]
└── logs/ (application logs directory)
```

### **Nginx Reverse Proxy Setup**
**Config location:** `/etc/nginx/sites-available/bridgeai`

```nginx
server {
    listen 80;
    listen 443 ssl http2;
    server_name go.ai-os.co.za www.go.ai-os.co.za;

    # SSL Certificate (auto-renewed via certbot)
    ssl_certificate /etc/letsencrypt/live/go.ai-os.co.za/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/go.ai-os.co.za/privkey.pem;

    # Main app (port 3000)
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;  # 24hr timeout for WebSocket
    }

    # Monitor/API (port 3001)
    location /monitor/ {
        proxy_pass http://localhost:3001/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### **UFW Firewall (VPS)**
```bash
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
```

### **Deployment Process**
Automated via `/c/aoe-unified-final/deploy-vps.sh`:

```bash
# 1. SSH + remote setup (Node, PM2, Nginx, Certbot)
# 2. Rsync project files (exclude node_modules, .git, .env)
# 3. Upload .env.production → .env
# 4. Upload users.db
# 5. npm ci --omit=dev (install deps)
# 6. Run migrations (if any)
# 7. PM2 start/reload ecosystem.config.js
# 8. Configure Nginx reverse proxy
# 9. Run: certbot --nginx -d go.ai-os.co.za
# 10. Enable UFW firewall
```

**Usage:**
```bash
bash deploy-vps.sh 102.208.231.53 root
```

---

## III. DOMAIN & SUBDOMAIN MAPPING (26 Active Domains)

### **Primary Domains**

| # | Domain | Subdomain | Function | Service | Port | Status |
|---|--------|-----------|----------|---------|------|--------|
| 1 | `bridge-ai-os.com` | — | Primary domain | All services | 443 | ✅ Live |
| 2 | `bridge-ai-os.com` | `abaas` | Admin control tower | ABAAS UI | 3000 | ✅ Live |
| 3 | `bridge-ai-os.com` | `god` | GOD MODE (topology) | Terminal Grid | 3001 | ✅ Live |
| 4 | `bridge-ai-os.com` | `live` | Live Wall (main UI) | React Frontend | 3000 | ✅ Live |
| 5 | `bridge-ai-os.com` | `svg` | SVG Engine (skills) | Python API | 7070 | ✅ Dev |
| 6 | `bridge-ai-os.com` | `brain` | Super Brain API | AI Endpoints | 8000 | ✅ Live |
| 7 | `bridge-ai-os.com` | `terminal` | Web Terminal | CLI Access | 5000 | ✅ Live |
| 8 | `bridge-ai-os.com` | `auth` | Auth Service | SIWE/JWT | 5001 | ✅ Live |
| 9 | `bridge-ai-os.com` | `grafana` | Monitoring | Grafana | 3000 | ✅ Live |
| 10 | `bridge-ai-os.tech` | — | API worker alias | FastAPI | 8000 | ✅ Live |
| 11 | `bridge-ai-os.tech` | `api` | REST API | FastAPI | 8000 | ✅ Live |
| 12 | `bridge-ai-os.tech` | `spine` | SPINE (state mutations) | State API | 8001 | ⚙️ Testing |
| 13 | `bridge-ai-os.co.za` | — | SA variant alias | All services | 443 | ✅ Live |
| 14 | `bridge-ai-os.co.za` | `gateway` | Public gateway | Gateway.js | 8080 | ✅ Live |
| 15 | `bridge-ai-os.co.za` | — (none) | — | **go.ai-os.co.za** | 443 | ✅ **VPS** |
| 16 | `bridge-ai-os.org` | — | Alias to .com | Redirect | 443 | ✅ Live |
| 17 | `bridge-ai-os.xyz` | — | Alias to .com | Redirect | 443 | ✅ Live |
| 18 | `ai-os.co.za` | — | Treasury (Zero Trust) | Internal Finance | 8888 | 🔒 Admin |

### **SUPAC Ecosystem (Supaclaw Variant)**

| # | Domain | Function | Service | Status |
|---|--------|----------|---------|--------|
| 19 | `supaco.ai` | Primary API + Auth | JWT + REST | ✅ Live |
| 20 | `supaco.io` | Marketing alias | Landing page | ✅ Live |
| 21 | `supaco.co.za` | SA variant | Regional alias | ✅ Live |
| 22 | `supaco.team` | Brand protection | DNS parking | ✅ Reserved |
| 23 | `supaco.tech` | Brand protection | DNS parking | ✅ Reserved |
| 24 | `supaco.xyz` | Brand protection | DNS parking | ✅ Reserved |

### **Vertical Domain Registrations (26-31)**

| # | Domain | Purpose | Audience | Status |
|---|--------|---------|----------|--------|
| 25 | `ban.systems` | BAN (Blockchain Autonomous Network) | Users | ✅ Live |
| 26 | `bridgeautonomous.network` | BAN branded | Users | ✅ Live |
| 27 | `ehsa.bridge-ai-os.com` | EHSA (Health Services) | Health sector | ✅ Live |
| 28 | `hospital.bridge-ai-os.com` | Hospital in a Box | Healthcare | ✅ Live |
| 29 | `aid.bridge-ai-os.com` | Bridge AID (Humanitarian) | NGOs | ✅ Live |
| 30 | `ubi.bridge-ai-os.com` | UBI (Universal Basic Income) | Social | ✅ Live |
| 31 | `aurora.bridge-ai-os.com` | Aurora (Energy/Sustainability) | Green sector | ✅ Live |
| 32 | `rooted.bridge-ai-os.com` | Rooted Earth (Agriculture) | Farmers | ✅ Live |

### **Vercel Deployments**

| # | Domain | Status |
|---|--------|--------|
| 33 | `app.supaco.ai` | ✅ Vercel deployment (React frontend) |

---

## IV. SYSTEM ARCHITECTURE & DATA FLOW

### **High-Level System Topology**

```
┌─────────────────────────────────────────────────────────────────┐
│                     BRIDGE AI OS ECOSYSTEM                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─ DNS/CDN Layer (Cloudflare)                                 │
│  │  └─ Tunnel (cloudflared): Private → Public routing           │
│  │                                                               │
│  ├─ Frontend Layer (React/TypeScript)                           │
│  │  ├─ Live Wall (3D UI) @ live.bridge-ai-os.com              │
│  │  ├─ ABAAS Control Tower @ abaas.bridge-ai-os.com           │
│  │  ├─ GOD MODE Topology @ god.bridge-ai-os.com               │
│  │  └─ Admin/CRM/Dashboard @ *.html                            │
│  │                                                               │
│  ├─ API Gateway Layer (Node.js)                                │
│  │  ├─ gateway.js (40KB) → Public QR/join endpoint            │
│  │  ├─ auth.js → SIWE/JWT token service                       │
│  │  └─ server.js (44KB) → Main request router                  │
│  │                                                               │
│  ├─ Business Logic Layer (FastAPI + Node.js)                   │
│  │  ├─ brain.js (125KB) → AI orchestrator, agent management   │
│  │  ├─ brain-agents.js → Agent lifecycle                      │
│  │  ├─ brain-business.js → Economic engine logic              │
│  │  ├─ leadgen-engine.js → Lead generation automation         │
│  │  ├─ supaclaw-abaas.js → Control plane logic                │
│  │  ├─ supaclaw-economy.js → DeFi/payment logic               │
│  │  ├─ supaclaw-ehsa.js → Health services logic               │
│  │  ├─ supaclaw-fabric.js → Network fabric logic              │
│  │  └─ data-service.js → Data orchestration                   │
│  │                                                               │
│  ├─ FastAPI Service (Python, port 8000)                        │
│  │  ├─ /health → Service health probe                         │
│  │  ├─ /charts → Data visualization endpoints                 │
│  │  ├─ /controlplane → System control API                     │
│  │  ├─ /observability → Metrics & tracing                     │
│  │  └─ /webhooks → Event ingestion                            │
│  │                                                               │
│  ├─ State & Memory Layer (Agent/BAN)                           │
│  │  ├─ Agent Memory System (memory/)                           │
│  │  ├─ Orchestration Engine (orchestration/)                  │
│  │  ├─ WebSocket Events (websockets/)                         │
│  │  └─ BAN Ledger (persistent state)                          │
│  │                                                               │
│  ├─ Data Layer (Databases)                                      │
│  │  ├─ SQLite: users.db (user sessions)                       │
│  │  ├─ SQLite: defi.db (DeFi transactions)                    │
│  │  ├─ Redis (cache + sessions) [redis://localhost:6379/0]   │
│  │  ├─ Neo4j (graph database) [bolt://localhost:7687]         │
│  │  └─ PostgreSQL (optional, not primary)                     │
│  │                                                               │
│  ├─ External Integrations                                       │
│  │  ├─ Payment: PayFast, Paystack, PayPal                     │
│  │  ├─ AI: Anthropic, OpenAI, OpenRouter, ElevenLabs          │
│  │  ├─ Auth: Discord OAuth, Google OAuth, Ethereum SIWE       │
│  │  ├─ Cloud: Cloudflare R2 (storage), Cloudflare Tunnel      │
│  │  ├─ Email: Brevo (SMTP relay)                              │
│  │  └─ Blockchain: Babylon, DeFi protocols                    │
│  │                                                               │
│  └─ VPS Execution Layer (Webway)                               │
│     ├─ IP: 102.208.231.53 (primary)                           │
│     ├─ IP: 102.208.228.44 (secondary)                         │
│     ├─ PM2 (process management)                               │
│     ├─ Nginx (reverse proxy, SSL/TLS)                         │
│     ├─ UFW (firewall)                                          │
│     └─ Certbot (SSL renewal)                                  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### **Request Flow (User → VPS → Services)**

```
1. User hits: https://go.ai-os.co.za
   ↓
2. DNS → IP: 102.208.231.53
   ↓
3. Nginx (port 443) [/etc/nginx/sites-available/bridgeai]
   ├─ Validates SSL cert (certbot-managed)
   ├─ Routes / → localhost:3000 (frontend)
   ├─ Routes /monitor/ → localhost:3001 (API)
   └─ Adds X-Forwarded-For, X-Real-IP headers
   ↓
4. PM2 Daemon (ecosystem.config.js)
   ├─ "system" app (port 3000)
   ├─ "monitor" app (port 3001)
   └─ Auto-restart on crash
   ↓
5. Application Logic
   ├─ server.js → Parses request, routes to logic
   ├─ gateway.js → Public endpoint handling
   ├─ brain.js → AI orchestration
   └─ SQLite/Redis → Data persistence
   ↓
6. Response
   ├─ Nginx → adds caching headers
   ├─ WebSocket upgrade (proxy_upgrade)
   └─ 86400s timeout (24 hours for long-lived connections)
```

---

## V. MAIN FEATURES & ARCHITECTURE

### **Core Features**

#### **1. Digital Twin System (Live Wall)**
- **UI:** React 3D interface @ `live.bridge-ai-os.com`
- **Auth:** SIWE (Sign In With Ethereum) + JWT
- **Features:**
  - Real-time agent status visualization
  - Customizable digital twin avatars
  - Real-time event streaming (WebSocket)
  - Multi-panel dashboard (agents, treasury, network)
  - Gateway QR code join system

#### **2. Agent Orchestration (Brain)**
- **Core:** `brain.js` (125KB) + `brain-agents.js`
- **Capabilities:**
  - Agent lifecycle management (spawn, task, retire)
  - Concurrent agent task execution
  - Memory persistence (agent state)
  - Skill registry (1,266+ SVG Engine skills)
  - Autonomous decision making
  - API-driven agent control

#### **3. DeFi & Payment System (Supaclaw Economy)**
- **Services:** `supaclaw-economy.js` + `defi/` module
- **Integrations:**
  - **PayFast:** ZA payment processor (primary)
  - **Paystack:** Pan-African payments
  - **PayPal:** Global fallback
  - **Babylon:** DeFi protocol integration
- **Features:**
  - Revenue loop tracking
  - Token balance management
  - Payment webhooks (notify URL)
  - Treasury dashboard
  - Multi-currency support

#### **4. Authentication & Authorization**
- **Service:** `auth.js` (port 5001)
- **Methods:**
  - SIWE (Sign In With Ethereum) — Web3 native
  - JWT (JSON Web Tokens) — Session management
  - Discord OAuth — Social login
  - Google OAuth — Email/SSO
  - Internal Orchestrator Auth — Service-to-service
- **Storage:** SQLite `users.db`
- **Sessions:** Redis cache + JWT fallback

#### **5. System Control Plane (ABAAS)**
- **UI:** ABAAS Control Tower @ `abaas.bridge-ai-os.com`
- **Capabilities:**
  - Real-time service status
  - Process start/stop/restart
  - Environment variable management
  - API key rotation
  - Audit log review
  - Health probe checks

#### **6. GOD MODE Topology**
- **UI:** @ `god.bridge-ai-os.com` (port 3001)
- **Features:**
  - Live service dependency graph
  - WebSocket event stream
  - Multi-panel terminal grid
  - System topology visualization
  - Direct service interaction

#### **7. SVG Engine (Skills & Workflows)**
- **Service:** Python API @ `svg.bridge-ai-os.com` (port 7070)
- **Structure:**
  - **core/** — Base component abstractions
  - **skills/** — 1,266+ individual skill modules
  - **api/** — REST endpoint layer
  - **teaching/** — Educational/onboarding materials
- **Features:**
  - Skill composition (chaining)
  - SVG rendering of workflows
  - Graph-based skill routing
  - Skill discovery API

#### **8. Lead Generation Engine**
- **Service:** `leadgen-engine.js`
- **Features:**
  - Automated lead capture
  - Lead scoring
  - CRM integration
  - Email sequence automation
  - Conversion tracking

#### **9. Health Services (EHSA)**
- **Service:** `supaclaw-ehsa.js`
- **Domain:** `ehsa.bridge-ai-os.com`
- **Features:**
  - Patient/provider onboarding
  - Medical records management
  - Appointment scheduling
  - Prescription management
  - Telemedicine support

#### **10. BAN (Blockchain Autonomous Network)**
- **Service:** BAN microservice (Docker container)
- **Ports:** 8001 (internal)
- **Features:**
  - Distributed node registry
  - Wallet state management
  - Ledger persistence
  - Task queue (node task scheduling)
  - Autonomous network coordination
  - Payout tracking & settlement

#### **11. Universal Basic Income (UBI)**
- **Domain:** `ubi.bridge-ai-os.com`
- **Features:**
  - User wallet creation
  - Monthly UBI distribution
  - Transaction ledger
  - Beneficiary management

#### **12. Vertical Markets**
- **EHSA (Healthcare)** @ `ehsa.bridge-ai-os.com`
- **Hospital in a Box** @ `hospital.bridge-ai-os.com`
- **Bridge AID (Humanitarian)** @ `aid.bridge-ai-os.com`
- **Aurora (Energy/Sustainability)** @ `aurora.bridge-ai-os.com`
- **Rooted Earth (Agriculture)** @ `rooted.bridge-ai-os.com`

---

### **Sub-Features by Layer**

#### **Frontend Sub-Features** (React Components)
```
Live Wall (index.html)
├─ 3D Digital Twin Visualization
├─ Real-time Agent Panel
├─ Treasury Dashboard
├─ Network Status Widget
└─ WebSocket Event Logger

Admin Panel (admin.html)
├─ Service Management (start/stop)
├─ Configuration Editor
├─ API Key Management
└─ Audit Log Viewer

CRM (crm.html)
├─ Lead Pipeline
├─ Customer Database
├─ Activity Timeline
└─ Forecasting

Dashboard (dashboard.html)
├─ KPI Cards
├─ Charts (via /charts API)
├─ Metrics Export
└─ Custom Widgets

Control Plane (controlplane.html)
├─ Service Status Monitor
├─ Real-time Metrics
├─ Process Control Buttons
└─ Log Stream Viewer

Lead Management (leads.html)
├─ Lead List
├─ Scoring Dashboard
├─ Conversion Funnel
└─ Email Templates
```

#### **API Sub-Features** (FastAPI Routes)
```
/charts
├─ GET /charts/revenue — Revenue trends
├─ GET /charts/agents — Agent activity
├─ GET /charts/transactions — Payment history
└─ POST /charts/custom — Custom chart data

/controlplane
├─ GET /controlplane/status — System health
├─ POST /controlplane/restart — Service restart
├─ GET /controlplane/config — Read configuration
└─ PATCH /controlplane/config — Update config

/observability
├─ GET /observability/metrics — Prometheus metrics
├─ GET /observability/traces — Trace data
├─ GET /observability/logs — Log aggregation
└─ GET /observability/health — Liveness check

/webhooks
├─ POST /webhooks/payfast — PayFast callbacks
├─ POST /webhooks/github — GitHub events
├─ POST /webhooks/agents — Agent status updates
└─ POST /webhooks/custom — Custom integrations
```

#### **Business Logic Sub-Features**
```
Agent Orchestration (brain.js)
├─ Agent.spawn() — Create new agent instance
├─ Agent.assignTask() — Queue task for execution
├─ Agent.updateState() — Persist agent state
├─ Agent.retire() — Graceful agent shutdown
└─ Agent.broadcast() — Emit events to clients

Economic Engine (supaclaw-economy.js)
├─ Wallet.create() — New user wallet
├─ Payment.process() — PayFast integration
├─ Treasury.addRevenue() — Track income
├─ Treasury.query() — Revenue analytics
└─ Token.mint() — Create bridge tokens

Authentication (auth.js)
├─ SIWE.challenge() — Generate eth_sign challenge
├─ SIWE.verify() — Verify signature
├─ JWT.issue() — Create session token
├─ JWT.validate() — Verify token
└─ OAuth.exchange() — Exchange auth code

Control Plane (supaclaw-abaas.js)
├─ Service.list() — All running services
├─ Service.restart() — Restart service (PM2)
├─ Process.kill() — Terminate process
├─ Config.read() — Load .env
└─ Config.update() — Modify configuration
```

---

## VI. OPERATIONAL SUMMARY

### **Deployment Checklist**

**Pre-Deploy:**
- [ ] Update `c:\aoe-unified-final\.env.production` with live keys
- [ ] Verify `users.db` is backed up locally
- [ ] Run smoke tests on localhost:3000 and localhost:3001
- [ ] Confirm VPS IP and SSH access

**Deploy:**
```bash
cd c:\aoe-unified-final
bash deploy-vps.sh 102.208.231.53 root
```

**Post-Deploy:**
- [ ] Check `https://go.ai-os.co.za` loads (3000)
- [ ] Check `https://go.ai-os.co.za/monitor/` loads (3001)
- [ ] Verify SSL cert auto-renewal setup
- [ ] Test payment webhooks
- [ ] Run `pm2 logs` on VPS to check for errors

### **Service Port Map (Development)**

| Port | Service | Command |
|------|---------|---------|
| 3000 | Frontend React app | `npm run dev` or PM2 |
| 3001 | Monitor/API | PM2 |
| 3020 | Bridge Frontend (alt) | npm start |
| 3030 | Bridge Auth (alt) | npm start |
| 5001 | Auth service | `node auth.js` |
| 5002 | Terminal proxy | `node terminal-proxy.js` |
| 7070 | SVG Engine (Python) | `python main.py` |
| 8000 | FastAPI backend | `uvicorn main:app` |
| 8001 | BAN service | Docker container |
| 8080 | Gateway service | `node gateway.js` |
| 6379 | Redis | `redis-server` |
| 7687 | Neo4j | Docker container |

### **Critical Configuration Files**

| File | Location | Purpose |
|------|----------|---------|
| `.env` | `c:\aoe-unified-final\` | Local development secrets |
| `.env.production` | VPS: `/var/www/bridgeai/.env` | Production secrets (upload only) |
| `ecosystem.config.js` | `c:\aoe-unified-final\` | PM2 app configuration |
| `.env` | `e:\bridgeai\bridgelivewall\` | FastAPI environment |
| `service-registry.json` | `e:\bridgeai\` | Service discovery registry |

### **Monitoring & Health Checks**

**VPS Health:**
```bash
ssh root@102.208.231.53
  pm2 list                    # Check PM2 apps
  pm2 logs                    # Stream logs
  pm2 monit                   # Real-time monitoring
  systemctl status nginx      # Nginx status
  ufw status                  # Firewall rules
```

**Application Health:**
- `https://go.ai-os.co.za/health` → FastAPI health probe
- `https://go.ai-os.co.za/api/notion/stats` → Notion stats endpoint
- `pm2 plus` → Real-time PM2 dashboard (optional)

---

## VII. INCIDENT RESPONSE & TROUBLESHOOTING

### **VPS Down**
1. Check IP reachability: `ping 102.208.231.53`
2. SSH into VPS: `ssh root@102.208.231.53`
3. Check PM2: `pm2 list`
4. Restart services: `pm2 restart ecosystem.config.js`
5. Check Nginx: `systemctl status nginx` + `nginx -t`

### **Application Crash**
1. Check PM2 logs: `pm2 logs system` (port 3000)
2. Check Node.js processes: `ps aux | grep node`
3. Review `.env` variables on VPS
4. Restart: `pm2 restart system` or `pm2 reload ecosystem.config.js`

### **Payment Processing Failing**
1. Verify PayFast merchant ID & key in `.env`
2. Check webhook endpoint: `POST https://go.ai-os.co.za/payfast/notify`
3. Review payment logs in VPS: `pm2 logs` grep "payfast"
4. Test with test merchant account (PayFast sandbox)

### **Authentication Not Working**
1. Verify JWT_SECRET consistency
2. Check auth.js running: `pm2 list` (should show running)
3. Test SIWE: curl -X POST https://go.ai-os.co.za/api/auth/siwe
4. Verify Redis: `redis-cli ping` → "PONG"

---

## VIII. SECURITY AUDIT SNAPSHOT

### **Verified**
- ✅ SSL/TLS enabled via Certbot (auto-renew)
- ✅ UFW firewall (ports 22, 80, 443 only)
- ✅ PM2 auto-restart on crash
- ✅ Environment variables externalized (not in code)
- ✅ SIWE authentication (Ethereum native)
- ✅ JWT session tokens (no plaintext passwords)

### **To Review**
- ⚠️ Git history may contain old .env files (audit with `git log -p -- .env`)
- ⚠️ PayFast merchant key in plaintext in c: .env (move to vault or 1Password)
- ⚠️ API keys in .env.production on VPS (restrict SSH access via UFW)
- ⚠️ Cloudflare tunnel credentials (review scope)

### **To Implement**
- 🔒 Rate limiting on payment endpoints
- 🔒 CSRF protection on admin endpoints
- 🔒 Request signing for webhook verification (PayFast)
- 🔒 Secrets rotation schedule (30-90 days)

---

## IX. FUTURE ROADMAP NOTES

### **Short-term (2026 Q2)**
- [ ] Complete live.bridge-ai-os.com migration from local
- [ ] Stabilize BAN network with 10+ nodes
- [ ] Launch UBI pilot (100 beneficiaries)
- [ ] Integrate health records for EHSA

### **Medium-term (2026 Q3-Q4)**
- [ ] Multi-region VPS deployment (redundancy)
- [ ] Kubernetes migration (from PM2)
- [ ] PostgreSQL adoption (from SQLite)
- [ ] GraphQL layer (from REST)

### **Long-term (2027+)**
- [ ] Tokenomics (BAI token)
- [ ] Governance (DAO)
- [ ] Decentralized BAN execution

---

**Document Generated:** 2026-04-01 10:25 UTC+2  
**Next Update:** 2026-04-30 (monthly cadence)  
**Owner:** Supas (ryanehsacoza) | BridgeAI Founder

