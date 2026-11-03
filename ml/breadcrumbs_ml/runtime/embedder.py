"""Fine-tuned retriever loader. Implements app.ports.Embedder.

A retriever export lives in ml/models/retriever/<version>/ with a retriever.json:
{"version", "base_model", "dim", "max_seq_length", "pooling", "normalize"}.
Point the backend at it with EMBEDDER=<that path> in backend/.env.
Changing "version" makes the backend re-embed every chunk.
"""

from app.ports import Embedder

NOT_READY = "not implemented yet: see ml/CLAUDE.md Q&A"


def load_embedder(path: str) -> Embedder:
    raise NotImplementedError(NOT_READY)
