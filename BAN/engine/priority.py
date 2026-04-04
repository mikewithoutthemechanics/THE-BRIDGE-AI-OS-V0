"""BAN — Multi-objective priority scoring engine.

score = w · [impact, revenue, risk, latency, trust]
"""

# Default weight vector (tunable)
DEFAULT_WEIGHTS = {
    "impact": 0.30,
    "revenue": 0.25,
    "risk": -0.15,   # negative = high risk lowers score
    "latency": -0.10, # negative = high latency lowers score
    "trust": 0.20,
}


def compute_priority(
    impact: float,
    revenue: float,
    risk: float,
    latency: float,
    trust: float,
    weights: dict | None = None,
) -> float:
    """Compute weighted priority score for a task vector."""
    w = weights or DEFAULT_WEIGHTS
    score = (
        w["impact"] * impact
        + w["revenue"] * revenue
        + w["risk"] * risk
        + w["latency"] * latency
        + w["trust"] * trust
    )
    return round(max(0.0, min(1.0, score)), 4)


def rank_tasks(tasks: list, weights: dict | None = None) -> list:
    """Sort tasks by priority score descending. Mutates priority_score field."""
    for t in tasks:
        t.priority_score = compute_priority(
            t.impact, t.revenue, t.risk, t.latency, t.trust, weights
        )
    return sorted(tasks, key=lambda t: t.priority_score, reverse=True)
