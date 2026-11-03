# Time-phrase rules

**Shared, written by hand (Daniel + Aditya).** Every parser (rules, LLM, trained) must produce exactly these ranges, and the expected Intents in `fixtures/questions/` follow them.

## Decisions (from the proposal)

1. Timestamps are stored in UTC, and calendar phrases are resolved in the user's timezone. "Now" is always passed in rather than read from the clock inside the core, which keeps every test deterministic.
2. Time phrases follow written rules. "2 days ago" is one full local calendar day, "last week" is the previous Monday through Sunday, and every range includes its start and excludes its end.

Consequences:

- Day boundaries are local midnights computed with the timezone, never `now - N * 24h`. A day that crosses a DST change is 23 or 25 hours long.
- A range is `[start, end)`. An entry at exactly local midnight belongs to the day that starts there.

## Rules to write by hand

Define each one as a range relative to `now` in `tz`, with one worked example using now = `2026-11-03T10:00:00-06:00` (America/Chicago).

- today
- yesterday
- N days ago
- last week
- this week
- last N days
- last night
- last month
