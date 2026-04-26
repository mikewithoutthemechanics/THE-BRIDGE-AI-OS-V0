"""Single-source superuser loader for the Python backend.

Reads shared/superusers.json at import time. Falls back to the hardcoded list
if the file is missing or malformed so a bad edit can't lock every admin out.
"""

from __future__ import annotations

import json
import logging
import os
from typing import List

_FALLBACK = [
    "ryanpcowan@gmail.com",
    "michaelgraemek@gmail.com",
    "marvin.saunders@gmail.com",
]


def _load() -> List[str]:
    path = os.path.join(os.path.dirname(__file__), "superusers.json")
    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        emails = [
            str(row.get("email", "")).strip().lower()
            for row in data.get("superusers", [])
            if isinstance(row, dict) and row.get("email")
        ]
        emails = [e for e in emails if e]
        if emails:
            return emails
    except Exception as err:
        logging.getLogger(__name__).warning(
            "[superusers] failed to read shared/superusers.json, falling back: %s", err
        )
    return list(_FALLBACK)


EMAILS: List[str] = _load()


def is_superuser(email: str) -> bool:
    if not isinstance(email, str):
        return False
    return email.strip().lower() in EMAILS
