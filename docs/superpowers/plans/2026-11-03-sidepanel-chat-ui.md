# Side Panel Chat UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the side panel's health readout with the chat UI from the spec: split `POST /ask` into `/ask` and `/answer`, extend `/health`, and build the thread, cards, trail, and no-match flows in the extension.

**Architecture:** The backend stops calling the LLM in `/ask`. It returns the Intent, rows, template answer, and window counts, then caches the ask in memory so `POST /answer` can run the AnswerWriter and verifier later. In the extension, all the logic is pure functions in `lib/` with Vitest tests: time labels, trail layout, captions, no-match copy, re-asks, the thread reducer, and composer keys. The React components in `entrypoints/sidepanel/` only render, and `App.tsx` wires them to the API client and the reducer.

**Tech Stack:** Python 3.12, FastAPI, Pydantic v2, pytest (uv). Bun, WXT 0.21, React 19, TypeScript 6, Tailwind CSS v4 (`@tailwindcss/vite`), `@fontsource-variable/inter`, Vitest, openapi-typescript.

**Spec:** `docs/superpowers/specs/2026-11-03-sidepanel-chat-ui-design.md`. The mockups in `docs/superpowers/specs/sidepanel-mockups/` are the visual reference for Tasks 11–13.

## Global Constraints

- **Package managers.** Python uses uv only. The extension uses Bun only (`bun add`, `bun run`, `bunx`).
- **Commits.** Claude never commits. Every "Commit" step means: print the commands in a fenced block for Daniel. The message format is `<type>(<scope>): <summary>`: lowercase, one line, no trailers.
- **Clock (invariant 1).** `now` and `tz` are passed in. Only the `/ask` route reads the wall clock. `AnswerCache` uses `time.monotonic()` only for expiry. Extension `lib/` functions take `nowMs` and `tz` as arguments and never call `Date.now()`; only `App.tsx` does.
- **Citations (invariant 3).** Only ids that `/ask` returned for that `ask_id` may be cited. `/answer` runs `verify()` against the cached result ids.
- **No network leaves the machine.** That covers fonts, favicons and inference:
  - Inter comes from `@fontsource-variable/inter`, bundled.
  - Favicons come from `chrome-extension://<id>/_favicon/`.
  - No Google Fonts, no favicon services, no CDN.
- **Tests never hit the network.** Backend tests use `FakeEmbedder` and `make_settings`.
- **Agents never edit** `fixtures/`, `tests/mutants/`, `eval/pass_bars.toml`, `ml/`, `backend/app/schemas/intent.py` or `docs/time-rules.md`. Agents never read `fixtures/questions/heldback/`.
- **Never weaken a test.** `test_ask_api.py` is rewritten for the split, and every check it makes today survives on `/ask` or `/answer`.
- **Generated types.** After any schema change, run `uv run python backend/scripts/export_openapi.py`, then `cd extension && bun run gen:api`. Commit `backend/openapi.json` and `extension/lib/api/schema.d.ts` together. Never hand-edit `schema.d.ts`.
- **Manifest permissions.** These become exactly `history`, `sidePanel`, `storage`, `favicon`. Host permissions are unchanged.
- **Fonts.** The font stack is exactly `-apple-system, BlinkMacSystemFont, "Inter Variable", sans-serif` (no `system-ui`). Code-like text uses `ui-monospace, "SF Mono", Menlo, monospace`. All numbers use `tabular-nums`.
- **Tokens.** Components use only the token variables from spec §3 "Tokens", never raw colors. Weights are 400, 500 and 600 only. Shadows appear on the dropdown only.
- **Time formatting.** `Intl` output can contain U+202F (narrow no-break space) before AM/PM and thin spaces in ranges. Every formatter in `lib/` replaces ` ` and ` ` with a plain space, so test strings use ordinary spaces.
- **Test timezone.** Extension tests run with `TZ=America/Chicago` (`vitest.config.ts`). They still pass `tz` explicitly. The fixed now is `NOW = Date.parse('2026-11-02T15:30:00Z')`, which is Mon, Nov 2 2026, 9:30 AM CST.

## Decisions this plan makes (flag to Daniel at handoff)

1. **Row time labels follow the thread mockup, not the spec's example list.** With now = Mon Nov 2:
   - The weekday form ("Thu 8:20 PM") covers entries 2–6 local days back.
   - The full date form starts at 7 days.

   The spec's test line lists "Thu, Oct 29, 8:40 PM", but Oct 29 is 4 days back, and the approved thread mockup shows "Thu 8:20 PM" for that same week. The test therefore uses Mon, Oct 26 for the full form.
2. **`llm_off` means the active writer is the template writer** (`writer.mode == "template"`), which is what `LLM_MODE=off` builds. Tests inject LLM writers while the settings keep `llm_mode="off"`.
3. **An LLM answer with no citations maps to `rejected_citation`.** The verifier rejects it the same way it rejects a foreign id.
4. **`/ask` caches only asks with results.** A no-match `ask_id` is still returned, but `/answer` gives 404 for it. The panel never calls `/answer` for a no-match.
5. **A 5xx from `/ask` is treated as `offline`.** The spec's client result set is `ok | offline | rejected | not_found | aborted`, and the offline card's `/health` polling recovers when the backend is healthy again.
6. **Only `today`, `yesterday`, `N days ago` and `last week` are recognized as ranges for re-asks.** `docs/time-rules.md` has headings but no written ranges yet. These four follow from its two written decisions (local calendar days, weeks run Monday to Sunday). Re-asks may still *send* "in the last 7 days" or "in the last 30 days", because the parser interprets those.
7. **Only one question is in flight at a time.** Send is ignored while the newest card is `asking` or `writing`; during `writing` the button is Stop.
8. **"Cited rows first, at most 3."** The visible rows are the cited rows in rank order, capped at 3, or the top 3 when nothing is cited. "N more results · not cited" reveals the rest, and expanding shows all rows in rank order.

## Review Focus

1. **Enter pressed while an IME is composing** (Japanese or Chinese input) must not send. Test: `composerKeyAction ignores Enter while composing` (Task 10).
2. **A late `/answer` reply after Stop or New chat** must not change the thread. Test: `answerOk after stop is ignored`, `answerOk for a cleared exchange is ignored` (Task 10).
3. **Backend restarted between `/ask` and `/answer`** (404) shows the template answer with "the local model didn't respond", never an error card. Tests: `postAnswer maps 404 to not_found` (Task 5), `answerFailed gives template with llm_error` (Task 10).
4. **An empty database on first open** (`entry_count` 0, `history_start` null) must not render "0 pages … since null". Test: `firstOpenSentence with no history` (Task 7).
5. **Odd rows:** an empty title, a search row, or a URL that `new URL` rejects must still render a title and a domain without throwing. Tests: `rowTitle falls back`, `rowDomain never throws` (Task 7).

---

## File map

| File | Task | Responsibility |
|---|---|---|
| `backend/app/answer_cache.py` (new) | 1 | `AnswerCache`, `CachedAsk` |
| `backend/app/history_stats.py` (new) | 2 | `window_counts`, `history_start`, `entry_count` |
| `backend/app/schemas/api.py` | 3, 4 | `WindowCounts`, new `AskResponse`, `AnswerRequest`, `AnswerResponse`, `HealthResponse` fields |
| `backend/app/routes/ask.py` | 3 | `/ask` without the LLM; caches the ask |
| `backend/app/routes/answer.py` (new) | 3 | `/answer`: writer, verifier, fallback reason |
| `backend/app/main.py` | 3, 4 | `answer_cache=` override, router, `/health` fields |
| `backend/openapi.json`, `extension/lib/api/schema.d.ts` | 4 | regenerated |
| `extension/lib/api/client.ts` | 5 | `postAsk`, `postAnswer`, `ApiResult`, type aliases |
| `extension/lib/zoned.ts` (new) | 6 | local calendar math in a named zone |
| `extension/lib/timeLabel.ts` (new) | 6 | row labels, date labels, range labels |
| `extension/lib/readAs.ts`, `lib/copy.ts`, `lib/rows.ts` (new) | 7 | caption, diagnostics text, fixed copy, row helpers |
| `extension/lib/trail.ts` (new) | 8 | trail layout |
| `extension/lib/reask.ts`, `lib/noMatch.ts` (new) | 9 | re-ask questions, no-match kinds |
| `extension/lib/thread.ts`, `lib/composerKeys.ts` (new) | 10 | thread reducer, key handling |
| `extension/wxt.config.ts`, `package.json`, `entrypoints/sidepanel/styles.css`, `lib/favicon.ts` | 11 | Tailwind, tokens, fonts, favicon permission |
| `extension/entrypoints/sidepanel/components/*.tsx` | 12, 13 | rendering only |
| `extension/entrypoints/sidepanel/App.tsx`, `main.tsx` | 13 | wiring |
| `CLAUDE.md`, `backend/CLAUDE.md`, `extension/CLAUDE.md` | 14 | layout and flow updates |

---

### Task 1: Answer cache

**Files:**
- Create: `backend/app/answer_cache.py`
- Test: `backend/tests/test_answer_cache.py`

**Interfaces:**
- Produces:
  - `@dataclass(frozen=True) class CachedAsk: question: str; intent: Intent; results: list[Result]; template_answer: Answer`
  - `class AnswerCache: __init__(self, *, max_entries: int = 50, ttl_s: float = 600.0, clock: Callable[[], float] = time.monotonic)`
  - `put(self, item: CachedAsk) -> str`. Returns a new id `"a_" + secrets.token_hex(8)`.
  - `get(self, ask_id: str) -> CachedAsk | None`

- [ ] **Step 1: Write the failing tests**

