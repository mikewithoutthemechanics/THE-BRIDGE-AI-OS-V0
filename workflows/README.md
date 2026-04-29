# Workflows

Tier-scoped operational workflows. Each file is a self-describing JSON definition consumed by [lib/workflow-engine.js](../lib/workflow-engine.js) and exposed via `/settings/workflows/*`.

## Layout

```
workflows/
├── free/           — Observability-only, no mutations
├── pro/            — Service restart, reload, logs
├── enterprise/     — Node drain, deploy rollback, DB backup
└── super_admin/    — Identity (grants/revokes), treasury, break-glass
```

Lower tiers inherit access to all workflows at their tier and below. A super_admin sees every workflow across all directories.

## Workflow schema

```json
{
  "id": "kebab-case-id",              // unique across all workflows
  "name": "Human readable name",
  "description": "What it does + side effects",
  "category": "observability|operations|identity|data|incident|treasury",
  "required_tier": "free|pro|enterprise|super_admin",
  "required_capability": null | "settings.grant_super_admin" | ...,
  "confirmation_required": true|false,
  "danger": null | "LOW" | "HIGH" | "CRITICAL",
  "params": [
    { "name": "...", "type": "string|integer|email|number", "required": true, "label": "...", "default": ..., "values": [...], "values_from": "/admin/...", "pattern": "...", "min": ..., "max": ..., "min_length": ... }
  ],
  "steps": [
    { "type": "confirm",   "message": "..." },
    { "type": "http_get",  "path": "...", "alias": "..." },
    { "type": "http_post", "path": "...", "body": {...}, "headers": {...} },
    { "type": "wait_for",  "path": "...", "match": "...", "timeout_s": ... },
    { "type": "poll",      "path": "...", "until": "...", "timeout_s": ... },
    { "type": "render",    "target": "...", "source": "..." }
  ],
  "estimated_duration_s": 1,
  "audit": true|false,
  "audit_action": "snake_case_name"
}
```

## Capability gates vs tier gates

- `required_tier` is a **minimum threshold**. A pro user can run a free workflow; a super admin can run anything.
- `required_capability` is a **discrete permission** (only super admins have capabilities). Used when even a super admin shouldn't be able to do it without an explicit cap.

If both are set, **both** must pass.

## Parameter interpolation

`{param_name}` in step fields is replaced with the runtime value. Interpolation happens in `path`, `body` (recursively), `headers`, and `message`.

## Adding a new workflow

1. Drop a new JSON file in the appropriate tier directory.
2. The engine auto-discovers it at boot — no registry edit needed.
3. Update this README if you add a new step type or category.

## Engine API

```js
const wf = require('./lib/workflow-engine');

wf.listAvailable(resolved)            // -> [workflow objects the user can see]
wf.canExecute(resolved, 'workflow-id') // -> { ok, reason?, workflow? }
wf.plan(resolved, 'id', params)        // -> { ok, workflow_id, steps, params } (validated, ready to execute)
```

The engine deliberately stops at **plan**, not **execute** — the first cut returns a validated plan and leaves actual HTTP execution to the caller (the dashboard or a CLI). This keeps the blast radius of a resolver bug small; a bug in `plan()` can't itself fire a destructive HTTP call.
