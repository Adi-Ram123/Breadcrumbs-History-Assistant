from fastapi.testclient import TestClient
from fakes import FakeEmbedder
from test_ask_api import ASK, ENTRIES, BadCitingWriter, BrokenWriter, CitingWriter, UncitedWriter, _client_with

from app.answer_cache import AnswerCache
from app.main import create_app
from app.schemas.api import AnswerResponse


def _ask(c):
    c.post("/ingest", json=ENTRIES)
    return c.post("/ask", json=ASK).json()


def _answer(c, ask):
    return c.post("/answer", json={"ask_id": ask["ask_id"]}).json()


def test_valid_citation_is_llm(settings):
    with _client_with(settings, CitingWriter()) as c:
        ask = _ask(c)
        body = _answer(c, ask)
    assert body["mode"] == "llm" and body["fallback_reason"] is None
    assert body["answer"]["cited"] == [ask["results"][0]["id"]]
    assert set(body) == set(AnswerResponse.model_fields) and set(body["timings_ms"]) == {"write"}


def test_foreign_citation_falls_back_rejected_citation(settings):
    with _client_with(settings, BadCitingWriter()) as c:
        ask = _ask(c)
        body = _answer(c, ask)
    assert body["mode"] == "template" and body["fallback_reason"] == "rejected_citation"
    assert body["answer"] == ask["template_answer"] and body["answer"]["cited"] == []


def test_uncited_answer_falls_back_rejected_citation(settings):
    with _client_with(settings, UncitedWriter()) as c:
        ask = _ask(c)
        body = _answer(c, ask)
    assert body["mode"] == "template" and body["fallback_reason"] == "rejected_citation"


def test_writer_exception_falls_back_llm_error(settings):
    with _client_with(settings, BrokenWriter()) as c:
        ask = _ask(c)
        body = _answer(c, ask)
    assert body["mode"] == "template" and body["fallback_reason"] == "llm_error"
    assert body["answer"] == ask["template_answer"]


def test_llm_off_returns_template_llm_off(client):
    ask = _ask(client)
    body = _answer(client, ask)
    assert body["mode"] == "template" and body["fallback_reason"] == "llm_off"
    assert body["answer"] == ask["template_answer"]


def test_unknown_ask_id_is_404(client):
    assert client.post("/answer", json={"ask_id": "a_0000000000000000"}).status_code == 404


def test_expired_ask_id_is_404(settings):
    t = [0.0]
    cache = AnswerCache(clock=lambda: t[0])
    with TestClient(create_app(settings, embedder=FakeEmbedder(), answer_cache=cache)) as c:
        ask = _ask(c)
        t[0] = 600.0
        assert c.post("/answer", json={"ask_id": ask["ask_id"]}).status_code == 404


def test_no_match_ask_id_is_404(client):
    ask = client.post("/ask", json=ASK).json()
    assert ask["mode"] == "no-match"
    assert client.post("/answer", json={"ask_id": ask["ask_id"]}).status_code == 404
