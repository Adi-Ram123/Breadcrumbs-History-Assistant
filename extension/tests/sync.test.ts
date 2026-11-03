import { describe, expect, it } from 'vitest';
import type { IngestEntry } from '../lib/ingest';
import { type PostResult, type SyncDeps, syncHistory } from '../lib/sync';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-11-03T16:00:00Z');

function fakeDeps(opts: { watermark?: number | null; post?: (e: IngestEntry[]) => PostResult } = {}) {
  const posted: IngestEntry[][] = [];
  let watermark = opts.watermark ?? null;
  const history: Record<string, { title: string; visits: { visitTime: number; transition: string }[] }> = {
    'https://example.com/ramen': { title: 'Ramen', visits: [{ visitTime: NOW - DAY, transition: 'link' }, { visitTime: NOW - DAY + 1000, transition: 'reload' }] },
    'https://example.com/old': { title: 'Old', visits: [{ visitTime: NOW - 200 * DAY, transition: 'link' }] },
    'chrome://settings': { title: 'Settings', visits: [{ visitTime: NOW - DAY, transition: 'typed' }] },
  };
  const deps: SyncDeps = {
    now: () => NOW,
    searchHistory: async () => Object.entries(history).map(([url, h]) => ({ url, title: h.title })),
    getVisits: async (url) => history[url]?.visits ?? [],
    post: async (entries) => {
      posted.push(entries);
      return opts.post ? opts.post(entries) : 'ok';
    },
    getWatermark: async () => watermark,
    setWatermark: async (ms) => {
      watermark = ms;
    },
  };
  return { deps, posted, getWatermark: () => watermark };
}

describe('syncHistory', () => {
  it('posts counted visits since 90 days ago and advances the watermark', async () => {
    const { deps, posted, getWatermark } = fakeDeps();
    const r = await syncHistory(deps);
    const all = posted.flat();
    expect(all.map((e) => e.url)).toEqual(['https://example.com/ramen']); // reload, too-old and chrome:// dropped
    expect(all[0]?.source).toBe('backfill');
    expect(r).toEqual({ posted: 1, skipped: 0, complete: true });
    expect(getWatermark()).toBe(NOW);
  });

  it('starts from the watermark when one exists', async () => {
    const { deps, posted } = fakeDeps({ watermark: NOW - DAY + 1 });
    await syncHistory(deps);
    expect(posted.flat()).toEqual([]);
  });

  it('keeps the watermark when the backend is unavailable', async () => {
    const { deps, getWatermark } = fakeDeps({ watermark: NOW - 2 * DAY, post: () => 'failed' });
    const r = await syncHistory(deps);
    expect(r.complete).toBe(false);
    expect(getWatermark()).toBe(NOW - 2 * DAY);
  });

  it('skips entries the backend rejects instead of retrying them forever', async () => {
    const { deps, getWatermark } = fakeDeps({ post: () => 'rejected' });
    const r = await syncHistory(deps);
    expect(r).toEqual({ posted: 0, skipped: 1, complete: true });
    expect(getWatermark()).toBe(NOW);
  });
});
