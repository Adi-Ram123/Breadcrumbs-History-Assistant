# extension/ (owner: Daniel)

Chrome MV3 extension built with WXT. It captures history into the backend and hosts the chat UI in the side panel. Read the root `CLAUDE.md` invariants first.

## Stack

Bun, WXT 0.21, React 19, TypeScript 6, Vitest, openapi-typescript, `@mozilla/readability`.

## Layout

| File | Responsibility |
| --- | --- |
| `wxt.config.ts` | Manifest: fixed `key`, permissions `history`, `sidePanel`, `storage`; host permissions `http://localhost:8000/*`, `<all_urls>` |
| `entrypoints/background.ts` | Opens the side panel on icon click; runs history sync on install, startup and panel open; turns content-script pages into live entries using Chrome's visit time |
| `entrypoints/content.ts` | Readability main text of each page, sent to the background (no timestamp; the background takes it from history) |
| `entrypoints/sidepanel/` | Chat UI (currently a backend health panel) |
| `lib/url.ts` | `isIngestible`, `extractGoogleQuery` (pure, tested) |
| `lib/ingest.ts` | `toIngestEntry`, `formatLocalIso`, `wellFormed` (pure, tested) |
| `lib/visits.ts` | `pickVisitTime`, `countedVisitTimes`: Chrome history is the only source of visit times; reloads don't count |
| `lib/sync.ts` | `syncHistory(deps)`: watermark sync with injected Chrome/storage deps (tested without Chrome) |
| `lib/api/schema.d.ts` | **Generated** from `backend/openapi.json` by `bun run gen:api`. Do not edit by hand |
| `lib/api/client.ts` | Typed fetch wrapper; never throws when the backend is offline |
| `scripts/gen-key.sh` | Makes a new manifest key and extension id (only if the key must change) |

## Working rules

- Use WXT's `browser` global (typed Chrome API), not `chrome`.
- Keep logic in `lib/` as pure functions with Vitest tests; entrypoints only wire Chrome events to them.
- The content script must never throw into the page and must not send anything except to the background.
- URL normalization and ids belong to the backend (`backend/app/index/urls.py`); do not duplicate them here.
- No remote code: everything executable ships in the package.
- Manual check after UI or manifest changes: `bun run build`, load `extension/dist/chrome-mv3` unpacked in `chrome://extensions`, and click the icon.
