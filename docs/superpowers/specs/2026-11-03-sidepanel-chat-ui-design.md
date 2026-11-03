# Side panel chat UI: design

- **Date:** 2026-11-03
- **Owner:** Daniel (extension and backend)
- **Status:** approved in brainstorming, ready for an implementation plan
- **Builds on:** [2026-11-02-repo-scaffold-design.md](2026-11-02-repo-scaffold-design.md)
- **Mockups:** [sidepanel-mockups/](sidepanel-mockups/). Open the `.html` files in Chrome.
  - [states.html](sidepanel-mockups/states.html): no match, waiting, plain answers, diagnostics
  - [thread.html](sidepanel-mockups/thread.html): scrolling, folding, all results
  - [first-open-offline.html](sidepanel-mockups/first-open-offline.html): first open and backend offline, light and dark
  - [dark-mode.html](sidepanel-mockups/dark-mode.html): the states in dark

## Goal

Replace the side panel's health readout with the chat UI. The user types a question about their own browsing history and gets three things:

- a one- or two-sentence answer whose citations link to the history entries it came from
- a line showing how the question was read
- the matching entries

The same panel serves everyday use and the course demo. A diagnostics switch shows the parsed Intent, the answer mode and timings when needed.

**Success looks like this:**

- Every state in the mockups is reachable in the built extension, in light and dark.
- The whole flow works with the keyboard alone and with VoiceOver.
- Rows appear about 50 ms after Send. Only the sentence waits on the LLM.
- No request leaves the machine. That covers fonts, favicons and inference.

## Decisions made in brainstorming

| Topic | Decision |
|---|---|
| Purpose | Demo plus debugging: the Intent is visible but doesn't get in the way |
| Thread | A scrolling thread for the session only |
| Styling | Tailwind CSS v4, with design tokens as CSS variables |
| Layout | Answer first. The "Read as" line and the time trail sit between the answer and the rows |
| Visual style | "Achromatic ledger": the panel frame has no color. The one hue (citation blue) marks only cited entries |
| Font | SF Pro through `-apple-system, BlinkMacSystemFont`, falling back to bundled Inter (`@fontsource-variable/inter`) |
| Status in the top bar | None. Backend status shows only where it matters: the offline card and the dropdown's last-sync time |
| Diagnostics | Behind a "Show diagnostics" switch in the "⋯" dropdown, kept in `browser.storage.local` |
| Favicons | From Chrome's local favicon cache (`favicon` permission). Never from an outside service |
| Dark mode | Follows `prefers-color-scheme` |
| API shape | Split: `POST /ask` (Intent and rows) and `POST /answer` (the LLM sentence) |

## 1. Architecture and API

### Backend (`backend/`, Daniel)

`POST /ask` splits into two plain-JSON endpoints. Both stay typed through OpenAPI, so `backend/openapi.json` and `extension/lib/api/schema.d.ts` are regenerated after the change, as usual.

#### `POST /ask`

Request: `AskRequest`, unchanged: `{question, tz, now?}`.

Steps: parse, then execute, then compute the counts and the template answer. Nothing calls the LLM. This route stays the only place that reads the clock (invariant 1).

```python
class WindowCounts(BaseModel):
    search: int
    visit: int

class AskResponse(BaseModel):
    ask_id: str                                  # opaque, e.g. "a_" + 16 hex chars
    question: str
    intent: Intent
    results: list[Result]                        # unchanged Result shape
    template_answer: Answer | None               # None when mode == "no-match"
    mode: Literal["results", "no-match"]
    window_counts: WindowCounts | None           # only when mode == "no-match"
    history_start: AwareDatetime | None          # oldest stored entry; None for an empty DB
    timings_ms: dict[str, float]                 # {"parse", "execute"}
```

- **`window_counts`** counts the stored entries of each kind inside `intent.time_range`, with no topic filter. With no time range, it counts every stored entry. The panel needs it to say "You opened 214 pages that week" or "No Google searches yesterday. You opened 38 pages".
- **`history_start`** is `MIN(visit_time)` over all entries.

#### `POST /answer`

```python
class AnswerRequest(BaseModel):
    ask_id: str

class AnswerResponse(BaseModel):
    answer: Answer
    mode: Literal["llm", "template"]
    fallback_reason: Literal["llm_off", "rejected_citation", "llm_error"] | None
    timings_ms: dict[str, float]                 # {"write"}
```

