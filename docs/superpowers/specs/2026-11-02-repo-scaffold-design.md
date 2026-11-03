# Breadcrumbs repo scaffold: design

Date: 2026-11-02
Status: approved in brainstorming, awaiting written-spec review

## Goal

Turn the empty repo (README only) into a runnable skeleton that Daniel and Aditya can each build on in parallel, with clear ownership per folder, shared hand-written contracts, and a scoped Claude context file for each owner. Aditya's file includes a Q&A of open model-side decisions.

## Architecture (hybrid of README.md and Final Project Proposal.pdf)

Everything runs locally on a MacBook Pro: the Chrome extension, a FastAPI backend, SQLite with sqlite-vec, the retriever, and a local Qwen LLM. No hosted APIs. If the laptop cannot run Qwen, the retriever and the DB together with reasonable performance, we revisit the hosting choice and record it in `docs/decisions/`.

Taken from the proposal: the FastAPI backend, Pydantic schemas, SQLite as the source of truth, the vector index derived from SQLite, the Intent parser behind `parse(question, now, tz)`, time-phrase rules, the verifier, the fixtures and question sets, the mutants, the eval harness, the decision logs, and uv and Bun.

Taken from the README: the chat UI lives in the Chrome side panel (no separate web app), a trained retriever, a local Qwen model, and a fixed manifest key.

Question flow:

```text
side panel -> POST /ask -> Parser.parse(question, now, tz) -> Intent
  -> executor: SQL filter on kind + time_range
  -> Embedder ranks topic over the filtered candidates (sqlite-vec)
  -> AnswerWriter -> verifier (drops answers that cite unreturned IDs) -> response
```

Ingestion flow:

```text
content script (Readability main text) -> POST /ingest   (live, on each page load)
background (chrome.history, one time)  -> POST /ingest   (backfill, title + URL only)
backend: validate -> entries/pages -> chunk -> Embedder -> vec_chunks
```

## Ownership

| Area | Owner |
| --- | --- |
| `extension/` (background, content script, side panel chat UI) | Daniel |
| `backend/` (FastAPI, SQLite, sqlite-vec, ingest, executor, delete, verifier, ports) | Daniel |
| `ml/` (retriever training and runtime, parser implementations, LLM client, answer writer, model eval) | Aditya |
| Intent schema, `docs/time-rules.md`, `fixtures/`, `eval/`, `tests/mutants/`, pass bars | Shared |

The verifier lives in the backend so that the code that writes answers is not the code that checks them. The vector index (storage, delete) is Daniel's; the embedding model is Aditya's.

## Repo layout

```text
Breadcrumbs-History-Assistant/
  README.md                   rewritten to describe this hybrid architecture
  CLAUDE.md                   shared rules for both owners
  pyproject.toml              uv workspace root (members: backend, ml)
  .python-version             3.12
  .gitignore
  .claude/settings.json       permissions.deny Read on fixtures/questions/heldback/**
  .github/workflows/ci.yml

  extension/                  Daniel. WXT + React + TypeScript, Bun
    CLAUDE.md
    package.json  wxt.config.ts  tsconfig.json  vitest.config.ts
    entrypoints/
      background.ts           opens side panel on icon click; one-time chrome.history backfill
      content.ts              Readability main text -> POST /ingest
      sidepanel/              index.html, main.tsx, App.tsx (shows backend /health status)
    lib/
      url.ts                  normalizeUrl, extractGoogleQuery (pure, unit tested)
      api/schema.d.ts         generated from backend OpenAPI by openapi-typescript
      api/client.ts           typed fetch wrapper
    tests/url.test.ts

  backend/                    Daniel. FastAPI + Pydantic + SQLite + sqlite-vec
    CLAUDE.md
    pyproject.toml
    .env.example
    app/
      main.py                 app factory, CORS, routes
      config.py               settings from env
      ports.py                Parser, Embedder, LLMClient, AnswerWriter Protocols
      schemas/ingest.py  intent.py (shared)  api.py
      db/schema.sql  db/connection.py
      index/chunking.py  index/store.py
      executor.py
      verifier.py
      stubs.py                default port implementations until ml/ provides real ones
    scripts/export_openapi.py
    tests/

  ml/                         Aditya
    CLAUDE.md                 scope, stack, contracts, Q&A of open decisions
    pyproject.toml            runtime deps; training deps in a `train` dependency group
    breadcrumbs_ml/
      runtime/                parser_rules.py, parser_llm.py, parser_tagger.py, embedder.py, llm_client.py, answer_writer.py
      training/               README.md (retriever + tagger training, data generator)
      eval/                   README.md (label-stage scoring, parser comparison)
    models/                   exported weights land here (gitignored until Q&A item 7 decides)
    tests/test_ports.py

  fixtures/                   shared, human-written only
    README.md                 formats for seed history and questions
    seed_history.json         empty list until written by hand
    questions/dev/  questions/heldback/
    HASHES                    sha256 of every fixture file
  eval/                       shared harness
    run.py                    label stage, fetch stage, end to end; "0 questions" when empty
  tests/mutants/README.md     the 7 wrong builds from the proposal
  scripts/
    demo-check                reset DB to seed, run held-back with replay, print pass/fail
    check_fixture_hashes.py
  docs/
    time-rules.md             shared time-phrase rules (from proposal decision 2)
    decisions/README.md       NN-*.md episode log format
```