```python
def _item(n=0):
    return CachedAsk(question=f"q{n}", intent=Intent(kind="any"), results=[], template_answer=Answer(text="t", cited=[]))

def test_put_returns_opaque_id_and_get_returns_item():
    c = AnswerCache()
    ask_id = c.put(_item())
    assert re.fullmatch(r"a_[0-9a-f]{16}", ask_id)
    assert c.get(ask_id).question == "q0"

def test_unknown_id_is_none():
    assert AnswerCache().get("a_0000000000000000") is None

def test_keeps_at_most_50_evicting_oldest():
    c = AnswerCache()
    ids = [c.put(_item(i)) for i in range(51)]
    assert c.get(ids[0]) is None
    assert c.get(ids[1]).question == "q1"
    assert c.get(ids[50]).question == "q50"

def test_expires_ten_minutes_after_put():
    t = [100.0]
    c = AnswerCache(clock=lambda: t[0])
    ask_id = c.put(_item())
    t[0] = 100.0 + 599.9
    assert c.get(ask_id) is not None
    t[0] = 100.0 + 600.0
    assert c.get(ask_id) is None
```

- [ ] **Step 2: Run them.** Run `uv run pytest backend/tests/test_answer_cache.py -v`. Expected: FAIL (`ModuleNotFoundError: app.answer_cache`).
- [ ] **Step 3: Implement `app/answer_cache.py`.**
  - Store the entries in an `OrderedDict[str, tuple[float, CachedAsk]]` in insertion order (FIFO). `get` doesn't refresh an entry's position.
  - An entry is expired when `clock() - put_time >= ttl_s`. Drop expired entries on access.
  - Guard both methods with a `threading.Lock`, because FastAPI runs sync routes in a thread pool.
  - Add a module docstring that says expiry uses the monotonic clock and that no answer depends on it.
- [ ] **Step 4: Run them.** Run `uv run pytest backend/tests/test_answer_cache.py -v`. Expected: 4 passed.
- [ ] **Step 5: Commit**

```bash
git add backend/app/answer_cache.py backend/tests/test_answer_cache.py
git commit -m "feat(backend): add in-memory answer cache for split ask and answer"
```

---

### Task 2: History stats

**Files:**
- Create: `backend/app/history_stats.py`
- Test: `backend/tests/test_history_stats.py`

**Interfaces:**
- Consumes: `connect`, `init_db` (`app/db/connection.py`), `upsert_entries` (`app/index/store.py`), `IngestEntry`, `TimeRange`.
- Produces:
  - `window_counts(conn, time_range: TimeRange | None) -> WindowCounts`. Counts entries of each kind with `visit_time_ms` in `[start, end)`, or all entries when the range is `None`. It takes no topic, so the topic can't affect it.
  - `history_start(conn, tz: str) -> datetime | None`: `MIN(visit_time_ms)` as an aware datetime in `tz`.
  - `entry_count(conn) -> int`
  - `WindowCounts` is defined in `app/schemas/api.py` in this task (`search: int`, `visit: int`) and is added to responses in Task 3.

- [ ] **Step 1: Write the failing tests.** The fixture is a `conn` from `connect(tmp_path/"s.db")` plus `init_db(conn, 8)`. It upserts three entries with `FakeEmbedder()`:
  - a visit at `2026-11-01T10:00:00-06:00`
  - a visit at `2026-11-01T20:00:00-06:00`
  - a search (query `"denver"`) at `2026-10-30T12:00:00-05:00`

```python
SUN = TimeRange(start="2026-11-01T00:00:00-05:00", end="2026-11-02T00:00:00-06:00")

def test_window_counts_respects_range_and_splits_kinds(conn):
    assert window_counts(conn, SUN) == WindowCounts(search=0, visit=2)

def test_window_counts_end_is_exclusive(conn):
    r = TimeRange(start="2026-11-01T00:00:00-05:00", end="2026-11-01T20:00:00-06:00")
    assert window_counts(conn, r) == WindowCounts(search=0, visit=1)

def test_window_counts_without_range_counts_everything(conn):
    assert window_counts(conn, None) == WindowCounts(search=1, visit=2)

def test_history_start_is_oldest_entry_in_tz(conn):
    assert history_start(conn, "America/Chicago") == datetime.fromisoformat("2026-10-30T12:00:00-05:00")
    assert history_start(conn, "America/Chicago").utcoffset() == timedelta(hours=-5)

def test_empty_db(empty_conn):
    assert history_start(empty_conn, "UTC") is None
    assert entry_count(empty_conn) == 0
    assert window_counts(empty_conn, None) == WindowCounts(search=0, visit=0)

def test_entry_count(conn):
    assert entry_count(conn) == 3
```

- [ ] **Step 2: Run them.** Run `uv run pytest backend/tests/test_history_stats.py -v`. Expected: FAIL on the import.
- [ ] **Step 3: Implement.**
  - Add `class WindowCounts(BaseModel): search: int; visit: int` to `app/schemas/api.py`.
  - Write `app/history_stats.py` with one `GROUP BY kind` query for the counts.
  - Convert the range to ms the same way the executor does (`int(dt.timestamp() * 1000)`).
  - For `history_start`, use `datetime.fromtimestamp(ms / 1000, ZoneInfo(tz))`.
- [ ] **Step 4: Run them.** Run `uv run pytest backend/tests/test_history_stats.py -v`. Expected: 6 passed.
- [ ] **Step 5: Commit**

```bash
git add backend/app/history_stats.py backend/app/schemas/api.py backend/tests/test_history_stats.py
git commit -m "feat(backend): add window counts and history start queries"
```

---

### Task 3: Split `/ask` and add `/answer`

**Files:**
- Modify: `backend/app/schemas/api.py`, `backend/app/routes/ask.py`, `backend/app/main.py`
- Create: `backend/app/routes/answer.py`
- Rewrite: `backend/tests/test_ask_api.py`
- Create: `backend/tests/test_answer_api.py`

**Interfaces:**
- Consumes: `AnswerCache`, `CachedAsk` (Task 1); `window_counts`, `history_start`, `WindowCounts` (Task 2); `verify` (`app/verifier.py`); `TemplateAnswerWriter` (`app/stubs.py`).
- Produces:
  - `AskResponse`: exactly the spec §1 fields (`ask_id`, `question`, `intent`, `results`, `template_answer`, `mode: Literal["results","no-match"]`, `window_counts: WindowCounts | None`, `history_start: AwareDatetime | None`, `timings_ms`). It has no `answer` field.
  - `AnswerRequest(ask_id: str)`
  - `AnswerResponse(answer: Answer, mode: Literal["llm","template"], fallback_reason: Literal["llm_off","rejected_citation","llm_error"] | None, timings_ms: dict[str, float])`
  - `create_app(..., answer_cache: AnswerCache | None = None)`. The lifespan sets `state.answer_cache = answer_cache or AnswerCache()`.

- [ ] **Step 1: Rewrite `test_ask_api.py`.**
  - Keep `ASK`, `ENTRIES` and the three writer classes.
  - Add `CitingWriter`, whose `write` returns `Answer(text="You read it [1].", cited=[results[0].id])`.
  - Add `FixedParser(intent)` (name `"fixed"`), which returns the given Intent.
  - Add `RecordingParser`, which stores `now` and returns `Intent(kind="any")`.
  - Write these tests:

```python
def test_ask_empty_db_no_match(client):
    body = client.post("/ask", json=ASK).json()
    assert body["mode"] == "no-match"
    assert body["results"] == [] and body["template_answer"] is None
    assert body["window_counts"] == {"search": 0, "visit": 0}
    assert body["history_start"] is None

def test_ask_returns_shape_without_answer(client):
    client.post("/ingest", json=ENTRIES)
    body = client.post("/ask", json=ASK).json()
    assert body["mode"] == "results" and len(body["results"]) >= 1
    assert set(body) == set(AskResponse.model_fields) and "answer" not in body
    assert set(body["timings_ms"]) == {"parse", "execute"}
    assert body["template_answer"]["cited"] == [] and body["window_counts"] is None
    assert re.fullmatch(r"a_[0-9a-f]{16}", body["ask_id"])

def test_ask_never_calls_the_writer(settings):
    with _client_with(settings, BrokenWriter()) as c:   # would raise if called
        c.post("/ingest", json=ENTRIES)
        assert c.post("/ask", json=ASK).json()["mode"] == "results"

def test_no_match_counts_ignore_topic_and_respect_kind_and_range(settings):
    sun = Intent(kind="search", time_range=TimeRange(start="2026-11-01T00:00:00-05:00", end="2026-11-02T00:00:00-06:00"), topic="denver")
    with TestClient(create_app(settings, embedder=FakeEmbedder(), parser=FixedParser(sun))) as c:
        c.post("/ingest", json=SUN_ENTRIES)   # two visits on Sun Nov 1, one search on Oct 30 (Task 2's three entries)
        body = c.post("/ask", json=ASK).json()
    assert body["mode"] == "no-match"
    assert body["window_counts"] == {"search": 0, "visit": 2}
    assert datetime.fromisoformat(body["history_start"]) == datetime.fromisoformat("2026-10-30T12:00:00-05:00")

def test_now_is_honored_only_with_debug_fixed_now(settings):
    fixed = "2026-01-05T12:00:00-06:00"
    # DEBUG_FIXED_NOW off: the parser sees the real clock, not `fixed`
    # DEBUG_FIXED_NOW on (settings.model_copy(update={"debug_fixed_now": True})): the parser sees `fixed`
```

- [ ] **Step 2: Write `test_answer_api.py`.** Move the old fallback checks here, so each one survives:

```python
def _ask(c):
    c.post("/ingest", json=ENTRIES)
    return c.post("/ask", json=ASK).json()

def test_valid_citation_is_llm(settings):
    with _client_with(settings, CitingWriter()) as c:
        ask = _ask(c)
        body = c.post("/answer", json={"ask_id": ask["ask_id"]}).json()
    assert body["mode"] == "llm" and body["fallback_reason"] is None
    assert body["answer"]["cited"] == [ask["results"][0]["id"]]
    assert set(body) == set(AnswerResponse.model_fields) and set(body["timings_ms"]) == {"write"}

def test_foreign_citation_falls_back_rejected_citation(settings):   # was test_ask_llm_answer_with_bad_citation_falls_back
    ... assert body["mode"] == "template" and body["fallback_reason"] == "rejected_citation"
    assert body["answer"] == ask["template_answer"] and body["answer"]["cited"] == []

def test_uncited_answer_falls_back_rejected_citation(settings):     # was test_ask_llm_answer_without_citation_falls_back
def test_writer_exception_falls_back_llm_error(settings):           # was test_ask_writer_exception_falls_back
def test_llm_off_returns_template_llm_off(client):                  # default TemplateAnswerWriter
    ... assert body["mode"] == "template" and body["fallback_reason"] == "llm_off"

def test_unknown_ask_id_is_404(client):
    assert client.post("/answer", json={"ask_id": "a_0000000000000000"}).status_code == 404

def test_expired_ask_id_is_404(settings):
    t = [0.0]
    cache = AnswerCache(clock=lambda: t[0])
    with TestClient(create_app(settings, embedder=FakeEmbedder(), answer_cache=cache)) as c:
        ask = _ask(c)
        t[0] = 600.0
        assert c.post("/answer", json={"ask_id": ask["ask_id"]}).status_code == 404

def test_no_match_ask_id_is_404(client):
    ask = client.post("/ask", json=ASK).json()
    assert client.post("/answer", json={"ask_id": ask["ask_id"]}).status_code == 404
```

