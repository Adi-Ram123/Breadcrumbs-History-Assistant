import { describe, expect, it } from 'vitest';
import type { Intent } from '../lib/api/client';
import { diagTimeRange, readAsCaption } from '../lib/readAs';

const TZ = 'America/Chicago';
const sat = { start: '2026-10-31T00:00:00-05:00', end: '2026-11-01T00:00:00-05:00' };
const week = { start: '2026-10-26T00:00:00-05:00', end: '2026-11-02T00:00:00-06:00' };

describe('readAsCaption', () => {
  it('searches over one whole day', () => {
    expect(readAsCaption({ kind: 'search', time_range: sat, topic: null, limit: null, order: 'recent' }, TZ))
      .toEqual({ what: 'searches', range: 'all of Sat, Oct 31' });
  });
  it('pages about a topic over a week', () => {
    expect(readAsCaption({ kind: 'visit', time_range: week, topic: 'ramen', limit: null, order: 'relevance' }, TZ))
      .toEqual({ what: 'pages about “ramen”', range: 'Mon, Oct 26 – Sun, Nov 1' });
  });
  it('anything, any time', () => {
    expect(readAsCaption({ kind: 'any', time_range: null, topic: 'movie', limit: 1, order: 'recent' }, TZ))
      .toEqual({ what: 'anything about “movie”', range: 'any time' });
  });
});

describe('diagTimeRange', () => {
  it('one zone abbreviation when both ends share it', () => {
    expect(diagTimeRange({ kind: 'search', time_range: sat } as Intent, TZ)).toBe('Oct 31 00:00 → Nov 1 00:00 CDT');
  });
  it('an abbreviation per end across a DST change', () => {
    expect(diagTimeRange({ kind: 'visit', time_range: week } as Intent, TZ)).toBe('Oct 26 00:00 CDT → Nov 2 00:00 CST');
  });
  it('no range', () => {
    expect(diagTimeRange({ kind: 'any', time_range: null } as Intent, TZ)).toBe('—');
  });
});
