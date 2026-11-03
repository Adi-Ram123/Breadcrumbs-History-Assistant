"""Request and response shapes for the REST API (exported to OpenAPI for the extension)."""

from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import AwareDatetime, BaseModel, Field, field_validator

from app.schemas.intent import Intent


class AskRequest(BaseModel):
    question: str = Field(min_length=1)
    tz: str
    now: AwareDatetime | None = None  # honored only when DEBUG_FIXED_NOW=1

    @field_validator("tz")
    @classmethod
    def _known_tz(cls, v: str) -> str:
        try:
            ZoneInfo(v)
        except (ZoneInfoNotFoundError, ValueError) as e:
            raise ValueError(f"unknown timezone: {v}") from e
        return v


class Result(BaseModel):
    id: str
    kind: Literal["search", "visit"]
    title: str
    url: str
    query: str | None = None
    visit_time: AwareDatetime
    score: float | None = None


class WindowCounts(BaseModel):
    """Stored entries of each kind inside a time window, ignoring the topic."""

    search: int
    visit: int


class Answer(BaseModel):
    text: str
    cited: list[str]


class AskResponse(BaseModel):
    """Intent and rows, fast. The LLM sentence comes later from POST /answer with `ask_id`."""

    ask_id: str  # opaque; only asks with results can be answered
    question: str
    intent: Intent
    results: list[Result]
    template_answer: Answer | None  # None when mode == "no-match"
    mode: Literal["results", "no-match"]
    window_counts: WindowCounts | None  # only when mode == "no-match"
    history_start: AwareDatetime | None  # oldest stored entry; None for an empty DB
    timings_ms: dict[str, float]  # parse, execute


class AnswerRequest(BaseModel):
    ask_id: str


class AnswerResponse(BaseModel):
    answer: Answer
    mode: Literal["llm", "template"]
    fallback_reason: Literal["llm_off", "rejected_citation", "llm_error"] | None
    timings_ms: dict[str, float]  # write


class HealthResponse(BaseModel):
    status: str
    embedder_version: str
    parser: str
    llm_mode: str
    entry_count: int
    history_start: AwareDatetime | None  # oldest stored entry, UTC; None for an empty DB
