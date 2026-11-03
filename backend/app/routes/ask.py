"""POST /ask: parse -> execute -> write -> verify. The only place that reads the clock."""

import sqlite3
from datetime import datetime
from time import perf_counter
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Request

from app.deps import get_conn
from app.executor import execute
from app.schemas.api import AskRequest, AskResponse
from app.stubs import TemplateAnswerWriter
from app.verifier import verify

router = APIRouter()


@router.post("/ask", response_model=AskResponse)
def ask(body: AskRequest, request: Request, conn: sqlite3.Connection = Depends(get_conn)) -> AskResponse:
    state = request.app.state
    if state.settings.debug_fixed_now and body.now is not None:
        now = body.now
    else:
        now = datetime.now(ZoneInfo(body.tz))

    t0 = perf_counter()
    intent = state.parser.parse(body.question, now, body.tz)
    t1 = perf_counter()
    results = execute(conn, intent, state.embedder, body.tz)
    t2 = perf_counter()

    answer, mode = None, "no-match"
    if results:
        writer = state.answer_writer
        try:
            candidate = writer.write(body.question, intent, results)
            verified = verify(candidate, [r.id for r in results])
        except Exception:  # LLM unavailable or broken: the ranked list still stands
            verified = None
        if writer.mode == "llm" and verified is not None:
            answer, mode = verified, "llm"
        else:
            answer, mode = TemplateAnswerWriter().write(body.question, intent, results), "template"
    t3 = perf_counter()

    return AskResponse(
        question=body.question,
        intent=intent,
        results=results,
        answer=answer,
        mode=mode,
        timings_ms={
            "parse": round((t1 - t0) * 1000, 2),
            "execute": round((t2 - t1) * 1000, 2),
            "write": round((t3 - t2) * 1000, 2),
        },
    )
