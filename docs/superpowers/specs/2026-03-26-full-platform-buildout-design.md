# BRIDGE AI OS — Full Platform Buildout Design

**Date:** 2026-03-26
**Approach:** Option A — Full-Featured Demo (localStorage + serverless API)

## Overview

Build out all stub features into functional, interactive systems. Add a new Control Panel as the admin nerve center. Connect treasury with real ledger. Render avatar with Babylon.js. All state persists in localStorage, API seeds initial data.

## Architecture

```
[Static HTML Pages]  -->  [Vercel Serverless API]  -->  [Seed Data]
       |
  [localStorage]  <-- persists mutations across page loads
```

### State Management Pattern
- API returns seed/default data on every call
- Frontend merges localStorage overrides on top
- Mutations (create task, credit user, dispatch agent) write to localStorage
- Export/reset available from control panel

---

## 1. Control Panel (`/control.html`)

New page — full admin dashboard. Dark command-center theme matching existing UI.

### Layout (top to bottom, responsive grid)

**Header Bar:** Logo, "CONTROL PANEL" title, live clock, connection status badge

**Row 1 — Treasury + Live Feed (2 columns)**
- **Treasury Panel:**
  - Balance display (large number, animated on change)
  - Revenue/Costs/Net sparkline chart (Chart.js, last 30 data points)
  - Plan breakdown: Starter/Pro/Enterprise subscriber counts + revenue
  - Transaction ledger table (scrollable, last 50 transactions)
  - "Add Transaction" form (type, amount, description)

- **Live Feed Panel:**
  - Scrolling event log (polls `/api/events/recent` every 3s)
  - Color-coded by type: lead=green, inference=blue, dispatch=yellow, task=cyan, treasury=gold
  - Filter buttons by event type
  - Max 100 events, auto-prune

**Row 2 — Agents + Tasks (2 columns)**
- **Agent Command Panel:**
  - 8 agent cards in 2x4 grid
  - Each card: name, status dot, tasks completed count, uptime
  - Toggle active/paused per agent
  - "Dispatch Task" form: select agent, task description, priority dropdown
  - Running task queue (assignee, description, priority, elapsed time)

- **Marketplace Ops Panel:**
  - Task list with status badges (open/in_progress/completed)
  - "Create Task" form: title, description, reward amount
  - Claim/Complete/Cancel buttons per task
  - Stats bar: open count, in-progress count, completed count, total rewards

**Row 3 — Users + System (2 columns)**
- **User Management Panel:**
  - Users table: email, credits, referral code, status, joined date
  - "Credit User" form: select user, amount
  - Enable/Disable toggle per user
  - Referral stats: total codes, claimed, pending

- **System Health Panel:**
  - Service cards: gateway, system, ainode, orchestrator, L1, L2, L3
  - Each: status dot, port, latency bar, last checked
  - Memory/CPU gauges (from `/api/registry/kernel`)
  - Quick Actions row: Export Ledger (CSV), Reset State, Refresh All

### Data Flow
- On load: fetch all API endpoints, merge with localStorage
- Mutations: update localStorage immediately, re-render affected panel
- Every 3s: poll `/api/events/recent` for live feed
- Every 10s: poll `/api/status` and `/api/registry/kernel` for system health

---

## 2. Treasury System

### New API Endpoints
- `GET /api/treasury/ledger` — returns seed transaction history (30 entries)
- `GET /api/treasury/summary` — returns balance, revenue_mtd, costs_mtd, net_mtd, plan breakdown
- `POST /api/treasury/transaction` — accepts `{type, amount, description}`, returns updated balance

### Seed Data (api/index.js)
Generate 30 realistic transactions:
- Subscription payments (Starter $49, Pro $149, Enterprise $499)
- Infrastructure costs (AWS, Vercel, API usage)
- Agent rewards (task completions)
- Referral bonuses

### localStorage Keys
- `bridgeos_treasury_balance` — current balance
- `bridgeos_treasury_ledger` — JSON array of transactions
- `bridgeos_treasury_plans` — plan subscriber counts

---

## 3. Agent Orchestration

### Enhanced API
- `GET /api/agents` — returns all 8 agents with realistic status
- `POST /api/agents/dispatch` — accepts `{agent, task, priority}`
- `GET /api/agents/queue` — returns active task queue

### Agent States (localStorage)
- `bridgeos_agents` — JSON map of agent states (active/paused, tasks_completed, current_task)
- `bridgeos_task_queue` — ordered task array
- `bridgeos_task_history` — completed tasks with timestamps

### Behavior
- Dispatching a task adds it to queue with timestamp
- Tasks auto-complete after random 10-30s (simulated via setInterval)
- Completed tasks move to history, agent task_completed increments
- Paused agents don't pick up new tasks

---

## 4. Marketplace Enhancement

### Enhanced API
- `POST /api/marketplace/tasks/create` — create new task
- `POST /api/marketplace/tasks/:id/claim` — claim a task
- `POST /api/marketplace/tasks/:id/complete` — complete, award credits
- `GET /api/marketplace/wallet` — user wallet with real credit balance

### localStorage Keys
- `bridgeos_marketplace_tasks` — full task list with status
- `bridgeos_user_credits` — credit balances per user

### Task Lifecycle
open -> claimed -> in_progress -> completed (credits awarded) | cancelled

---

## 5. Avatar System (`/avatar.html` rebuild)

### Babylon.js Integration
- Load Babylon.js 6.x from CDN
- Create actual 3D scene per mode:
  - **wireframe**: Icosphere with wireframe material, edge glow, slow rotation
  - **textured**: Humanoid capsule with PBR material, directional + ambient light
  - **anatomical**: Layered transparent spheres (skeleton/muscle/skin), x-ray toggle
  - **neural**: Particle system with 5000 particles, synapse connections, bloom post-process
  - **holographic**: Mesh with fresnel effect, scanline shader, chromatic aberration
  - **quantum**: Point cloud with probability haze, wave collapse animation
- Mode selector buttons along bottom
- Camera orbit controls (ArcRotateCamera)
- Animation controls: play/pause, speed slider
- Scene info panel showing current mode config from API

---

## 6. UI Updates

### ui.html
- Add Control Panel nav card with SVG icon (sliders/dashboard icon)
- Add link to `/control.html`

### All subpages
- Add "CONTROL" link in nav bars

### build-static.js
- Ensure control.html copies to public/ root

### vercel.json
- Add rewrites for new API endpoints:
  - `/api/treasury/:path*` -> `/api`
  - `/api/agents/dispatch` -> `/api`
  - `/api/agents/queue` -> `/api`
  - `/api/marketplace/tasks/:path*` -> `/api`

---

## 7. Event System

### New API Endpoint
- `GET /api/events/recent` — returns last 50 generated events with timestamps

### Seed Events (api/index.js)
On each call, generate 50 realistic events spanning the last 5 minutes:
- lead_delivered, ai_inference, swarm_dispatch, task_completed, treasury_update
- Each with realistic agent names, values, timestamps

---

## Design Principles

1. **No external dependencies** — everything works on Vercel serverless
2. **localStorage persistence** — survives page reloads, not redeploys
3. **Seed + Override pattern** — API provides defaults, frontend layer adds mutations
4. **Consistent dark theme** — #050a0f bg, #00c8ff accent, Courier New mono
5. **No emojis** — SVG icons only (Heroicons/Lucide style inline SVGs)
6. **Responsive** — works at 375px, 768px, 1024px, 1440px
7. **Accessible** — 4.5:1 contrast, focus states, cursor-pointer on interactives
