"""BAN — Consensus engine (single-process simulation).

Resolution: highest trust_score wins leader election.
"""
from __future__ import annotations
from datetime import datetime
from backend.models import ConsensusState, NodeInfo


class ConsensusEngine:
    """Simple trust-based consensus."""

    def __init__(self):
        self.state = ConsensusState()

    def run_round(self, nodes: list[NodeInfo]) -> ConsensusState:
        """Execute a consensus round. Highest trust node becomes leader."""
        self.state.round += 1
        self.state.votes = {}
        self.state.resolved = False

        online = [n for n in nodes if n.online]
        if not online:
            self.state.leader = "none"
            self.state.leader_trust = 0.0
            self.state.resolved = True
            self.state.last_updated = datetime.utcnow().isoformat()
            return self.state

        # Each node votes for the highest-trust peer (excluding self for fairness)
        for voter in online:
            candidates = [n for n in online if n.id != voter.id] or online
            best = max(candidates, key=lambda n: n.trust_score)
            self.state.votes[voter.id] = best.id

        # Tally votes
        tally: dict[str, int] = {}
        for voted_for in self.state.votes.values():
            tally[voted_for] = tally.get(voted_for, 0) + 1

        winner_id = max(tally, key=lambda k: (tally[k], next((n.trust_score for n in online if n.id == k), 0)))
        winner = next((n for n in online if n.id == winner_id), online[0])

        self.state.leader = winner.name
        self.state.leader_trust = winner.trust_score
        self.state.resolved = True
        self.state.last_updated = datetime.utcnow().isoformat()
        return self.state

    def get_state(self) -> ConsensusState:
        return self.state
