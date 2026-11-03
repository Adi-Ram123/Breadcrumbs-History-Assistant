"""Rule-based time-phrase parser. Follows docs/time-rules.md exactly.

Implements app.ports.Parser. Never read the clock: use the `now` and `tz` arguments.
"""

from datetime import datetime

from app.schemas.intent import Intent

NOT_READY = "not implemented yet: see ml/CLAUDE.md Q&A"


class RulesParser:
    name = "rules"

    def parse(self, question: str, now: datetime, tz: str) -> Intent:
        raise NotImplementedError(NOT_READY)
