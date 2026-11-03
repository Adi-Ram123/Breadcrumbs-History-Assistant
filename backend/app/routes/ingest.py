"""POST /ingest and DELETE /entries/{entry_id}."""

import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from app.deps import get_conn
from app.index.store import delete_entry, upsert_entries
from app.schemas.ingest import IngestRequest, IngestResponse

router = APIRouter()


@router.post("/ingest", response_model=IngestResponse)
def ingest(body: IngestRequest, request: Request, conn: sqlite3.Connection = Depends(get_conn)) -> IngestResponse:
    ids = upsert_entries(conn, body.entries, request.app.state.embedder)
    return IngestResponse(ids=ids)


@router.delete("/entries/{entry_id}", status_code=204)
def delete(entry_id: str, conn: sqlite3.Connection = Depends(get_conn)) -> Response:
    if not delete_entry(conn, entry_id):
        raise HTTPException(status_code=404, detail="entry not found")
    return Response(status_code=204)
