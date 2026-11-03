import { postIngest } from '../lib/api/client';
import { toIngestEntry } from '../lib/ingest';
import { type SyncResult, syncHistory } from '../lib/sync';
import { pickVisitTime } from '../lib/visits';

const WATERMARK_KEY = 'lastSyncedMs';

let running: Promise<SyncResult> | null = null;

/** Sync history since the last successful sync. Concurrent calls share one run. */
function runSync(): Promise<SyncResult> {
  running ??= syncHistory({
    now: () => Date.now(),
    searchHistory: (startTime) => browser.history.search({ text: '', startTime, maxResults: 100000 }),
    getVisits: (url) => browser.history.getVisits({ url }),
    post: postIngest,
    getWatermark: async () => ((await browser.storage.local.get(WATERMARK_KEY))[WATERMARK_KEY] as number | undefined) ?? null,
    setWatermark: (ms) => browser.storage.local.set({ [WATERMARK_KEY]: ms }),
  }).finally(() => {
    running = null;
  });
  return running;
}

/** A page the content script just read. Its timestamp comes from Chrome's history, not the clock. */
async function ingestLivePage(page: { url: string; title: string; text: string | null }) {
  const visitTime = pickVisitTime(await browser.history.getVisits({ url: page.url }));
  if (visitTime === null) return 'skipped'; // reload-only or not in history; sync covers the visit
  const entry = toIngestEntry({ ...page, visitTime: new Date(visitTime), source: 'live' });
  return entry ? postIngest([entry]) : 'skipped';
}

export default defineBackground(() => {
  const openPanelOnClick = () => browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  browser.runtime.onInstalled.addListener(() => {
    void openPanelOnClick();
    void runSync();
  });
  browser.runtime.onStartup.addListener(() => {
    void openPanelOnClick();
    void runSync();
  });

  browser.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
    const m = msg as { type?: string; url?: string; title?: string; text?: string | null };
    if (m?.type === 'sync') {
      runSync().then(sendResponse);
      return true;
    }
    if (m?.type === 'page' && typeof m.url === 'string') {
      ingestLivePage({ url: m.url, title: m.title ?? '', text: m.text ?? null }).then((result) => sendResponse({ result }));
      return true;
    }
    return false;
  });
});