- [ ] **Step 3: Run both test files.** Run `uv run pytest backend/tests/test_ask_api.py backend/tests/test_answer_api.py -v`. Expected: FAIL. The old `/ask` still has `answer` and `mode="template"`, and `/answer` returns 404 for every request because the route doesn't exist.
- [ ] **Step 4: Change the schemas and `/ask`.**
  - Replace `AskResponse` in `api.py` and add `AnswerRequest` and `AnswerResponse`, as in the Interfaces block.
  - In `routes/ask.py`:
    - Keep the clock logic.
    - Parse and execute the question.
    - When there are results, compute `TemplateAnswerWriter().write(...)` and `cache.put(CachedAsk(...))`, which yields the `ask_id`.
    - For a no-match, set `ask_id = "a_" + secrets.token_hex(8)`, not cached. Then set `window_counts = window_counts(conn, intent.time_range)`.
    - Always set `history_start = history_start(conn, body.tz)`.
    - Set `timings_ms = {"parse", "execute"}`.
    - Remove the writer and verifier calls from this route.
- [ ] **Step 5: Implement `routes/answer.py`.** It's `POST /answer`, with `response_model=AnswerResponse`.
  - `cache.get(ask_id)`, and raise `HTTPException(404, "ask not found or expired")` when it returns `None`.
  - When `writer.mode == "template"`, return `(cached.template_answer, "template", "llm_off")`.
  - Otherwise call `writer.write(question, intent, results)` inside `try`:
    - If it raises, return the template answer with `"llm_error"`.
    - If `verify(candidate, [r.id for r in results])` is `None`, return the template answer with `"rejected_citation"`.
    - Otherwise return `(candidate, "llm", None)`.
  - Time it as `{"write": ms}`.
  - Register the router in `main.py` and add the `answer_cache` override.
- [ ] **Step 6: Run the backend suite.** Run `uv run pytest -q`. Expected: all pass, with no test removed except the renamed `/ask` fallback tests listed in Step 2.
- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas/api.py backend/app/routes/ask.py backend/app/routes/answer.py backend/app/main.py backend/tests/test_ask_api.py backend/tests/test_answer_api.py
git commit -m "feat(api): split ask into ask and answer endpoints with cached asks"
```

---

### Task 4: `/health` fields and regenerated types

**Files:**
- Modify: `backend/app/schemas/api.py` (`HealthResponse`), `backend/app/main.py`, `backend/tests/test_health.py`
- Regenerate: `backend/openapi.json`, `extension/lib/api/schema.d.ts`

**Interfaces:**
- Consumes: `entry_count`, `history_start` (Task 2).
- Produces: `HealthResponse` gains `entry_count: int` and `history_start: AwareDatetime | None`, in UTC. The extension types `components['schemas'][...]` for `AskResponse`, `AnswerResponse`, `AnswerRequest`, `WindowCounts`, `HealthResponse`, `Intent`, `Result`, `Answer`.

- [ ] **Step 1: Update `test_health.py`.**

```python
def test_health_returns_ok(client):
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert set(body) == {"status", "embedder_version", "parser", "llm_mode", "entry_count", "history_start"}
    assert body["entry_count"] == 0 and body["history_start"] is None

def test_health_counts_entries(client):
    client.post("/ingest", json=ENTRIES)   # import ENTRIES from test_ask_api
    body = client.get("/health").json()
    assert body["entry_count"] == 2
    assert datetime.fromisoformat(body["history_start"]) == datetime.fromisoformat("2026-11-02T18:55:00-06:00")
```

- [ ] **Step 2: Run them.** Run `uv run pytest backend/tests/test_health.py -v`. Expected: FAIL on the key set.
- [ ] **Step 3: Implement.** Add the two fields to `HealthResponse`. `health` takes `conn = Depends(get_conn)` and calls `entry_count(conn)` and `history_start(conn, "UTC")`.
- [ ] **Step 4: Run and regenerate.** Run:

```bash
uv run pytest -q
uv run python backend/scripts/export_openapi.py
cd extension && bun run gen:api && bun run typecheck
```

Expected: pytest all pass, and `git diff --stat` shows both generated files changed. The typecheck may fail only in `App.tsx`, if it reads removed fields; it reads none today, so expect it to pass.
- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/api.py backend/app/main.py backend/tests/test_health.py backend/openapi.json extension/lib/api/schema.d.ts
git commit -m "feat(api): add entry count and history start to health and regenerate client types"
```

---

### Task 5: API client

**Files:**
- Modify: `extension/lib/api/client.ts`
- Test: `extension/tests/client.test.ts` (extend)

**Interfaces:**
- Consumes: the generated `components` (Task 4).
- Produces:
  - Type aliases: `AskResponse`, `AnswerResponse`, `Intent`, `Result`, `Answer`, `WindowCounts`, `HealthResponse`.
  - `type ApiResult<T> = { status: 'ok'; data: T } | { status: 'offline' } | { status: 'rejected'; detail: string } | { status: 'not_found' } | { status: 'aborted' }`
  - `postAsk(question: string, tz: string): Promise<ApiResult<AskResponse>>`
  - `postAnswer(askId: string, signal?: AbortSignal): Promise<ApiResult<AnswerResponse>>`
  - `getHealth` and `postIngest` are unchanged.

- [ ] **Step 1: Write the failing tests.** Use the same `vi.stubGlobal('fetch', …)` style as the existing file.
  - `postAsk returns ok with data on 200`
  - `postAsk maps a rejected fetch to offline`
  - `postAsk maps 5xx to offline`
  - `postAsk maps 422 to rejected with the first detail msg`: the body is `{"detail":[{"msg":"Value error, unknown timezone: Mars/Base"}]}`, and the result is `detail === 'Value error, unknown timezone: Mars/Base'`.
  - `postAsk maps 400 with a string detail to rejected`: `{"detail":"bad"}` gives `'bad'`. A body that isn't JSON gives `'HTTP 400'`.
  - `postAnswer maps 404 to not_found`
  - `postAnswer maps an aborted signal to aborted`: `const ac = new AbortController(); ac.abort();` with a fetch stub that rejects with `new DOMException('x','AbortError')`.
  - `postAsk and postAnswer never throw`: a fetch stub that throws synchronously, and one whose `json()` rejects.
- [ ] **Step 2: Run them.** Run `cd extension && bun run test tests/client.test.ts`. Expected: FAIL, because `postAsk` isn't exported.
- [ ] **Step 3: Implement both functions.** They use one shared `request<T>(path, body, signal)` helper.
  - `POST` with JSON.
  - An `AbortError` (or `signal?.aborted`) gives `aborted`. Any other throw gives `offline`.
  - 404 gives `not_found`. Any other 4xx gives `rejected`, with the detail parsed as the tests require. 5xx gives `offline`.
- [ ] **Step 4: Run them.** Run `bun run test tests/client.test.ts`. Expected: all pass.
- [ ] **Step 5: Commit**

```bash
git add extension/lib/api/client.ts extension/tests/client.test.ts
git commit -m "feat(extension): add ask and answer api client with typed results"
```

---

### Task 6: Zoned time and time labels

**Files:**
- Create: `extension/lib/zoned.ts`, `extension/lib/timeLabel.ts`
- Test: `extension/tests/zoned.test.ts`, `extension/tests/timeLabel.test.ts`

**Interfaces:**
- Produces in `zoned.ts`. Every function takes epoch ms and an IANA `tz`.
  - `localParts(ms, tz): { year: number; month: number; day: number; hour: number; minute: number; weekday: number }`. `weekday` runs 0–6 with Sun = 0, and `hour` runs 0–23.
  - `zonedMs(p: { year; month; day; hour?: number; minute?: number }, tz): number`. A nonexistent time moves forward, and an ambiguous one takes the earlier instant.
  - `startOfLocalDay(ms, tz): number`
  - `addLocalDays(dayStartMs, n, tz): number`. Returns the local midnight n days later, so a day can be 23 or 25 hours.
  - `localDayDiff(fromMs, toMs, tz): number`. Calendar days from `fromMs`'s local date to `toMs`'s.
- Produces in `timeLabel.ts`. All of these use `en-US` and the U+202F replacement from Global Constraints.
  - `clockLabel(ms, tz, opts?: { dropZeroMinutes?: boolean }): string`. Gives "9:14 PM", or "6 PM" with `dropZeroMinutes`.
  - `rowTimeLabel(ms, nowMs, tz): string`
  - `dateLabel(ms, tz): string`. Gives "Sat, Oct 31".
  - `rangeLabel(range: { startMs: number; endMs: number } | null, tz): string`
  - `spanLabel(range, tz): string`. Gives "on Sun, Nov 1" for one whole day, and "from " + `rangeLabel` otherwise.
  - `wholeLocalDays(range, tz): number`. The number of whole local days the range covers, or 0 if either end isn't a local midnight.
  - `toRange(tr: Intent['time_range']): { startMs; endMs } | null`. Parses the ISO strings with `Date.parse`.

- [ ] **Step 1: Write the failing tests.** `const TZ = 'America/Chicago'; const NOW = Date.parse('2026-11-02T15:30:00Z');`

