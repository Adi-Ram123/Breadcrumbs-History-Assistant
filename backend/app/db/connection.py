"""SQLite connections with the sqlite-vec extension loaded."""

import sqlite3
from pathlib import Path

import sqlite_vec

SCHEMA_PATH = Path(__file__).with_name("schema.sql")


def connect(db_path: Path | str) -> sqlite3.Connection:
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.enable_load_extension(True)
    sqlite_vec.load(conn)
    conn.enable_load_extension(False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(conn: sqlite3.Connection, dim: int) -> None:
    conn.executescript(SCHEMA_PATH.read_text())
    conn.execute(
        "CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks "
        f"USING vec0(chunk_id INTEGER PRIMARY KEY, embedding float[{int(dim)}])"
    )
    conn.commit()
