# Breadcrumbs: History Assistant

A Chrome extension plus a local FastAPI backend that answers questions about your own browsing history ("what was the last movie I watched?", "what did I search 2 days ago?") and links each answer to the history entries it came from. Everything runs on the user's machine: SQLite with sqlite-vec, the retriever, and a local Qwen LLM. Design: `docs/superpowers/specs/2026-11-02-repo-scaffold-design.md`. Proposal-level contract: pass bars in `eval/pass_bars.toml`, time rules in `docs/time-rules.md`.

Question flow: side panel → `POST /ask` → `Parser.parse(question, now, tz)` → Intent → executor (SQL kind + time filter, then vector topic rank) → AnswerWriter → verifier → response.

## Ownership

| Area | Owner | Scoped notes |
| --- | --- | --- |
| `extension/` (background backfill, content script, side panel chat UI) | Daniel | `extension/CLAUDE.md` |
| `backend/` (FastAPI, SQLite, sqlite-vec, ingest, executor, delete, verifier, ports) | Daniel | `backend/CLAUDE.md` |
| `ml/` (retriever, parsers, LLM client, answer writer, model training and eval) | Aditya | `ml/CLAUDE.md` |
| `backend/app/schemas/intent.py`, `docs/time-rules.md`, `fixtures/`, `eval/`, `tests/mutants/` | Shared | |

Work inside your own area. A change to a shared contract or to the other person's area needs both owners to agree.

## Commands

```bash
uv sync --all-packages                              # Python deps for backend + ml
uv run pytest                                       # all Python tests
uv run uvicorn app.main:app --app-dir backend       # backend on http://localhost:8000
DB_PATH=$PWD/data/demo.db uv run python -m app.seed --reset   # seed a separate demo DB; never --force on real history
uv run python backend/scripts/export_openapi.py     # write backend/openapi.json
uv run python eval/run.py --set dev                 # eval harness (dev set)
./scripts/demo-check                                # seed + held-back run with replayed LLM responses

cd extension
bun install
bun run dev        # Chrome with the extension loaded, reloads on save
bun run test       # Vitest
bun run typecheck
bun run build      # extension/dist/chrome-mv3
bun run gen:api    # regenerate lib/api/schema.d.ts from backend/openapi.json
```

After changing any API schema: run `export_openapi.py`, then `bun run gen:api`, and commit both `backend/openapi.json` and `extension/lib/api/schema.d.ts`. CI fails if they drift.

## Invariants

A change that breaks one of these is rejected, even if the tests pass.

1. **`now` and `tz` are passed in.** The executor, store, verifier and every parser never read the clock. Only the `/ask` route does.
2. **Timestamps are stored as UTC epoch ms.** Calendar phrases are resolved in the user's timezone, and every range is `[start, end)`.
3. **Only IDs the executor returned may be cited.** `app/verifier.py` drops any other answer and the API falls back to the template answer.
4. **Delete is one operation.** Removing an entry removes its row and, when no other entry uses the page or query, its chunks and vectors in the same transaction.
5. **No hosted inference.** No external API calls for parsing, embedding or answering; no telemetry. History never leaves the machine.
6. **Agents do not edit `fixtures/`, `tests/mutants/` or `eval/pass_bars.toml`.** Propose changes instead. `scripts/check_fixture_hashes.py` fails the build if fixtures change without a reviewed `HASHES` update.
7. **Agents never read `fixtures/questions/heldback/`.** It runs only at milestones, through `eval/run.py`.
8. **Never weaken a test to make it pass.** Fix the code, or raise the test as wrong with evidence.
9. **Tests never hit the network or download models.** Use `backend/tests/fakes.py` (`FakeEmbedder`).
