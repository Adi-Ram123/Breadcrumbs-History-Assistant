"""Write and delete entries, pages, chunks and vectors.

Every public function here runs in a single transaction, so an entry and its
vectors are never out of step (proposal decision 5).
"""

import sqlite3
from collections.abc import Sequence

import sqlite_vec

from app.index.chunking import doc_chunks
from app.index.urls import entry_id, normalize_url, page_id, search_doc_id
from app.ports import Embedder
from app.schemas.ingest import IngestEntry

META_EMBEDDER_VERSION = "embedder_version"


def _ms(entry: IngestEntry) -> int:
    return int(entry.visit_time.timestamp() * 1000)


def entry_doc_id(row: sqlite3.Row) -> str:
    """The chunk doc an entries row maps to."""
    if row["kind"] == "visit":
        return row["page_id"]
    return search_doc_id(row["query"])


def _get_meta(conn: sqlite3.Connection, key: str) -> str | None:
    row = conn.execute("select value from meta where key = ?", (key,)).fetchone()
    return row[0] if row else None


def _set_meta(conn: sqlite3.Connection, key: str, value: str) -> None:
    conn.execute(
        "insert into meta(key, value) values (?, ?) on conflict(key) do update set value = excluded.value",
        (key, value),
    )


def _doc_texts(conn: sqlite3.Connection, doc_id: str) -> list[str]:
    rows = conn.execute("select text from chunks where doc_id = ? order by ordinal", (doc_id,))
    return [r[0] for r in rows]


def _delete_doc(conn: sqlite3.Connection, doc_id: str) -> None:
    conn.execute(
        "delete from vec_chunks where chunk_id in (select chunk_id from chunks where doc_id = ?)",
        (doc_id,),
    )
    conn.execute("delete from chunks where doc_id = ?", (doc_id,))


def _write_doc(conn, doc_type: str, doc_id: str, texts: list[str], vectors: list[list[float]]) -> None:
    _delete_doc(conn, doc_id)
    for ordinal, (text, vec) in enumerate(zip(texts, vectors, strict=True)):
        cur = conn.execute(
            "insert into chunks(doc_type, doc_id, ordinal, text) values (?, ?, ?, ?)",
            (doc_type, doc_id, ordinal, text),
        )
        conn.execute(
            "insert into vec_chunks(chunk_id, embedding) values (?, ?)",
            (cur.lastrowid, sqlite_vec.serialize_float32(vec)),
        )


def upsert_entries(conn: sqlite3.Connection, entries: Sequence[IngestEntry], embedder: Embedder) -> list[str]:
    ids: list[str] = []
    pending: dict[str, tuple[str, list[str]]] = {}  # doc_id -> (doc_type, chunk texts)
    with conn:
        if _get_meta(conn, META_EMBEDDER_VERSION) is None:
            _set_meta(conn, META_EMBEDDER_VERSION, embedder.version)
        for e in entries:
            ms = _ms(e)
            eid = e.id or entry_id(e.kind, e.url, ms)
            pid = page_id(e.url) if e.kind == "visit" else None
            conn.execute(
                "insert or ignore into entries(id, kind, url, query, title, visit_time_ms, page_id, source) "
                "values (?, ?, ?, ?, ?, ?, ?, ?)",
                (eid, e.kind, e.url, e.query, e.title, ms, pid, e.source),
            )
            ids.append(eid)

            if e.kind == "visit":
                old = conn.execute("select title, text from pages where page_id = ?", (pid,)).fetchone()
                title = e.title or (old["title"] if old else "") or ""
                text = e.text if e.text is not None else (old["text"] if old else None)
                status = "ok" if text else "none"
                conn.execute(
                    "insert into pages(page_id, url, title, text, text_status) values (?, ?, ?, ?, ?) "
                    "on conflict(page_id) do update set title = excluded.title, text = excluded.text, "
                    "text_status = excluded.text_status",
                    (pid, normalize_url(e.url), title, text, status),
                )
                doc_type, doc_id, texts = "page", pid, doc_chunks(title, e.url, text)
            else:
                doc_type, doc_id, texts = "search", search_doc_id(e.query), [e.query.strip()]

            current = pending[doc_id][1] if doc_id in pending else _doc_texts(conn, doc_id)
            if texts != current:
                pending[doc_id] = (doc_type, texts)

        if pending:
            flat = [t for _, texts in pending.values() for t in texts]
            vectors = iter(embedder.embed(flat))
            for doc_id, (doc_type, texts) in pending.items():
                _write_doc(conn, doc_type, doc_id, texts, [next(vectors) for _ in texts])
    return ids


def delete_entry(conn: sqlite3.Connection, entry_id_: str) -> bool:
    row = conn.execute("select * from entries where id = ?", (entry_id_,)).fetchone()
    if row is None:
        return False
    doc_id = entry_doc_id(row)
    with conn:
        conn.execute("delete from entries where id = ?", (entry_id_,))
        if row["kind"] == "visit":
            still_used = conn.execute("select 1 from entries where page_id = ? limit 1", (doc_id,)).fetchone()
        else:
            queries = conn.execute("select query from entries where kind = 'search'").fetchall()
            still_used = any(search_doc_id(q[0]) == doc_id for q in queries)
        if not still_used:
            _delete_doc(conn, doc_id)
            if row["kind"] == "visit":
                conn.execute("delete from pages where page_id = ?", (doc_id,))
    return True


def ensure_embedder_version(conn: sqlite3.Connection, embedder: Embedder) -> bool:
    """Re-embed every chunk if the stored embedder version differs. Returns True if it rebuilt."""
    current = _get_meta(conn, META_EMBEDDER_VERSION)
    if current == embedder.version:
        return False
    has_chunks = conn.execute("select 1 from chunks limit 1").fetchone() is not None
    with conn:
        if has_chunks or current is not None:
            conn.execute("drop table if exists vec_chunks")
            conn.execute(
                "create virtual table vec_chunks "
                f"using vec0(chunk_id INTEGER PRIMARY KEY, embedding float[{int(embedder.dim)}])"
            )
            rows = conn.execute("select chunk_id, text from chunks order by chunk_id").fetchall()
            if rows:
                vectors = embedder.embed([r["text"] for r in rows])
                conn.executemany(
                    "insert into vec_chunks(chunk_id, embedding) values (?, ?)",
                    [(r["chunk_id"], sqlite_vec.serialize_float32(v)) for r, v in zip(rows, vectors, strict=True)],
                )
        _set_meta(conn, META_EMBEDDER_VERSION, embedder.version)
    return has_chunks or current is not None
