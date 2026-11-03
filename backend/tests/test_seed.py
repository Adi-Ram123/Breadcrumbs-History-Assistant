import json

import pytest
from fakes import FakeEmbedder

from app.db.connection import connect, init_db
from app.seed import load_seed


def _entry(id_, url, deleted=False):
    return {
        "id": id_, "kind": "visit", "url": url, "query": None, "title": id_,
        "visit_time": "2026-11-02T20:00:00-06:00", "text": None, "source": "seed", "deleted": deleted,
    }


@pytest.fixture
def conn(tmp_path):
    c = connect(tmp_path / "x.db")
    init_db(c, dim=8)
    return c


def test_load_seed_respects_explicit_ids_and_deleted(conn, tmp_path):
    seed = tmp_path / "seed.json"
    seed.write_text(json.dumps([
        _entry("v001", "https://a.com/1"), _entry("v002", "https://a.com/2"),
        _entry("v003", "https://a.com/3", deleted=True),
    ]))
    assert load_seed(conn, seed, FakeEmbedder()) == 2
    ids = {r[0] for r in conn.execute("select id from entries")}
    assert ids == {"v001", "v002"}
    assert conn.execute("select count(*) from vec_chunks").fetchone()[0] == 2


def test_load_empty_seed(conn, tmp_path):
    seed = tmp_path / "seed.json"
    seed.write_text("[]")
    assert load_seed(conn, seed, FakeEmbedder()) == 0


def test_seed_entries_need_ids(conn, tmp_path):
    seed = tmp_path / "seed.json"
    bad = _entry("x", "https://a.com")
    del bad["id"]
    seed.write_text(json.dumps([bad]))
    with pytest.raises(ValueError, match="id"):
        load_seed(conn, seed, FakeEmbedder())


def _db_with_source(path, source):
    from app.index.store import upsert_entries
    from app.schemas.ingest import IngestEntry

    c = connect(path)
    init_db(c, dim=8)
    upsert_entries(c, [IngestEntry(kind="visit", url="https://a.com", title="a",
                                   visit_time="2026-11-02T20:00:00-06:00", source=source)], FakeEmbedder())
    c.close()


def test_reset_refuses_db_with_real_history(tmp_path):
    from app.seed import reset_db

    db = tmp_path / "real.db"
    _db_with_source(db, "backfill")
    with pytest.raises(RuntimeError, match="--force"):
        reset_db(db)
    assert db.exists()
    reset_db(db, force=True)
    assert not db.exists()


def test_reset_allows_seed_only_db(tmp_path):
    from app.seed import reset_db

    db = tmp_path / "demo.db"
    _db_with_source(db, "seed")
    reset_db(db)
    assert not db.exists()
    reset_db(db)  # missing file is fine
