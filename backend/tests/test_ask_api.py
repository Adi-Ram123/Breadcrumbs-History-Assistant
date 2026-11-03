from fastapi.testclient import TestClient
from fakes import FakeEmbedder

from app.main import create_app
from app.schemas.api import Answer, AskResponse

ASK = {"question": "ramen recipes", "tz": "America/Chicago"}
ENTRIES = {
    "entries": [
        {"kind": "visit", "url": "https://example.com/ramen", "title": "Ramen recipes",
         "visit_time": "2026-11-02T19:00:00-06:00", "source": "live"},
        {"kind": "search", "url": "https://www.google.com/search?q=ramen+recipes", "query": "ramen recipes",
         "visit_time": "2026-11-02T18:55:00-06:00", "source": "live"},
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


def test_ask_empty_db_no_match(client):
    body = client.post("/ask", json=ASK).json()
    assert body["mode"] == "no-match"
    assert body["results"] == [] and body["answer"] is None


def test_ask_returns_shape(client):
    client.post("/ingest", json=ENTRIES)
    body = client.post("/ask", json=ASK).json()
    assert body["mode"] == "template"
    assert len(body["results"]) >= 1
    assert set(body) == set(AskResponse.model_fields)
    assert set(body["timings_ms"]) == {"parse", "execute", "write"}


def _client_with(settings, writer):
    return TestClient(create_app(settings, embedder=FakeEmbedder(), answer_writer=writer))


def test_ask_llm_answer_with_bad_citation_falls_back(settings):
    with _client_with(settings, BadCitingWriter()) as c:
        c.post("/ingest", json=ENTRIES)
        body = c.post("/ask", json=ASK).json()
    assert body["mode"] == "template"
    assert body["answer"]["cited"] == []


def test_ask_writer_exception_falls_back(settings):
    with _client_with(settings, BrokenWriter()) as c:
        c.post("/ingest", json=ENTRIES)
        body = c.post("/ask", json=ASK).json()
    assert body["mode"] == "template"


class UncitedWriter:
    mode = "llm"

    def write(self, question, intent, results):
        return Answer(text="You searched dune showtimes on Monday.", cited=[])


def test_ask_llm_answer_without_citation_falls_back(settings):
    with _client_with(settings, UncitedWriter()) as c:
        c.post("/ingest", json=ENTRIES)
        body = c.post("/ask", json=ASK).json()
    assert body["mode"] == "template"
