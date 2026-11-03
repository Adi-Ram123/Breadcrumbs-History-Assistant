"""LLM parser: question -> Intent JSON via LLMClient with schema-constrained output, temperature 0.

Implements app.ports.Parser. Never read the clock: use the `now` and `tz` arguments.
"""

from datetime import datetime

from app.schemas.intent import Intent

NOT_READY = "not implemented yet: see ml/CLAUDE.md Q&A"


class LLMParser:
    name = "llm"

    def parse(self, question: str, now: datetime, tz: str) -> Intent:
        raise NotImplementedError(NOT_READY)
