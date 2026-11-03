"""Counts the side panel needs to explain an empty answer and the first-open screen."""

import sqlite3
from datetime import datetime
from zoneinfo import ZoneInfo

from app.schemas.api import WindowCounts
from app.schemas.intent import TimeRange


def _ms(dt: datetime) -> int:
    return int(dt.timestamp() * 1000)


def window_counts(conn: sqlite3.Connection, time_range: TimeRange | None) -> WindowCounts:
    """Entries of each kind with visit time in [start, end), or all entries when there is no range."""
    sql, args = "select kind, count(*) as n from entries", []
    if time_range is not None:
        sql += " where visit_time_ms >= ? and visit_time_ms < ?"
        args = [_ms(time_range.start), _ms(time_range.end)]
    counts = {r["kind"]: r["n"] for r in conn.execute(sql + " group by kind", args)}
    return WindowCounts(search=counts.get("search", 0), visit=counts.get("visit", 0))


def history_start(conn: sqlite3.Connection, tz: str) -> datetime | None:
    """The oldest stored visit time, in `tz`. None for an empty database."""
    ms = conn.execute("select min(visit_time_ms) from entries").fetchone()[0]
    return None if ms is None else datetime.fromtimestamp(ms / 1000, ZoneInfo(tz))


def entry_count(conn: sqlite3.Connection) -> int:
    return conn.execute("select count(*) from entries").fetchone()[0]
