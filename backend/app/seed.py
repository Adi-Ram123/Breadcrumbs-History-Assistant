"""Load the hand-written seed history (fixtures/seed_history.json) into the database.

Usage: DB_PATH=data/demo.db uv run python -m app.seed --reset [--force] [--path fixtures/seed_history.json]

--reset refuses to delete a database that holds real history (any non-seed entry)
unless --force is given. Point DB_PATH at a separate demo database instead.
"""

import argparse
import json
import sqlite3
from pathlib import Path

from app.config import REPO_ROOT, Settings
from app.db.connection import connect, init_db
from app.index.store import delete_entry, ensure_embedder_version, upsert_entries
from app.ports import Embedder
from app.registry import build_embedder
from app.schemas.ingest import IngestEntry

DEFAULT_SEED = REPO_ROOT / "fixtures" / "seed_history.json"


def load_seed(conn: sqlite3.Connection, path: Path, embedder: Embedder) -> int:
    """Ingest every seed entry, then delete the ones marked deleted. Returns the live count."""
    items = json.loads(Path(path).read_text())
    for i, item in enumerate(items):
        if not item.get("id"):
            raise ValueError(f"seed entry #{i} has no id; expected answers refer to seed ids")
    entries = [IngestEntry(**{k: v for k, v in item.items() if k != "deleted"}) for item in items]
    if entries:
        upsert_entries(conn, entries, embedder)
    deleted = [item["id"] for item in items if item.get("deleted")]
    for entry_id in deleted:
        delete_entry(conn, entry_id)
    return len(items) - len(deleted)


def reset_db(db_path: Path, force: bool = False) -> None:
    """Delete the database file, unless it holds real (non-seed) history and force is False."""
    db_path = Path(db_path)
    if not db_path.exists():
        return
    if not force:
        conn = connect(db_path)
        try:
            has_table = conn.execute(
                "select 1 from sqlite_master where type = 'table' and name = 'entries'"
            ).fetchone()
            real = has_table and conn.execute("select 1 from entries where source != 'seed' limit 1").fetchone()
        finally:
            conn.close()
        if real:
            raise RuntimeError(
                f"{db_path} contains real browsing history; refusing to reset it. "
                "Use a separate DB_PATH (e.g. data/demo.db) or pass --force."
            )
    db_path.unlink()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--reset", action="store_true", help="delete the database file first")
    ap.add_argument("--force", action="store_true", help="allow --reset on a database with real history")
    ap.add_argument("--path", type=Path, default=DEFAULT_SEED)
    args = ap.parse_args()

    settings = Settings()
    if args.reset:
        try:
            reset_db(settings.db_path, force=args.force)
        except RuntimeError as e:
            raise SystemExit(str(e)) from None
    embedder = build_embedder(settings.embedder)
    conn = connect(settings.db_path)
    init_db(conn, embedder.dim)
    ensure_embedder_version(conn, embedder)
    n = load_seed(conn, args.path, embedder)
    conn.close()
    print(f"Loaded {n} entries")


if __name__ == "__main__":
    main()
