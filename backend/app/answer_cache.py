"""In-memory cache of recent asks, so POST /answer can write the answer for a POST /ask.

Expiry uses a monotonic clock. That does not break the "now is passed in" rule:
no answer depends on it, only whether an ask is still available. Nothing here
is written to SQLite, and restarting the backend clears it.
"""

import secrets
import threading
import time
from collections import OrderedDict
from collections.abc import Callable
from dataclasses import dataclass

from app.schemas.api import Answer, Result
from app.schemas.intent import Intent


@dataclass(frozen=True)
class CachedAsk:
    question: str
    intent: Intent
    results: list[Result]
    template_answer: Answer


class AnswerCache:
    """The `max_entries` most recent asks (oldest evicted first), each kept for `ttl_s` seconds."""

    def __init__(
        self, *, max_entries: int = 50, ttl_s: float = 600.0, clock: Callable[[], float] = time.monotonic
    ) -> None:
        self._max = max_entries
        self._ttl = ttl_s
        self._clock = clock
        self._items: OrderedDict[str, tuple[float, CachedAsk]] = OrderedDict()
        self._lock = threading.Lock()  # sync routes run in FastAPI's thread pool

    def put(self, item: CachedAsk) -> str:
        ask_id = "a_" + secrets.token_hex(8)
        with self._lock:
            self._items[ask_id] = (self._clock(), item)
            while len(self._items) > self._max:
                self._items.popitem(last=False)
        return ask_id

    def get(self, ask_id: str) -> CachedAsk | None:
        with self._lock:
            entry = self._items.get(ask_id)
            if entry is None:
                return None
            put_at, item = entry
            if self._clock() - put_at >= self._ttl:
                del self._items[ask_id]
                return None
            return item
