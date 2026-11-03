# Handoff: from search to reasoning

- **For:** Aditya
- **From:** Daniel
- **Date:** 2026-11-03
- **State:** branch `feat/sidepanel-chat-ui`. The backend and side panel work end to end; every model slot still runs on a stub.

Today Breadcrumbs answers a question by vector search with no understanding of it. The whole question is embedded and compared against titles. This doc covers what exists, what real history shows, and where reasoning could plug in. The design decisions are yours: section 4 lists options, not choices.

## 1. Set up Claude Code first

This repo pins the tools the existing specs, plans and records were made with, so your sessions work the same way.

| Tool | Version | How you get it |
| --- | --- | --- |
| superpowers | 6.4.2 (`obra/superpowers@8ca22db`) | Plugin from this repo's marketplace (`.claude-plugin/marketplace.json`) |
| impeccable | 4.8.0 | Project skill in `.claude/skills/impeccable/`. It loads when you open the repo, with no install step |

Steps:
1. Open the repo in Claude Code and accept the workspace trust prompt. The project settings, including the marketplace, are ignored until you do.
2. Install superpowers:
   ```
   claude plugin install superpowers@breadcrumbs --scope project
   ```
   Claude Code may also tell you `superpowers` is enabled in project settings but isn't installed. This is the command for that.
3. **If you already have superpowers installed globally**, you'll have two copies. Turn yours off for this repo in `.claude/settings.local.json`:
   ```json
   { "enabledPlugins": { "superpowers@<your marketplace>": false } }
   ```
   `claude plugin list` shows what's installed. Do the same in reverse if you'd rather keep yours.
4. impeccable's first run downloads its engine into `~/.impeccable/bin/` and checks it against `scripts/engine-checksums.txt`. You'll mostly need it if you touch the side panel.

How the existing work was made:
- **Architectural work:** `superpowers:brainstorming` → written spec → `superpowers:writing-plans` → `superpowers:executing-plans`, then one fresh code reviewer over the whole branch.
- **UI work:** impeccable critiqued the mockups before the spec.

For your parsers and writer, the same flow applies: start with brainstorming.

## 2. Read these

| File | Why |
| --- | --- |
| `CLAUDE.md` (root) | Question flow, ownership, the 9 invariants |
| `ml/CLAUDE.md` | Your scope, the ports you implement, and the open Q&A items 1–9 |
| `docs/superpowers/specs/2026-11-02-repo-scaffold-design.md` | Why the system is shaped this way |
| `docs/superpowers/specs/2026-11-03-sidepanel-chat-ui-design.md` | What the panel shows for each response, and why |
| `docs/superpowers/records/2026-11-02-repo-scaffold.md` | Every call made while building the scaffold, plus known issues |
| `docs/superpowers/records/2026-11-03-sidepanel-chat-ui.md` | The same for the chat UI and the `/ask` + `/answer` split |
| `docs/time-rules.md` | The exact meaning of every time phrase (shared contract) |
| `backend/app/ports.py`, `backend/app/schemas/intent.py` | The seams your code plugs into |

## 3. What happens to a question today

```
side panel ── POST /ask {question, tz} ───────────────────────────────────────────────┐
  Parser.parse(question, now, tz) → Intent       StubParser: kind=any, time_range=None,
                                                  topic=<the whole question>, limit=10
  executor.execute(Intent)                        1. SQL: filter kind + [start, end)
                                                  2. embed topic, best chunk cosine per entry,
                                                     drop < 0.3 (MIN_TOPIC_SCORE)
                                                  3. sort by score or recency, cut to limit
  rows + template answer, cached under ask_id     "Found 10 matching entries."
side panel shows the rows ◄────────────────────────────────────────────────────────────┘
side panel ── POST /answer {ask_id} ── AnswerWriter.write(question, intent, rows)
                                        → verifier: every cited id must be a returned row
                                        → answer, or the template plus fallback_reason
```

**How history gets in.**
- **Backfill:** `extension/lib/sync.ts` sends every Chrome history visit since the last sync. That's URL, title and time only.
- **Page text:** `extension/entrypoints/content.ts` sends a page's Readability text when you load it with the extension running.
- **Searches:** a `google.*/search?q=` visit becomes a `search` entry with `query`. Other search engines are stored as plain visits.

**How it's stored.** SQLite at `data/breadcrumbs.db`, with sqlite-vec for vectors:

| Table | Holds |
| --- | --- |
| `entries` | One row per visit or search |
| `pages` | One row per distinct page, with its text |
| `chunks` + `vec_chunks` | 384-d MiniLM vectors of `title \| url`, then 1000-character text slices overlapping by 200 |
| `meta` | Which embedder made the vectors |

## 4. What Daniel's real history shows (2026-11-03)

- **What's stored:**
  - 43,392 visits and 4,499 searches since 2026-08-05.
  - 14,749 distinct pages, of which **only 12 have page text**. Everything else matches on title and URL.
- **"what did I search up about chicago":**
  - 4× the search `what to do in chicago` (0.70), then 6× the same `Chicago Trip?` Google My Maps page.
  - 9 Chicago searches exist, but the stub doesn't know "search" means `kind=search`, and repeat visits fill the 10 slots.
- **"what did I search about on font choices":** 7× `Browse Fonts - Google Fonts`, the search `google fonts`, and 2× Adobe Fonts. 12 font searches exist.
- **"What did I search 2 days ago?":** 10 LinkedIn pages. "2 days ago" was treated as a topic, so no time filter ran.
- **Latency:** about 1.4 s warm (5.4 s cold) per question. With no time filter, every question scores all 47,891 entries.

