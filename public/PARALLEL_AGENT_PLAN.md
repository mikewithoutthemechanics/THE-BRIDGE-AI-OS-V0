# Parallel Agent Execution Plan for Route Analysis

## Overview

This document outlines a parallel agent workflow for analyzing the admin-sitemap.html and producing a comprehensive route map. The workflow uses 5 specialized agents working concurrently to maximize efficiency.

## Agent Roles & Responsibilities

| Agent | Role | Primary Focus |
|-------|------|---------------|
| **Agent A** | AdminRouteAnalyzer | Extract and classify admin routes from Admin & Intelligence category |
| **Agent B** | UserRouteAnalyzer | Extract and classify user routes across all other categories |
| **Agent C** | DynamicParamValidator | Identify dynamic segments, query params, and validate route patterns |
| **Agent D** | MetadataEnricher | Enrich routes with middleware, auth requirements, status codes |
| **Agent E** | ConvergenceOrchestrator | Aggregate results, validate consistency, resolve conflicts |

## Work Division Strategy

### Phase 1: Parallel Extraction (Agents A, B, C)

**Agent A - AdminRouteAnalyzer**
- Input: admin-sitemap.html lines 128-139
- Output: Array of admin route objects
- Focus: Extract routes under "Admin & Intelligence" category

**Agent B - UserRouteAnalyzer**
- Input: admin-sitemap.html (all categories except Admin & Intelligence)
- Output: Array of user route objects
- Focus: Extract Core, Verticals, Business Suite, Economy & DeFi, Agents & System, Settings & Docs

**Agent C - DynamicParamValidator**
- Input: Full PAGES object
- Output: List of routes with dynamic segments detected
- Focus: Identify patterns like `:id`, `:slug`, query params

### Phase 2: Enrichment (Agent D)

**Agent D - MetadataEnricher**
- Input: Combined route arrays from A, B, C
- Output: Enriched routes with inferred middleware, auth requirements
- Focus: Add authGuard, roles, layout, status codes

### Phase 3: Convergence (Agent E)

**Agent E - ConvergenceOrchestrator**
- Input: Enriched routes from D
- Output: Final validated JSON + Markdown
- Focus: Validate, resolve conflicts, produce final outputs

## Synchronization Points

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Agent A     │     │ Agent B     │     │ Agent C     │
│ (Admin)     │     │ (User)      │     │ (Dynamic)   │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                  │                  │
       └──────────────────┼──────────────────┘
                        ▼
               ┌─────────────────┐
               │    MERGE        │  ← Sync Point 1
               └────────┬────────┘
                        │
                        ▼
               ┌─────────────────┐
               │  Agent D        │  ← Enrichment Phase
               │  (Metadata)     │
               └────────┬────────┘
                        │
                        ▼
               ┌─────────────────┐
               │  Agent E        │  ← Final Validation
               │  (Orchestrator) │
               └────────┬────────┘
                        │
                        ▼
               Final JSON + Markdown Output
```

## Sample Agent Prompts

### Agent A: AdminRouteAnalyzer
```
You are the AdminRouteAnalyzer agent. 

TASK: Extract all admin routes from the sitemap data.

INPUT: The PAGES object from admin-sitemap.html, specifically the "Admin & Intelligence" category (lines 128-139).

OUTPUT: A JSON array of route objects with:
- path: the href value (e.g., "/admin.html")
- page: derived from name (e.g., "AdminPanel")
- component: page + "View" suffix
- category: "admin"
- sourceAnchor: "admin-sitemap.html#L<line>"

Extract these routes:
- Admin Command Center (/admin-command.html)
- Admin Revenue (/admin-revenue.html)
- Admin Panel (/admin.html)
- Admin Withdraw (/admin-withdraw.html)
- Intelligence (/intelligence.html)
- Executive Dashboard (/executive-dashboard.html)
- AOE Dashboard (/aoe-dashboard.html)
- Bridge Audit (/bridge-audit-dashboard.html)
- Auth Dashboard (/auth-dashboard.html)
- Admin Sitemap (/admin-sitemap.html)