```ts
// zoned.test.ts
expect(startOfLocalDay(Date.parse('2026-11-01T15:00:00Z'), TZ)).toBe(Date.parse('2026-11-01T05:00:00Z'));
expect(addLocalDays(Date.parse('2026-11-01T05:00:00Z'), 1, TZ)).toBe(Date.parse('2026-11-02T06:00:00Z')); // 25-hour day
expect(zonedMs({ year: 2026, month: 11, day: 1, hour: 6 }, TZ)).toBe(Date.parse('2026-11-01T12:00:00Z'));
expect(zonedMs({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, TZ)).toBe(Date.parse('2026-03-08T08:30:00Z')); // gap -> forward
expect(localDayDiff(Date.parse('2026-10-31T03:52:00Z'), NOW, TZ)).toBe(2);
expect(localParts(NOW, TZ)).toMatchObject({ weekday: 1, hour: 9, minute: 30 });

// timeLabel.test.ts
expect(rowTimeLabel(Date.parse('2026-11-02T14:00:00Z'), NOW, TZ)).toBe('8:00 AM');
expect(rowTimeLabel(Date.parse('2026-11-02T03:14:00Z'), NOW, TZ)).toBe('Yesterday 9:14 PM');
expect(rowTimeLabel(Date.parse('2026-11-01T03:52:00Z'), NOW, TZ)).toBe('Sat 10:52 PM');
expect(rowTimeLabel(Date.parse('2026-10-28T00:05:00Z'), NOW, TZ)).toBe('Tue 7:05 PM');          // 6 days back
expect(rowTimeLabel(Date.parse('2026-10-26T23:30:00Z'), NOW, TZ)).toBe('Mon, Oct 26, 6:30 PM'); // 7 days back
expect(rowTimeLabel(Date.parse('2025-12-31T18:00:00Z'), NOW, TZ)).toBe('Wed, Dec 31, 2025, 12:00 PM');
expect(dateLabel(Date.parse('2026-08-04T14:12:00Z'), TZ)).toBe('Tue, Aug 4');
const sat = { startMs: Date.parse('2026-10-31T05:00:00Z'), endMs: Date.parse('2026-11-01T05:00:00Z') };
const week = { startMs: Date.parse('2026-10-26T05:00:00Z'), endMs: Date.parse('2026-11-02T06:00:00Z') };
const night = { startMs: Date.parse('2026-10-31T23:00:00Z'), endMs: Date.parse('2026-11-01T10:00:00Z') };
expect(rangeLabel(sat, TZ)).toBe('Sat, Oct 31');
expect(rangeLabel(week, TZ)).toBe('Mon, Oct 26 – Sun, Nov 1');   // exclusive end shown as the last day
expect(rangeLabel(night, TZ)).toBe('Sat, Oct 31, 6 PM – Sun, Nov 1, 4 AM');
expect(rangeLabel(null, TZ)).toBe('any time');
expect(spanLabel(sat, TZ)).toBe('on Sat, Oct 31');
expect(spanLabel(week, TZ)).toBe('from Mon, Oct 26 – Sun, Nov 1');
expect(wholeLocalDays(week, TZ)).toBe(7);
expect(wholeLocalDays(night, TZ)).toBe(0);
```

- [ ] **Step 2: Run them.** Run `bun run test tests/zoned.test.ts tests/timeLabel.test.ts`. Expected: FAIL on the imports.
- [ ] **Step 3: Implement `zoned.ts`.**
  - `localParts` uses a cached `Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year/month/day/hour/minute: 'numeric', weekday: 'short' }).formatToParts`.
  - `zonedMs` uses offset correction:

```ts
const guess = Date.UTC(y, m - 1, d, h, min);
const off1 = offsetMs(guess - offsetMs(guess, tz), tz); // offsetMs(ms) = Date.UTC(localParts(ms)) - ms
let ms = guess - off1;
if (localParts(ms, tz).hour !== h) ms = guess - offsetMs(guess, tz); // gap: take the later offset (moves forward)
```

  - `addLocalDays` = `zonedMs` of (local date of `dayStartMs`) + n days at hour 0. Do the date arithmetic through `Date.UTC`.
- [ ] **Step 4: Implement `timeLabel.ts`.**
  - **Row labels**, by `localDayDiff` from the entry to now:
    - 0 days: `clockLabel`
    - 1 day: `Yesterday ${clock}`
    - 2–6 days: `${Weekday} ${clock}`
    - otherwise: `${dateLabel}, ${clock}`, with `, ${year}` inserted after the date when the year differs from now's.
  - **Range labels:**
    - Whole local days: a single day is `dateLabel(start)`, and several days are `dateLabel(start) – dateLabel(lastDay)`, where `lastDay = addLocalDays(end, -1)`.
    - Anything else: `${dateLabel}, ${clockLabel(dropZeroMinutes)}` on both ends.
    - The separator is `" – "` (an en dash with plain spaces).
- [ ] **Step 5: Run them.** Run `bun run test tests/zoned.test.ts tests/timeLabel.test.ts`. Expected: all pass.
- [ ] **Step 6: Commit**

```bash
git add extension/lib/zoned.ts extension/lib/timeLabel.ts extension/tests/zoned.test.ts extension/tests/timeLabel.test.ts
git commit -m "feat(extension): add zone-aware day math and time labels"
```

---

### Task 7: Captions, fixed copy and row helpers

**Files:**
- Create: `extension/lib/readAs.ts`, `extension/lib/copy.ts`, `extension/lib/rows.ts`
- Test: `extension/tests/readAs.test.ts`, `extension/tests/copy.test.ts`, `extension/tests/rows.test.ts`

**Interfaces:**
- Consumes: `rangeLabel`, `toRange`, `dateLabel`, `wholeLocalDays` (Task 6); `Intent`, `Result` (Task 5).
- Produces:
  - `readAsCaption(intent: Intent, tz): { what: string; range: string }`. Gives `what` such as `searches`, `pages`, `anything`, or `pages about “ramen”`. `range` is `rangeLabel`, prefixed with `all of ` when it covers exactly one whole local day.
  - `diagTimeRange(intent, tz): string`
  - `type PlainReason = 'llm_off' | 'stopped' | 'rejected_citation' | 'llm_error'`
  - `reasonText(r: PlainReason): string`, with the exact spec §2 strings.
  - `firstOpenSentence(entryCount: number, historyStartIso: string | null, tz, platform: 'mac' | 'other'): string`
  - `diagSummary(mode: 'llm' | 'template', totalMs: number): string`
  - `formatCount(n: number): string`
  - `rowTitle(r: Result): string`
  - `rowDomain(url: string): string`
  - `splitRows(results: Result[], cited: string[]): { visible: Result[]; hidden: Result[] }`

- [ ] **Step 1: Write the failing tests.**

```ts
const sat = { start: '2026-10-31T00:00:00-05:00', end: '2026-11-01T00:00:00-05:00' };
const week = { start: '2026-10-26T00:00:00-05:00', end: '2026-11-02T00:00:00-06:00' };
expect(readAsCaption({ kind: 'search', time_range: sat, topic: null, limit: null, order: 'recent' }, TZ))
  .toEqual({ what: 'searches', range: 'all of Sat, Oct 31' });
expect(readAsCaption({ kind: 'visit', time_range: week, topic: 'ramen', limit: null, order: 'relevance' }, TZ))
  .toEqual({ what: 'pages about “ramen”', range: 'Mon, Oct 26 – Sun, Nov 1' });
expect(readAsCaption({ kind: 'any', time_range: null, topic: 'movie', limit: 1, order: 'recent' }, TZ))
  .toEqual({ what: 'anything about “movie”', range: 'any time' });
expect(diagTimeRange({ kind: 'search', time_range: sat } as Intent, TZ)).toBe('Oct 31 00:00 → Nov 1 00:00 CDT');
expect(diagTimeRange({ kind: 'visit', time_range: week } as Intent, TZ)).toBe('Oct 26 00:00 CDT → Nov 2 00:00 CST');
expect(diagTimeRange({ kind: 'any', time_range: null } as Intent, TZ)).toBe('—');

expect(reasonText('llm_off')).toBe('Plain answer: the local model is off.');
expect(reasonText('stopped')).toBe('Plain answer: you stopped the local model.');
expect(reasonText('rejected_citation')).toBe("Plain answer: the model's reply named a page that isn't in your history, so it was set aside.");
expect(reasonText('llm_error')).toBe("Plain answer: the local model didn't respond.");
expect(firstOpenSentence(4812, '2026-08-04T14:12:00Z', TZ, 'mac'))
  .toBe('Answers come from the 4,812 pages and searches Chrome kept since Tue, Aug 4. Nothing leaves this Mac.');
// Review Focus 4
expect(firstOpenSentence(0, null, TZ, 'other'))
  .toBe('No history is synced yet. Breadcrumbs copies your Chrome history while this panel is open. Nothing leaves this computer.');
expect(diagSummary('llm', 1160)).toBe('LLM, verified · 1,160 ms');
expect(diagSummary('template', 52.4)).toBe('Plain · 52 ms');

// rows (Review Focus 5)
expect(rowTitle({ kind: 'search', query: 'dune showtimes', title: '', url: 'https://www.google.com/search?q=dune' } as Result)).toBe('dune showtimes');
expect(rowTitle({ kind: 'visit', title: '', url: 'https://example.com/a' } as Result)).toBe('example.com/a');
expect(rowDomain('https://www.kayak.com/flights')).toBe('kayak.com');
expect(rowDomain('not a url')).toBe('not a url');
// splitRows: ids r1..r10, cited ['r5','r2'] -> visible [r2, r5], hidden the other 8 in rank order
// cited [] -> visible r1..r3; cited 5 ids -> visible = first 3 cited in rank order, hidden = the rest in rank order
```

