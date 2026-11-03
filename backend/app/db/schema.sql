-- SQLite is the source of truth. vec_chunks is derived and created in connection.init_db
-- because its dimension comes from the active embedder.
-- All timestamps are UTC epoch milliseconds.

CREATE TABLE IF NOT EXISTS entries (
    id            TEXT PRIMARY KEY,
    kind          TEXT NOT NULL CHECK (kind IN ('search', 'visit')),
    url           TEXT NOT NULL,
    query         TEXT,
    title         TEXT,
    visit_time_ms INTEGER NOT NULL,
    page_id       TEXT,
    source        TEXT NOT NULL CHECK (source IN ('live', 'backfill', 'seed'))
);

CREATE TABLE IF NOT EXISTS pages (
    page_id     TEXT PRIMARY KEY,
    url         TEXT NOT NULL,
    title       TEXT,
    text        TEXT,
    text_status TEXT NOT NULL CHECK (text_status IN ('ok', 'failed', 'none'))
);

CREATE TABLE IF NOT EXISTS chunks (
    chunk_id INTEGER PRIMARY KEY,
    doc_type TEXT NOT NULL CHECK (doc_type IN ('page', 'search')),
    doc_id   TEXT NOT NULL,
    ordinal  INTEGER NOT NULL,
    text     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT
);

CREATE INDEX IF NOT EXISTS idx_entries_visit_time ON entries (visit_time_ms);
CREATE INDEX IF NOT EXISTS idx_entries_page_id ON entries (page_id);
CREATE INDEX IF NOT EXISTS idx_chunks_doc_id ON chunks (doc_id);
