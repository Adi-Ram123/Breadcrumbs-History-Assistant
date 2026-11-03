from datetime import datetime, timedelta, timezone

import pytest
from fakes import FakeEmbedder

from app.db.connection import connect, init_db
from app.executor import execute
from app.index.store import upsert_entries
from app.schemas.ingest import IngestEntry
from app.schemas.intent import Intent, TimeRange

CST = timezone(timedelta(hours=-6))
TZ = "America/Chicago"
DAY_START = datetime(2026, 11, 2, 0, 0, tzinfo=CST)
DAY_END = datetime(2026, 11, 3, 0, 0, tzinfo=CST)


@pytest.fixture
def conn(tmp_path):
    c = connect(tmp_path / "x.db")
    init_db(c, dim=8)
    return c


def visit(url, title, at):
    return IngestEntry(kind="visit", url=url, title=title, visit_time=at, source="seed")


def search(q, at):
    return IngestEntry(kind="search", url=f"https://www.google.com/search?q={q}", query=q, visit_time=at, source="seed")


def test_range_end_is_exclusive(conn):
    at_start, at_end = upsert_entries(
        conn,
        [visit("https://a.com/1", "start", DAY_START), visit("https://a.com/2", "end", DAY_END)],
        FakeEmbedder(),
    )
    intent = Intent(kind="any", time_range=TimeRange(start=DAY_START, end=DAY_END), order="recent")
    ids = [r.id for r in execute(conn, intent, FakeEmbedder(), TZ)]
    assert ids == [at_start]


def test_kind_search_excludes_visits(conn):
    s, _ = upsert_entries(
        conn, [search("cheap flights", DAY_START), visit("https://a.com", "flights", DAY_START)], FakeEmbedder()
    )
    results = execute(conn, Intent(kind="search", order="recent"), FakeEmbedder(), TZ)
    assert [r.id for r in results] == [s]
    assert results[0].query == "cheap flights"


def test_recent_order_and_limit(conn):
    _, newer = upsert_entries(
        conn,
        [visit("https://a.com/old", "old", DAY_START), visit("https://a.com/new", "new", DAY_START + timedelta(hours=5))],
        FakeEmbedder(),
    )
    results = execute(conn, Intent(kind="visit", order="recent", limit=1), FakeEmbedder(), TZ)
    assert [r.id for r in results] == [newer]
    assert results[0].visit_time.utcoffset() == timedelta(hours=-6)


def test_topic_filters_unrelated(conn):
    ramen, _ = upsert_entries(
        conn,
        [visit("https://example.com/ramen", "Ramen recipes", DAY_START), visit("https://irs.gov/forms", "Tax forms", DAY_START)],
        FakeEmbedder(),
    )
    results = execute(conn, Intent(kind="any", topic="ramen recipes", order="relevance"), FakeEmbedder(), TZ)
    assert [r.id for r in results] == [ramen]
    assert results[0].score > 0.3


def test_empty_db_returns_empty(conn):
    assert execute(conn, Intent(kind="any", topic="anything"), FakeEmbedder(), TZ) == []
