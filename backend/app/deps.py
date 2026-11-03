"""FastAPI dependencies shared by the routers."""

from collections.abc import Iterator

from fastapi import Request

from app.db.connection import connect


def get_conn(request: Request) -> Iterator:
    """One SQLite connection per request."""
    conn = connect(request.app.state.settings.db_path)
    try:
        yield conn
    finally:
        conn.close()
