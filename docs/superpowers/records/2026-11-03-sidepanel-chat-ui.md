# Execution record: side panel chat UI

- **Plan:** `docs/superpowers/plans/2026-11-03-sidepanel-chat-ui.md`
- **Spec:** `docs/superpowers/specs/2026-11-03-sidepanel-chat-ui-design.md`
- **Mockups:** `docs/superpowers/specs/sidepanel-mockups/`
- **Design critique:** `2026-11-03-sidepanel-mockup-critique.md` in this folder. It was made with impeccable before the spec, and the spec answers its P1 and P2 issues.
- **How it ran:** superpowers `executing-plans` on branch `feat/sidepanel-chat-ui`, then one fresh reviewer (Opus) over the whole branch. The reviewer found 0 Critical, 4 Important and 10 Minor issues, and agreed with every ruling.
- **Commits:** `07e9529` (API), `1b1649a` (panel logic), `00a5a7c` (panel UI), `2130f4c` (docs).
- **Source:** the execution ledger (`.superpowers/sdd/2026-11-03-sidepanel-chat-ui/progress.md`, git-ignored scratch).

## What changed in the backend (relevant to `ml/`)

- `/ask` no longer calls the LLM. It parses, executes, caches the rows under an `ask_id` (50 entries, 10 minutes), and returns the rows plus the template answer right away.
- `POST /answer {ask_id}` runs the `AnswerWriter`, then the verifier. It returns `fallback_reason`:

  | Reason | When |
  | --- | --- |
  | `llm_off` | `LLM_MODE=off` |
  | `llm_error` | the writer raised |
  | `rejected_citation` | the verifier dropped the answer |

- `/health` adds `entry_count` and `history_start`.

## Rulings

| Where | Ruling | Cost if wrong |
| --- | --- | --- |
| Task 5 | A 2xx whose body isn't JSON counts as offline | One mapping line |
| Task 6 | The plan's test used `2026-10-31T03:52Z` for "Sat 10:52 PM", but that instant is Fri 10:52 PM CDT. Used `2026-11-01T03:52Z` | None (fixture typo) |
| Task 8 | Added a test: uncited trail ticks have no label and never merge with cited ones | None |
| Task 9 | The possessive ("yesterday's searches") is used only for today, yesterday and last week; other ranges read "in your pages from <dates>" | Copy tweak |
| Task 9 | The before-history sentence always names the dates, never "124 days ago" | None |
| Task 9 | An empty window with no time range says "Nothing in your history." and offers no re-ask | Copy tweak |
| Task 9 | Added tests for the "Today" before-history fallback and the singular "Show the search" button | None |
| Task 10 | `askOk` and `askFailed` apply only while the card is still asking, so a stale `/ask` reply can't overwrite it | None |
| Task 10 | Questions are trimmed; a plain answer announces "Answer ready, 0 sources." | Copy tweak |
| Task 11 | The dark-mode favicon backing became a token, `--fav-bg` | None |
| Task 12 | Mockup CSS ported as component classes in `@layer components`, using tokens only | Restyle effort |
| Task 12 | **Citation marker contract (`lib/answerText.ts`): `[n]` in the answer text means the n-th id in `answer.cited`, and the chip shows that row's rank. Cited ids that no marker references are appended as chips. Needs Aditya's confirmation.** | Chips land at the end of the sentence instead of inline |
| Task 12 | The menu's sync time reads "2 min ago" (`syncAgoLabel`); no-match cards get a diagnostics line ("No match · N ms") | None |
| Task 12 | The writing timer uses `performance.now()`, so no `lib/` or component code reads the wall clock | None |
| Task 12 | "· not cited" shows only when there are citations and none of the hidden rows is cited | Copy tweak |
| Task 13 | `firstOpenSentence` handles a panel opened before `/health` answers | Copy tweak |
| Task 13 | Going offline puts the unsent question back in the composer | None |
| Task 13 | The newest exchange is at least as tall as the thread, so the new question can scroll to the top; the Undo toast takes priority over the "Latest answer" pill | Layout tweak |
| Task 13 | The menu note text comes from the mockup | None |
| Final | New chat during writing settles that card as a plain answer with reason `stopped` | One string |

## Fixed after the final review (each one RED then GREEN, suite 128/128)

- Undo could restore a card stuck asking or writing.
- Undo discarded a question sent after New chat.
- A repeated status message wasn't announced to screen readers.
- A question cleared by New chat could still call `/answer` and take Stop's controller.

## Deferred minors

- IME: also treat keyCode 229 as composing, and don't let Esc inside an IME stop an answer.
- `/health` is read once on open, so on first install "No history is synced yet" stays up after the first sync.
- Try again sends the card's original question, drops an edited draft, and gives no feedback while still offline.
- The Undo toast isn't announced.
- The top bar's menu button uses `aria-haspopup`, but the popup has no menu role.
- Wide trail labels near an edge can spill past it.
- **The `[n]` marker contract is unconfirmed; unmatched markers render literally.**
- **`/answer` runs `verify()` outside the `try`, so a writer returning something that isn't an `Answer` gives a 500 instead of `llm_error`.**
- On an empty DB, the no-match card offers "Last 30 days", which can't help.
- `writing.startedMs` is stored but unused.

## Checked by hand (Daniel, real Chrome)

The unpacked extension loads and runs. With the backend down it shows the offline card. Still unchecked:
- real favicons
- light/dark switching
- VoiceOver
- 200% zoom
- a DevTools network audit
