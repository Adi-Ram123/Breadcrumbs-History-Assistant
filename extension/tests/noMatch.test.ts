import { describe, expect, it } from 'vitest';
import type { AskResponse, Intent } from '../lib/api/client';
import { describeNoMatch } from '../lib/noMatch';

const TZ = 'America/Chicago';
const NOW = Date.parse('2026-11-02T15:30:00Z');
const YESTERDAY = { start: '2026-11-01T00:00:00-05:00', end: '2026-11-02T00:00:00-06:00' };
const LAST_WEEK = { start: '2026-10-26T00:00:00-05:00', end: '2026-11-02T00:00:00-06:00' };
const JUL1 = { start: '2026-07-01T00:00:00-05:00', end: '2026-07-02T00:00:00-05:00' };
const HS = '2026-08-04T14:12:00Z';

function ask(intent: Partial<Intent>, counts: { search: number; visit: number }, hs: string | null = HS): AskResponse {
  return {
    ask_id: 'a_0', question: 'q', results: [], template_answer: null, mode: 'no-match',
    intent: { kind: 'any', order: 'relevance', limit: null, time_range: null, topic: null, ...intent },
    window_counts: counts, history_start: hs, timings_ms: { parse: 1, execute: 1 },
  };
}

describe('describeNoMatch', () => {
  it('before history', () => {
    expect(describeNoMatch(ask({ kind: 'visit', time_range: JUL1, topic: null }, { search: 0, visit: 0 }), NOW, TZ)).toEqual({
      kind: 'before-history', showTrail: false,
      sentence: 'Your history here starts on Tue, Aug 4.',
      sub: "The first sync copied the last 90 days from Chrome, so Wed, Jul 1 isn't in Breadcrumbs.",
      reasks: [{ label: 'Last 7 days', question: 'which pages did I open in the last 7 days?' }],
    });
  });
  it('before history boundary: end exactly at history_start counts, 1 ms later does not', () => {
    const r = { start: '2026-08-03T00:00:00-05:00', end: '2026-08-04T14:12:00Z' };
    expect(describeNoMatch(ask({ kind: 'visit', time_range: r }, { search: 0, visit: 0 }), NOW, TZ).kind).toBe('before-history');
    const later = { ...r, end: '2026-08-04T14:12:00.001Z' };
    expect(describeNoMatch(ask({ kind: 'visit', time_range: later }, { search: 0, visit: 0 }), NOW, TZ).kind).toBe('empty-window');
  });
  it('before history picks yesterday when last 7 days starts too early', () => {
    const hs = '2026-10-29T12:00:00Z';
    expect(describeNoMatch(ask({ kind: 'visit', time_range: JUL1 }, { search: 0, visit: 0 }, hs), NOW, TZ).reasks)
      .toEqual([{ label: 'Yesterday', question: 'which pages did I open yesterday?' }]);
  });
  it('before history falls back to today', () => {
    const hs = '2026-11-02T14:00:00Z';
    expect(describeNoMatch(ask({ kind: 'search', time_range: JUL1 }, { search: 0, visit: 0 }, hs), NOW, TZ).reasks)
      .toEqual([{ label: 'Today', question: 'what did I search today?' }]);
  });
  it('topic', () => {
    expect(describeNoMatch(ask({ kind: 'visit', time_range: LAST_WEEK, topic: 'ramen' }, { search: 50, visit: 214 }), NOW, TZ)).toEqual({
      kind: 'topic', showTrail: true,
      sentence: "Nothing about “ramen” in last week's pages.",
      sub: 'You opened 214 pages that week; none of their titles or text mention “ramen”.',
      reasks: [
        { label: 'Search all history', question: 'which pages about “ramen” did I open?' },
        { label: 'Last 30 days', question: 'which pages about “ramen” did I open in the last 30 days?' },
      ],
    });
  });
  it('topic over searches on one day', () => {
    const m = describeNoMatch(ask({ kind: 'search', time_range: YESTERDAY, topic: 'dune' }, { search: 12, visit: 40 }), NOW, TZ);
    expect(m.sentence).toBe("Nothing about “dune” in yesterday's searches.");
    expect(m.sub).toBe('You made 12 searches that day; none of them mention “dune”.');
  });
  it('wrong kind: searches', () => {
    expect(describeNoMatch(ask({ kind: 'search', time_range: YESTERDAY }, { search: 0, visit: 38 }), NOW, TZ)).toEqual({
      kind: 'wrong-kind', showTrail: true,
      sentence: 'No Google searches yesterday.',
      sub: "You opened 38 pages on Sun, Nov 1, but didn't search for anything.",
      reasks: [{ label: 'Show the 38 pages', question: 'which pages did I open yesterday?' }],
    });
  });
  it('wrong kind: pages, singular, and no button without a phrase', () => {
    const night = { start: '2026-10-31T18:00:00-05:00', end: '2026-11-01T04:00:00-06:00' };
    const m = describeNoMatch(ask({ kind: 'visit', time_range: night }, { search: 1, visit: 0 }), NOW, TZ);
    expect(m.sentence).toBe('No pages opened from Sat, Oct 31, 6 PM – Sun, Nov 1, 4 AM.');
    expect(m.sub).toBe("You made 1 Google search from Sat, Oct 31, 6 PM – Sun, Nov 1, 4 AM, but didn't open any pages.");
    expect(m.reasks).toEqual([]);
  });
  it('wrong kind: one search gets a singular button', () => {
    const m = describeNoMatch(ask({ kind: 'visit', time_range: YESTERDAY }, { search: 1, visit: 0 }), NOW, TZ);
    expect(m.reasks).toEqual([{ label: 'Show the search', question: 'what did I search yesterday?' }]);
  });
  it('empty window', () => {
    expect(describeNoMatch(ask({ kind: 'search', time_range: YESTERDAY }, { search: 0, visit: 0 }), NOW, TZ)).toEqual({
      kind: 'empty-window', showTrail: true,
      sentence: 'Nothing in your history for yesterday.',
      sub: 'Chrome kept no visits or searches then.',
      reasks: [{ label: 'Last 30 days', question: 'what did I search in the last 30 days?' }],
    });
  });
  it('topic with no time range has no re-asks', () => {
    const m = describeNoMatch(ask({ kind: 'visit', time_range: null, topic: 'ramen' }, { search: 3, visit: 9 }), NOW, TZ);
    expect(m.sentence).toBe('Nothing about “ramen” in your pages.');
    expect(m.sub).toBe('You opened 9 pages; none of their titles or text mention “ramen”.');
    expect(m.reasks).toEqual([]);
  });
});
