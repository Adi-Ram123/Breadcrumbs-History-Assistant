from app.db.connection import connect

BODY = {
    "entries": [
        {
            "kind": "visit",
            "url": "https://example.com/ramen",
            "title": "Ramen recipes",
            "visit_time": "2026-11-03T10:00:00-06:00",
            "source": "live",
        }
    ]
}


def test_ingest_valid_returns_ids(client):
    r = client.post("/ingest", json=BODY)
    assert r.status_code == 200
    ids = r.json()["ids"]
    assert len(ids) == 1 and ids[0].startswith("e_")


def test_ingest_bad_kind_422(client):
    bad = {"entries": [{**BODY["entries"][0], "kind": "bookmark"}]}
    assert client.post("/ingest", json=bad).status_code == 422


def test_ingest_is_idempotent(client, settings):
    a = client.post("/ingest", json=BODY).json()["ids"]
    b = client.post("/ingest", json=BODY).json()["ids"]
    assert a == b
    conn = connect(settings.db_path)
    assert conn.execute("select count(*) from entries").fetchone()[0] == 1


def test_delete_entry_204_then_404(client):
    (eid,) = client.post("/ingest", json=BODY).json()["ids"]
    assert client.delete(f"/entries/{eid}").status_code == 204
    assert client.delete(f"/entries/{eid}").status_code == 404


def test_ingest_lone_surrogate_title_is_stored(client):
    # A title cut mid-emoji arrives as JSON "\ud83d" (a lone UTF-16 surrogate).
    raw = (
        '{"entries": [{"kind": "visit", "url": "https://example.com/x", "title": "Movie night \\ud83d",'
        ' "text": "plot \\udc00 summary", "visit_time": "2026-11-03T10:00:00-06:00", "source": "backfill"}]}'
    )
    r = client.post("/ingest", content=raw, headers={"Content-Type": "application/json"})
    assert r.status_code == 200
    assert len(r.json()["ids"]) == 1
