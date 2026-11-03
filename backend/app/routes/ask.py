"""POST /ask: parse -> execute -> template answer. The only place that reads the clock.

The LLM never runs here. Asks with results are cached so POST /answer can write
the sentence afterwards; the panel shows the rows in the meantime.
"""

import secrets
import sqlite3
from datetime import datetime
from time import perf_counter
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Request

from app.answer_cache import CachedAsk
from app.deps import get_conn
from app.executor import execute
from app.history_stats import history_start, window_counts
from app.schemas.api import AskRequest, AskResponse
from app.stubs import TemplateAnswerWriter

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

    if results:
        template = TemplateAnswerWriter().write(body.question, intent, results)
        ask_id = state.answer_cache.put(
            CachedAsk(question=body.question, intent=intent, results=results, template_answer=template)
        )
        mode, counts = "results", None
    else:
        # Not cached: there is nothing to answer, so /answer returns 404 for it.
        template, ask_id = None, "a_" + secrets.token_hex(8)
        mode, counts = "no-match", window_counts(conn, intent.time_range)

    return AskResponse(
        ask_id=ask_id,
        question=body.question,
        intent=intent,
        results=results,
        template_answer=template,
        mode=mode,
        window_counts=counts,
        history_start=history_start(conn, body.tz),
        timings_ms={
            "parse": round((t1 - t0) * 1000, 2),
            "execute": round((t2 - t1) * 1000, 2),
        },
    )
