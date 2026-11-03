import pytest
from pydantic import ValidationError

from app.schemas.api import AskRequest
from app.schemas.ingest import IngestEntry
from app.schemas.intent import TimeRange

VISIT = {
    "kind": "visit",
    "url": "https://www.rtings.com/laptop",
    "title": "Best Budget Laptops 2026",
    "visit_time": "2026-11-03T10:00:00-06:00",
    "source": "live",
}


def test_ingest_accepts_valid_visit():
    e = IngestEntry(**VISIT)
    assert e.kind == "visit"
    assert e.id is None
    assert e.visit_time.utcoffset() is not None


def test_ingest_rejects_bad_kind():
    with pytest.raises(ValidationError):
        IngestEntry(**{**VISIT, "kind": "bookmark"})


def test_ingest_search_requires_query():
    with pytest.raises(ValidationError):
        IngestEntry(**{**VISIT, "kind": "search", "query": "   "})
    ok = IngestEntry(**{**VISIT, "kind": "search", "query": "cheap flights"})
    assert ok.query == "cheap flights"


def test_ingest_rejects_naive_datetime():
    with pytest.raises(ValidationError):
        IngestEntry(**{**VISIT, "visit_time": "2026-11-03T10:00:00"})


def test_time_range_rejects_start_not_before_end():
    t = "2026-11-03T00:00:00-06:00"
    with pytest.raises(ValidationError):
        TimeRange(start=t, end=t)


def test_ask_request_rejects_unknown_tz():
    with pytest.raises(ValidationError):
        AskRequest(question="what did I search", tz="Mars/Base")
