import type { PostResult } from './api/client';
import { type IngestEntry, toIngestEntry } from './ingest';
import { countedVisitTimes, type VisitLike } from './visits';

export type { PostResult };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Chrome and storage access, injected so the sync logic is unit tested without Chrome. */
export interface SyncDeps {
  now(): number;
  searchHistory(startTime: number): Promise<{ url?: string; title?: string }[]>;
  getVisits(url: string): Promise<VisitLike[]>;
  post(entries: IngestEntry[]): Promise<PostResult>;
  getWatermark(): Promise<number | null>;
  setWatermark(ms: number): Promise<void>;
}

export interface SyncResult {
  posted: number;
  skipped: number;
  complete: boolean;
}

/**
 * Send every counted visit since the last successful sync (or the last `initialDays`)
 * to the backend. The watermark only moves once every batch has been accepted or
 * rejected, so history browsed while the backend was down is picked up next time.
 * Re-sending a visit is harmless: ingest is idempotent on (kind, url, visit time).
 */
export async function syncHistory(deps: SyncDeps, { initialDays = 90, batchSize = 500 } = {}): Promise<SyncResult> {
  const runStart = deps.now();
  const since = (await deps.getWatermark()) ?? runStart - initialDays * DAY_MS;

  const entries: IngestEntry[] = [];
  for (const item of await deps.searchHistory(since)) {
    if (!item.url) continue;
    for (const t of countedVisitTimes(await deps.getVisits(item.url), since)) {
      const entry = toIngestEntry({ url: item.url, title: item.title ?? '', visitTime: new Date(t), source: 'backfill' });
      if (entry) entries.push(entry);
    }
  }

  let posted = 0;
  let skipped = 0;
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    const result = await deps.post(batch);
    if (result === 'failed') return { posted, skipped, complete: false };
    if (result === 'ok') {
      posted += batch.length;
      continue;
    }
    // Rejected (4xx): one bad entry fails the whole batch, so retry entries one by one.
    for (const entry of batch) {
      const single = await deps.post([entry]);
      if (single === 'failed') return { posted, skipped, complete: false };
      if (single === 'ok') posted += 1;
      else skipped += 1;
    }
  }
  await deps.setWatermark(runStart);
  return { posted, skipped, complete: true };
}
