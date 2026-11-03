from app.db.connection import connect, init_db


def _names(conn):
    return {r[0] for r in conn.execute("select name from sqlite_master")}


def test_init_creates_tables(tmp_path):
    conn = connect(tmp_path / "x.db")
    init_db(conn, dim=8)
    assert {"entries", "pages", "chunks", "meta", "vec_chunks"} <= _names(conn)


def test_sqlite_vec_loaded(tmp_path):
    conn = connect(tmp_path / "x.db")
    (version,) = conn.execute("select vec_version()").fetchone()
    assert isinstance(version, str) and version


def test_init_is_idempotent(tmp_path):
    conn = connect(tmp_path / "x.db")
    init_db(conn, dim=8)
    init_db(conn, dim=8)
