from datetime import datetime

from test_ask_api import ENTRIES


def test_health_returns_ok(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert set(body) == {"status", "embedder_version", "parser", "llm_mode", "entry_count", "history_start"}
    assert body["entry_count"] == 0 and body["history_start"] is None


def test_health_counts_entries(client):
    client.post("/ingest", json=ENTRIES)
    body = client.get("/health").json()
    assert body["entry_count"] == 2
    assert datetime.fromisoformat(body["history_start"]) == datetime.fromisoformat("2026-11-02T18:55:00-06:00")
