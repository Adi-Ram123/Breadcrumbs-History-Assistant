# Execution record: repo scaffold

- **Plan:** `docs/superpowers/plans/2026-11-02-repo-scaffold.md`
- **Spec:** `docs/superpowers/specs/2026-11-02-repo-scaffold-design.md`
- **How it ran:** superpowers `executing-plans` (inline, one session), then one fresh reviewer over the whole change.
- **Source:** the execution ledger (`.superpowers/sdd/2026-11-02-repo-scaffold/progress.md`, git-ignored scratch). This file keeps its decisions.

A ruling is a call the plan or spec didn't settle. Each one lists what it costs if it turns out wrong.

## Rulings

| Where | Ruling | Why | Cost if wrong |
| --- | --- | --- | --- |
| Setup | Worked in the main tree with no branch and no commits; Daniel commits from printed commands | Daniel's git rules forbid Claude committing or branching | Branch by hand before committing |
| Task 1 | Smoke-tested uvicorn on port 8765, not 8000 | Avoid clobbering a running local service | None |
| Task 2 | `Intent` fields `time_range`, `topic` and `limit` default to `None`; `order` defaults to `relevance` | The spec lists types only, and defaults keep parser output short | A parser that forgets a field gets a silent default instead of a validation error. **Remove the defaults when the Intent draft is finalized.** |
| Task 4 | `fakes.py` is imported through pytest's `pythonpath = backend/tests` | Cleaner than a `sys.path` hack | None |
| Task 5 | `ensure_embedder_version` drops and recreates `vec_chunks`, so a dimension change works; `upsert` records `meta.embedder_version` on first write. Added tests for re-embedding on title change, embedding search queries, and chunking pages with text | The README requires re-embedding when a title changes | None |
| Task 6 | `get_conn` moved from `main.py` to `app/deps.py` | Routers import it without a circular import | None |
| Task 7 | `/ask` catches exceptions from the answer writer and falls back to the template answer | The ranked list must still show when the LLM is unavailable; the `ml/` skeleton writers raise `NotImplementedError` | LLM bugs are silent. The response's `mode`, and now `fallback_reason`, signal it. |
| Task 8 | `load_seed` raises `ValueError` on a seed entry with no `id` | Expected answers depend on ids, and hash ids would mismatch silently | None |
| Task 10 | TypeScript pinned to `^6` (Bun picked 7.0.2) | The README pins TS 6, and TS 7's native compiler may break tool APIs | One version bump later |
| Task 10 | WXT's `browser` global instead of `chrome`; dropped `@types/chrome` | WXT's tsconfig doesn't load Chrome types; `browser` is WXT's typed Chrome API | None |
| Task 10 | Added a `typecheck` script and extra tests: country-domain Google, look-alike host, unparseable URL, non-2xx health, `postIngest` offline | Cheap guards | None |
| Task 10 | Backfill also retries on `runtime.onStartup` | The plan only ran it on install, so a backend that was offline at install would never get history | None |
| Task 10 | Manual Chrome load check left to Daniel | It needs Chrome's UI | A panel or CORS issue found later |
| Task 11 | The fixture hash check ignores `.DS_Store` as well as `HASHES`; `fixtures/README.md` includes one worked question example ("2 days ago" across DST) to pin the format | Humans may replace the example | None |
| Task 12 | `ml/CLAUDE.md` Q&A wording keeps the literal `Decision: (open)` only on the 9 items (the grep count is 9) | The count is how open items are found | None |
| Task 13 | OpenAPI drift checked as "regenerating gives the same files"; CI also runs `bun run typecheck` | Nothing was committed yet, so a git diff check was empty | None |
| Final | Live pages take their visit time from `chrome.history` (latest non-reload visit) and are skipped if there is none | Removes clock-based duplicate visits | A rare race loses that page's text; the visit still syncs title-only |
| Final | A 5xx from `/ingest` is "failed": retry later and hold the watermark. A 4xx is "rejected": retry one by one and skip the bad entry | A transient DB lock must not drop history | An entry that always returns 500 blocks sync |

## Fixed after the final review

- Tests read `backend/.env` (`test_make_settings_ignores_environment`).
- The verifier accepted an answer with no citations (`test_rejects_answer_without_citation`, `test_ask_llm_answer_without_citation_falls_back`).
- A lone UTF-16 surrogate in a title caused a 500 that stalled backfill (`test_ingest_lone_surrogate_title_is_stored`).
- `seed --reset` could wipe a real history DB. It now refuses unless `--force` (`test_reset_refuses_db_with_real_history`); `demo-check` uses `data/demo.db`.
- Duplicate visits, history lost while the backend was down, and a batch stuck on one bad entry (visits, sync, client and ingest tests).

## Deferred minors

| Minor | Status on 2026-11-03 |
| --- | --- |
| `store.py`: an ingest with `text=""` overwrites good page text (should be `if e.text`) | Open |
| The executor returns each visit separately, so repeat visits to one page can fill the top 10 | **Open, and visible on real history** (see the handoff) |
| Embedding runs inside the write transaction, with no WAL or `busy_timeout`, so a long embed can fail a concurrent ingest with "database is locked" | Open |
| A duplicate id within one seed batch leaves orphan search vectors | Open |
| The side panel checked `/health` once on mount and stayed offline until reopened | Fixed by the chat UI's 5 s offline poll |
| A change of embedder version re-embeds everything in one `embed()` call at startup | Open; matters once Aditya's retriever swaps in |