- [ ] **Step 2: Run them.** Run `bun run test tests/readAs.test.ts tests/copy.test.ts tests/rows.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the three modules.**
  - **`diagTimeRange`.** Format each end as `MMM D HH:mm`, 24-hour. The zone abbreviation comes from `Intl` `timeZoneName: 'short'`. Write it once at the end when both ends share it, and after each end otherwise.
  - **`rowTitle`.**
    - A search uses `query`.
    - Otherwise use the trimmed `title`.
    - If that's empty, use host + path with no `www.`, falling back to the raw URL.
  - **`rowDomain`** strips `www.` and catches the `URL` constructor's error.
  - **`formatCount`** is `n.toLocaleString('en-US')`.
- [ ] **Step 4: Run them.** Same command. Expected: all pass.
- [ ] **Step 5: Commit**

```bash
git add extension/lib/readAs.ts extension/lib/copy.ts extension/lib/rows.ts extension/tests/readAs.test.ts extension/tests/copy.test.ts extension/tests/rows.test.ts
git commit -m "feat(extension): add read-as captions, panel copy and row helpers"
```

---

### Task 8: Trail layout

**Files:**
- Create: `extension/lib/trail.ts`
- Test: `extension/tests/trail.test.ts`

**Interfaces:**
- Consumes: `zoned.ts`, `clockLabel`, `rowTimeLabel`, `rangeLabel` (Task 6).
- Produces:

```ts
export interface TrailInput {
  range: { startMs: number; endMs: number } | null;
  results: { visitMs: number }[];      // rank = index + 1
  citedRanks: number[];
  kind: 'search' | 'visit' | 'any';
  tz: string; nowMs: number; widthPx: number;
}
export type Anchor = 'start' | 'middle' | 'end';
export interface AxisLabel { x: number; text: string; short?: string; minor?: boolean; anchor: Anchor }
export interface TrailMark { x: number; width: 2 | 4; cited: boolean; ranks: number[]; label: string | null; anchor: Anchor }
export interface Trail { axis: 'hours' | 'days'; labels: AxisLabel[]; marks: TrailMark[]; empty: string | null; ariaLabel: string }
export function buildTrail(input: TrailInput): Trail | null;
export function rankLabel(ranks: number[]): string;
```

Rules:
- **Axis choice:**
  - A range of 25 hours or less gets the hour axis.
  - Otherwise, a range spanning 2–7 local days gets the day axis.
  - Anything longer, or no range, returns `null`.
- **Hour labels** sit at each local 0, 6, 12 and 18 o'clock inside `[start, end)`. They read "12 AM", "6 AM", "noon", "6 PM", and "6 AM" and "6 PM" are `minor`. An end label `${Weekday} ${clockLabel(end, dropZeroMinutes)}` follows, anchored `end`.
- **Day labels** sit at the middle of each local day, with `text` "Mon" and `short` "M".
- **Position:** `x = (t - start) / (end - start) * widthPx`, in true milliseconds.
- **Merging:** marks of the same cited state whose neighbouring x values are under 6px apart merge, chained, into one mark of width 4. Unmerged marks have width 2.
- **Mark labels:** only cited marks get one, `rankLabel(ranks)`.
- **Anchors:** a label or mark with x < 12 anchors `start`, one with x > widthPx − 12 anchors `end`, and anything else `middle`.
- **Empty text:** with no results, `empty` is `'no searches'` when `kind === 'search'` and `'no matches'` otherwise.

- [ ] **Step 1: Write the failing tests.**

```ts
const SAT = { startMs: Date.parse('2026-10-31T05:00:00Z'), endMs: Date.parse('2026-11-01T05:00:00Z') };
const SUN = { startMs: Date.parse('2026-11-01T05:00:00Z'), endMs: Date.parse('2026-11-02T06:00:00Z') };
const WEEK = { startMs: Date.parse('2026-10-26T05:00:00Z'), endMs: Date.parse('2026-11-02T06:00:00Z') };
const base = { kind: 'visit', tz: TZ, nowMs: NOW, widthPx: 250, citedRanks: [] as number[] } as const;
const at = (iso: string) => ({ visitMs: Date.parse(iso) });

