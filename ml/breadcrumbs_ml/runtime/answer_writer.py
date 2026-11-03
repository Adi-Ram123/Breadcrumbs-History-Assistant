"""LLM answer writer. Implements app.ports.AnswerWriter.

Write one or two sentences that cite only ids from `results`. The backend's
verifier drops any answer that cites anything else and falls back to a template.
Send only titles of the returned entries to the model (proposal decision 6).
"""

from typing import Literal

from app.schemas.api import Answer, Result
from app.schemas.intent import Intent

NOT_READY = "not implemented yet: see ml/CLAUDE.md Q&A"


class LLMAnswerWriter:
    mode: Literal["llm", "template"] = "llm"

    def __init__(self, mode: str) -> None:
        self.llm_mode = mode  # live | replay | record, passed to the LLMClient

    def write(self, question: str, intent: Intent, results: list[Result]) -> Answer:
        raise NotImplementedError(NOT_READY)