## Contracts

### SQLite schema

All timestamps are UTC epoch milliseconds.

```sql
entries(id TEXT PRIMARY KEY, kind TEXT CHECK (kind IN ('search','visit')), url TEXT NOT NULL,
        query TEXT, title TEXT, visit_time_ms INTEGER NOT NULL, page_id TEXT,
        source TEXT CHECK (source IN ('live','backfill','seed')))
pages(page_id TEXT PRIMARY KEY, url TEXT NOT NULL, title TEXT, text TEXT,
      text_status TEXT CHECK (text_status IN ('ok','failed','none')))
chunks(chunk_id INTEGER PRIMARY KEY, doc_type TEXT CHECK (doc_type IN ('page','search')),
       doc_id TEXT NOT NULL, ordinal INTEGER NOT NULL, text TEXT NOT NULL)
vec_chunks  USING vec0(chunk_id INTEGER PRIMARY KEY, embedding float[<embedder dim>])
meta(key TEXT PRIMARY KEY, value TEXT)
```

`entries` holds one row per visit or search event. `page_id` is a hash of the normalized URL. `DELETE /entries/{id}` runs in one transaction: it deletes the entry, and if no other entry references its page (or, for a search, its query doc), it also deletes the page, its chunks and their vectors. When `meta.embedder_version` differs from the active embedder's version, the backend rebuilds `vec_chunks`.

### Intent (shared draft, both owners finalize by hand)

```python
class TimeRange(BaseModel):
    start: AwareDatetime   # inclusive
    end: AwareDatetime     # exclusive

class Intent(BaseModel):
    kind: Literal["search", "visit", "any"]
    time_range: TimeRange | None
    topic: str | None
    limit: int | None
    order: Literal["recent", "relevance"]
```

`"any"` and `order` are additions to the proposal so that questions like "last movie I watched" fit (`order="recent"`, `limit=1`). The file is marked DRAFT until both owners sign off.

### API

- `GET /health` returns `{status, embedder_version, parser, llm_mode}`.
- `POST /ingest` accepts `{entries: [{kind, url, query?, title, visit_time (ISO 8601 with offset), text?, source}]}` and returns `{ids}`. Pydantic rejects invalid input with 422.
- `POST /ask` accepts `{question, tz, now?}`, where `now` is honored only when `DEBUG_FIXED_NOW=1`. It returns `{question, intent, results: [{id, kind, title, url, query, visit_time, score}], answer: {text, cited} | null, mode: "llm" | "template" | "no-match", timings_ms}`.
- `DELETE /entries/{id}` returns 204, or 404 if the entry does not exist.

### Ports (`backend/app/ports.py`)

- `Parser.parse(question: str, now: datetime, tz: str) -> Intent`
- `Embedder`: `name`, `version`, `dim`, and `embed(texts: list[str]) -> list[list[float]]`
- `LLMClient.complete(messages, json_schema) -> str`, with mode `live`, `replay` or `record`. Recordings are keyed by request hash.
- `AnswerWriter.write(question, intent, results) -> Answer`

The default stubs in `backend/app/stubs.py` are:

