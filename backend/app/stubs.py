"""Default implementations used until ml/ provides real ones."""

from datetime import datetime
from typing import Literal

from app.schemas.api import Answer, Result
from app.schemas.intent import Intent


class StubParser:
    name = "stub"

    def parse(self, question: str, now: datetime, tz: str) -> Intent:
        return Intent(kind="any", time_range=None, topic=question, limit=10, order="relevance")


class MiniLMEmbedder:
    """Stock all-MiniLM-L6-v2. The model loads on first use, not at import."""

    name = "minilm"
    version = "minilm-l6-v2-stock"
    dim = 384
    model_id = "sentence-transformers/all-MiniLM-L6-v2"

    def __init__(self) -> None:
        self._model = None

    def embed(self, texts: list[str]) -> list[list[float]]:
        if self._model is None:
            from sentence_transformers import SentenceTransformer

            self._model = SentenceTransformer(self.model_id)
        vecs = self._model.encode(texts, normalize_embeddings=True)
        return [v.tolist() for v in vecs]


class TemplateAnswerWriter:
    mode: Literal["llm", "template"] = "template"

    def write(self, question: str, intent: Intent, results: list[Result]) -> Answer:
        n = len(results)
        noun = "entry" if n == 1 else "entries"
        return Answer(text=f"Found {n} matching {noun}.", cited=[])
