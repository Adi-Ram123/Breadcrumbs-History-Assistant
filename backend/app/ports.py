"""Interfaces between the backend (Daniel) and model code in ml/ (Aditya).

The backend only talks to models through these Protocols. Implementations are
picked by name in app/registry.py from backend/.env.
"""

from datetime import datetime
from typing import Literal, Protocol, runtime_checkable

from app.schemas.api import Answer, Result
from app.schemas.intent import Intent


@runtime_checkable
class Parser(Protocol):
    name: str

    def parse(self, question: str, now: datetime, tz: str) -> Intent:
        """Turn a question into an Intent. `now` and `tz` are passed in; never read the clock."""
        ...


@runtime_checkable
class Embedder(Protocol):
    name: str
    version: str  # changing it makes the backend re-embed every chunk
    dim: int

    def embed(self, texts: list[str]) -> list[list[float]]:
        """Return one L2-normalized vector of length `dim` per text."""
        ...


@runtime_checkable
class LLMClient(Protocol):
    mode: str  # live | replay | record

    def complete(self, messages: list[dict[str, str]], json_schema: dict) -> str:
        """Return the model's JSON text, constrained to `json_schema`."""
        ...


@runtime_checkable
class AnswerWriter(Protocol):
    mode: Literal["llm", "template"]

    def write(self, question: str, intent: Intent, results: list[Result]) -> Answer:
        """Write a short answer that cites only ids from `results`. The verifier checks this."""
        ...
