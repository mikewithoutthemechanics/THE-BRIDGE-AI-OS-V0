from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib import error as urlerror
from urllib import request as urlrequest


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class RepoRegistry:
    def __init__(self, path: str = "monolith/repos.json") -> None:
        self.path = Path(path)
        self._cache: Optional[List[Dict[str, Any]]] = None

    def load(self) -> List[Dict[str, Any]]:
        if not self.path.exists():
            raise FileNotFoundError(f"Repo registry not found: {self.path}")
        raw = json.loads(self.path.read_text(encoding="utf-8"))
        repos = raw.get("repos", [])
        if not isinstance(repos, list):
            raise ValueError("repos.json must contain a 'repos' list")
        self._cache = repos
        return repos

    def list(self) -> List[Dict[str, Any]]:
        return self._cache if self._cache is not None else self.load()

    def get(self, repo_id: str) -> Dict[str, Any]:
        for repo in self.list():
            if repo.get("id") == repo_id:
                return repo
        raise KeyError(f"Repository '{repo_id}' not found")


class MemoryStore:
    def __init__(self, base_dir: str = "monolith/memory") -> None:
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _repo_path(self, repo_id: str) -> Path:
        return self.base_dir / f"{repo_id}.json"

    def _load_json(self, path: Path) -> Dict[str, Any]:
        if not path.exists():
            return {}
        return json.loads(path.read_text(encoding="utf-8"))

    def _save_json(self, path: Path, data: Dict[str, Any]) -> None:
        data["last_updated"] = utc_now_iso()
        path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    def load_repo(self, repo_id: str) -> Dict[str, Any]:
        return self._load_json(self._repo_path(repo_id))

    def save_repo(self, repo_id: str, data: Dict[str, Any]) -> None:
        self._save_json(self._repo_path(repo_id), data)

    def load_global(self) -> Dict[str, Any]:
        return self._load_json(self.base_dir / "global-patterns.json")

    def save_global(self, data: Dict[str, Any]) -> None:
        self._save_json(self.base_dir / "global-patterns.json", data)

    def log_event(self, repo_id: str, event: Dict[str, Any]) -> None:
        repo_data = self.load_repo(repo_id)
        events = repo_data.setdefault("events", [])
        event.setdefault("time", utc_now_iso())
        events.append(event)
        self.save_repo(repo_id, repo_data)


@dataclass
class CmdResult:
    returncode: int
    stdout: str
    stderr: str

    @property
    def ok(self) -> bool:
        return self.returncode == 0


class GitWrapper:
    def __init__(self, repo_path: str) -> None:
        self.repo_path = Path(repo_path)

    def run(self, command: List[str]) -> CmdResult:
        proc = subprocess.run(
            command,
            cwd=self.repo_path,
            capture_output=True,
            text=True,
            shell=False,
        )
        return CmdResult(proc.returncode, proc.stdout, proc.stderr)

    def fetch_and_pull(self, branch: str) -> CmdResult:
        fetch = self.run(["git", "fetch", "--all"])
        if not fetch.ok:
            return fetch
        return self.run(["git", "pull", "origin", branch])

    def create_branch(self, branch: str) -> CmdResult:
        return self.run(["git", "checkout", "-b", branch])

    def add_all(self) -> CmdResult:
        return self.run(["git", "add", "."])

    def commit(self, message: str) -> CmdResult:
        return self.run(["git", "commit", "-m", message])

    def push(self, branch: str) -> CmdResult:
        return self.run(["git", "push", "origin", branch])

    def reset_hard(self, ref: str = "HEAD") -> CmdResult:
        return self.run(["git", "reset", "--hard", ref])


class TestRunner:
    def __init__(self, repo_path: str, stack: List[str]) -> None:
        self.repo_path = Path(repo_path)
        self.stack = set(stack or [])

    def _run(self, command: List[str]) -> CmdResult:
        proc = subprocess.run(
            command,
            cwd=self.repo_path,
            capture_output=True,
            text=True,
            shell=False,
        )
        return CmdResult(proc.returncode, proc.stdout, proc.stderr)

    def run_tests(self) -> CmdResult:
        if "python" in self.stack:
            return self._run(["python", "-m", "pytest", "-q"])
        if "node" in self.stack or "javascript" in self.stack or "typescript" in self.stack:
            return self._run(["npm", "test", "--silent"])
        return CmdResult(0, "No test command configured for stack", "")

    def run_lint(self) -> CmdResult:
        if "python" in self.stack:
            return self._run(["python", "-m", "flake8"])
        if "node" in self.stack or "javascript" in self.stack or "typescript" in self.stack:
            return self._run(["npm", "run", "lint", "--silent"])
        return CmdResult(0, "No lint command configured for stack", "")

    def run_security(self) -> CmdResult:
        if "python" in self.stack:
            return self._run(["python", "-m", "bandit", "-q", "-r", "."])
        if "node" in self.stack or "javascript" in self.stack or "typescript" in self.stack:
            return self._run(["npm", "audit", "--audit-level=high"])
        return CmdResult(0, "No security command configured for stack", "")


