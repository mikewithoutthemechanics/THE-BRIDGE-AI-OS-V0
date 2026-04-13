"""BAN — Node registry with static initial nodes."""
from __future__ import annotations
from backend.models import NodeInfo


def create_default_nodes() -> dict[str, NodeInfo]:
    """Seed the registry with Ryan, Mike, and Marvin."""
    nodes = [
        NodeInfo(id="node-ryan",   name="Ryan",   capacity=15, latency_ms=12,  trust_score=0.95, online=True),
        NodeInfo(id="node-mike",   name="Mike",   capacity=10, latency_ms=35,  trust_score=0.88, online=True),
        NodeInfo(id="node-marvin", name="Marvin", capacity=8,  latency_ms=60,  trust_score=0.78, online=True),
    ]
    return {n.id: n for n in nodes}


class NodeRegistry:
    """In-memory node registry."""

    def __init__(self):
        self.nodes: dict[str, NodeInfo] = create_default_nodes()

    def get(self, node_id: str) -> NodeInfo | None:
        return self.nodes.get(node_id)

    def all(self) -> list[NodeInfo]:
        return list(self.nodes.values())

    def online(self) -> list[NodeInfo]:
        return [n for n in self.nodes.values() if n.online]

    def add(self, node: NodeInfo):
        self.nodes[node.id] = node

    def set_online(self, node_id: str, status: bool):
        if node_id in self.nodes:
            self.nodes[node_id].online = status

    def record_completion(self, node_id: str, success: bool):
        n = self.nodes.get(node_id)
        if not n:
            return
        if success:
            n.completed_tasks += 1
            n.trust_score = min(1.0, n.trust_score + 0.005)
        else:
            n.failed_tasks += 1
            n.trust_score = max(0.0, n.trust_score - 0.02)
