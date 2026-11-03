# backend/ (owner: Daniel)

FastAPI service on `http://localhost:8000` that stores history and answers questions. Read the root `CLAUDE.md` invariants first.

## Stack

Python 3.12 with uv (workspace member `breadcrumbs-backend`), FastAPI, Pydantic v2, pydantic-settings, `sqlite3` + sqlite-vec, sentence-transformers (stock MiniLM default embedder), pytest.

## Layout

| File | Responsibility |
| --- | --- |
| `app/main.py` | `create_app(settings, *, parser, embedder, answer_writer, answer_cache)`; lifespan builds components, runs `init_db` and `ensure_embedder_version`; `/health` (with `entry_count`, `history_start`) |
| `app/config.py` | `Settings` from env and `backend/.env` (see `.env.example`) |
| `app/schemas/ingest.py` | Ingest contract (extension → backend). Owned here |
| `app/schemas/intent.py` | **Shared** Intent draft. Change only with Aditya |
| `app/schemas/api.py` | `/ask`, `/answer` and `/health` shapes, exported to OpenAPI |
| `app/db/schema.sql`, `app/db/connection.py` | Tables and the sqlite-vec `vec_chunks` index |
| `app/index/urls.py` | URL normalization and stable ids (`p_`, `s_`, `e_`) |
| `app/index/chunking.py` | `title \| url` first chunk + overlapping text chunks |
| `app/index/store.py` | `upsert_entries`, `delete_entry`, `ensure_embedder_version` (each one transaction) |
| `app/executor.py` | Intent → SQL filter → topic rank → order → limit. `MIN_TOPIC_SCORE` lives here |
| `app/verifier.py` | Citation check |
| `app/answer_cache.py` | In-memory cache of the last 50 asks with results (10 min), so `/answer` can write the sentence for an `ask_id` |
| `app/history_stats.py` | `window_counts`, `history_start`, `entry_count` for no-match sentences and the first-open screen |
| `app/ports.py` | Protocols Aditya implements: `Parser`, `Embedder`, `LLMClient`, `AnswerWriter` |
| `app/stubs.py`, `app/registry.py` | Defaults, and selection by `PARSER`, `EMBEDDER`, `LLM_MODE` |
| `app/routes/` | `/ingest`, `DELETE /entries/{id}`, `/ask` (Intent, rows, template answer; never calls the LLM), `/answer` (writer + verifier, with `fallback_reason`) |
| `app/seed.py` | `python -m app.seed --reset` loads `fixtures/seed_history.json`; `reset_db` refuses to delete a DB with non-seed entries unless `--force` (use `DB_PATH=data/demo.db`) |

## Choosing model implementations

`backend/.env`:

- `PARSER=stub|rules|llm|tagger` (the last three come from `ml/breadcrumbs_ml/runtime/`)
- `EMBEDDER=minilm` or a path to `ml/models/retriever/<version>/`
- `LLM_MODE=off|live|replay|record` (`off` = template answers only)

When the embedder's `version` changes, the backend re-embeds every chunk at startup.

## Working rules

- TDD: write the failing test in `backend/tests/` first. Use `FakeEmbedder` from `tests/fakes.py`; never load MiniLM in tests.
- Executor changes must keep `[start, end)` and kind filtering exact; those are mutants 03 and 05.
- After changing any schema in `app/schemas/`, regenerate `backend/openapi.json` and the extension client (see root `CLAUDE.md`).
