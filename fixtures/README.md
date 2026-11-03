# Fixtures

**Everything in this folder is written by hand.** Coding agents do not edit it (`.claude/settings.json` denies it, and `scripts/check_fixture_hashes.py` fails the build if a file changes without `fixtures/HASHES` being regenerated in the same reviewed commit). After an intentional change, run `uv run python scripts/check_fixture_hashes.py --write` and commit `HASHES` with it.

## `seed_history.json`

A JSON list of entries. The seed loader (`uv run python -m app.seed --reset`) ingests all of them, then deletes the ones marked `deleted`.

```json
{
  "id": "s014",
  "kind": "search",
  "url": "https://www.google.com/search?q=cheap+flights+to+denver",
  "query": "cheap flights to denver",
  "title": "cheap flights to denver - Google Search",
  "visit_time": "2026-11-01T22:47:00-06:00",
  "text": null,
  "source": "seed",
  "deleted": false
}
```

- `id` is required and stable; expected answers refer to it. Use a readable scheme such as `sNNN` for searches and `vNNN` for visits.
- `kind` is `search` or `visit`. Searches need `query`. Visits may have `text` (main page text) or `null`.
- `visit_time` is ISO 8601 with the local UTC offset.

Target contents (proposal): about 300 searches and visits over 14 days in `America/Chicago`, with "now" fixed at `2026-11-03T10:00:00-06:00`. The window must cover:

- the end of daylight saving time on Nov 1 (offset `-05:00` before 2:00 local, `-06:00` after)
- entries just before and just after local midnight
- repeated searches
- similar topics such as "java" and "javascript"
- deleted entries (`"deleted": true`)

## `questions/dev/*.jsonl` and `questions/heldback/*.jsonl`

One question per line:

```json
{"id": "q001", "question": "what did I search 2 days ago?", "now": "2026-11-03T10:00:00-06:00", "tz": "America/Chicago", "expected_intent": {"kind": "search", "time_range": {"start": "2026-11-01T00:00:00-05:00", "end": "2026-11-02T00:00:00-06:00"}, "topic": null, "limit": null, "order": "recent"}, "expected_ids": ["s014", "s015"], "tags": ["dst", "time-only"]}
```

- About 80 questions in total, half dev and half held back. Commit both sets before any parser exists.
- `expected_ids` is the exact set the executor must return for `expected_intent`. Use `[]` for no-match questions.
- `tags` mark the trap subset used by the swap rule: `java-javascript`, `last-n-vs-last-week`, `dst`, plus `no-match`.
- **Held-back questions are never shown to a coding agent** and run only at milestones.