- a parser returning `Intent(kind="any", time_range=None, topic=question, limit=10, order="relevance")`
- stock all-MiniLM-L6-v2 for the embedder (dim 384)
- an LLM client that raises when called
- a template-only answer writer that cites nothing

Config (`PARSER`, `EMBEDDER`) selects the `ml/` implementations once they exist.

### Config (`backend/.env`)

`DB_PATH`, `DEFAULT_TZ=America/Chicago`, `PARSER=stub|rules|llm|tagger`, `EMBEDDER=minilm|<path>`, `LLM_MODE=off|live|replay|record`, `DEBUG_FIXED_NOW=0`, `EXTENSION_ORIGIN=chrome-extension://<id>`.

### Extension manifest

- Permissions: `history`, `sidePanel`, `storage`.
- Host permissions: `http://localhost:8000/*` and `<all_urls>` (the latter for the content script).
- A fixed `key`, so the extension id and the CORS origin stay stable.
- The side panel opens on action click.

## Testing and CI

Skeleton tests (real, passing):

- backend:
  - `/health` returns 200.
  - `/ingest` rejects a bad `kind` and accepts a valid entry.
  - DB init creates all tables and sqlite-vec loads.
  - Deleting an entry removes its chunks and vectors.
  - `/ask` returns the documented shape using the stubs.
- extension: `normalizeUrl` and `extractGoogleQuery`.
- ml: the stub implementations satisfy the backend Protocols.
- eval: `uv run eval/run.py` prints "0 questions" and exits 0 when the question sets are empty.

CI runs on push and PR:

1. `uv sync` and `uv run pytest`
2. `bun install`, `bun run test` and `bun run build` in `extension/`
3. OpenAPI drift: export `openapi.json`, regenerate `schema.d.ts`, then `git diff --exit-code`
4. `uv run scripts/check_fixture_hashes.py`

Mutant patches are added to `tests/mutants/` once the code they mutate exists.

## Claude files

- **`CLAUDE.md`** (root): project summary, ownership table, commands, and these invariants:
  - `now` and `tz` are passed in, and core code never reads the clock.
  - Timestamps are stored in UTC; ranges are `[start, end)`.
  - Only IDs the executor returned may be cited, and the verifier enforces this.
  - Delete removes rows and vectors together.
  - Agents don't edit `fixtures/`, `tests/mutants/` or pass bars.
  - Agents never read `fixtures/questions/heldback/`.
  - Never weaken a test.
  - No hosted inference.
- **`backend/CLAUDE.md`** and **`extension/CLAUDE.md`**: Daniel's scope, stack, commands and owned contracts.
- **`ml/CLAUDE.md`**: Aditya's scope, stack (uv, Python 3.12, sentence-transformers, transformers, datasets, seqeval, PyTorch with MPS), the ports he implements, and where artifacts land (`ml/models/retriever/<version>/` with a version tag the backend reads). It also has a Q&A section that instructs Claude to walk Aditya through these one at a time and record each answer as `docs/decisions/NN-*.md`:
  1. LLM runtime: Ollama, MLX-LM or llama.cpp
  2. Qwen size and quantization
  3. What the retriever embeds (`title | url`, page-text chunks, or both), and its max sequence length; this must match `backend/app/index/chunking.py`
  4. Embedding dimension, which sets the `vec0` column
  5. Who writes the rule-based parser; tagger (DistilBERT) or LoRA for the trained parser
  6. Answer-writer prompt and JSON shape
  7. Where model weights live: gitignored plus a download script, Git LFS, or Hugging Face Hub
  8. Memory and latency budget with Qwen, the retriever and the DB running together
  9. Retriever metrics (such as Recall@5) and how they plug into `eval/`

## Out of scope for the scaffold

Real parser logic, the trained retriever, LLM integration, fixture contents, question sets, mutant patches, and the chat UI beyond a health-status panel. Each one is later work against these contracts.

## Done when

- `uv sync && uv run pytest` passes from the repo root.
- `cd extension && bun install && bun run test && bun run build` passes.
- `uv run uvicorn app.main:app --app-dir backend` serves `GET /health` with 200.
- Loading `extension/.output/chrome-mv3` in Chrome and clicking the icon opens a side panel showing the backend status.
- No commits are made by Claude; commit commands are handed to Daniel.
