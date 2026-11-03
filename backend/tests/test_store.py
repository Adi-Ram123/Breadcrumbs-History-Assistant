from datetime import datetime, timedelta, timezone

import pytest
from fakes import FakeEmbedder

from app.db.connection import connect, init_db
from app.index.store import delete_entry, ensure_embedder_version, upsert_entries
from app.index.urls import page_id
from app.schemas.ingest import IngestEntry

T0 = datetime(2026, 11, 3, 10, 0, tzinfo=timezone(timedelta(hours=-6)))


@pytest.fixture
def conn(tmp_path):
    c = connect(tmp_path / "s.db")
    init_db(c, dim=8)
    return c


def visit(url="https://example.com/ramen", title="Ramen recipes", text=None, at=T0):
    return IngestEntry(kind="visit", url=url, title=title, visit_time=at, text=text, source="live")


def count(conn, sql, *args):
    return conn.execute(sql, args).fetchone()[0]


def doc_counts(conn, doc_id):
    chunks = count(conn, "select count(*) from chunks where doc_id = ?", doc_id)
    vecs = count(
        conn,
        "select count(*) from vec_chunks where chunk_id in (select chunk_id from chunks where doc_id = ?)",
        doc_id,
    )
    return chunks, vecs


def test_page_without_text_gets_title_chunk(conn):
    upsert_entries(conn, [visit()], FakeEmbedder())
    pid = page_id("https://example.com/ramen")
    assert doc_counts(conn, pid) == (1, 1)
    assert count(conn, "select count(*) from vec_chunks") == 1
    status = conn.execute("select text_status from pages where page_id = ?", (pid,)).fetchone()[0]
    assert status == "none"


def test_page_with_text_is_chunked(conn):
    upsert_entries(conn, [visit(text="tonkotsu broth " * 200)], FakeEmbedder())
    chunks, vecs = doc_counts(conn, page_id("https://example.com/ramen"))
    assert chunks >= 2 and chunks == vecs


def test_upsert_is_idempotent(conn):
    ids1 = upsert_entries(conn, [visit()], FakeEmbedder())
    ids2 = upsert_entries(conn, [visit()], FakeEmbedder())
    assert ids1 == ids2
    assert count(conn, "select count(*) from entries") == 1
    assert count(conn, "select count(*) from chunks") == 1


def test_search_entry_embeds_query(conn):
    e = IngestEntry(
        kind="search", url="https://www.google.com/search?q=cheap+flights", query="cheap flights",
        visit_time=T0, source="live",
    )
    upsert_entries(conn, [e], FakeEmbedder())
    row = conn.execute("select doc_type, text from chunks").fetchone()
    assert tuple(row) == ("search", "cheap flights")


def test_delete_keeps_shared_page(conn):
    a, _ = upsert_entries(conn, [visit(), visit(at=T0 + timedelta(hours=1))], FakeEmbedder())
    assert delete_entry(conn, a) is True
    assert doc_counts(conn, page_id("https://example.com/ramen")) == (1, 1)


def test_delete_last_entry_removes_vectors(conn):
    a, b = upsert_entries(conn, [visit(), visit(at=T0 + timedelta(hours=1))], FakeEmbedder())
    delete_entry(conn, a)
    delete_entry(conn, b)
    pid = page_id("https://example.com/ramen")
    assert doc_counts(conn, pid) == (0, 0)
    assert count(conn, "select count(*) from vec_chunks") == 0
    assert count(conn, "select count(*) from pages where page_id = ?", pid) == 0


def test_delete_missing_returns_false(conn):
    assert delete_entry(conn, "e_missing") is False


def test_embedder_version_change_reembeds(conn):
    upsert_entries(conn, [visit()], FakeEmbedder())
    assert ensure_embedder_version(conn, FakeEmbedder()) is False
    assert ensure_embedder_version(conn, FakeEmbedder(version="fake-v2")) is True
    v = conn.execute("select value from meta where key = 'embedder_version'").fetchone()[0]
    assert v == "fake-v2"
    assert count(conn, "select count(*) from vec_chunks") == 1


def test_title_change_reembeds(conn):
    upsert_entries(conn, [visit()], FakeEmbedder())
    upsert_entries(conn, [visit(title="Shoyu ramen", at=T0 + timedelta(hours=2))], FakeEmbedder())
    texts = [r[0] for r in conn.execute("select text from chunks")]
    assert texts == ["Shoyu ramen | example.com/ramen"]
    assert count(conn, "select count(*) from vec_chunks") == 1