## 5. Where reasoning can plug in

Ownership (from root `CLAUDE.md`):
- **Yours:** the parsers, the answer writer, the LLM client and the retriever.
- **Daniel's:** the executor, the verifier, the routes and the DB.
- **Shared, needs both of you:** `Intent`, `docs/time-rules.md`, `fixtures/`, `eval/`.

The options, roughly cheapest first:

### A. Understand the question (Parser → Intent)

This was already planned: `rules`, `llm` and `tagger` parsers.
- **Fixes most of section 4:** "search" becomes `kind=search`, "2 days ago" becomes a `time_range`, and the topic shrinks to "chicago" or "font choices".
- **No contract change.**
- **First step:** the rules parser, as the baseline and the offline default.

### B. Ask questions the Intent can't express

Today's `Intent` is kind + time + topic + limit + order. Some example questions need more:

| Question | Needs |
| --- | --- |
| "last movie I watched" | A category: what counts as a movie page? |
| "what did I look at after searching X" | Order relative to another entry |
| "how many times did I open Y" | Counting |
| "which sites did I use for fonts" | Grouping by page or site, not individual visits |

Each of these is an `Intent` and executor change, so it's shared: agree it with Daniel before building.

### C. Judge the candidates (new step between the executor and the writer)

- **What it does:** an LLM reads the top N rows (titles, plus text where there is any) and keeps or reorders the ones that actually answer the question.
- **Why it's safe:** it can only choose from executor rows, so invariant 3 still holds.
- **What it changes:** it's a new port and a new place in `/ask` or `/answer`, so agree it with Daniel. It also costs latency, and the panel shows rows before the LLM answer, so decide whether judging happens before the rows appear.

### D. Several queries per question (an LLM that plans executor calls)

- **What it's for:** "the movie I watched the night I searched for tickets" needs one query whose result feeds a second.
- **Why it's the biggest change:**
  - `/ask` returns one Intent today.
  - The panel's "Read as" line and time trail show exactly one Intent and one range.
  - The answer cache is keyed by one ask.
- Worth a brainstorm of its own if A–C aren't enough.

### E. Reason in the answer (AnswerWriter)

- **What it does:** writes a sentence that draws a conclusion from the rows, not just "Found 10".
- **Limits:**
  - It's capped by what's in the rows, and with page text for 12 pages that's mostly titles.
  - It must cite only returned ids. The verifier also rejects an answer with zero citations.

### Constraints on every option (root `CLAUDE.md`)

- Everything runs locally; there are no hosted APIs.
- Parsers get `now` and `tz` passed in and never read the clock.
- Only executor-returned ids may be cited.
- Tests never download models.
- The trained parser must stay under 200 ms on a laptop CPU (the swap rule).
- Model choice uses the dev set only, never `fixtures/questions/heldback/`.

## 6. Contracts the side panel already relies on

Changing any of these means a panel change, so tell Daniel.

- **The `/ask` response**:
  - `ask_id`, `question`, `intent`, `results` (rank = position)
  - `template_answer`
  - `mode`: `results` or `no-match`
  - `window_counts` (no-match only), `history_start`, `timings_ms`
- **The Intent fields the panel reads:**
  - `intent.kind` drives the copy ("searches" vs "pages").
  - `intent.time_range` drives the time trail and the no-match re-asks.
  - All of `intent` is shown as the "Read as" line.
- **`/answer`** returns `answer`, `mode` and `fallback_reason` (`llm_off`, `llm_error` or `rejected_citation`).
- **Citation markers. This one is unconfirmed and needs your answer:**
  - `[n]` in `answer.text` means the n-th id in `answer.cited`.
  - The panel draws a chip there showing that row's rank.
  - Cited ids with no marker get chips at the end of the sentence.
  - A marker with no matching citation shows as literal text.
  - See `extension/lib/answerText.ts`.

## 7. Known issues in Daniel's area that affect model quality

From the two records.
- **Repeat visits fill the results.** Each visit is its own row. Grouping them is an executor change, agreed with whoever writes the expected answers.
- **Page text exists for only 12 pages**, so the retriever mostly sees `title | url`. That matters for Q&A item 3.
- An ingest with empty text (`text=""`) overwrites good page text in `store.py`.
- Embedding runs inside the write transaction, with no WAL or `busy_timeout`, so a long embed can fail a concurrent ingest.
- A new embedder `version` re-embeds every chunk in one `embed()` call at startup. With your retriever on 16k chunks that's a long, memory-heavy start.
- `/answer` calls `verify()` outside its `try`, so a writer returning something that isn't an `Answer` gives a 500 instead of `llm_error`.
- `Intent` fields default to `None` and `order` defaults to `relevance` (a scaffold ruling). Remove the defaults when you finalize the Intent, so a parser that forgets a field fails loudly.

## 8. Questions this raises, beyond Q&A items 1–9

1. Which of A–E is in scope for the course deliverable, and in what order?
2. Do the dev questions need anything from B (a category, ordering, counting, grouping)? If so, the `Intent` change comes before the trained parser.
3. Should results be grouped by page or query by default? This decides with you whether "what did I search about chicago" returns distinct searches.
4. Is the `[n]` citation marker format right for your writer?
5. Do you need page text for more than 12 pages? If so, that's a backfill change on Daniel's side, since Chrome's history has no page content.