- **Inputs:** it reads the question, Intent and results that `/ask` stored, then runs the `AnswerWriter` and the verifier. Invariant 3 is unchanged: only ids returned by `/ask` may be cited.
- **Outcomes:**
  - The LLM answer is valid: `mode = "llm"`.
  - The verifier rejects it: the template answer with `rejected_citation`.
  - The writer raises: the template answer with `llm_error`.
  - `LLM_MODE=off`: the template answer with `llm_off`.
- **Not found:** an unknown or expired `ask_id` gets a 404.
- **Stop:** the panel stops a running answer by aborting its fetch. "Stopped" is shown by the panel and never sent by the server. Cancelling generation on the server when the client disconnects is optional and best effort. The backend may finish the write and throw the result away.

#### The answer cache

- `app/answer_cache.py` holds the entries in process memory, on `app.state`. Nothing is written to SQLite.
- It keeps the 50 most recent asks and expires each entry 10 minutes after `/ask`.
- Expiry uses `time.monotonic()` inside the cache. This doesn't break invariant 1, because no answer depends on it.
- Restarting the backend clears the cache. A later `/answer` then gets a 404, and the panel keeps the template answer.

#### `GET /health`

`GET /health` adds two fields for the first-open screen:

- `entry_count: int`
- `history_start: AwareDatetime | None`

### Extension (`extension/`, Daniel)

| Path | Responsibility |
|---|---|
| `entrypoints/sidepanel/App.tsx` | Loads health and settings, owns the thread reducer, wires the components |
| `entrypoints/sidepanel/styles.css` | Tailwind v4 entry, the `@font-face` import for Inter, and the light and dark token sets |
| `entrypoints/sidepanel/components/*.tsx` | The components in section 2; they only render |
| `lib/thread.ts` | Pure reducer: exchanges, phases, folding, New chat with undo |
| `lib/trail.ts` | Axis choice, tick positions, merging, labels |
| `lib/readAs.ts` | "Read as …" caption from an Intent |
| `lib/timeLabel.ts` | Row and caption time labels relative to `now` in the browser timezone |
| `lib/noMatch.ts` | Picks the no-match kind and its sentence from `AskResponse` |
| `lib/reask.ts` | Re-ask question text from an Intent |
| `lib/favicon.ts` | `faviconUrl(pageUrl)` → `browser.runtime.getURL('/_favicon/')` + `?pageUrl=…&size=32` |
| `lib/api/client.ts` | `getHealth`, `postAsk`, `postAnswer(askId, signal)`; never throw, return a typed result |
| `wxt.config.ts` | Add the `favicon` permission and the Tailwind Vite plugin |

**New dependencies** (Bun): `tailwindcss`, `@tailwindcss/vite`, `@fontsource-variable/inter`.

**Font stack:**

```css
font-family: -apple-system, BlinkMacSystemFont, "Inter Variable", sans-serif;
```

- `system-ui` is deliberately left out: on Windows it would resolve to Segoe UI before reaching Inter.
- Inter is packaged in the extension and loads only when the Apple fonts aren't available.
- The few code-like strings (the start command, diagnostics values) use `ui-monospace, "SF Mono", Menlo, monospace`.
- Every number uses `font-variant-numeric: tabular-nums`.

## 2. Components and states

