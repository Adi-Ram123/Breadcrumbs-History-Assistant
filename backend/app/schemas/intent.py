"""DRAFT: shared contract, finalize by hand (Daniel + Aditya).

The Intent is the handoff between the parser (Aditya) and the executor (Daniel).
Time ranges are half-open: start is inclusive, end is exclusive. Both ends are
timezone-aware; the executor converts them to UTC ms. See docs/time-rules.md.

Draft additions to the proposal, to accept or cut together:
- kind "any" (questions that do not say search vs visit)
- order "recent" | "relevance" ("last movie I watched" -> recent, limit 1)
"""

from typing import Literal

from pydantic import AwareDatetime, BaseModel, Field, model_validator


class TimeRange(BaseModel):
    start: AwareDatetime  # inclusive
    end: AwareDatetime  # exclusive

    @model_validator(mode="after")
    def _start_before_end(self) -> "TimeRange":
        if not self.start < self.end:
            raise ValueError("time_range.start must be before time_range.end")
        return self


class Intent(BaseModel):
    kind: Literal["search", "visit", "any"]
    time_range: TimeRange | None = None
    topic: str | None = None
    limit: int | None = Field(default=None, ge=1, le=100)
    order: Literal["recent", "relevance"] = "relevance"
