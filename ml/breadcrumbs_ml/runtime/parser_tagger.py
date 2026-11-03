"""Trained parser (DistilBERT token tagger or LoRA, see Q&A item 5). Must run offline in under 200ms on a laptop CPU.

Implements app.ports.Parser. Never read the clock: use the `now` and `tz` arguments.
"""

from datetime import datetime

from app.schemas.intent import Intent

NOT_READY = "not implemented yet: see ml/CLAUDE.md Q&A"


class TaggerParser:
    name = "tagger"

    def parse(self, question: str, now: datetime, tz: str) -> Intent:
        raise NotImplementedError(NOT_READY)