Return ONLY the JSON array, no explanation.
```

### Agent B: UserRouteAnalyzer
```
You are the UserRouteAnalyzer agent.

TASK: Extract all user routes from the sitemap data.

INPUT: The PAGES object from admin-sitemap.html, excluding the "Admin & Intelligence" category.

OUTPUT: A JSON array of route objects with:
- path: the href value
- page: derived from name
- component: page + "View" suffix
- category: the "cat" field value
- sourceAnchor: "admin-sitemap.html#L<line>"

Process these categories:
- Core (lines 65-83)
- Verticals (lines 84-99)
- Business Suite (lines 100-116)
- Economy & DeFi (lines 117-127)
- Agents & System (lines 140-154)
- Settings & Docs (lines 155-165)
- Dev / Demo (lines 166-173)

Return ONLY the JSON array, no explanation.
```

### Agent C: DynamicParamValidator
```
You are the DynamicParamValidator agent.

TASK: Analyze routes for dynamic segments and query parameters.

INPUT: The complete PAGES object from admin-sitemap.html.

OUTPUT: For each route with dynamic segments (e.g., /users/:id), return:
{
  "path": "/actual/path",
  "isDynamic": true,
  "params": [
    { "name": "paramName", "type": "string", "required": true, "description": "..." }
  ]
}

For routes with query params (e.g., /search?q=...), return:
{
  "path": "/actual/path",
  "queryParams": [
    { "name": "paramName", "type": "string", "required": false, "description": "..." }
  ]
}

Analyze all 98 routes and return JSON. If no dynamic segments found, return empty array with note: "No dynamic segments detected in static HTML sitemap - may require runtime route analysis."
```

### Agent D: MetadataEnricher
```
You are the MetadataEnricher agent.

TASK: Enrich route objects with authentication, authorization, and metadata.

INPUT: Combined array of admin and user routes from Agents A and B.

OUTPUT: For each route, add these fields:
- requiresAuth: "none" | "user" | "admin" (based on category and path)
- roles: [] for public, ["admin"] for admin routes, ["admin","user"] for user routes
- layout: "AdminLayout" | "MainLayout" | "PublicLayout"
- middleware: [] for public, ["authGuard"] for authenticated, ["authGuard","adminOnly"] for admin
- statusCodes: [200,401,403,404] or [200,404] based on auth
- deprecated: true/false
- deprecationNote: "" or migration note

Rules:
- Routes with "admin" in category = requiresAuth: "admin"
- Routes with cat="core" and href in ["/","/checkout.html","/welcome.html","/pricing.html","/join.html","/payment-success.html","/payment-cancel.html"] = requiresAuth: "none"
- All other authenticated routes = requiresAuth: "user"
- /terminal.html = deprecated: true, deprecationNote: "Use terminal-v3.html instead"

Return complete enriched JSON array.
```

### Agent E: ConvergenceOrchestrator
```
You are the ConvergenceOrchestrator agent.

TASK: Aggregate, validate, and produce final outputs.

INPUT: Enriched routes from Agent D.

VALIDATION CHECKS:
1. All admin routes must be under adminRoutes array
2. All user routes must be under userRoutes array  
3. No duplicate paths within same array
4. All routes have page and component defined
5. No path conflicts (identical paths with same method)
6. 404 route exists in userRoutes

OUTPUT: Two files:
1. routes.json with structure:
{
  "adminRoutes": [...],
  "userRoutes": [...]
}

2. ROUTE_MAP.md with:
- Total counts (admin vs user)
- Category breakdown
- Deprecated routes noted
- Gaps/inconsistencies identified
- Next steps

Return both file contents in your response.
```

## Parallelism Level

**Recommended: 5 agents** (as defined above)

- Phase 1: 3 agents run in parallel (A, B, C)
- Phase 2: 1 agent (D) runs after sync point 1
- Phase 3: 1 agent (E) runs after sync point 2

**Total execution time:** ~3x faster than sequential (assuming parallel execution environment)

## Implementation Notes

- All agents work from the same input source (admin-sitemap.html)
- No inter-agent communication needed during extraction phase
- ConvergenceOrchestrator acts as the single source of truth
- JSON output is self-contained and ready for frontend router ingestion