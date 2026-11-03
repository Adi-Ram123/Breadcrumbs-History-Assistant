# extension/ (owner: Daniel)

Chrome MV3 extension built with WXT. It captures history into the backend and hosts the chat UI in the side panel. Read the root `CLAUDE.md` invariants first.

## Stack

Bun, WXT 0.21, React 19, TypeScript 6, Tailwind CSS v4 (`@tailwindcss/vite`), `@fontsource-variable/inter` (bundled fallback font), Vitest, openapi-typescript, `@mozilla/readability`.

## Layout

| File | Responsibility |
| --- | --- |
| `wxt.config.ts` | Manifest: fixed `key`, permissions `history`, `sidePanel`, `storage`, `favicon`; host permissions `http://localhost:8000/*`, `<all_urls>`; Tailwind Vite plugin |
| `entrypoints/background.ts` | Opens the side panel on icon click; runs history sync on install, startup and panel open; turns content-script pages into live entries using Chrome's visit time |
| `entrypoints/content.ts` | Readability main text of each page, sent to the background (no timestamp; the background takes it from history) |
| `entrypoints/sidepanel/` | Chat UI (design: `docs/superpowers/specs/2026-11-03-sidepanel-chat-ui-design.md`). `App.tsx` wires the reducer and API and is the only wall-clock reader; `components/` only render; `styles.css` holds the light/dark tokens and component styles ported from the mockups |
| `lib/url.ts` | `isIngestible`, `extractGoogleQuery` (pure, tested) |
| `lib/ingest.ts` | `toIngestEntry`, `formatLocalIso`, `wellFormed` (pure, tested) |
| `lib/visits.ts` | `pickVisitTime`, `countedVisitTimes`: Chrome history is the only source of visit times; reloads don't count |
| `lib/sync.ts` | `syncHistory(deps)`: watermark sync with injected Chrome/storage deps (tested without Chrome) |
| `lib/api/schema.d.ts` | **Generated** from `backend/openapi.json` by `bun run gen:api`. Do not edit by hand |
| `lib/api/client.ts` | Typed fetch wrapper: `getHealth`, `postIngest`, `postAsk`, `postAnswer` → `ok \| offline \| rejected \| not_found \| aborted`; never throws |
| `lib/zoned.ts`, `lib/timeLabel.ts` | Local calendar math in a named zone (DST-true days) and row/range/date labels |
| `lib/readAs.ts`, `lib/copy.ts`, `lib/rows.ts`, `lib/answerText.ts` | "Read as" caption and diagnostics range, fixed panel copy, row title/domain/visibility, citation chips inside answer text |
| `lib/trail.ts` | Time trail layout: axis, tick merging, label anchoring |
| `lib/noMatch.ts`, `lib/reask.ts` | The four no-match kinds and re-ask questions (time-rules phrases only) |
| `lib/thread.ts`, `lib/composerKeys.ts` | Thread reducer (phases, folding, New chat + Undo, late replies ignored) and composer keys (IME-safe Enter) |
| `lib/favicon.ts` | Favicon URL from Chrome's local `_favicon` cache |
| `scripts/gen-key.sh` | Makes a new manifest key and extension id (only if the key must change) |

## Working rules

- Use WXT's `browser` global (typed Chrome API), not `chrome`.
- Keep logic in `lib/` as pure functions with Vitest tests; entrypoints only wire Chrome events to them.
- The content script must never throw into the page and must not send anything except to the background.
- URL normalization and ids belong to the backend (`backend/app/index/urls.py`); do not duplicate them here.
- No remote code: everything executable ships in the package.
- Manual check after UI or manifest changes: `bun run build`, load `extension/dist/chrome-mv3` unpacked in `chrome://extensions`, and click the icon.
