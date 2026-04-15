# Bridge AI OS

<div align="center">
  <img src="bridge-ai-os-banner.svg" alt="Bridge AI OS - Animated System Architecture" width="100%" style="max-width: 800px; height: auto;" />
</div>

[![Status](https://img.shields.io/badge/status-operational-brightgreen.svg)](https://bridge-ai-os.com)
[![Version](https://img.shields.io/badge/version-v0→∞-blue.svg)](https://github.com/bridgeaios/THE-BRIDGE-AI-OS-V0/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

> The Operating System for Production-Grade AI Workflow Orchestration

Bridge AI OS is a modular, extensible operating system for orchestrating AI workflows, tools, and agents into cohesive, production-ready systems. It bridges data, models, and interfaces—turning fragmented AI capabilities into unified, deployable pipelines.

## ✨ Features

- **🧠 Modular AI Agents**: Composable agents with specialized roles (brain, OSINT, billing, SVG)
- **🔗 Tool Integration**: Connect any API, database, or service as a first-class tool
- **⚡ Real-Time Orchestration**: WebSocket-powered dynamic workflow engine
- **🔐 Zero-Trust Auth**: JWT + SIWE multi-layer authentication fabric
- **📊 Revenue Engine**: Built-in billing, subscriptions, and monetisation layer
- **🌐 26-Domain Fabric**: Production CDN mesh across Cloudflare infrastructure

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    BRIDGE AI OS — 5-TIER STACK                     │
├─────────────────────────────────────────────────────────────────────┤
│  TIER 0 ▸ DNS / CDN                                                │
│           Cloudflare → 26 domains → production VPS                 │
├─────────────────────────────────────────────────────────────────────┤
│  TIER 1 ▸ Reverse Proxy                                            │
│           Nginx (80/443) → TLS termination → UFW firewall           │
├─────────────────────────────────────────────────────────────────────┤
│  TIER 2 ▸ Gateway Layer                                            │
│           gateway.js :8080 → proxying · SSE · auth façade          │
├──────────────────────┬──────────────────────┬───────────────────────┤
│  TIER 3A            │  TIER 3B             │  TIER 3C             │
│  Node.js            │  FastAPI (Python)     │  SVG Skill Engine    │
│  server.js         │  brain.js :8000        │  :7070               │
│  :3000-5002         │  BAN engine :8001      │  React SPA :3020     │
├──────────────────────┴──────────────────────┴───────────────────────┤
│  TIER 4 ▸ Persistence                                               │
│           PostgreSQL │ Redis │ Neo4j │ SQLite │ Supabase           │
└─────────────────────────────────────────────────────────────────────┘
```

## 🤖 Agent Network

```
                    ┌─────────────────────┐
                    │   🧠  SUPER BRAIN   │
                    │  AI Twin · WebSocket │
                    └──────────┬──────────┘
           ┌──────────────────┼──────────────────┐
           ▼                  ▼                  ▼
  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐
  │ 📡 OSINT Agent │ │ 💼 CRM Agent   │ │ 💰 Billing Agt │
  │ Intelligence   │ │ Lead Scoring   │ │ Revenue Engine │
  └────────────────┘ └────────────────┘ └────────────────┘
           ┌──────────────────┼──────────────────┐
           ▼                  ▼                  ▼
  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐
  │ 🔐 Auth Agent  │ │ 📊 SVG Engine  │ │ 🌐 API Gateway │
  │ JWT · SIWE     │ │ Skill Graphs   │ │ Unified Proxy  │
  └────────────────┘ └────────────────┘ └────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- Node.js >= 18.0.0
- Python >= 3.10
- Docker >= 20.10
- PostgreSQL >= 14
- Redis >= 6

### Installation

```bash
# Clone the repository
git clone https://github.com/bridgeaios/THE-BRIDGE-AI-OS-V0.git
cd THE-BRIDGE-AI-OS-V0

# Install dependencies
npm install
pip install -r requirements.txt

# Copy environment configuration
cp .env.example .env
```

### Minimal Local Run

**Node.js Example:**
```javascript
import { Agent } from './src/agents/base-agent.js';

const agent = new Agent({
  name: 'summarizer',
  model: 'gpt-4',
  maxTokens: 500
});

const result = await agent.run({
  input: 'Summarize this text: The quick brown fox jumps over the lazy dog.',
  context: { style: 'bullets' }
});

console.log(result.output);
```

**Python Example:**
```python
from brain import BrainEngine

brain = BrainEngine(
    model_provider="openai",
    api_key=os.getenv("OPENAI_API_KEY"),
    temperature=0.7
)

response = brain.process(
    prompt="What is the capital of France?",
    stream=False
)

print(response["content"])
```

### Docker Quick Start

```bash
# Start all services
docker-compose up -d

# Verify services
docker-compose ps

# View logs
docker-compose logs -f
```

## 📡 API Reference

### Core Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/agent/run` | Execute an agent with input |
| GET | `/api/v1/agent/status/:id` | Get agent execution status |
| POST | `/api/v1/tools/call` | Invoke a tool |
| GET | `/api/v1/tools/list` | List available tools |
| POST | `/api/v1/brain/query` | Query the AI brain |
| WS | `/ws/stream` | Real-time streaming |

### Example Request/Response

**POST** `/api/v1/agent/run`
```json
{
  "agent": "summarizer",
  "input": "Text to summarize",
  "options": {
    "temperature": 0.7,
    "maxTokens": 500
  }
}
```

**Response:**
```json
{
  "id": "exec_abc123",
  "status": "completed",
  "output": "Summary text...",
  "metadata": {
    "tokens": 42,
    "latency_ms": 1250
  }
}
```

> **Note:** Full API documentation available at [docs.bridge-ai-os.com](https://docs.bridge-ai-os.com)

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | Server port | `3000` |
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `API_KEY` | External AI service API key | Required |
| `MODEL_PROVIDER` | AI model provider | `openai` |
| `JWT_SECRET` | JWT signing secret | Required |
| `SUPABASE_URL` | Supabase project URL | Required |
| `SUPABASE_KEY` | Supabase anon key | Required |

### Example .env

```bash
# Core Configuration
NODE_ENV=production
PORT=3000

# Database
DATABASE_URL=postgresql://user:password@host:5432/bridgeaios

# Redis
REDIS_URL=redis://localhost:6379

# AI Services
OPENAI_API_KEY=sk-your-key-here
MODEL_PROVIDER=openai

# Authentication
JWT_SECRET=your-jwt-secret-here

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key-here
```

> **⚠️ Security Note:** Never commit `.env` files. Use secrets management.

## 🛠️ Tech Stack

- **Backend**: Node.js, Python (FastAPI), TypeScript
- **Frontend**: React, Vite
- **Database**: PostgreSQL, Redis, Neo4j, Supabase
- **Infrastructure**: Docker, Nginx, Cloudflare
- **Real-time**: WebSocket, SSE
- **Authentication**: JWT, SIWE

## 🧭 Roadmap

| Version | Target | Milestones |
|---------|--------|------------|
| v1.0.0 | Q2 2026 | Core orchestration engine, basic agents |
| v1.1.0 | Q3 2026 | Agent plugins, tool registry expansion |
| v1.2.0 | Q4 2026 | Advanced billing, subscription management |
| v2.0.0 | Q1 2027 | Multi-region deployment, enterprise features |

## 🧪 Testing

```bash
# Run unit tests
npm test

# Run integration tests
npm run integration

# Run linting
npm run lint

# Run type checking
npm run typecheck

# Run all checks
npm run check
```

Maintain ≥80% code coverage. CI enforces lint, typecheck, and test passing.

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Standards

- Run `npm run lint` before committing
- Maintain ≥80% test coverage
- Use TypeScript for new Node.js code
- Follow PEP 8 for Python code

## 🌍 Domain Network

- **bridge-ai-os.com** — Primary Platform
- **abaas.bridge-ai-os.com** — ABAAS Control Plane
- **god.bridge-ai-os.com** — GOD MODE Topology
- **brain.bridge-ai-os.com** — AI Brain Endpoint
- **live.bridge-ai-os.com** — Digital Twin · Live Wall
- **svg.bridge-ai-os.com** — SVG Skill Engine UI
- *+ 20 more sub-domains active*

## 📊 Live Stats

[![GitHub Stats](https://github-readme-stats.vercel.app/api?username=bridgeaios&show_icons=true&theme=dark)](https://github.com/bridgeaios)
[![GitHub Streak](https://github-readme-streak-stats.herokuapp.com/?user=bridgeaios&theme=dark)](https://github.com/bridgeaios)
[![Top Languages](https://github-readme-stats.vercel.app/api/top-langs/?username=bridgeaios&layout=compact&theme=dark)](https://github.com/bridgeaios)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙌 Credits

- **Core Contributors**: Bridge AI OS Team
- **Open-Source Libraries**: FastAPI, Express.js, React, PostgreSQL, Redis, Nginx, Cloudflare

---

**Built with ❤️ by Bridge AI OS**

*From v0 to infinity — the journey begins.*
