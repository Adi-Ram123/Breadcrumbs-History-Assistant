"""Intent -> matching entries. Our code, not the LLM, decides which entries come back.

1. SQL filter on kind and the half-open time range [start, end).
2. If there is a topic, rank candidates by their best chunk's cosine similarity
   and drop anything below MIN_TOPIC_SCORE.
3. Order (relevance or recent) and cut to the limit.
"""

import json
import sqlite3
from datetime import datetime
from zoneinfo import ZoneInfo

import sqlite_vec

from app.index.store import entry_doc_id
from app.ports import Embedder
from app.schemas.api import Result
from app.schemas.intent import Intent

# Starting value; tune on the dev set and record the change in docs/decisions/.
MIN_TOPIC_SCORE = 0.3


def _ms(dt: datetime) -> int:
    return int(dt.timestamp() * 1000)


def _topic_scores(conn: sqlite3.Connection, doc_ids: set[str], topic: str, embedder: Embedder) -> dict[str, float]:
    qvec = sqlite_vec.serialize_float32(embedder.embed([topic])[0])
    rows = conn.execute(
        "select c.doc_id, min(vec_distance_cosine(v.embedding, ?)) as dist "
        "from chunks c join vec_chunks v on v.chunk_id = c.chunk_id "
        "where c.doc_id in (select value from json_each(?)) group by c.doc_id",
        (qvec, json.dumps(sorted(doc_ids))),
    )
    return {r["doc_id"]: 1.0 - r["dist"] for r in rows}


def execute(
    conn: sqlite3.Connection, intent: Intent, embedder: Embedder, tz: str, *, default_limit: int = 10
) -> list[Result]:
    where, args = [], []
    if intent.kind != "any":
        where.append("kind = ?")
        args.append(intent.kind)
    if intent.time_range is not None:
        where.append("visit_time_ms >= ? and visit_time_ms < ?")
        args += [_ms(intent.time_range.start), _ms(intent.time_range.end)]
    sql = "select * from entries" + (" where " + " and ".join(where) if where else "")
    rows = conn.execute(sql, args).fetchall()
    if not rows:
        return []

    scored: list[tuple[sqlite3.Row, float | None]]
    if intent.topic:
        scores = _topic_scores(conn, {entry_doc_id(r) for r in rows}, intent.topic, embedder)
        scored = [(r, scores.get(entry_doc_id(r))) for r in rows]
        scored = [(r, s) for r, s in scored if s is not None and s >= MIN_TOPIC_SCORE]
    else:
        scored = [(r, None) for r in rows]

    if intent.order == "relevance":
        scored.sort(key=lambda rs: (rs[1] or 0.0, rs[0]["visit_time_ms"]), reverse=True)
    else:
        scored.sort(key=lambda rs: rs[0]["visit_time_ms"], reverse=True)

    zone = ZoneInfo(tz)
    return [
        Result(
            id=r["id"],
            kind=r["kind"],
            title=r["title"] or "",
            url=r["url"],
            query=r["query"],
            visit_time=datetime.fromtimestamp(r["visit_time_ms"] / 1000, zone),
            score=s,
        )
        for r, s in scored[: intent.limit or default_limit]
    ]
