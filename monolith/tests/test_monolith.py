from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from monolith.monolith import BridgeAIOsVerbEngine, MemoryStore, Orchestrator, RepoRegistry, VerbEngine


class MemoryStoreTests(unittest.TestCase):
    def test_log_event_persists(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            store = MemoryStore(tmp)
            store.log_event("repo-x", {"type": "event-a"})
            data = store.load_repo("repo-x")
            self.assertIn("events", data)
            self.assertEqual(len(data["events"]), 1)
            self.assertEqual(data["events"][0]["type"], "event-a")


class RepoRegistryTests(unittest.TestCase):
    def test_load_registry(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "repos.json"
            path.write_text(
                json.dumps(
                    {
                        "repos": [
                            {
                                "id": "a",
                                "path": ".",
                                "default_branch": "main",
                                "stack": ["python"],
                                "policy": {"auto_push": False},
                            }
                        ]
                    }
                ),
                encoding="utf-8",
            )
            registry = RepoRegistry(str(path))
            repos = registry.list()
            self.assertEqual(len(repos), 1)
            self.assertEqual(registry.get("a")["id"], "a")


class VerbEngineSmokeTests(unittest.TestCase):
    def test_default_verb_engine_detect_issue_is_empty(self) -> None:
        engine = VerbEngine()
        issue = engine.call("detect_repo_issue", {"repo_id": "x", "repo_path": "."})
        self.assertEqual(issue, {})


class BridgeVerbEngineTests(unittest.TestCase):
    @patch("monolith.monolith.BridgeAIOsVerbEngine._http_json")
    def test_detect_issue_maps_failed_execution(self, mock_http) -> None:
        mock_http.return_value = {"agents": {"execution_status": "failed"}}
        engine = BridgeAIOsVerbEngine()
        issue = engine.call("detect_repo_issue", {"repo_id": "x", "repo_path": "."})
        self.assertEqual(issue["type"], "agents_execution_failed")

    @patch("monolith.monolith.BridgeAIOsVerbEngine._http_json")
    def test_dashboard_event_posts_usage(self, mock_http) -> None:
        mock_http.return_value = {"ok": True}
        engine = BridgeAIOsVerbEngine()
        res = engine.call("dashboard_event", {"message": "hello"})
        self.assertTrue(res["ok"])


class OrchestratorIdleTests(unittest.TestCase):
    def test_orchestrator_returns_sync_failure_for_non_git_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            repos_path = Path(tmp) / "repos.json"
            repos_path.write_text(
                json.dumps(
                    {
                        "repos": [
                            {
                                "id": "bad-repo",
                                "path": tmp,
                                "default_branch": "main",
                                "stack": ["python"],
                                "policy": {"auto_push": False},
                            }
                        ]
                    }
                ),
                encoding="utf-8",
            )

            registry = RepoRegistry(str(repos_path))
            memory = MemoryStore(str(Path(tmp) / "memory"))
            orchestrator = Orchestrator(registry, memory, VerbEngine(), dashboard=type("D", (), {"log": lambda *_a, **_k: None})())
            result = orchestrator.run_all_repos()[0]
            self.assertFalse(result["ok"])
            self.assertEqual(result["stage"], "sync")


if __name__ == "__main__":
    unittest.main()