class VerbEngine:
    """BridgeAI OS integration shim.

    Replace/extend `call()` with real verb routing for your environment.
    """

    def call(self, verb: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        if verb == "detect_repo_issue":
            return {}
        if verb == "collect_code_context":
            return {"files": [], "hints": []}
        if verb == "generate_patch_plan":
            issue = payload.get("issue", {})
            return {
                "summary": issue.get("summary", "Patch issue"),
                "changes": [],
            }
        if verb == "apply_code_patch":
            return {"ok": True, "applied": True}
        if verb == "open_pr":
            return {"ok": True, "url": None}
        if verb == "dashboard_event":
            return {"ok": True}
        return {"ok": True}


class BridgeAIOsVerbEngine(VerbEngine):
    """HTTP-backed Bridge AI OS verb adapter with safe local fallbacks.

    It uses existing platform endpoints where available:
    - GET /api/system/state        -> detect_repo_issue
    - POST /api/usage/event        -> dashboard_event
    """

    def __init__(self, base_url: str = "http://127.0.0.1:8080", token: str = "", timeout_s: float = 8.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.timeout_s = timeout_s

    def _headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    def _http_json(self, method: str, path: str, body: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")
        req = urlrequest.Request(
            url=f"{self.base_url}{path}",
            method=method,
            headers=self._headers(),
            data=data,
        )
        with urlrequest.urlopen(req, timeout=self.timeout_s) as resp:
            raw = resp.read().decode("utf-8") if resp else "{}"
            return json.loads(raw or "{}")

    def call(self, verb: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        if verb == "detect_repo_issue":
            try:
                state = self._http_json("GET", "/api/system/state")
                agents = state.get("agents", {})
                status = (agents.get("execution_status") or "").lower()
                if status in {"failed", "error"}:
                    return {
                        "id": f"system-state-{int(datetime.now(timezone.utc).timestamp())}",
                        "type": "agents_execution_failed",
                        "summary": "Agents execution status is failed in system state",
                        "details": {"execution_status": status},
                    }
                return {}
            except Exception:
                return {}

        if verb == "dashboard_event":
            try:
                self._http_json(
                    "POST",
                    "/api/usage/event",
                    {
                        "userId": "patch-monolith",
                        "feature": "monolith.dashboard_event",
                        "meta": payload,
                    },
                )
                return {"ok": True}
            except Exception:
                return {"ok": False}

        # For verbs that are not yet exposed by Bridge endpoints, keep inherited fallback.
        try:
            return super().call(verb, payload)
        except (ValueError, KeyError, urlerror.URLError):
            return {"ok": False, "error": "verb execution failed", "verb": verb}


class Dashboard:
    def __init__(self, verb_engine: Optional[VerbEngine] = None) -> None:
        self.verb_engine = verb_engine

    def log(self, message: str, level: str = "info", extra: Optional[Dict[str, Any]] = None) -> None:
        line = f"[MONOLITH/{level.upper()}] {message}"
        print(line)
        if self.verb_engine:
            self.verb_engine.call("dashboard_event", {"message": message, "level": level, "extra": extra or {}})


class MonitoringHooks:
    def __init__(self, verbs: VerbEngine) -> None:
        self.verbs = verbs

    def detect_issue(self, repo_meta: Dict[str, Any]) -> Dict[str, Any]:
        return self.verbs.call(
            "detect_repo_issue",
            {"repo_id": repo_meta["id"], "repo_path": repo_meta["path"]},
        )


class PatchPlanner:
    def __init__(self, verbs: VerbEngine) -> None:
        self.verbs = verbs

    def collect_context(self, repo_meta: Dict[str, Any], issue: Dict[str, Any]) -> Dict[str, Any]:
        return self.verbs.call(
            "collect_code_context",
            {"repo_id": repo_meta["id"], "repo_path": repo_meta["path"], "issue": issue},
        )

    def generate_plan(self, repo_meta: Dict[str, Any], issue: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        return self.verbs.call(
            "generate_patch_plan",
            {"repo": repo_meta, "issue": issue, "context": context},
        )

    def apply_plan(self, repo_path: str, plan: Dict[str, Any]) -> Dict[str, Any]:
        return self.verbs.call("apply_code_patch", {"repo_path": repo_path, "patch_plan": plan})


class CrossRepoIntelligence:
    def __init__(self, memory: MemoryStore) -> None:
        self.memory = memory

    def update_global_patterns(self, repo_id: str, issue: Dict[str, Any], success: bool) -> None:
        global_mem = self.memory.load_global()
        patterns = global_mem.setdefault("patterns", [])
        patterns.append(
            {
                "repo_id": repo_id,
                "issue_type": issue.get("type", "unknown"),
                "issue_summary": issue.get("summary", ""),
                "success": success,
                "time": utc_now_iso(),
            }
        )
        self.memory.save_global(global_mem)


class SelfHealing:
    def rollback(self, git: GitWrapper) -> CmdResult:
        return git.reset_hard("HEAD")


class Orchestrator:
    def __init__(
        self,
        registry: RepoRegistry,
        memory: MemoryStore,
        verbs: VerbEngine,
        dashboard: Dashboard,
    ) -> None:
        self.registry = registry
        self.memory = memory
        self.verbs = verbs
        self.dashboard = dashboard
        self.monitoring = MonitoringHooks(verbs)
        self.planner = PatchPlanner(verbs)
        self.cross_repo = CrossRepoIntelligence(memory)
        self.self_heal = SelfHealing()

    def _branch_name(self, repo_id: str, issue: Dict[str, Any]) -> str:
        issue_id = issue.get("id") or datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        return f"patch/{repo_id}/{issue_id}"

    def run_repo_cycle(self, repo_meta: Dict[str, Any]) -> Dict[str, Any]:
        repo_id = repo_meta["id"]
        git = GitWrapper(repo_meta["path"])
        tests = TestRunner(repo_meta["path"], repo_meta.get("stack", []))

        self.dashboard.log(f"Sync {repo_id}")
        sync = git.fetch_and_pull(repo_meta.get("default_branch", "main"))
        if not sync.ok:
            self.memory.log_event(repo_id, {"type": "sync_failed", "stderr": sync.stderr})
            return {"ok": False, "repo_id": repo_id, "stage": "sync", "error": sync.stderr}

        issue = self.monitoring.detect_issue(repo_meta)
        if not issue:
            self.memory.log_event(repo_id, {"type": "healthy_no_issue"})
            self.dashboard.log(f"{repo_id}: no issue detected")
            return {"ok": True, "repo_id": repo_id, "stage": "idle"}

        branch = self._branch_name(repo_id, issue)
        self.dashboard.log(f"{repo_id}: issue detected, patching on {branch}")

        branch_result = git.create_branch(branch)
        if not branch_result.ok:
            self.memory.log_event(repo_id, {"type": "branch_failed", "stderr": branch_result.stderr})
            return {"ok": False, "repo_id": repo_id, "stage": "branch", "error": branch_result.stderr}

        context = self.planner.collect_context(repo_meta, issue)
        plan = self.planner.generate_plan(repo_meta, issue, context)
        apply_result = self.planner.apply_plan(repo_meta["path"], plan)

        tests_result = tests.run_tests()
        lint_result = tests.run_lint()
        security_result = tests.run_security()
        success = tests_result.ok and lint_result.ok

        event = {
            "type": "patch_attempt",
            "repo_id": repo_id,
            "issue": issue,
            "branch": branch,
            "plan": plan,
            "apply_result": apply_result,
            "tests_ok": tests_result.ok,
            "lint_ok": lint_result.ok,
            "security_ok": security_result.ok,
            "tests_log": tests_result.stdout + tests_result.stderr,
            "lint_log": lint_result.stdout + lint_result.stderr,
            "security_log": security_result.stdout + security_result.stderr,
        }
        self.memory.log_event(repo_id, event)
        self.cross_repo.update_global_patterns(repo_id, issue, success)

        if success:
            git.add_all()
            commit = git.commit(f"Auto-patch: {issue.get('summary', issue.get('type', 'unknown issue'))}")
            if not commit.ok:
                return {"ok": False, "repo_id": repo_id, "stage": "commit", "error": commit.stderr}

            policy = repo_meta.get("policy", {})
            if policy.get("auto_push", False):
                push = git.push(branch)
                if not push.ok:
                    return {"ok": False, "repo_id": repo_id, "stage": "push", "error": push.stderr}
            else:
                self.verbs.call(
                    "open_pr",
                    {
                        "repo_id": repo_id,
                        "branch": branch,
                        "title": f"Auto-patch: {issue.get('summary', issue.get('type', 'issue'))}",
                    },
                )

            self.dashboard.log(f"{repo_id}: patch succeeded")
            return {"ok": True, "repo_id": repo_id, "stage": "patched", "branch": branch}

        self.self_heal.rollback(git)
        self.dashboard.log(f"{repo_id}: patch failed and was reverted", level="warn")
        return {"ok": False, "repo_id": repo_id, "stage": "reverted", "branch": branch}

    def run_all_repos(self) -> List[Dict[str, Any]]:
        results = []
        for repo_meta in self.registry.list():
            try:
                results.append(self.run_repo_cycle(repo_meta))
            except Exception as exc:
                repo_id = repo_meta.get("id", "unknown")
                self.memory.log_event(repo_id, {"type": "orchestrator_exception", "error": str(exc)})
                results.append({"ok": False, "repo_id": repo_id, "stage": "exception", "error": str(exc)})
        return results
