"""BAN — Task router: selects best node for a given task."""
from __future__ import annotations
from backend.models import NodeInfo


def route_task(nodes: list[NodeInfo], trust_required: float = 0.0) -> NodeInfo | None:
    """Select best available node.

    Scoring: trust_score * 0.5 + (1 - latency_norm) * 0.3 + capacity_ratio * 0.2
    Only considers online nodes with available capacity and sufficient trust.
    """
    candidates = [
        n for n in nodes
        if n.online and n.active_tasks < n.capacity and n.trust_score >= trust_required
    ]
    if not candidates:
        return None

    max_latency = max(n.latency_ms for n in candidates) or 1
    max_capacity = max(n.capacity for n in candidates) or 1

    def score(n: NodeInfo) -> float:
        latency_norm = 1 - (n.latency_ms / max_latency)
        capacity_ratio = (n.capacity - n.active_tasks) / max_capacity
        return n.trust_score * 0.5 + latency_norm * 0.3 + capacity_ratio * 0.2

    return max(candidates, key=score)