it('one local day gets an hour axis', () => {
  const t = buildTrail({ ...base, range: SAT, results: [] })!;
  expect(t.axis).toBe('hours');
  expect(t.labels.map((l) => l.text)).toEqual(['12 AM', '6 AM', 'noon', '6 PM', 'Sun 12 AM']);
  expect(t.labels.filter((l) => l.minor).map((l) => l.text)).toEqual(['6 AM', '6 PM']);
  expect(t.labels.at(-1)!.anchor).toBe('end');
  expect(t.empty).toBe('no matches');
});
it('the 25-hour Sun Nov 1 keeps true length', () => {
  const t = buildTrail({ ...base, range: SUN, results: [] })!;
  expect(t.labels.find((l) => l.text === '6 AM')!.x).toBeCloseTo((7 / 25) * 250, 5);
  expect(t.labels.at(-1)!.text).toBe('Mon 12 AM');
});
it('2-7 days get day labels', () => {
  const t = buildTrail({ ...base, range: WEEK, results: [] })!;
  expect(t.axis).toBe('days');
  expect(t.labels.map((l) => l.text)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  expect(t.labels.map((l) => l.short)).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
});
it('more than 7 days or no range has no trail', () => {
  expect(buildTrail({ ...base, range: { startMs: WEEK.startMs, endMs: WEEK.endMs + 86_400_000 }, results: [] })).toBeNull();
  expect(buildTrail({ ...base, range: null, results: [] })).toBeNull();
});
it('ticks under 6px merge with rank labels', () => {
  const two = buildTrail({ ...base, range: SAT, citedRanks: [1, 2], results: [at('2026-11-01T03:47:00Z'), at('2026-11-01T03:52:00Z')] })!;
  expect(two.marks).toHaveLength(1);
  expect(two.marks[0]).toMatchObject({ width: 4, cited: true, label: '1, 2' });
  const three = buildTrail({ ...base, range: SAT, citedRanks: [1, 2, 3], results: ['03:49', '03:55', '03:58'].map((m) => at(`2026-11-01T${m}:00Z`)) })!;
  expect(three.marks[0].label).toBe('1–3');
  const apart = buildTrail({ ...base, range: SAT, citedRanks: [1, 2], results: [at('2026-11-01T02:00:00Z'), at('2026-11-01T02:40:00Z')] })!;
  expect(apart.marks).toHaveLength(2);   // 40 min = 6.9px
});
it('labels near an edge anchor inward', () => {
  const t = buildTrail({ ...base, range: SAT, citedRanks: [1, 2], results: [at('2026-11-01T04:59:00Z'), at('2026-10-31T05:05:00Z')] })!;
  expect(t.marks.map((m) => m.anchor).sort()).toEqual(['end', 'start']);
});
it('search kind with no results says no searches', () => {
  expect(buildTrail({ ...base, kind: 'search', range: SAT, results: [] })!.empty).toBe('no searches');
});
it('aria label spells out range and result times', () => {
  const t = buildTrail({ ...base, range: SAT, citedRanks: [1], results: [at('2026-11-01T03:52:00Z')] })!;
  expect(t.ariaLabel).toContain('Sat, Oct 31');
  expect(t.ariaLabel).toContain('Sat 10:52 PM');
});
expect(rankLabel([1, 3])).toBe('1, 3');
expect(rankLabel([1, 3, 5])).toBe('1, 3, 5');
expect(rankLabel([2, 3, 4])).toBe('2–4');
```

- [ ] **Step 2: Run them.** Run `bun run test tests/trail.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `trail.ts`** following the rules above.
  - The aria label is `${rangeLabel(range)}. ` followed by either `No searches.` / `No matches.`, or `${n} results: ${times joined by ', '}.`, using `rowTimeLabel`.
  - `rankLabel` uses "a–b" only when the sorted ranks form one run of 3 or more, and a comma list otherwise.
- [ ] **Step 4: Run them.** Same command. Expected: all pass.
- [ ] **Step 5: Commit**

```bash
git add extension/lib/trail.ts extension/tests/trail.test.ts
git commit -m "feat(extension): add trail layout with merging, anchoring and dst-true hours"
```

---

### Task 9: Re-asks and no-match kinds

**Files:**
- Create: `extension/lib/reask.ts`, `extension/lib/noMatch.ts`
- Test: `extension/tests/reask.test.ts`, `extension/tests/noMatch.test.ts`

**Interfaces:**
- Consumes: `zoned.ts`, `dateLabel`, `rangeLabel`, `spanLabel`, `toRange` (Task 6); `formatCount` (Task 7); `AskResponse` (Task 5).
- Produces:
  - `timePhrase(range: { startMs; endMs } | null, nowMs, tz): 'today' | 'yesterday' | 'last week' | `${number} days ago` | null`
  - `reaskQuestion(kind: Intent['kind'], topic: string | null, phrase: string): string`
  - `interface ReAsk { label: string; question: string }`
  - `type NoMatchKind = 'before-history' | 'topic' | 'wrong-kind' | 'empty-window'`
  - `interface NoMatch { kind: NoMatchKind; sentence: string; sub: string; showTrail: boolean; reasks: ReAsk[] }`
  - `describeNoMatch(ask: AskResponse, nowMs: number, tz: string): NoMatch`

**Question templates.** When `phrase` is `''`, there is no trailing space before `?`.

| kind | with topic | without topic |
|---|---|---|
| `visit` | `which pages about “${topic}” did I open ${phrase}?` | `which pages did I open ${phrase}?` |
| `search` | `what did I search about “${topic}” ${phrase}?` | `what did I search ${phrase}?` |
| `any` | `what did I look at about “${topic}” ${phrase}?` | `what did I look at ${phrase}?` |

**No-match order of checks:**
1. Before history: the range is set, `history_start` is set, and `end <= history_start`.
2. Empty window: both counts are 0.
3. Wrong kind: `kind !== 'any'`, `counts[kind] === 0` and the other kind's count is above 0.
4. Topic: a topic is set.
5. Otherwise: empty window.

`showTrail` is false only for the before-history kind.

- [ ] **Step 1: Write the failing tests.** Use `NOW` and `TZ` as before.
  - `YESTERDAY` = `2026-11-01T00:00:00-05:00`..`2026-11-02T00:00:00-06:00`.
  - `LAST_WEEK` = `2026-10-26T00:00:00-05:00`..`2026-11-02T00:00:00-06:00`.
  - `JUL1` = `2026-07-01T00:00:00-05:00`..`2026-07-02T00:00:00-05:00`.
  - `HS` = `'2026-08-04T14:12:00Z'`.
  - `ask(intent, counts, hs = HS)` builds a no-match `AskResponse`.

```ts
// reask.test.ts
expect(timePhrase(toRange(YESTERDAY), NOW, TZ)).toBe('yesterday');
expect(timePhrase(toRange(LAST_WEEK), NOW, TZ)).toBe('last week');
expect(timePhrase({ startMs: Date.parse('2026-10-30T05:00:00Z'), endMs: Date.parse('2026-10-31T05:00:00Z') }, NOW, TZ)).toBe('3 days ago');
expect(timePhrase({ startMs: Date.parse('2026-10-31T23:00:00Z'), endMs: Date.parse('2026-11-01T10:00:00Z') }, NOW, TZ)).toBeNull();
expect(timePhrase(null, NOW, TZ)).toBeNull();
expect(reaskQuestion('visit', 'ramen', 'in the last 30 days')).toBe('which pages about “ramen” did I open in the last 30 days?');
expect(reaskQuestion('visit', 'ramen', '')).toBe('which pages about “ramen” did I open?');
expect(reaskQuestion('search', null, 'yesterday')).toBe('what did I search yesterday?');
expect(reaskQuestion('search', 'dune', 'last week')).toBe('what did I search about “dune” last week?');
expect(reaskQuestion('any', null, 'today')).toBe('what did I look at today?');
expect(reaskQuestion('any', 'denver', 'in the last 7 days')).toBe('what did I look at about “denver” in the last 7 days?');

// noMatch.test.ts
it('before history', () => {
  expect(describeNoMatch(ask({ kind: 'visit', time_range: JUL1, topic: null }, { search: 0, visit: 0 }), NOW, TZ)).toEqual({
    kind: 'before-history', showTrail: false,
    sentence: 'Your history here starts on Tue, Aug 4.',
    sub: "The first sync copied the last 90 days from Chrome, so Wed, Jul 1 isn't in Breadcrumbs.",
    reasks: [{ label: 'Last 7 days', question: 'which pages did I open in the last 7 days?' }],
  });
});
it('before history boundary: end exactly at history_start counts, 1 ms later does not', () => {
  const r = { start: '2026-08-03T00:00:00-05:00', end: '2026-08-04T14:12:00Z' };
  expect(describeNoMatch(ask({ kind: 'visit', time_range: r, topic: null }, { search: 0, visit: 0 }), NOW, TZ).kind).toBe('before-history');
  const later = { ...r, end: '2026-08-04T14:12:00.001Z' };
  expect(describeNoMatch(ask({ kind: 'visit', time_range: later, topic: null }, { search: 0, visit: 0 }), NOW, TZ).kind).toBe('empty-window');
});
it('before history picks yesterday when last 7 days starts too early', () => {
  const hs = '2026-10-29T12:00:00Z';
  expect(describeNoMatch(ask({ kind: 'visit', time_range: JUL1, topic: null }, { search: 0, visit: 0 }, hs), NOW, TZ).reasks)
    .toEqual([{ label: 'Yesterday', question: 'which pages did I open yesterday?' }]);
});
it('topic', () => {
  expect(describeNoMatch(ask({ kind: 'visit', time_range: LAST_WEEK, topic: 'ramen' }, { search: 50, visit: 214 }), NOW, TZ)).toEqual({
    kind: 'topic', showTrail: true,
    sentence: "Nothing about “ramen” in last week's pages.",
    sub: 'You opened 214 pages that week; none of their titles or text mention “ramen”.',
    reasks: [
      { label: 'Search all history', question: 'which pages about “ramen” did I open?' },
      { label: 'Last 30 days', question: 'which pages about “ramen” did I open in the last 30 days?' },
    ],
  });
});
it('topic over searches on one day', () => {
  const m = describeNoMatch(ask({ kind: 'search', time_range: YESTERDAY, topic: 'dune' }, { search: 12, visit: 40 }), NOW, TZ);
  expect(m.sentence).toBe("Nothing about “dune” in yesterday's searches.");
  expect(m.sub).toBe('You made 12 searches that day; none of them mention “dune”.');
});
it('wrong kind: searches', () => {
  expect(describeNoMatch(ask({ kind: 'search', time_range: YESTERDAY, topic: null }, { search: 0, visit: 38 }), NOW, TZ)).toEqual({
    kind: 'wrong-kind', showTrail: true,
    sentence: 'No Google searches yesterday.',
    sub: "You opened 38 pages on Sun, Nov 1, but didn't search for anything.",
    reasks: [{ label: 'Show the 38 pages', question: 'which pages did I open yesterday?' }],
  });
});
it('wrong kind: pages, singular, and no button without a phrase', () => {
  const night = { start: '2026-10-31T18:00:00-05:00', end: '2026-11-01T04:00:00-06:00' };
  const m = describeNoMatch(ask({ kind: 'visit', time_range: night, topic: null }, { search: 1, visit: 0 }), NOW, TZ);
  expect(m.sentence).toBe('No pages opened from Sat, Oct 31, 6 PM – Sun, Nov 1, 4 AM.');
  expect(m.sub).toBe("You made 1 Google search from Sat, Oct 31, 6 PM – Sun, Nov 1, 4 AM, but didn't open any pages.");
  expect(m.reasks).toEqual([]);
});
it('empty window', () => {
  expect(describeNoMatch(ask({ kind: 'search', time_range: YESTERDAY, topic: null }, { search: 0, visit: 0 }), NOW, TZ)).toEqual({
    kind: 'empty-window', showTrail: true,
    sentence: 'Nothing in your history for yesterday.',
    sub: 'Chrome kept no visits or searches then.',
    reasks: [{ label: 'Last 30 days', question: 'what did I search in the last 30 days?' }],
  });
});
it('topic with no time range has no re-asks', () => {
  const m = describeNoMatch(ask({ kind: 'visit', time_range: null, topic: 'ramen' }, { search: 3, visit: 9 }), NOW, TZ);
  expect(m.sentence).toBe('Nothing about “ramen” in your pages.');
  expect(m.sub).toBe('You opened 9 pages; none of their titles or text mention “ramen”.');
  expect(m.reasks).toEqual([]);
});
```

- [ ] **Step 2: Run them.** Run `bun run test tests/reask.test.ts tests/noMatch.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `reask.ts`.**
  - `timePhrase` recognizes only whole-local-day ranges:
    - one day where `localDayDiff(start, now)` is 0 → `today`
    - one day 1 back → `yesterday`
    - one day 2 or more back → `${N} days ago`
    - 7 days starting on the Monday before this week's Monday and ending on this week's Monday → `last week`
  - Everything else returns `null`.
- [ ] **Step 4: Implement `noMatch.ts`.**
  - Build the copy with the tests' exact strings and pluralise through `formatCount`:
    - "1 page" / "N pages"
    - "1 Google search" / "N Google searches"
    - "1 search" / "N searches"
    - "Show the page" / "Show the N pages"
  - The when-word in the topic sub is:
    - `that week` for `last week`
    - `that day` for any single whole day
    - `then` for any other range
    - nothing when there's no range
  - Without a phrase, the topic sentence is `Nothing about “x” in your ${noun} from ${rangeLabel}.`. With no range, it is `Nothing about “x” in your ${noun}.`. For kind `any`, the noun is "history" and the sub reads `You have N entries …`.
  - The before-history re-ask takes the first fit, in this order:
    - "Last 7 days" (`in the last 7 days`), if `addLocalDays(today, -7) >= history_start`
    - "Yesterday", if yesterday's start ≥ `history_start`
    - "Today"
  - In every re-ask, keep the original kind and topic.
- [ ] **Step 5: Run them.** Same command. Expected: all pass.
- [ ] **Step 6: Commit**

```bash
git add extension/lib/reask.ts extension/lib/noMatch.ts extension/tests/reask.test.ts extension/tests/noMatch.test.ts
git commit -m "feat(extension): add no-match kinds and re-ask questions"
```

---

### Task 10: Thread reducer and composer keys

**Files:**
- Create: `extension/lib/thread.ts`, `extension/lib/composerKeys.ts`
- Test: `extension/tests/thread.test.ts`, `extension/tests/composerKeys.test.ts`

**Interfaces:**
- Consumes: `AskResponse`, `AnswerResponse`, `Answer` (Task 5); `PlainReason` (Task 7).
- Produces:

```ts
export type Card =
  | { phase: 'asking' }
  | { phase: 'writing'; ask: AskResponse; startedMs: number }
  | { phase: 'answered'; ask: AskResponse; answer: Answer; mode: 'llm' | 'template'; reason: PlainReason | null; writeMs: number | null }
  | { phase: 'no-match'; ask: AskResponse }
  | { phase: 'offline' }
  | { phase: 'rejected'; detail: string };
export interface Exchange { id: number; question: string; card: Card; rowsOpen: boolean; moreOpen: boolean; diagOpen: boolean }
export interface ThreadState { exchanges: Exchange[]; nextId: number; undo: Exchange[] | null }
export type Action =
  | { type: 'send'; question: string }
  | { type: 'askOk'; id: number; ask: AskResponse; nowMs: number }
  | { type: 'askFailed'; id: number; status: 'offline' } | { type: 'askFailed'; id: number; status: 'rejected'; detail: string }
  | { type: 'answerOk'; id: number; res: AnswerResponse }
  | { type: 'answerFailed'; id: number }
  | { type: 'skipAnswer'; id: number }
  | { type: 'stop'; id: number }
  | { type: 'toggleRows' | 'toggleMore' | 'toggleDiag'; id: number }
  | { type: 'newChat' } | { type: 'undo' } | { type: 'dropUndo' };
export const initialThread: ThreadState;
export function threadReducer(s: ThreadState, a: Action): ThreadState;
export function isBusy(s: ThreadState): boolean;           // newest card asking or writing
export function statusText(e: Exchange): string | null;    // the role=status line for that exchange's current phase
export function lastQuestion(s: ThreadState): string | null;

// composerKeys.ts
export function composerKeyAction(
  e: { key: string; shiftKey: boolean; isComposing: boolean },
  ctx: { text: string; writing: boolean; lastQuestion: string | null },
): 'send' | 'newline' | 'stop' | 'recall' | null;
```

**Rules:**
- **`send`:**
  - Ignored when `isBusy` or when the question is blank after trimming.
  - Otherwise it appends `{ phase: 'asking' }` with `rowsOpen: true` and sets `rowsOpen: false` and `moreOpen: false` on every earlier exchange.
- **`askOk`:** `results` goes to `writing`, and `no-match` goes to `no-match`.
- **`answerOk` and `answerFailed`** apply only while that exchange is `writing`. Otherwise they're ignored.
  - `answerOk` uses `res.answer`, `res.mode` and `res.fallback_reason`.
  - `answerFailed` uses the template answer with `llm_error`.
- **`skipAnswer`** uses the template answer with `llm_off`.
- **`stop`** uses the template answer with `stopped`.
- **Toggles:** `toggleDiag` opening one exchange closes it on all the others.
- **Ids:** any action for an id that isn't present is ignored.
- **`newChat`** moves the exchanges to `undo`. `undo` restores them, and `dropUndo` clears `undo`.
- **`statusText`:**
  - answered: `Answer ready, N sources.` (`1 source`), where N is `answer.cited.length`
  - stopped: `Stopped.`
  - no-match: `No matches.`
  - offline: `Couldn't reach the backend. Question not asked.`
  - rejected: `Couldn't read that question.`
  - otherwise `null`
- **Composer keys:**
  - Enter with `isComposing` → `null`.
  - Shift+Enter → `newline`.
  - Enter while `writing` → `null`.
  - Enter → `send`.
  - Escape while `writing` → `stop`.
  - ArrowUp with empty `text` and a `lastQuestion` → `recall`.
  - Anything else → `null`.

- [ ] **Step 1: Write the failing tests.** Build fixtures as `askResults` (3 results, `template_answer` `{text:'Found 3 matching entries.', cited:[]}`) and `askNoMatch`. The tests are:
  - `send appends an asking exchange and folds earlier rows`
  - `send is ignored while busy`
  - `send ignores a blank question`
  - `askOk with results enters writing; with no-match enters no-match`
  - `askFailed offline and rejected`
  - `answerOk gives llm answer`
  - `answerOk with fallback keeps the reason`
  - `answerFailed gives template with llm_error`: Review Focus 3
  - `skipAnswer gives template with llm_off`
  - `stop gives template with stopped`
  - `answerOk after stop is ignored`: Review Focus 2
  - `answerOk for a cleared exchange is ignored`: Review Focus 2. The sequence is send, askOk, newChat, then `answerOk` for the old id; `exchanges` stays `[]`.
  - `only the newest card is unfolded after two sends`
  - `toggleDiag keeps one panel open`
  - `newChat then undo restores the thread; dropUndo clears it`
  - `statusText for each phase`
  - `composerKeyAction ignores Enter while composing`: Review Focus 1
  - one test per remaining key rule
- [ ] **Step 2: Run them.** Run `bun run test tests/thread.test.ts tests/composerKeys.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement both modules.** The reducer is pure and returns new objects; no React imports.
- [ ] **Step 4: Run them.** Same command. Expected: all pass.
- [ ] **Step 5: Commit**

```bash
git add extension/lib/thread.ts extension/lib/composerKeys.ts extension/tests/thread.test.ts extension/tests/composerKeys.test.ts
git commit -m "feat(extension): add thread reducer and composer key handling"
```

---

### Task 11: Styling foundation, fonts and favicons

**Files:**
- Modify: `extension/package.json`, `bun.lock` (via `bun add`), `extension/wxt.config.ts`, `extension/entrypoints/sidepanel/main.tsx`
- Create: `extension/entrypoints/sidepanel/styles.css`, `extension/lib/favicon.ts`
- Test: `extension/tests/favicon.test.ts`

**Interfaces:**
- Produces:
  - `faviconUrl(pageUrl: string, getURL: (p: string) => string = (p) => browser.runtime.getURL(p as never)): string`. Gives `getURL('/_favicon/') + '?pageUrl=' + encodeURIComponent(pageUrl) + '&size=32'`.
  - Tailwind utilities backed by the tokens: `bg-ground`, `bg-surface`, `bg-raised`, `border-border`, `border-rule`, `border-control`, `text-text`, `text-muted`, `bg-primary`, `text-primary-ink`, `text-hue`, `bg-hue-bg`, `bg-cite-hover`, `bg-tick-muted`, `text-icon-disabled`, `text-negative`.

- [ ] **Step 1: Write the failing test.**

```ts
expect(faviconUrl('https://www.kayak.com/a?b=1', (p) => `chrome-extension://id${p}`))
  .toBe('chrome-extension://id/_favicon/?pageUrl=https%3A%2F%2Fwww.kayak.com%2Fa%3Fb%3D1&size=32');
```

- [ ] **Step 2: Run it.** Run `bun run test tests/favicon.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `lib/favicon.ts`.**
- [ ] **Step 4: Add dependencies and config.**
  - Run `bun add -d tailwindcss @tailwindcss/vite`, then `bun add @fontsource-variable/inter`.
  - In `wxt.config.ts`:
    - Add `vite: () => ({ plugins: [tailwindcss()] })`.
    - Add `'favicon'` to `permissions`.
    - Update the header comment.
  - In `main.tsx`, import `./styles.css`.
- [ ] **Step 5: Write `styles.css`.**
  - Start with `@import "tailwindcss";` and `@import "@fontsource-variable/inter";`.
  - Map each spec token to a Tailwind color with `@theme inline { --color-ground: var(--ground); … }`.
  - Set the light values on `:root` and the dark values under `@media (prefers-color-scheme: dark) { :root { … } }`. Copy all 15 tokens from the spec §3 table verbatim, including `--pop-shadow`.
  - Set `body` to `background: var(--ground)` and `color: var(--text)`, with the exact font stack from Global Constraints, `font-size: 14px`, `line-height: 20px` and `font-variant-numeric: tabular-nums`.
  - Add `:focus-visible { outline: 2px solid var(--hue); outline-offset: 2px }`.
  - Add a `.sr-only` utility.
  - Make the root element a size container: `#root { container-type: inline-size }`.
- [ ] **Step 6: Verify.**

```bash
bun run test && bun run typecheck && bun run build
grep -c '"favicon"' dist/chrome-mv3/manifest.json
grep -rlE "fonts.googleapis|gstatic|google.com/s2/favicons" dist/chrome-mv3 || echo "no remote font or favicon urls"
```

Expected:
- tests and typecheck pass, and the build succeeds
- the grep prints `1`
- the last line prints `no remote font or favicon urls`
- `dist/chrome-mv3` contains the bundled Inter woff2 file(s)
- [ ] **Step 7: Commit**

```bash
git add extension/package.json extension/bun.lock extension/wxt.config.ts extension/entrypoints/sidepanel/main.tsx extension/entrypoints/sidepanel/styles.css extension/lib/favicon.ts extension/tests/favicon.test.ts
git commit -m "chore(extension): add tailwind v4, design tokens, bundled inter and favicon permission"
```

---

### Task 12: Card components

**Files:**
- Create: `extension/entrypoints/sidepanel/components/` `Icons.tsx`, `ResultList.tsx`, `Trail.tsx`, `ReadAs.tsx`, `AnswerCard.tsx`, `NoMatchCard.tsx`, `OfflineCard.tsx`, `RejectedCard.tsx`, `DiagnosticsLine.tsx`

**Interfaces:**
- Consumes: Tasks 5–11. The components only render, so every string and number comes from `lib/`.
- Produces these props:
  - `ResultList({ results, cited, open, moreOpen, onToggleMore, tz, nowMs, onOpen })`
  - `Trail({ input: Omit<TrailInput,'widthPx'> })`. It measures its own width with `ResizeObserver`.
  - `ReadAs({ intent, tz, nowMs, results, citedRanks, foldable?: { open: boolean; count: number; onToggle } })`
  - `AnswerCard({ exchange, tz, nowMs, latest: boolean, showDiag: boolean, onToggleRows, onToggleMore, onToggleDiag, onOpen })`. It renders the `asking`, `writing` and `answered` phases.
  - `NoMatchCard({ ask, tz, nowMs, onReask: (q: string) => void })`
  - `OfflineCard({ onRetry })`
  - `RejectedCard({ detail })`
  - `DiagnosticsLine({ card, open, onToggle })`
  - `onOpen(url)` is supplied by App and calls `browser.tabs.create({ url, active: false })`.

**What each component must do.** Match the spec §2 component table and the mockups. These are the points a reviewer will check:

- **Rows:**
  - Each row is `<a href target="_blank" rel="noopener">`. Its `onClick` calls `preventDefault` and then `onOpen`, so a middle-click still works.
  - The row is at least 48px tall and holds:
    - the rank badge
    - the title, using `rowTitle` and one-line `truncate`, or 2 lines at `@max-[280px]`
    - the favicon `<img src={faviconUrl(url)} width=16 height=16 alt="">`, which sits on a 16px `#e8e8e8` rounded square under dark mode; search rows show a grey magnifier and "Google search" instead
    - `rowDomain` · `rowTimeLabel`
    - the open icon
    - a hidden ", opens in a new tab"
  - **Badges:**
    - A cited badge has `bg-hue-bg text-hue` and `aria-label="Source N."`.
    - An uncited badge is a grey number with `aria-hidden`.
    - While the card is `writing`, every badge is grey.
  - **Folding:**
    - `splitRows` decides the visible rows, then a `<button aria-expanded>` reads "N more results · not cited" or "Show fewer".
    - When `open` is false, the whole list is replaced by a "N results" button with `aria-expanded=false`.
- **Answer:**
  - The answer is 15/22. Each citation chip is an `<a>` named `Source N: <title>`, 20px tall with an invisible 2px extension.
  - An older card (`latest === false`) clamps the answer to 3 lines.
  - A plain answer (`mode === 'template'`) adds the info icon and `reasonText(reason)`, at 12px in `text-muted`.
  - **Chip numbering:** chips number the cited results in row order. Map each id in `answer.cited` to its rank in `results`.
- **Asking:** the final layout with flat `bg-raised` bars and no animation.
- **Writing:** "Writing an answer", with ` · N s` added once 2 s have passed since `startedMs`. Use a 1 s interval inside the component.
- **Trail:**
  - The trail is `role="img"` with `aria-label`.
  - Ticks are absolutely positioned at `x`:
    - cited: 2×12, or 4×12 when merged, in `bg-hue`
    - uncited: 2×8 in `bg-tick-muted`
  - Labels go above the track, using `anchor` to set `translateX(0 | -50% | -100%)`.
  - Minor labels get a class hidden at `@max-[280px]`. Day labels swap to `short` there.
  - With `empty` set, the grey text sits centred on the track.
- **ReadAs:** "Read as **what**, **range**" at 12/16 `text-muted`, then the `Trail`. At `@max-[280px]` the fold button stacks below the caption.
- **NoMatchCard:**
  - The sentence and sub come from `describeNoMatch`.
  - `ReadAs` appears when `showTrail` is true.
  - Each re-ask is a 32px outlined button (`border-control`) that calls `onReask(question)`.
- **OfflineCard:**
  - The negative icon, then "Couldn't reach the Breadcrumbs backend on localhost:8000, so this question wasn't asked. Start it in a terminal from the repo:".
  - The command `uv run uvicorn app.main:app --app-dir backend` in mono. `--app-dir` sits in a `whitespace-nowrap` span so it breaks only at spaces.
  - Copy uses `navigator.clipboard.writeText`, and the button label changes to "Copied" for 2 s.
  - Then a **Try again** button.
- **RejectedCard:** "Couldn't read that question" and the `detail`.
- **DiagnosticsLine:**
  - A `<button aria-expanded>` showing `diagSummary(mode, parse + execute + write)`.
  - It opens a `<dl>` with:
    - `kind`
    - `time_range` (`diagTimeRange`)
    - `topic · order · limit`, where null shows as `—`
    - `parse · fetch · write`, from `ask.timings_ms.parse`, `ask.timings_ms.execute` and `writeMs`, each through `formatCount(Math.round(x))`, with a ` ms` suffix on the last
- **Colors and shape:** use token utilities only. The card radius is 8, controls 6, chips 4, and the card padding 16px. Nothing has a shadow.

- [ ] **Step 1: Build the components** as specified.
- [ ] **Step 2: Verify the types and build.** Run `bun run typecheck && bun run build`. Expected: both pass.
- [ ] **Step 3: Check for raw colors.** Run `grep -nE "#[0-9a-fA-F]{3,6}|rgb\(" entrypoints/sidepanel/components/*.tsx`. Expected: the only hit is the `#e8e8e8` favicon backing (spec §3), or nothing if that value is moved into `styles.css`.
- [ ] **Step 4: Commit**

```bash
git add extension/entrypoints/sidepanel/components/
git commit -m "feat(extension): add answer, no-match, offline and result row components"
```

---

### Task 13: Panel shell and App wiring

**Files:**
- Create: `extension/entrypoints/sidepanel/components/` `TopBar.tsx`, `Thread.tsx`, `Composer.tsx`, `EmptyState.tsx`
- Rewrite: `extension/entrypoints/sidepanel/App.tsx`

**Interfaces:**
- Consumes: `threadReducer`, `initialThread`, `isBusy`, `statusText`, `lastQuestion` and `composerKeyAction` (Task 10); `getHealth`, `postAsk`, `postAnswer` (Task 5); `firstOpenSentence`, `rowTimeLabel` (Tasks 6–7); the Task 12 components.
- Produces: the finished panel.

**Wiring in `App.tsx`:**
- **On mount:**
  - `browser.runtime.sendMessage({ type: 'sync' })`, as today.
  - `getHealth()`.
  - Read the storage keys `showDiagnostics` (boolean) and `lastSyncedMs`.
  - Subscribe to `browser.storage.onChanged` for both.
  - `tz = Intl.DateTimeFormat().resolvedOptions().timeZone`.
  - `nowMs` is state, refreshed every 60 s and on each send. `App` is the only caller of `Date.now()`.
- **`ask(question)`:**
  1. Dispatch `send`.
  2. Call `postAsk`. On `ok`, dispatch `askOk`. On `offline` or `rejected`, dispatch `askFailed`, and start polling `getHealth()` every 5 s while offline. While offline the composer is disabled, with the note "Sending is paused until the backend is running.", and keeps its text.
  3. For `mode === 'results'`, either dispatch `skipAnswer` when `health.llm_mode === 'off'`, or create an `AbortController` held in a ref and call `postAnswer`:
     - `ok` → `answerOk`
     - `aborted` → nothing, because Stop already dispatched
     - otherwise → `answerFailed`
- **Stop:** `controller.abort()` plus dispatch `stop`.
- **Status line:** after each dispatch that changes the newest exchange's phase, set the single `role="status" aria-live="polite"` line to `statusText(newest)`.
- **New chat:**
  - Dispatch `newChat`, then show an "Undo" toast above the composer for 5 s. When it expires, dispatch `dropUndo`.
  - Undo dispatches `undo`.
  - Abort any running `/answer` first.
- **Try again** on the offline card calls `getHealth()`. If it's healthy, re-send that card's question.

**Components:**
- **`TopBar`:**
  - The mark plus `<h1>Breadcrumbs</h1>`, hidden visually below `@max-[220px]` but kept for screen readers.
  - A New chat icon button (`aria-label`, `title`).
  - A "⋯" icon button with `aria-expanded` that opens the dropdown (`--pop-shadow`). It holds:
    - **Sync history now**: sends `{ type: 'sync' }` and shows `rowTimeLabel(lastSyncedMs)` on the right.
    - **Show diagnostics**: `role="switch"`, `aria-checked`, the description "Shows how each question was read and timed", and it writes `showDiagnostics`.
  - Esc closes the dropdown and focuses "⋯". Clicking outside closes it.
- **`Thread`:**
  - `<main aria-label="Conversation">`, holding each exchange as an `<h2>` question bubble (`bg-raised`, max 85% width) followed by its card.
  - The spacing is 32px between exchanges and 16px from question to card.
  - **On send:** scroll the new question to the top, with `behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'`.
  - **When scrolled away from the bottom:** track "at bottom" with a 24px tolerance. Away from the bottom, show the "Latest answer" pill (32px, `border-border`, no shadow) above the composer. Clicking it scrolls to the bottom, and it hides at the bottom.
- **`Composer`:**
  - A `<form>` holding a visually hidden `<label>` "Ask about your history" and a `<textarea>` that grows to 6 lines. The textarea has no focus ring and no border change on focus (`outline-none`, and no `focus-within` styles on the form).
  - `onKeyDown` maps `composerKeyAction` to send, newline, stop and recall, using `e.nativeEvent.isComposing`.
  - The button is Send (disabled when blank, busy or offline) or Stop while writing.
- **`EmptyState`:**
  - Shown when the thread has no exchanges.
  - The heading "Find something you browsed" (18/26 semibold), then `firstOpenSentence(health.entry_count, health.history_start, tz, navigator.platform.startsWith('Mac') ? 'mac' : 'other')`.
  - Then 4 buttons, each ending in the up-arrow icon, that ask immediately:
    - "What did I search 2 days ago?"
    - "What was the last movie I watched?"
    - "Which ramen pages did I open last week?"
    - "What was I reading yesterday afternoon?"
  - If the panel opens while the backend is offline, the empty state still renders, and the first send produces the offline card.

- [ ] **Step 1: Build the four components and rewrite `App.tsx`** as specified.
- [ ] **Step 2: Verify the whole extension.** Run `bun run test && bun run typecheck && bun run build`. Expected: all pass.
- [ ] **Step 3: Smoke-test in Chrome against a seeded demo DB.** In a terminal from the repo, run:

```bash
DB_PATH=$PWD/data/demo.db uv run python -m app.seed --reset
DB_PATH=$PWD/data/demo.db uv run uvicorn app.main:app --app-dir backend
```

  - Load `extension/dist/chrome-mv3` unpacked and open the panel.
  - Ask a question and confirm the rows appear, then the answer. With `LLM_MODE=off`, it's a plain answer with the "local model is off" reason.
  - Stop the backend, ask again, and confirm the offline card and the paused Send. Start the backend again and confirm Send re-enables within 5 s.
- [ ] **Step 4: Commit**

```bash
git add extension/entrypoints/sidepanel/
git commit -m "feat(extension): replace health panel with side panel chat ui"
```

---

### Task 14: Docs and the manual check

**Files:**
- Modify: `CLAUDE.md` (the question-flow line), `backend/CLAUDE.md` (layout table: `answer_cache.py`, `history_stats.py`, `routes/answer.py`), `extension/CLAUDE.md` (stack, permissions incl. `favicon`, new `lib/` files, sidepanel description)

- [ ] **Step 1: Update the three CLAUDE.md files.** The question-flow line becomes:

  > side panel → `POST /ask` → `Parser.parse(question, now, tz)` → Intent → executor → rows and template answer (cached by `ask_id`) → side panel → `POST /answer` → AnswerWriter → verifier → answer

- [ ] **Step 2: Run the full suites.**

```bash
uv run pytest -q
uv run python backend/scripts/export_openapi.py && (cd extension && bun run gen:api)
git diff --exit-code backend/openapi.json extension/lib/api/schema.d.ts
cd extension && bun run typecheck && bun run test && bun run build
```

Expected: everything passes, and the `git diff --exit-code` exits 0, which means no drift.
- [ ] **Step 3: Do the manual check from spec §4.** Record the results in the handoff message.
  - Compare each state in `docs/superpowers/specs/sidepanel-mockups/*.html` in light and dark (System Settings → Appearance):
    - first open
    - asking
    - writing
    - answered (LLM and plain)
    - each no-match kind
    - offline
    - rejected
    - diagnostics
  - Go through the whole flow keyboard-only:
    - Tab order
    - Enter and Shift+Enter
    - Esc for Stop and for the dropdown
    - ↑ to recall
  - VoiceOver announces "Answer ready, N sources."
  - At the narrowest side panel width and at 200% zoom, nothing scrolls sideways.
  - In DevTools → Network, the only requests go to `localhost:8000` and `chrome-extension://`.
- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md backend/CLAUDE.md extension/CLAUDE.md
git commit -m "doc(repo): describe split ask and answer flow and side panel layout"
```
