"""Test-only components. Deterministic, no network, no model downloads."""

import hashlib
import math
import re


class FakeEmbedder:
    """Bag-of-words hashed into `dim` buckets, then L2-normalized.

    Texts that share words land closer together, which is enough to test ranking.
    """

    name = "fake"
    dim = 8

    def __init__(self, version: str = "fake-v1"):
        self.version = version

    def embed(self, texts: list[str]) -> list[list[float]]:
        out = []
        for text in texts:
            vec = [0.0] * self.dim
            for word in re.findall(r"[a-z0-9]+", text.lower()):
                bucket = int(hashlib.md5(word.encode()).hexdigest(), 16) % self.dim
                vec[bucket] += 1.0
            norm = math.sqrt(sum(v * v for v in vec)) or 1.0
            out.append([v / norm for v in vec])
        return out


def make_settings(tmp_path):
    """Settings for tests: every field at its code default, ignoring env vars and backend/.env."""
    from app.config import Settings

    defaults = {name: field.default for name, field in Settings.model_fields.items()}
    return Settings(_env_file=None, **{**defaults, "db_path": tmp_path / "t.db"})
