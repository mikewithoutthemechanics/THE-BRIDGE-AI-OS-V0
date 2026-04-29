from __future__ import annotations

import argparse
import json
import os

from monolith.monolith import BridgeAIOsVerbEngine, Dashboard, MemoryStore, Orchestrator, RepoRegistry, VerbEngine


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Bridge AI OS Patch Monolith")
    parser.add_argument("--repos", default="monolith/repos.json", help="Path to repo registry JSON")
    parser.add_argument("--memory", default="monolith/memory", help="Directory for monolith memory files")
    parser.add_argument("--repo-id", default=None, help="Run for a single repo id")
    parser.add_argument("--bridge-url", default=os.getenv("MONOLITH_BRIDGE_URL", "http://127.0.0.1:8080"), help="Bridge API base URL")
    parser.add_argument("--bridge-token", default=os.getenv("MONOLITH_BRIDGE_TOKEN", ""), help="Bridge bearer token")
    parser.add_argument("--offline", action="store_true", help="Disable Bridge HTTP integration and use local shim")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    registry = RepoRegistry(args.repos)
    memory = MemoryStore(args.memory)
    verbs = VerbEngine() if args.offline else BridgeAIOsVerbEngine(base_url=args.bridge_url, token=args.bridge_token)
    dashboard = Dashboard(verbs)
    orchestrator = Orchestrator(registry, memory, verbs, dashboard)

    if args.repo_id:
        repo = registry.get(args.repo_id)
        result = orchestrator.run_repo_cycle(repo)
        print(json.dumps(result, indent=2))
        return 0 if result.get("ok") else 1

    results = orchestrator.run_all_repos()
    print(json.dumps(results, indent=2))
    all_ok = all(item.get("ok") for item in results)
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
