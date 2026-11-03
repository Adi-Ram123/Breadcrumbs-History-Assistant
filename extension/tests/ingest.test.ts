import { describe, expect, it } from 'vitest';
import { formatLocalIso, toIngestEntry } from '../lib/ingest';

const at = new Date('2026-11-03T16:00:00Z');

describe('toIngestEntry', () => {
  it('maps a Google search to a search entry', () => {
    const e = toIngestEntry({ url: 'https://www.google.com/search?q=cheap+flights', title: 'cheap flights - Google Search', visitTime: at, text: 'ignored', source: 'live' });
    expect(e).toMatchObject({ kind: 'search', query: 'cheap flights', text: null, source: 'live' });
  });
  it('maps a page to a visit entry with text', () => {
    const e = toIngestEntry({ url: 'https://example.com/ramen', title: 'Ramen', visitTime: at, text: 'broth', source: 'backfill' });
    expect(e).toMatchObject({ kind: 'visit', url: 'https://example.com/ramen', title: 'Ramen', text: 'broth', visit_time: '2026-11-03T10:00:00-06:00' });
  });
  it('replaces lone surrogates so the backend can store the text', () => {
    const e = toIngestEntry({ url: 'https://example.com/m', title: 'Movie night \ud83d', visitTime: at, text: 'a\udc00b', source: 'live' });
    expect(e?.title).toBe('Movie night \ufffd');
    expect(e?.text).toBe('a\ufffdb');
  });
  it('drops pages that should not be ingested', () => {
    expect(toIngestEntry({ url: 'chrome://newtab', title: '', visitTime: at, source: 'live' })).toBeNull();
  });
});

describe('formatLocalIso', () => {
  it('uses the local offset after DST ends', () => {
    expect(formatLocalIso(new Date('2026-11-03T16:00:00Z'))).toBe('2026-11-03T10:00:00-06:00');
  });
  it('uses the local offset before DST ends', () => {
    expect(formatLocalIso(new Date('2026-10-31T15:00:00Z'))).toBe('2026-10-31T10:00:00-05:00');
  });
});
