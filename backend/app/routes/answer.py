"""POST /answer: write and verify the sentence for an earlier /ask.

Only ids that /ask returned for this ask_id may be cited (invariant 3). Any
failure falls back to the template answer, with the reason the panel shows.
"""

from time import perf_counter

from fastapi import APIRouter, HTTPException, Request

from app.answer_cache import CachedAsk
from app.ports import AnswerWriter
from app.schemas.api import Answer, AnswerRequest, AnswerResponse
from app.verifier import verify

router = APIRouter()


def _write(writer: AnswerWriter, cached: CachedAsk) -> tuple[Answer, str, str | None]:
    if writer.mode == "template":  # LLM_MODE=off builds the template writer
        return cached.template_answer, "template", "llm_off"
    try:
        candidate = writer.write(cached.question, cached.intent, cached.results)
    except Exception:  # LLM unavailable or broken: the ranked list still stands
        return cached.template_answer, "template", "llm_error"
    verified = verify(candidate, [r.id for r in cached.results])
    if verified is None:
        return cached.template_answer, "template", "rejected_citation"
    return verified, "llm", None


@router.post("/answer", response_model=AnswerResponse)
def answer(body: AnswerRequest, request: Request) -> AnswerResponse:
    state = request.app.state
    cached = state.answer_cache.get(body.ask_id)
    if cached is None:
        raise HTTPException(status_code=404, detail="ask not found or expired")
    t0 = perf_counter()
    text, mode, reason = _write(state.answer_writer, cached)
    return AnswerResponse(
        answer=text,
        mode=mode,
        fallback_reason=reason,
        timings_ms={"write": round((perf_counter() - t0) * 1000, 2)},
    )
