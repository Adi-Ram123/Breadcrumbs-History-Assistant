# Breadcrumbs Repo Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the README-only repo into a runnable skeleton: a uv workspace (FastAPI backend plus Aditya's `ml/` package), a WXT side-panel extension, shared fixtures and eval scaffolding, scoped Claude files, and CI.

**Architecture:** The Chrome extension (Daniel) ingests visits and searches into a local FastAPI backend (Daniel). The backend stores events in SQLite, with page text chunked and embedded into sqlite-vec. `POST /ask` runs Parser → Intent → executor (SQL kind and time filter, then vector topic rank) → AnswerWriter → verifier. Model code (Aditya, `ml/`) plugs in through Protocols in `backend/app/ports.py`, selected by config. Until `ml/` code exists, stubs make everything run.

**Tech Stack:** Python 3.12, uv 0.12 workspace, FastAPI, Pydantic v2, pydantic-settings, sqlite3 + sqlite-vec, sentence-transformers; Bun 1.4, WXT, React, TypeScript, Vitest, openapi-typescript, @mozilla/readability; pytest; GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-02-repo-scaffold-design.md`

## Global Constraints

- Python `3.12` (`.python-version`), managed only with uv. JS only with Bun (`bun add`, `bun run`, `bunx`).
- Claude never commits. Every "Commit" step means: print the commands in a fenced block for Daniel. Message format: `<type>(<scope>): <summary>`, lowercase, one line, no trailers.
- Timestamps are stored as UTC epoch ms. Time ranges are `[start, end)`. Core functions (`executor`, `store`, `verifier`, parsers) take `now`/`tz` as arguments and never call `datetime.now()`. Only the `/ask` route reads the clock.
- Only IDs the executor returned may be cited. `verify()` enforces this.
- Deleting an entry removes its entry row and, when no other entry still uses the doc, the page row, chunks and vectors, all in one transaction.
- No hosted inference and no network calls at test time. Tests use `FakeEmbedder`, never MiniLM.
- Default timezone `America/Chicago`. Backend at `http://localhost:8000`.
- Extension permissions are exactly `history`, `sidePanel`, `storage`. Host permissions are exactly `http://localhost:8000/*` and `<all_urls>`.
- Agents never read `fixtures/questions/heldback/` and never edit `fixtures/` or `tests/mutants/` after Task 11 creates them.

**Deviation from the spec (deliberate):** URL normalization lives in the backend (`app/index/urls.py`) so the extension and the seed loader share one implementation. The extension's pure-function tests cover `isIngestible` and `extractGoogleQuery` instead of `normalizeUrl`. Also added: an optional `id` on `IngestEntry`, used only by the seed loader, because hand-written expected answers need stable entry IDs.

## Review Focus

1. **Re-ingesting the same visit** (page reload, backfill rerun) must not create duplicate entries. It returns the same id. Test: `test_ingest_is_idempotent` (Task 6).
2. **Backend offline while browsing** must not throw in the extension, and the side panel shows "Backend offline". Test: `getHealth returns null when fetch rejects` (Task 10).
3. **A visit_time with no UTC offset** is rejected with 422 rather than silently treated as UTC. Test: `test_ingest_rejects_naive_datetime` (Task 2).
4. **A page with no extractable text** is still stored and embedded by title. Test: `test_page_without_text_gets_title_chunk` (Task 5).
5. **Deleting one of two visits to the same page** keeps that page's vectors. Deleting the last one removes them. Tests: `test_delete_keeps_shared_page`, `test_delete_last_entry_removes_vectors` (Task 5).

---

### Task 1: uv workspace and backend health endpoint

**Files:**
- Create: `.python-version`, `.gitignore`, `pyproject.toml` (virtual workspace root), `backend/pyproject.toml`, `backend/.env.example`, `backend/app/__init__.py`, `backend/app/config.py`, `backend/app/main.py`, `backend/tests/test_health.py`

