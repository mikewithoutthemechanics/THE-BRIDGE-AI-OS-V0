"""BAN — Economic filter: execute only if (reward - cost) > 0."""


def economic_value(reward: float, cost: float) -> float:
    """Net value of executing a task."""
    return round(reward - cost, 4)


def is_viable(reward: float, cost: float, threshold: float = 0.0) -> bool:
    """Returns True if task passes economic filter."""
    return economic_value(reward, cost) > threshold


def filter_viable(tasks: list, threshold: float = 0.0) -> list:
    """Filter tasks to only economically viable ones."""
    viable = []
    for t in tasks:
        ev = economic_value(t.reward, t.cost)
        t.economic_value = ev
        if ev > threshold:
            viable.append(t)
    return viable


class Ledger:
    """Simple in-memory economic ledger."""

    def __init__(self):
        self.balance = 10000.0
        self.total_earned = 0.0
        self.total_spent = 0.0
        self.transactions: list[dict] = []

    def credit(self, amount: float, ref: str = ""):
        self.balance += amount
        self.total_earned += amount
        self.transactions.append({"type": "credit", "amount": amount, "ref": ref, "balance": self.balance})

    def debit(self, amount: float, ref: str = ""):
        self.balance -= amount
        self.total_spent += amount
        self.transactions.append({"type": "debit", "amount": amount, "ref": ref, "balance": self.balance})

    def summary(self) -> dict:
        return {
            "balance": round(self.balance, 2),
            "total_earned": round(self.total_earned, 2),
            "total_spent": round(self.total_spent, 2),
            "tx_count": len(self.transactions),
            "last_10": self.transactions[-10:],
        }
