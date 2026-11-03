from datetime import datetime, timedelta

import pytest
from fakes import FakeEmbedder

from app.db.connection import connect, init_db
from app.history_stats import entry_count, history_start, window_counts
from app.index.store import upsert_entries
from app.schemas.api import WindowCounts
from app.schemas.ingest import IngestEntry
from app.schemas.intent import TimeRange

ENTRIES = [
    IngestEntry(kind="visit", url="https://example.com/a", title="A", visit_time="2026-11-01T10:00:00-06:00", source="live"),
    IngestEntry(kind="visit", url="https://example.com/b", title="B", visit_time="2026-11-01T20:00:00-06:00", source="live"),
    IngestEntry(kind="search", url="https://www.google.com/search?q=denver", query="denver",
                visit_time="2026-10-30T12:00:00-05:00", source="live"),
]
SUN = TimeRange(start="2026-11-01T00:00:00-05:00", end="2026-11-02T00:00:00-06:00")


@pytest.fixture
def empty_conn(tmp_path):
    c = connect(tmp_path / "s.db")
    init_db(c, 8)
    yield c
    c.close()


@pytest.fixture
def conn(empty_conn):
    upsert_entries(empty_conn, ENTRIES, FakeEmbedder())
    return empty_conn


def test_window_counts_respects_range_and_splits_kinds(conn):
    assert window_counts(conn, SUN) == WindowCounts(search=0, visit=2)


def test_window_counts_end_is_exclusive(conn):
    r = TimeRange(start="2026-11-01T00:00:00-05:00", end="2026-11-01T20:00:00-06:00")
    assert window_counts(conn, r) == WindowCounts(search=0, visit=1)


def test_window_counts_without_range_counts_everything(conn):
    assert window_counts(conn, None) == WindowCounts(search=1, visit=2)


def test_history_start_is_oldest_entry_in_tz(conn):
    start = history_start(conn, "America/Chicago")
    assert start == datetime.fromisoformat("2026-10-30T12:00:00-05:00")
    assert start.utcoffset() == timedelta(hours=-5)


def test_empty_db(empty_conn):
    assert history_start(empty_conn, "UTC") is None
    assert entry_count(empty_conn) == 0
    assert window_counts(empty_conn, None) == WindowCounts(search=0, visit=0)


def test_entry_count(conn):
    assert entry_count(conn) == 3
