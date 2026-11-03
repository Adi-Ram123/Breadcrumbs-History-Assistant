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


class Answer(BaseModel):
    text: str
    cited: list[str]


class AskResponse(BaseModel):
    question: str
    intent: Intent
    results: list[Result]
    answer: Answer | None
    mode: Literal["llm", "template", "no-match"]
    timings_ms: dict[str, float]


class HealthResponse(BaseModel):
    status: str
    embedder_version: str
    parser: str
    llm_mode: str
