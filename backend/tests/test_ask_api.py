import re
from datetime import datetime

from fastapi.testclient import TestClient
from fakes import FakeEmbedder

from app.main import create_app
from app.schemas.api import Answer, AskResponse
from app.schemas.intent import Intent, TimeRange

ASK = {"question": "ramen recipes", "tz": "America/Chicago"}
ENTRIES = {
    "entries": [
        {"kind": "visit", "url": "https://example.com/ramen", "title": "Ramen recipes",
         "visit_time": "2026-11-02T19:00:00-06:00", "source": "live"},
        {"kind": "search", "url": "https://www.google.com/search?q=ramen+recipes", "query": "ramen recipes",
         "visit_time": "2026-11-02T18:55:00-06:00", "source": "live"},
    ]
}
# Two visits on Sun Nov 1 and one search on Fri Oct 30.
SUN_ENTRIES = {
    "entries": [
        {"kind": "visit", "url": "https://example.com/a", "title": "A",
         "visit_time": "2026-11-01T10:00:00-06:00", "source": "live"},
        {"kind": "visit", "url": "https://example.com/b", "title": "B",
         "visit_time": "2026-11-01T20:00:00-06:00", "source": "live"},
        {"kind": "search", "url": "https://www.google.com/search?q=denver", "query": "denver",
         "visit_time": "2026-10-30T12:00:00-05:00", "source": "live"},
    ]
}


class BadCitingWriter:
    mode = "llm"

    def write(self, question, intent, results):
        return Answer(text="You read the fake page [1].", cited=["e_fake"])


class BrokenWriter:
    mode = "llm"

    def write(self, question, intent, results):
        raise NotImplementedError


class UncitedWriter:
    mode = "llm"

    def write(self, question, intent, results):
        return Answer(text="You searched dune showtimes on Monday.", cited=[])


class CitingWriter:
    mode = "llm"

    def write(self, question, intent, results):
        return Answer(text="You read it [1].", cited=[results[0].id])


class FixedParser:
    name = "fixed"

    def __init__(self, intent):
        self.intent = intent

    def parse(self, question, now, tz):
        return self.intent


class RecordingParser:
    name = "recording"

    def __init__(self):
        self.now = None

    def parse(self, question, now, tz):
        self.now = now
        return Intent(kind="any")


def _client_with(settings, writer):
    return TestClient(create_app(settings, embedder=FakeEmbedder(), answer_writer=writer))


def test_ask_empty_db_no_match(client):
    body = client.post("/ask", json=ASK).json()
    assert body["mode"] == "no-match"
    assert body["results"] == [] and body["template_answer"] is None
    assert body["window_counts"] == {"search": 0, "visit": 0}
    assert body["history_start"] is None


def test_ask_returns_shape_without_answer(client):
    client.post("/ingest", json=ENTRIES)
    body = client.post("/ask", json=ASK).json()
    assert body["mode"] == "results" and len(body["results"]) >= 1
    assert set(body) == set(AskResponse.model_fields) and "answer" not in body
    assert set(body["timings_ms"]) == {"parse", "execute"}
    assert body["template_answer"]["cited"] == [] and body["window_counts"] is None
    assert re.fullmatch(r"a_[0-9a-f]{16}", body["ask_id"])


def test_ask_never_calls_the_writer(settings):
    with _client_with(settings, BrokenWriter()) as c:  # would raise if /ask called it
        c.post("/ingest", json=ENTRIES)
        assert c.post("/ask", json=ASK).json()["mode"] == "results"


def test_no_match_counts_ignore_topic_and_respect_kind_and_range(settings):
    sun = Intent(
        kind="search",
        time_range=TimeRange(start="2026-11-01T00:00:00-05:00", end="2026-11-02T00:00:00-06:00"),
        topic="denver",
    )
    with TestClient(create_app(settings, embedder=FakeEmbedder(), parser=FixedParser(sun))) as c:
        c.post("/ingest", json=SUN_ENTRIES)
        body = c.post("/ask", json=ASK).json()
    assert body["mode"] == "no-match"
    assert body["window_counts"] == {"search": 0, "visit": 2}
    assert datetime.fromisoformat(body["history_start"]) == datetime.fromisoformat("2026-10-30T12:00:00-05:00")


def test_now_is_honored_only_with_debug_fixed_now(settings):
    fixed = "2026-01-05T12:00:00-06:00"
    parser = RecordingParser()
    with TestClient(create_app(settings, embedder=FakeEmbedder(), parser=parser)) as c:
        c.post("/ask", json={**ASK, "now": fixed})
    assert parser.now != datetime.fromisoformat(fixed)

    debug = settings.model_copy(update={"debug_fixed_now": True})
    parser = RecordingParser()
    with TestClient(create_app(debug, embedder=FakeEmbedder(), parser=parser)) as c:
        c.post("/ask", json={**ASK, "now": fixed})
    assert parser.now == datetime.fromisoformat(fixed)