**Interfaces:**
- Produces: `Settings` (pydantic-settings, env file `backend/.env` resolved from `config.py`'s location) with fields `db_path: Path = <repo>/data/breadcrumbs.db`, `default_tz: str = "America/Chicago"`, `parser: str = "stub"`, `embedder: str = "minilm"`, `llm_mode: Literal["off","live","replay","record"] = "off"`, `debug_fixed_now: bool = False`, `extension_origin: str = ""`.
- Produces: `create_app(settings: Settings | None = None, **overrides) -> FastAPI` in `app/main.py` and module-level `app = create_app()`. Later tasks add the override keywords `parser`, `embedder`, `answer_writer`. Creating the app must not open the DB or load models; DB init happens in the lifespan.

- [ ] **Step 1: Write root config.** Root `pyproject.toml` has no `[project]`. It contains `[tool.uv.workspace] members = ["backend", "ml"]`, `[dependency-groups] dev = ["pytest", "httpx"]` and `[tool.pytest.ini_options]` with `testpaths = ["backend/tests", "ml/tests", "scripts/tests"]`, `addopts = "--import-mode=importlib"` and `pythonpath = ["scripts"]`. Remove `ml` from members until Task 9 creates it. `.gitignore` covers `.venv/`, `__pycache__/`, `data/`, `backend/.env`, `ml/models/*` with `!ml/models/.gitkeep`, `extension/node_modules/`, `extension/.output/`, `extension/.wxt/`.
- [ ] **Step 2: Write `backend/pyproject.toml`.** Name `breadcrumbs-backend`, build backend hatchling, `[tool.hatch.build.targets.wheel] packages = ["app"]`, dependencies `fastapi`, `uvicorn[standard]`, `pydantic>=2`, `pydantic-settings`, `sqlite-vec`, `sentence-transformers`. Use `uv add --package breadcrumbs-backend ...` so versions resolve and get locked.
- [ ] **Step 3: Write the failing test** `backend/tests/test_health.py`:

```python
def test_health_returns_ok(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert set(body) == {"status", "embedder_version", "parser", "llm_mode"}
```

Add a `client` fixture in `backend/tests/conftest.py` that builds `create_app(Settings(db_path=tmp_path / "t.db"))` and wraps it in `TestClient` used as a context manager, so the lifespan runs. Until Task 4 the health values can be the raw settings strings (`embedder_version` = `settings.embedder`).

- [ ] **Step 4: Run** `uv run pytest backend/tests/test_health.py -v`. Expected: FAIL (import error).
- [ ] **Step 5: Implement** `Settings`, `create_app` and `GET /health`. Add CORS with `allow_origins=[settings.extension_origin]` when it is non-empty.
- [ ] **Step 6: Run** `uv sync && uv run pytest -v`. Expected: 1 passed. Also run `uv run uvicorn app.main:app --app-dir backend --port 8000` and check that `curl localhost:8000/health` returns 200, then stop the server.
- [ ] **Step 7: Commit (hand to Daniel)**

```bash
git add .python-version .gitignore pyproject.toml uv.lock backend/
git commit -m "chore(backend): add uv workspace and fastapi health endpoint"
```

---

### Task 2: Pydantic schemas (ingest, Intent draft, API)

**Files:**
- Create: `backend/app/schemas/__init__.py`, `backend/app/schemas/ingest.py`, `backend/app/schemas/intent.py`, `backend/app/schemas/api.py`, `backend/tests/test_schemas.py`

**Interfaces:**
- Produces, in `ingest.py`:
  - `IngestEntry`: `id: str | None = None`, `kind: Literal["search","visit"]`, `url: str` (min length 1), `query: str | None = None`, `title: str = ""`, `visit_time: AwareDatetime`, `text: str | None = None`, `source: Literal["live","backfill","seed"]`. Validator: `kind == "search"` requires a non-blank `query`.
  - `IngestRequest`: `entries: list[IngestEntry]` (1..1000).
  - `IngestResponse`: `ids: list[str]`.
- Produces, in `intent.py` (module docstring starts with `DRAFT: shared contract, finalize by hand (Daniel + Aditya)`):
  - `TimeRange`: `start: AwareDatetime`, `end: AwareDatetime`. Validator: `start < end`.
  - `Intent`: `kind: Literal["search","visit","any"]`, `time_range: TimeRange | None`, `topic: str | None`, `limit: int | None` (1..100), `order: Literal["recent","relevance"]`.
- Produces, in `api.py`:
  - `AskRequest`: `question: str` (min 1), `tz: str`, validated with `zoneinfo.ZoneInfo`; `now: AwareDatetime | None = None`.
  - `Result`: `id, kind, title, url, query: str | None, visit_time: AwareDatetime, score: float | None`.
  - `Answer`: `text: str`, `cited: list[str]`.
  - `AskResponse`: `question, intent: Intent, results: list[Result], answer: Answer | None, mode: Literal["llm","template","no-match"], timings_ms: dict[str, float]`.
  - `HealthResponse`: `status, embedder_version, parser, llm_mode`.

- [ ] **Step 1: Write failing tests:**
  - `test_ingest_accepts_valid_visit`
  - `test_ingest_rejects_bad_kind` (`kind="bookmark"` raises `ValidationError`)
  - `test_ingest_search_requires_query`
  - `test_ingest_rejects_naive_datetime` (`visit_time="2026-11-03T10:00:00"` raises)
  - `test_time_range_rejects_start_not_before_end` (equal start and end raises)
  - `test_ask_request_rejects_unknown_tz` (`tz="Mars/Base"` raises)
- [ ] **Step 2: Run** `uv run pytest backend/tests/test_schemas.py -v`. Expected: FAIL (imports).
- [ ] **Step 3: Implement the three schema modules** as listed in Interfaces.
- [ ] **Step 4: Run** the same command. Expected: 6 passed.
- [ ] **Step 5: Commit (hand to Daniel)**

```bash
git add backend/app/schemas backend/tests/test_schemas.py
git commit -m "feat(backend): add ingest, intent draft and api schemas"
```

---

### Task 3: SQLite + sqlite-vec database init

**Files:**
- Create: `backend/app/db/__init__.py`, `backend/app/db/schema.sql`, `backend/app/db/connection.py`, `backend/tests/test_db.py`

**Interfaces:**
- Produces: `connect(db_path: Path | str) -> sqlite3.Connection`. It creates parent dirs, loads sqlite-vec (`enable_load_extension(True)`, `sqlite_vec.load(conn)`, then disable), and sets `row_factory = sqlite3.Row`.
- Produces: `init_db(conn, dim: int) -> None`. It runs `schema.sql` (the `entries`, `pages`, `chunks` and `meta` tables, copied verbatim from the spec's SQLite schema, all `IF NOT EXISTS`, plus indexes on `entries(visit_time_ms)`, `entries(page_id)` and `chunks(doc_id)`), then `CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(chunk_id INTEGER PRIMARY KEY, embedding float[{dim}])`.

- [ ] **Step 1: Write failing tests:**
  - `test_init_creates_tables`: the names in `sqlite_master` include `entries`, `pages`, `chunks`, `meta` and `vec_chunks`.
  - `test_sqlite_vec_loaded`: `select vec_version()` returns a string.
  - `test_init_is_idempotent`: calling `init_db` twice does not raise.
- [ ] **Step 2: Run** `uv run pytest backend/tests/test_db.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement** `schema.sql`, `connect` and `init_db`.
- [ ] **Step 4: Run** the same command. Expected: 3 passed.
- [ ] **Step 5: Commit (hand to Daniel)**

```bash
git add backend/app/db backend/tests/test_db.py
git commit -m "feat(db): add sqlite schema with sqlite-vec index"
```

---

### Task 4: Ports, stubs, registry, and wiring them into the app

**Files:**
- Create: `backend/app/ports.py`, `backend/app/stubs.py`, `backend/app/registry.py`, `backend/tests/fakes.py`, `backend/tests/test_registry.py`
- Modify: `backend/app/main.py` (resolve components and init the DB in the lifespan; `/health` reports the real values), `backend/tests/conftest.py`

**Interfaces:**
- Produces, in `ports.py` (all `@runtime_checkable Protocol`):
  - `Parser`: `name: str`, `parse(question: str, now: datetime, tz: str) -> Intent`
  - `Embedder`: `name: str`, `version: str`, `dim: int`, `embed(texts: list[str]) -> list[list[float]]`
  - `LLMClient`: `mode: str`, `complete(messages: list[dict[str, str]], json_schema: dict) -> str`
  - `AnswerWriter`: `mode: Literal["llm","template"]`, `write(question: str, intent: Intent, results: list[Result]) -> Answer`
- Produces, in `stubs.py`:
  - `StubParser` (`name="stub"`): returns `Intent(kind="any", time_range=None, topic=question, limit=10, order="relevance")`.
  - `MiniLMEmbedder` (`name="minilm"`, `version="minilm-l6-v2-stock"`, `dim=384`): loads `sentence-transformers/all-MiniLM-L6-v2` lazily on the first `embed`, with `normalize_embeddings=True`.
  - `TemplateAnswerWriter` (`mode="template"`): returns `Answer(text=f"Found {n} matching entries.", cited=[])`.
- Produces, in `registry.py`:
  - `build_parser(name: str) -> Parser`: `"stub"` gives `StubParser`. `"rules"`, `"llm"` and `"tagger"` import `breadcrumbs_ml.runtime.parser_rules:RulesParser`, `parser_llm:LLMParser` and `parser_tagger:TaggerParser`.
  - `build_embedder(name: str) -> Embedder`: `"minilm"` gives `MiniLMEmbedder`. Any other value is a path passed to `breadcrumbs_ml.runtime.embedder:load_embedder(path)`.
  - `build_answer_writer(llm_mode: str) -> AnswerWriter`: `"off"` gives `TemplateAnswerWriter`. Anything else gives `breadcrumbs_ml.runtime.answer_writer:LLMAnswerWriter(mode=llm_mode)`.
  - Unknown parser names raise `ValueError` naming the valid choices. Imports use `importlib.import_module`.
- Produces, in `tests/fakes.py`: `FakeEmbedder` (`name="fake"`, `version="fake-v1"`, `dim=8`). `embed` is deterministic: a bag of words hashed with `hashlib.md5` into 8 buckets, then L2-normalized, so texts that share words score closer.
- `create_app(settings=None, *, parser=None, embedder=None, answer_writer=None)`: overrides win over the registry. The conftest `client` fixture now passes `embedder=FakeEmbedder()`.

- [ ] **Step 1: Write failing tests:**
  - `test_stubs_satisfy_ports`: `isinstance(StubParser(), Parser)`, and likewise for `MiniLMEmbedder()` with `Embedder` and `TemplateAnswerWriter()` with `AnswerWriter`.
  - `test_unknown_parser_raises`: `build_parser("nope")` raises `ValueError`.
  - `test_health_reports_embedder_version`: `client.get("/health").json()["embedder_version"] == "fake-v1"`.
- [ ] **Step 2: Run** `uv run pytest backend/tests -v`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** `ports.py`, `stubs.py`, `registry.py` and `fakes.py`, and wire them into `main.py`. The lifespan calls `init_db(connect(settings.db_path), embedder.dim)`. Store the components on `app.state`. Add a `get_conn` dependency that opens a connection per request and closes it afterwards.
- [ ] **Step 4: Run** `uv run pytest backend/tests -v`. Expected: all pass.
- [ ] **Step 5: Commit (hand to Daniel)**

```bash
git add backend/app/ports.py backend/app/stubs.py backend/app/registry.py backend/app/main.py backend/tests
git commit -m "feat(backend): add model ports, default stubs and config registry"
```

---

### Task 5: URL normalization, chunking, and the index store

**Files:**
- Create: `backend/app/index/__init__.py`, `backend/app/index/urls.py`, `backend/app/index/chunking.py`, `backend/app/index/store.py`, `backend/tests/test_urls.py`, `backend/tests/test_chunking.py`, `backend/tests/test_store.py`

**Interfaces:**
- Produces, in `urls.py`:
  - `normalize_url(url: str) -> str`: lowercase scheme and host, strip a leading `www.`, drop the fragment, drop the query params `utm_*`, `fbclid`, `gclid`, sort the remaining params, and strip a trailing `/` except on the root path.
  - `page_id(url) -> str` = `"p_" + sha256(normalize_url(url))[:16]`.
  - `search_doc_id(query) -> str` = `"s_" + sha256(query.strip().lower())[:16]`.
  - `entry_id(kind, url, visit_time_ms) -> str` = `"e_" + sha256(f"{kind}|{normalize_url(url)}|{visit_time_ms}")[:16]`.
- Produces, in `chunking.py`:
  - `chunk_text(text: str | None, max_chars: int = 1000, overlap: int = 200) -> list[str]`: returns `[]` for None or whitespace-only text. Prefer to break at whitespace.
  - `doc_chunks(title: str, url: str, text: str | None) -> list[str]` = `[f"{title} | {display_url}"] + chunk_text(text)`, where `display_url` is `normalize_url(url)` without the scheme. This matches the README's `title | url` format; Q&A item 3 may change it.
- Produces, in `store.py`:
  - `upsert_entries(conn, entries: list[IngestEntry], embedder: Embedder) -> list[str]`, in one transaction:
    - Insert entries with `INSERT OR IGNORE`. The id is `entry.id` or `entry_id(...)`. Store `visit_time_ms` as UTC ms, and set `page_id` for visits.
    - Upsert `pages`. Only overwrite `text` when new text is non-null. `text_status` is `'ok'` when text is present and `'none'` otherwise.
    - (Re)build chunks and vectors for each doc whose chunk texts changed.
    - Searches use doc_type `'search'`, doc_id `search_doc_id(query)` and chunks `[query]`.
    - Return the ids in input order.
  - `delete_entry(conn, entry_id: str) -> bool`, in one transaction: delete the entry. If no remaining entry maps to the same doc, delete that doc's chunks, its `vec_chunks` rows and its `pages` row (for visits). Returns `False` if the entry is missing.
  - `ensure_embedder_version(conn, embedder) -> bool`: if `meta.embedder_version` differs, re-embed every chunk, store the new version and return `True`.
  - `entry_doc_id(row) -> str`: maps an entries row to its doc id (used by the executor).
  - Vectors are written with `sqlite_vec.serialize_float32`.

- [ ] **Step 1: Write failing tests:**
  - `test_urls.py`:
    - `normalize_url("HTTPS://www.Example.com/a/?utm_source=x&b=2&a=1#top") == "https://example.com/a?a=1&b=2"`
    - `normalize_url("https://example.com/") == "https://example.com/"`
    - `page_id` is stable across the `www.` and `utm` variants.
  - `test_chunking.py`:
    - `chunk_text(None) == []`
    - a 2500-char text gives chunks that are each ≤ 1000 chars, cover all of the text, and overlap by about 200 chars
    - `doc_chunks("T", "https://rtings.com/laptop", None) == ["T | rtings.com/laptop"]`
  - `test_store.py` (uses `FakeEmbedder` and a tmp DB):
    - `test_page_without_text_gets_title_chunk`: one chunk and one vector, `text_status == 'none'`.
    - `test_upsert_is_idempotent`: the same entry twice gives one row and the same id.
    - `test_delete_keeps_shared_page`: two visits to the same URL at different times; deleting one leaves the page's chunks and vectors.
    - `test_delete_last_entry_removes_vectors`: afterwards the `chunks`, `vec_chunks` and `pages` counts for that doc are 0.
    - `test_delete_missing_returns_false`.
    - `test_embedder_version_change_reembeds`: re-running with a `FakeEmbedder` whose `version="fake-v2"` returns `True` and updates meta.
- [ ] **Step 2: Run** `uv run pytest backend/tests/test_urls.py backend/tests/test_chunking.py backend/tests/test_store.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement** `urls.py`, `chunking.py` and `store.py`.
- [ ] **Step 4: Run** the same command. Expected: all pass.
- [ ] **Step 5: Commit (hand to Daniel)**

```bash
git add backend/app/index backend/tests/test_urls.py backend/tests/test_chunking.py backend/tests/test_store.py
git commit -m "feat(backend): add url normalization, chunking and vector store with joint delete"
```

---

### Task 6: `/ingest` and `DELETE /entries/{id}` routes

**Files:**
- Create: `backend/app/routes/__init__.py`, `backend/app/routes/ingest.py`, `backend/tests/test_ingest_api.py`
- Modify: `backend/app/main.py` (include the router; the lifespan calls `ensure_embedder_version`)

**Interfaces:**
- Consumes: `upsert_entries` and `delete_entry` (Task 5), `IngestRequest` and `IngestResponse` (Task 2).
- Produces: `POST /ingest` returns 200 with `IngestResponse`, or 422 on invalid input. `DELETE /entries/{entry_id}` returns 204, or 404.

- [ ] **Step 1: Write failing tests:**
  - `test_ingest_valid_returns_ids`: one id, prefixed `e_`.
  - `test_ingest_bad_kind_422`.
  - `test_ingest_is_idempotent`: posting the same body twice returns the same id, and `select count(*) from entries` is 1.
  - `test_delete_entry_204_then_404`.
- [ ] **Step 2: Run** `uv run pytest backend/tests/test_ingest_api.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement** the router.
- [ ] **Step 4: Run** `uv run pytest -v`. Expected: all pass.
- [ ] **Step 5: Commit (hand to Daniel)**

```bash
git add backend/app/routes backend/app/main.py backend/tests/test_ingest_api.py
git commit -m "feat(api): add ingest and delete entry endpoints"
```

---

### Task 7: Executor, verifier, and `/ask`

**Files:**
- Create: `backend/app/executor.py`, `backend/app/verifier.py`, `backend/app/routes/ask.py`, `backend/tests/test_executor.py`, `backend/tests/test_verifier.py`, `backend/tests/test_ask_api.py`
- Modify: `backend/app/main.py` (include the ask router)

**Interfaces:**
- Produces: `execute(conn, intent: Intent, embedder: Embedder, tz: str, *, default_limit: int = 10) -> list[Result]`, with the constant `MIN_TOPIC_SCORE = 0.3` (to be tuned on the dev set; recorded in `docs/decisions/` when it changes). Algorithm:
  1. SQL over `entries`: filter `kind` unless it is `"any"`, and apply `visit_time_ms >= start_ms AND visit_time_ms < end_ms` when `time_range` is set.
  2. If `topic` is set, embed it. For each candidate doc, score = `1 - min(vec_distance_cosine(embedding, :q))` over its chunks (join `vec_chunks` to `chunks` with `doc_id IN (...)`). Drop candidates scoring below `MIN_TOPIC_SCORE`. With no topic, `score = None`.
  3. Order: for `"relevance"`, score descending, then `visit_time` descending. For `"recent"`, `visit_time` descending.
  4. Truncate to `intent.limit or default_limit`.
  5. Each `Result.visit_time` is converted to `tz`.
- Produces: `verify(answer: Answer, returned_ids: Sequence[str]) -> Answer | None`. Returns `None` if the text is blank, any cited id is not in `returned_ids`, or `cited` has duplicates. Otherwise it returns the answer unchanged.
- Produces: `POST /ask` → `AskResponse`:
  - `now` is `req.now` if `settings.debug_fixed_now and req.now`, otherwise `datetime.now(ZoneInfo(req.tz))`.
  - Then `parse`, `execute`, and if there are no results, `mode="no-match"` with `answer=None`.
  - Otherwise `write` and then `verify`. If `verify` returns `None` or the writer's mode is `"template"`, use `TemplateAnswerWriter` output with `mode="template"`; otherwise use `mode="llm"`.
  - `timings_ms` keys are `parse`, `execute` and `write`.

- [ ] **Step 1: Write failing tests:**
  - `test_executor.py` (seed rows through `upsert_entries` with `FakeEmbedder`; tz `America/Chicago`):
    - `test_range_end_is_exclusive`: an entry at exactly `end` (local midnight) is excluded, and one at `start` is included.
    - `test_kind_search_excludes_visits`.
    - `test_recent_order_and_limit`: `order="recent", limit=1` returns the newest matching entry.
    - `test_topic_filters_unrelated`: topic "ramen recipes" returns the ramen page and not "tax forms".
    - `test_empty_db_returns_empty`.
  - `test_verifier.py`:
    - `test_rejects_uncited_id`: `cited=["e_x"]` with `returned=["e_a"]` returns `None`.
    - `test_rejects_duplicate_citation`.
    - `test_accepts_valid`.
    - `test_rejects_blank_text`.
  - `test_ask_api.py`:
    - `test_ask_empty_db_no_match`: `mode == "no-match"`, `results == []`, `answer is None`.
    - `test_ask_returns_shape`: after ingesting 2 entries, `mode == "template"`, `len(results) >= 1`, and the keys match `AskResponse`.
    - `test_ask_llm_answer_with_bad_citation_falls_back`: inject an `answer_writer` with `mode="llm"` that cites `"e_fake"`; the response has `mode == "template"` and `answer.cited == []`.
- [ ] **Step 2: Run** `uv run pytest backend/tests/test_executor.py backend/tests/test_verifier.py backend/tests/test_ask_api.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement** `execute`, `verify` and the ask route.
- [ ] **Step 4: Run** `uv run pytest -v`. Expected: all pass.
- [ ] **Step 5: Commit (hand to Daniel)**

```bash
git add backend/app/executor.py backend/app/verifier.py backend/app/routes/ask.py backend/app/main.py backend/tests
git commit -m "feat(backend): add executor, citation verifier and ask endpoint"
```

---

### Task 8: Seed loader and OpenAPI export

**Files:**
- Create: `backend/app/seed.py`, `backend/scripts/export_openapi.py`, `backend/openapi.json` (generated), `backend/tests/test_seed.py`

**Interfaces:**
- Produces: `load_seed(conn, path: Path, embedder: Embedder) -> int`.
  - The seed file is a JSON list of objects with the `IngestEntry` fields plus `deleted: bool = false`, all with `source: "seed"` and explicit `id`.
  - It ingests everything, then calls `delete_entry` for each entry with `deleted: true`.
  - It returns the number of live entries.
- Produces: the CLI `uv run python -m app.seed --reset [--path fixtures/seed_history.json]`. `--reset` deletes the DB file first. It prints `Loaded N entries`.
- Produces: `backend/scripts/export_openapi.py`, which writes `json.dumps(create_app().openapi(), indent=2, sort_keys=True) + "\n"` to `backend/openapi.json`.

- [ ] **Step 1: Write failing tests:**
  - `test_load_seed_respects_explicit_ids_and_deleted`: in a tmp seed with 3 entries, one `deleted`, the function returns 2, the explicit ids are present in `entries`, and the deleted id's vectors are gone.
  - `test_load_empty_seed`: `[]` returns 0.
- [ ] **Step 2: Run** `uv run pytest backend/tests/test_seed.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement** `load_seed`, the CLI and the export script.
- [ ] **Step 4: Run** `uv run pytest -v && uv run python backend/scripts/export_openapi.py`. Expected: tests pass, and `backend/openapi.json` contains the `/ingest`, `/ask`, `/health` and `/entries/{entry_id}` paths.
- [ ] **Step 5: Commit (hand to Daniel)**

```bash
git add backend/app/seed.py backend/scripts backend/openapi.json backend/tests/test_seed.py
git commit -m "feat(backend): add seed loader and openapi export"
```

---

### Task 9: `ml/` package skeleton (Aditya's side)

**Files:**
- Create: `ml/pyproject.toml`, `ml/breadcrumbs_ml/__init__.py`, `ml/breadcrumbs_ml/runtime/__init__.py`, `ml/breadcrumbs_ml/runtime/{parser_rules,parser_llm,parser_tagger,embedder,llm_client,answer_writer}.py`, `ml/breadcrumbs_ml/training/README.md`, `ml/breadcrumbs_ml/eval/README.md`, `ml/models/.gitkeep`, `ml/tests/test_ports.py`
- Modify: root `pyproject.toml` (add `"ml"` back to the workspace members)

**Interfaces:**
- Consumes: the Protocols in `app.ports` and `Intent`, `Result` and `Answer` (Tasks 2 and 4).
- Produces:
  - `RulesParser` (`name="rules"`), `LLMParser` (`name="llm"`) and `TaggerParser` (`name="tagger"`), each with a `parse` that raises `NotImplementedError("see ml/CLAUDE.md Q&A")`.
  - `load_embedder(path: str) -> Embedder`, which raises the same error.
  - `LocalLLMClient(mode: str)` with `complete` raising the same error.
  - `LLMAnswerWriter(mode: str)` with `mode` attribute `"llm"` and a raising `write`.
  - These are the exact import paths `registry.py` uses.
- `ml/pyproject.toml`:
  - name `breadcrumbs-ml`, hatchling, `packages = ["breadcrumbs_ml"]`
  - dependencies `breadcrumbs-backend`, with `[tool.uv.sources] breadcrumbs-backend = { workspace = true }`
  - `[dependency-groups] train = ["transformers", "datasets", "seqeval", "accelerate"]`

- [ ] **Step 1: Write the failing test** `test_runtime_classes_satisfy_ports`: `isinstance(RulesParser(), Parser)`, likewise for the other two parsers, `isinstance(LLMAnswerWriter("live"), AnswerWriter)` and `isinstance(LocalLLMClient("replay"), LLMClient)`. Also `test_registry_resolves_ml_parsers`: `build_parser("rules").name == "rules"`.
- [ ] **Step 2: Run** `uv sync --all-packages && uv run pytest ml/tests -v`. Expected: FAIL.
- [ ] **Step 3: Implement** the skeleton classes. The training and eval READMEs each contain one paragraph: what goes here, and that `ml/CLAUDE.md` holds the open decisions.
- [ ] **Step 4: Run** `uv run pytest -v`. Expected: all pass.
- [ ] **Step 5: Commit (hand to Daniel)**

```bash
git add pyproject.toml uv.lock ml/
git commit -m "chore(ml): add ml package skeleton implementing backend ports"
```

---

### Task 10: WXT extension with side panel, ingestion, and generated API client

**Files:**
- Create: `extension/package.json`, `extension/wxt.config.ts`, `extension/tsconfig.json`, `extension/vitest.config.ts`, `extension/scripts/gen-key.sh`, `extension/lib/url.ts`, `extension/lib/ingest.ts`, `extension/lib/api/schema.d.ts` (generated), `extension/lib/api/client.ts`, `extension/entrypoints/background.ts`, `extension/entrypoints/content.ts`, `extension/entrypoints/sidepanel/{index.html,main.tsx,App.tsx}`, `extension/tests/url.test.ts`, `extension/tests/ingest.test.ts`, `extension/tests/client.test.ts`
- Modify: `backend/.env.example` (set `EXTENSION_ORIGIN=chrome-extension://<generated id>`)

**Interfaces:**
- Produces, in `lib/url.ts`:
  - `isIngestible(url: string): boolean`: false for `chrome://`, `chrome-extension://`, `about:`, `file://`, `edge://`, hosts `localhost` and `127.0.0.1`, and `accounts.google.com`.
  - `extractGoogleQuery(url: string): string | null`: the trimmed, non-empty `q` param when the host matches `/(^|\.)google\.[a-z.]+$/` and the path is `/search`.
- Produces, in `lib/ingest.ts`:
  - `toIngestEntry(input: { url: string; title: string; visitTime: Date; text?: string | null; source: "live" | "backfill" }): IngestEntry | null`, using the generated `components["schemas"]["IngestEntry"]` type.
  - `formatLocalIso(d: Date): string` gives local time with an offset, such as `2026-11-03T10:00:00-06:00`.
- Produces, in `lib/api/client.ts`:
  - `API_BASE = "http://localhost:8000"`
  - `getHealth(): Promise<HealthResponse | null>`, which returns `null` on a network error or non-2xx response.
  - `postIngest(entries: IngestEntry[]): Promise<boolean>`
- `package.json` scripts:
  - `dev: "wxt"`, `build: "wxt build"`, `zip: "wxt zip"`, `test: "vitest run"`
  - `gen:api: "openapi-typescript ../backend/openapi.json -o lib/api/schema.d.ts"`
  - `postinstall: "wxt prepare"`
- `wxt.config.ts`:
  - `modules: ['@wxt-dev/module-react']`
  - `manifest: { key, permissions: ['history','sidePanel','storage'], host_permissions: ['http://localhost:8000/*','<all_urls>'], action: {} }`
- `vitest.config.ts`: `test.env.TZ = "America/Chicago"`.

- [ ] **Step 1: Install.** In `extension/`, run `bun add react react-dom @mozilla/readability` and `bun add -d wxt @wxt-dev/module-react typescript @types/react @types/react-dom @types/chrome vitest openapi-typescript`.
- [ ] **Step 2: Generate the key.** `gen-key.sh` runs `openssl genrsa 2048`, prints the base64 DER public key (the manifest `key`) and the extension id (the first 32 hex chars of the SHA-256 of the DER, mapped `0-f` to `a-p`), then discards the private key. Run it, paste the key into `wxt.config.ts` and the id into `backend/.env.example`.
- [ ] **Step 3: Write failing tests:**
  - `url.test.ts`:
    - `extractGoogleQuery("https://www.google.com/search?q=cheap+flights&oq=x") === "cheap flights"`
    - `extractGoogleQuery("https://www.google.com/maps?q=x") === null`
    - `isIngestible("chrome://settings") === false`
    - `isIngestible("https://example.com") === true`
  - `ingest.test.ts`:
    - a Google search URL maps to `kind: "search"` with the query and `text: null`
    - `chrome://newtab` maps to `null`
    - `formatLocalIso(new Date("2026-11-03T16:00:00Z")) === "2026-11-03T10:00:00-06:00"`
    - `formatLocalIso(new Date("2026-10-31T15:00:00Z")) === "2026-10-31T10:00:00-05:00"` (before the DST end)
  - `client.test.ts`: `getHealth returns null when fetch rejects`, using `vi.stubGlobal("fetch", () => Promise.reject(new TypeError()))`.
- [ ] **Step 4: Run** `bun run gen:api && bun run test`. Expected: FAIL (modules missing).
- [ ] **Step 5: Implement** the lib modules.
- [ ] **Step 6: Run** `bun run test`. Expected: all pass.
- [ ] **Step 7: Implement the entrypoints.**
  - `background.ts`:
    - On install: `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`, then `runBackfill()`.
    - `runBackfill()`: `chrome.history.search({ text: "", startTime: Date.now() - 90 days, maxResults: 100000 })`, then `getVisits` per item, then `toIngestEntry({..., source: "backfill"})` per visit, POSTed in batches of 500. Set `chrome.storage.local.backfillDone = true` only after every batch succeeds.
    - The `onMessage` handler for `{ type: "ingest", entry }` calls `postIngest([entry])`.
  - `content.ts`: matches `<all_urls>`, `runAt: "document_idle"`. Skip if `!isIngestible(location.href)`. Text comes from `new Readability(document.cloneNode(true) as Document).parse()?.textContent`, trimmed and capped at 100000 chars; it is `null` on Google search pages or on failure. Send `{ type: "ingest", entry }`. Wrap the whole thing in try/catch so it never throws into the page.
  - `sidepanel/App.tsx`: on mount, call `getHealth()` and render `Backend: ok · embedder <version> · parser <name>` or `Backend offline. Start it with: uv run uvicorn app.main:app --app-dir backend`.
- [ ] **Step 8: Run** `bun run build`. Expected: `extension/.output/chrome-mv3/manifest.json` exists, contains the `key`, and has the exact permissions above.
- [ ] **Step 9: Manual check.** Start the backend. In `chrome://extensions`, load unpacked from `extension/.output/chrome-mv3`. The id equals the one in `.env.example`. Clicking the icon opens the side panel, which shows "Backend: ok". Stop the backend, reopen the panel, and it shows "Backend offline".
- [ ] **Step 10: Commit (hand to Daniel)**

```bash
git add extension/ backend/.env.example
git commit -m "feat(extension): add wxt side panel, history backfill and page ingestion"
```

---

### Task 11: Shared fixtures, hash check, eval harness, mutants, and docs

**Files:**
- Create: `fixtures/README.md`, `fixtures/seed_history.json` (`[]`), `fixtures/questions/dev/.gitkeep`, `fixtures/questions/heldback/.gitkeep`, `fixtures/HASHES`, `scripts/check_fixture_hashes.py`, `scripts/tests/test_check_fixture_hashes.py`, `scripts/demo-check`, `eval/run.py`, `eval/pass_bars.toml`, `tests/mutants/README.md`, `docs/time-rules.md`, `docs/decisions/README.md`

**Interfaces:**
- Produces, in `check_fixture_hashes.py`:
  - `compute_hashes(root: Path) -> dict[str, str]`: the sha256 of every file under `root` except `HASHES`, keyed by POSIX relative path.
  - `diff_hashes(expected: dict, actual: dict) -> list[str]`: lines like `changed: x`, `added: x`, `removed: x`.
  - CLI: with no args, check `fixtures/` against `fixtures/HASHES` (format `<sha256>  <relpath>`, sorted) and exit 1 with the diff on mismatch. `--write` regenerates the file (for humans only).
- Produces, in `eval/run.py`: CLI `--set dev|heldback` (default `dev`) and `--replay`. It loads `fixtures/questions/<set>/*.jsonl` (format defined in `fixtures/README.md`). With 0 questions it prints `0 questions in <set>` and exits 0. Otherwise it prints `not implemented: scoring` and exits 2. Scoring comes later, against `pass_bars.toml`.
- `eval/pass_bars.toml`, with values copied from the proposal:
  - `intent_kind_time_exact = 0.90`
  - `intent_topic_exact = 0.80`
  - `fetch_exact_set = 1.00`
  - `e2e_recall_min = 0.85`
  - `invented_citations_max = 0`
  - `swap_rule_max_accuracy_gap_points = 2`
  - `swap_rule_max_latency_ms = 200`
- `fixtures/README.md` documents:
  - The seed format: a JSON list of `{id, kind, url, query, title, visit_time (ISO with offset), text, deleted}`. It also states the target of about 300 entries over 14 days in America/Chicago with now = `2026-11-03T10:00:00-06:00`, plus the required edge cases (the DST end on Nov 1, near midnight, repeated searches, java vs javascript, deleted entries).
  - The question JSONL format: `{id, question, now, tz, expected_intent, expected_ids, tags}`.
  - That everything under `fixtures/` is human-written only.
- `scripts/demo-check` (bash, executable):
  1. `uv run python -m app.seed --reset`
  2. `uv run python eval/run.py --set heldback --replay`
- `tests/mutants/README.md`: the 7 wrong builds and the check each one fails, copied from the proposal's table, plus the patch naming convention `NN-short-name.patch`.
- `docs/time-rules.md`: proposal decisions 1 and 2, verbatim. Then a `## Rules to write by hand` list of the phrases to define: today, yesterday, N days ago, last week, this week, last N days, last night, last month.
- `docs/decisions/README.md`: the episode template (request, commit, acceptance command, observed, decided, remaining limitation) and the naming convention `NN-short-name.md`.

- [ ] **Step 1: Write failing tests:**
  - `test_detects_changed_file`: tmp dir, write a file, compute the hashes, modify the file, and `diff_hashes` reports `changed: a.json`.
  - `test_detects_added_and_removed`.
  - `test_ignores_hashes_file`.
- [ ] **Step 2: Run** `uv run pytest scripts/tests -v`. Expected: FAIL.
- [ ] **Step 3: Implement** the script and create all the other files listed above.
- [ ] **Step 4: Run** `uv run python scripts/check_fixture_hashes.py --write && uv run python scripts/check_fixture_hashes.py && uv run python eval/run.py && ./scripts/demo-check && uv run pytest -v`. Expected: the hash check exits 0, eval prints `0 questions in dev`, demo-check prints `Loaded 0 entries` and `0 questions in heldback`, and all tests pass.
- [ ] **Step 5: Commit (hand to Daniel)**

```bash
git add fixtures scripts eval tests/mutants docs/time-rules.md docs/decisions
git commit -m "chore(repo): add fixture formats, hash check, eval harness skeleton and mutant list"
```

---

### Task 12: Claude files, agent permissions, and README rewrite

**Files:**
- Create: `CLAUDE.md`, `backend/CLAUDE.md`, `extension/CLAUDE.md`, `ml/CLAUDE.md`, `.claude/settings.json`
- Modify: `README.md` (full rewrite)

**Interfaces:**
- `.claude/settings.json`:

```json
{
  "permissions": {
    "deny": [
      "Read(./fixtures/questions/heldback/**)",
      "Edit(./fixtures/**)",
      "Write(./fixtures/**)",
      "Edit(./tests/mutants/**)",
      "Write(./tests/mutants/**)",
      "Edit(./eval/pass_bars.toml)"
    ]
  }
}
```

- [ ] **Step 1: Write the root `CLAUDE.md`.** Include: a one-paragraph project summary, the ownership table from the spec, the run commands (`uv sync --all-packages`, `uv run pytest`, `uv run uvicorn app.main:app --app-dir backend`, `cd extension && bun run dev|test|build|gen:api`, `uv run python backend/scripts/export_openapi.py`, `./scripts/demo-check`), the invariants from Global Constraints, and "after changing any API schema: export openapi, then `bun run gen:api`, commit both". Do not include personal git rules; each person keeps their own.
- [ ] **Step 2: Write `backend/CLAUDE.md` and `extension/CLAUDE.md`** (Daniel). Cover scope, the files owned, the contracts owned (ingest schema, DB schema, API, ports), and how stubs and real `ml/` implementations are selected through `backend/.env`.
- [ ] **Step 3: Write `ml/CLAUDE.md`** (Aditya). Sections:
  - **Scope:** retriever training and runtime, parsers (rules, LLM, tagger), LLM client, answer writer, and model eval. Not his: the DB, API, extension and verifier.
  - **Stack:** uv, Python 3.12, sentence-transformers, transformers, datasets, seqeval, PyTorch with MPS. The training deps are in the `train` group: `uv sync --all-packages --group train`.
  - **Contracts:** the Protocols in `backend/app/ports.py` (signatures copied), the `Intent` draft, and the registry names in `backend/app/registry.py`.
  - **Where your retriever lands:** `ml/models/retriever/<version>/` with a `retriever.json` (`version`, `base_model`, `dim`, `max_seq_length`, `pooling`, `normalize`). `load_embedder(path)` reads it. Set `EMBEDDER=<path>` in `backend/.env`. Changing `version` makes the backend re-embed everything.
  - **Rules:** the invariants from the root CLAUDE.md; no hosted inference; never read held-back questions; generated training data must not overlap held-back (the overlap check fails the build).
  - **Q&A: decisions to make with Aditya.** An instruction to Claude: "When Aditya starts a session here and any item below has no linked decision, walk him through the next open item: ask one question at a time, offer 2–4 options with trade-offs and a recommendation, then record the answer as `docs/decisions/NN-<topic>.md` and link it here." The nine items, copied from the spec's Claude-files section, each with a `Decision: (open)` line.
- [ ] **Step 4: Rewrite `README.md`** for the hybrid architecture. Cover: what it is; how it works (the ingest and ask flows from the spec, plus a mermaid diagram of extension → FastAPI → SQLite/sqlite-vec, with the parser, embedder and LLM boxes marked local); the repo layout with owners; the tech stack (the spec's choices; the LLM runtime "decided in ml/CLAUDE.md Q&A"); getting started (the commands from Step 1, plus loading the unpacked extension); the API contract; privacy (everything local); team and attribution (the proposal's dependency list).
- [ ] **Step 5: Verify.** Run `cat .claude/settings.json | python3 -m json.tool`. Expected: valid JSON. Check that each of the 9 Q&A items in `ml/CLAUDE.md` appears exactly once (`grep -c "Decision: (open)" ml/CLAUDE.md` gives 9).
- [ ] **Step 6: Commit (hand to Daniel)**

```bash
git add CLAUDE.md backend/CLAUDE.md extension/CLAUDE.md ml/CLAUDE.md .claude/settings.json README.md
git commit -m "doc(repo): add scoped claude files, aditya q&a and hybrid readme"
```

---

### Task 13: CI workflow and final verification

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Job `python` (ubuntu-latest):
  1. `astral-sh/setup-uv` with cache
  2. `uv sync --all-packages --locked`
  3. `uv run pytest -v`
  4. `uv run python scripts/check_fixture_hashes.py`
  5. `uv run python eval/run.py`
- Job `extension` (ubuntu-latest), needing `python` to export OpenAPI:
  1. setup-uv, then `uv sync --all-packages --locked`
  2. `oven-sh/setup-bun`
  3. `uv run python backend/scripts/export_openapi.py`
  4. `cd extension && bun install --frozen-lockfile && bun run gen:api`
  5. `git diff --exit-code backend/openapi.json extension/lib/api/schema.d.ts`
  6. `bun run test && bun run build`

- [ ] **Step 1: Write `ci.yml`** as specified.
- [ ] **Step 2: Run every CI command locally, in order, from a clean state** (`rm -rf .venv extension/node_modules extension/.output`). Expected: each command exits 0, and `git diff --exit-code` shows no drift.
- [ ] **Step 3: Check the spec's "Done when" list:**
  - `uv sync --all-packages && uv run pytest` passes.
  - `cd extension && bun install && bun run test && bun run build` passes.
  - uvicorn serves `/health` with 200.
  - The manual side-panel check from Task 10, Step 9 passes.
- [ ] **Step 4: Commit (hand to Daniel)**

```bash
git add .github/workflows/ci.yml
git commit -m "chore(ci): add github actions for tests, fixture hashes and openapi drift"
```
