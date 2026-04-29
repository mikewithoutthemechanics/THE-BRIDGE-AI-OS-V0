# Patch Monolith

Production-oriented patch agent monolith for Bridge AI OS.

## What it includes

- Repo registry loader (`repos.json`)
- Persistent memory store (`monolith/memory/*.json`)
- Git wrapper (fetch/pull/branch/commit/push/revert)
- Test/lint/security runners
- Monitoring hook adapter (via verbs)
- Patch planner adapter (collect context -> generate plan -> apply)
- Cross-repo pattern memory
- Self-healing rollback path
- Dashboard event adapter
- Orchestrator for single-repo or all-repo execution

## Layout

- `monolith.py`: all core components and orchestrator
- `main.py`: CLI entrypoint
- `repos.example.json`: sample repo registry
- `tests/test_monolith.py`: unit tests

## Quick start

1. Create a registry file:
   - Copy `monolith/repos.example.json` to `monolith/repos.json`
   - Update repository ids/paths/remotes
2. Run all repos:
   - `python -m monolith.main --repos monolith/repos.json`
3. Run one repo:
   - `python -m monolith.main --repos monolith/repos.json --repo-id bridge-core`
4. Offline mode (no Bridge HTTP calls):
   - `python -m monolith.main --repos monolith/repos.json --offline`

## Bridge integration

By default, the runner uses `BridgeAIOsVerbEngine` and connects to:

- `MONOLITH_BRIDGE_URL` (default `http://127.0.0.1:8080`)
- `MONOLITH_BRIDGE_TOKEN` (optional bearer token)

Current live endpoint mappings:

- `detect_repo_issue` -> `GET /api/system/state`
- `dashboard_event` -> `POST /api/usage/event`

Unmapped verbs still use safe local fallback behavior until dedicated Bridge endpoints are exposed.

## Test

- `python -m unittest monolith.tests.test_monolith -v`

## Bridge AI OS integration points

The `VerbEngine.call()` method is the integration seam for:

- `detect_repo_issue`
- `collect_code_context`
- `generate_patch_plan`
- `apply_code_patch`
- `open_pr`
- `dashboard_event`

Replace this shim with your real verb router so the monolith can use your existing intelligence stack.
