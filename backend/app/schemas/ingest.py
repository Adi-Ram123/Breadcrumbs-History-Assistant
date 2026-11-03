"""Ingest contract: what the extension (and the seed loader) send to POST /ingest."""

from typing import Literal

from pydantic import AwareDatetime, BaseModel, Field, field_validator, model_validator


class IngestEntry(BaseModel):
    # Only the seed loader sets id, so hand-written expected answers can name entries.
    # The extension leaves it empty and the backend derives a stable hash id.
    id: str | None = None
    kind: Literal["search", "visit"]
    url: str = Field(min_length=1)
    query: str | None = None
    title: str = ""
    visit_time: AwareDatetime
    text: str | None = None
    source: Literal["live", "backfill", "seed"]

    @field_validator("url", "query", "title", "text", mode="before")
    @classmethod
    def _well_formed(cls, v):
        # Browsers can hand us lone UTF-16 surrogates (e.g. an emoji cut in half);
        # SQLite cannot store them, so replace them instead of failing the batch.
        if isinstance(v, str):
            return v.encode("utf-8", "replace").decode("utf-8")
        return v

    @model_validator(mode="after")
    def _search_needs_query(self) -> "IngestEntry":
        if self.kind == "search" and not (self.query and self.query.strip()):
            raise ValueError("search entries need a non-blank query")
        return self


class IngestRequest(BaseModel):
    entries: list[IngestEntry] = Field(min_length=1, max_length=1000)


class IngestResponse(BaseModel):
    ids: list[str]