| Component | Contents |
|---|---|
| `TopBar` | Mark and "Breadcrumbs" (the page's `h1`), New chat (`+`), and "⋯", which opens a dropdown: **Sync history now** (last sync time on the right) and **Show diagnostics** (`role="switch"`, with a one-line description) |
| `Thread` | `<main aria-label="Conversation">` with one `Exchange` per question, the "Latest answer" button, and one hidden `role="status"` line |
| `Exchange` | The question as an `h2` bubble, then its card |
| `AnswerCard` | Answer sentence with citation chips; reason line for plain answers; `ReadAs`; `ResultList`; `DiagnosticsLine` when diagnostics are on |
| `ReadAs` | Caption `Read as <kind/topic>, <range>`, then `Trail` |
| `Trail` | See the trail rules below |
| `ResultList` | Rows, then a "N more results · not cited" disclosure |
| `NoMatchCard` | Sentence, sub-sentence, `ReadAs`, and 1–2 re-ask buttons |
| `OfflineCard` | The error sentence, the start command with a Copy button, and **Try again** |
| `EmptyState` | Heading "Find something you browsed", a sentence with `entry_count` and `history_start`, and 4 example questions as buttons |
| `Composer` | `<form>` with a visually hidden label and a `<textarea>`; Send becomes Stop while an answer is being written |

### Card phases (`lib/thread.ts`)

| Phase | Entered when | Shows |
|---|---|---|
| `asking` | Send | Final layout with flat grey placeholder bars; no shimmer |
| `writing` | `/ask` returned `results` | "Writing an answer" (an elapsed count in seconds appears after 2 s), `ReadAs` with grey ticks, and the rows. Row numbers stay grey until the answer cites them |
| `answered` | `/answer` returned, or Stop, or `/answer` failed | The sentence and, for a plain answer, its reason; cited ticks and badges turn blue |
| `no-match` | `/ask` returned `no-match` | `NoMatchCard` |
| `offline` | `/ask` couldn't connect | `OfflineCard` |
| `rejected` | `/ask` returned 4xx | "Couldn't read that question" and the reason |

When `getHealth()` reports `llm_mode == "off"`, the panel skips `/answer` and goes straight from `writing` to `answered` with the reason `llm_off`.

### Plain-answer reasons

All are 12px grey text, after an info icon:

| Reason | Text |
|---|---|
| `llm_off` | Plain answer: the local model is off. |
| `stopped` | Plain answer: you stopped the local model. |
| `rejected_citation` | Plain answer: the model's reply named a page that isn't in your history, so it was set aside. |
| `llm_error` or `/answer` failed or 404 | Plain answer: the local model didn't respond. |

### No-match kinds (`lib/noMatch.ts`)

`k` is `intent.kind`, `counts = window_counts`, and `other` is the other kind's count.

| Kind | Condition | Sentence / sub-sentence | Re-asks |
|---|---|---|---|
| Before history | the range ends at or before `history_start` | "Your history here starts on Tue, Aug 4." / "The first sync copied the last 90 days from Chrome, so <range> isn't in Breadcrumbs." | One of "today", "yesterday", "last 7 days" that falls after `history_start` |
| Topic | topic set and `counts[k] > 0` | "Nothing about <topic> in <range>'s <kind>." / "You opened N pages that week; none of their titles or text mention <topic>." | "Search all history", "Last 30 days" |
| Wrong kind | `counts[k] == 0` and `other > 0` | "No Google searches <range>." / "You opened N pages on <date>, but didn't search for anything." (and the reverse for visits) | "Show the N pages" / "Show the N searches" |
| Empty window | both counts are 0 | "Nothing in your history for <range>." / "Chrome kept no visits or searches then." | "Last 30 days" |

The range picture shows for every kind except "Before history".

### Re-asks (`lib/reask.ts`)

- **How a re-ask is sent:** each button sends a new question built from the old Intent. It goes through `/ask` like typed text, so the parser stays the only thing that turns words into an Intent.
- **Vocabulary:** questions use only phrases from `docs/time-rules.md` ("last N days", "yesterday", …) and fixed templates, for example "which pages about “ramen” did I open in the last 30 days?".
- **No button without a phrasing:** a button appears only when its question can be phrased that way.

### Trail rules (`lib/trail.ts`)

- **Axis:**
  - A range of one local day or less gets an hour axis: 12 AM, 6 AM, noon, 6 PM, and the end label with its weekday ("Sun 12 AM").
  - 2–7 days get one label per day.
  - Anything longer, or no range, gets no trail, only the caption.
- **Ticks:** cited ticks are 2×12px in the hue. Uncited ticks are 2×8px in `--tick-muted`.
- **Merging:** ticks closer than 6px merge into one 4px-wide mark. Its label lists the ranks: "1, 2" for two, "1–3" for a run of three or more.
- **Labels:**
  - They sit above the track.
  - Near an edge, a label anchors inward so it never overflows.
  - With no results, the track shows "no matches" or "no searches" in grey.
- **Accessibility:** the trail is `role="img"`, with a label that spells out the range and the result times.
- **Time zone:** positions use the panel's time zone. A 23- or 25-hour day keeps its true length, matching `docs/time-rules.md`.

### Rows

- Each row is a full-width link: rank badge, title (one line, ending in "…"), favicon or search glyph, domain, time label, and the open icon.
- **Rank badge:** cited badges are filled (`--hue-bg`, with the number in the hue). Uncited badges are a plain grey number, hidden from screen readers.
- **Search rows** use a grey magnifier and "Google search" in place of the favicon and domain.
- **What shows:** cited rows first, at most 3. With no citations, the top 3 results show. The rest sit behind "N more results · not cited", which reveals them in place, and "Show fewer" folds them again.

## 3. Behavior, accessibility and theming

**Scrolling**
- Sending scrolls the new question to the top of the thread. The jump is instant under `prefers-reduced-motion`, smooth otherwise.
- If the user has scrolled away from the bottom, nothing pulls them down. A "Latest answer" button (a 32px pill with a border and no shadow, sitting above the composer) appears instead and hides at the bottom.

**Folding**
- Only the newest card shows its rows. When the next question is sent, earlier cards fold their rows behind an "N results" button, never while being read.
- Answer sentences never fold. An older card's sentence is limited to 3 lines.
- Only one diagnostics panel is open at a time.

**The thread**
- It lasts for the session only.
- New chat clears it at once and offers Undo for 5 seconds.

**Settings and sync**
- Show diagnostics is stored in `browser.storage.local`.
- History sync runs on panel open, as today. The dropdown shows the last sync time from the `lastSyncedMs` watermark.

**Diagnostics on**
- Each card adds a line, "LLM, verified · 1,160 ms" (or "Plain · …"), that opens a key/value list. It uses the real field names: `kind`, `time_range` (with the zone abbreviation), `topic · order · limit`, `parse · fetch · write`.

**Keyboard**
- Enter sends and Shift+Enter makes a new line.
- Esc stops an answer that's being written. With the dropdown open, Esc closes it and returns focus to "⋯".
- ↑ in an empty composer recalls the last question.
- Tab order follows the visual order.

**Focus**
- A 2px `--hue` outline with 2px offset, on `:focus-visible`.
- The composer draws **no** focus ring and no border change on focus; the caret shows that it's focused.

**Announcements**
- One `role="status"` line, with `aria-live="polite"`, says "Answer ready, N sources.", "No matches.", "Stopped.", "Couldn't reach the backend. Question not asked."
- The thread itself is not a live region.

**Names**
- Citation chips are links named "Source N: <title>".
- Rows add a hidden ", opens in a new tab".
- Icon buttons have `aria-label` and `title`.
- Folding buttons use `aria-expanded`.

**Hit areas**
- At least 24px. Citation chips are 20px with an invisible 2px extension.
- Buttons are 32px and rows at least 48px.

**Opening pages**
- Rows and chips open the page in a new background tab (`browser.tabs.create({url, active: false})`), so the panel keeps its place.

**Width**
- Fluid. The panel follows Chrome's side panel width, using container queries on the panel.
- At ≤ 280px:
  - titles wrap to 2 lines
  - day labels become single letters
  - the 6 AM and 6 PM labels drop
  - "Read as" stacks above its fold button
- At ≤ 220px, the "Breadcrumbs" text is hidden visually but kept for screen readers.
- Nothing ever scrolls sideways, including at 200% browser zoom (180 CSS px).

**Errors**
- `/ask` can't connect: the `offline` card, and the panel checks `/health` every 5 s while offline. Send is disabled, with the note "Sending is paused until the backend is running." The user's text stays.
- `/ask` returns 4xx: the `rejected` card.
- `/answer` fails or returns 404: the template answer with "the local model didn't respond".

### Tokens

Components use only these variables, never raw colors.

| Token | Light | Dark |
|---|---|---|
| `--ground` | #f8f8f8 | #111111 |
| `--surface` | #ffffff | #1a1a1a |
| `--raised` (question bubble, disabled Send) | #eeeeee | #262626 |
| `--border` | #e6e6e6 | #2a2a2a |
| `--rule` (row dividers) | #f0f0f0 | #222222 |
| `--control` (composer, outlined buttons) | #d4d4d4 | #444444 |
| `--text` | #0a0a0a | #f2f2f2 |
| `--muted` | #6b6b6b | #a8a8a8 |
| `--primary` / `--primary-ink` (Stop, switch) | #141414 / #ffffff | #f2f2f2 / #111111 |
| `--hue` / `--hue-bg` (citations, focus) | #1d5fbf / #eaf0fa | #7aa7ec / #1c2a40 |
| `--cite-hover` | #dce6f6 | #24364f |
| `--tick-muted` | #9a9a9a | #6a6a6a |
| `--icon-disabled` | #8a8a8a | #6f6f6f |
| `--negative` (offline icon only) | #c4242a | #e5566f |
| `--pop-shadow` (dropdown only) | 0 8px 24px rgba(0,0,0,.10), 0 2px 6px rgba(0,0,0,.06) | 0 8px 24px rgba(0,0,0,.55), 0 2px 6px rgba(0,0,0,.4) |

**Contrast** is at least 4.5:1 for every text pair in both themes. The lowest measured values are 5.0:1 in light and 5.9:1 in dark.

**Favicons in dark mode** sit on a 16px `#e8e8e8` rounded square. Without it, dark icons on transparent backgrounds would vanish.

**Type**

| Role | Size and weight |
|---|---|
| Answer | 15/22 regular |
| Body, rows, questions | 14/20 |
| Captions and meta | 12/16 |
| Trail axis | 11/14 |
| Empty-state heading | 18/26 semibold |

Weights are 400, 500 and 600 only.

**Shape and spacing**

| Element | Value |
|---|---|
| Card radius | 8 |
| Control radius | 6 |
| Chip radius | 4 |
| Between exchanges | 32px |
| Question to card | 16px |
| Card padding | 16px |
| Row minimum height | 48px |

**Shadows** appear only on the dropdown. Nothing at rest has a shadow.

## 4. Testing

**Backend (pytest, `FakeEmbedder`, TDD)**

`/ask`:
- Returns `ask_id`, Intent, results and `template_answer`, with `mode = "results"`. There is no `answer` key.
- A no-match returns `window_counts`, with topic ignored and kind and range respected, and `history_start`, which is `null` on an empty DB.
- `now` is honored only with `DEBUG_FIXED_NOW`.

`/answer`:
- **Answer outcomes:**
  - A valid citation returns `llm`.
  - A foreign citation returns `template` with `rejected_citation`.
  - A writer that raises returns `template` with `llm_error`.
  - `LLM_MODE=off` returns `llm_off`.
- **Ids:** an unknown `ask_id` returns 404, and so does an expired one (tested with an injected clock on the cache).

Cache:
- Keeps at most 50 entries, evicting the oldest first.

Health and contract:
- `/health` returns `entry_count` and `history_start`.
- `test_ask_api.py` is rewritten for the split. Every check it makes today survives on `/ask` or `/answer`.
- `export_openapi.py` and `bun run gen:api` produce no drift in CI.

**Extension (Vitest, pure functions)**

`thread.ts`:
- each phase and its transitions
- Stop gives the template answer with `stopped`
- only the newest card is unfolded
- New chat followed by Undo restores the thread

`trail.ts`:
- axis choice: 1 day, 2–7 days, more than 7 days, and no range
- merging under 6px, with "1, 2" and "1–3" labels
- labels near an edge anchor inward
- the 25-hour Sun, Nov 1 2026 in America/Chicago

`noMatch.ts`:
- each of the four kinds, plus the boundary where the range ends exactly at `history_start`

`reask.ts`:
- each template
- no button when no phrasing exists

`readAs.ts` and `timeLabel.ts`:
- fixed `now` = Mon, Nov 2 2026, 9:30 AM America/Chicago
- "Yesterday 9:14 PM", "Sat 10:52 PM", "Thu, Oct 29, 8:40 PM"

`client.ts`:
- never throws
- returns `ok | offline | rejected | not_found | aborted`

**Manual check before calling it done**
- Run `bun run build` and load `extension/dist/chrome-mv3`.
- Compare each mockup state in light and dark.
- Go through the whole flow keyboard-only.
- Check VoiceOver announces answers.
- Try the narrowest panel width and 200% zoom.
- Confirm that DevTools' Network panel shows requests only to `localhost:8000` and `chrome-extension://`.

## Out of scope

- Editing the Intent in place, such as clicking a date to change it. Re-asks cover this for now.
- A thread that survives closing the panel.
- Streaming the LLM's text word by word.
- Any change to `ml/`, `backend/app/schemas/intent.py`, `docs/time-rules.md`, `fixtures/` or `eval/`.
  - `LLMAnswerWriter` (Aditya) already fits `/answer` unchanged.
  - The re-ask phrases rely only on the time phrases already listed in `docs/time-rules.md`.

## Impact on the other owner

None to the contracts Aditya implements. The `Parser`, `AnswerWriter` and `LLMClient` ports are unchanged. `eval/run.py` doesn't call `/ask` yet. When it does, it gets the Intent and results from `/ask` alone, and the answer from `/answer` only when it needs one.
