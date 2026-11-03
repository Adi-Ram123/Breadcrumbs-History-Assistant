import { describe, expect, it } from 'vitest';
import { reaskQuestion, timePhrase } from '../lib/reask';
import { toRange } from '../lib/timeLabel';

const TZ = 'America/Chicago';
const NOW = Date.parse('2026-11-02T15:30:00Z');
const YESTERDAY = { start: '2026-11-01T00:00:00-05:00', end: '2026-11-02T00:00:00-06:00' };
const LAST_WEEK = { start: '2026-10-26T00:00:00-05:00', end: '2026-11-02T00:00:00-06:00' };

describe('timePhrase', () => {
  it('recognizes whole-day and last-week ranges', () => {
    expect(timePhrase(toRange({ start: '2026-11-02T00:00:00-06:00', end: '2026-11-03T00:00:00-06:00' }), NOW, TZ)).toBe('today');
    expect(timePhrase(toRange(YESTERDAY), NOW, TZ)).toBe('yesterday');
    expect(timePhrase(toRange(LAST_WEEK), NOW, TZ)).toBe('last week');
    expect(timePhrase({ startMs: Date.parse('2026-10-30T05:00:00Z'), endMs: Date.parse('2026-10-31T05:00:00Z') }, NOW, TZ)).toBe('3 days ago');
  });
  it('has no phrase for other ranges', () => {
    expect(timePhrase({ startMs: Date.parse('2026-10-31T23:00:00Z'), endMs: Date.parse('2026-11-01T10:00:00Z') }, NOW, TZ)).toBeNull();
    expect(timePhrase({ startMs: Date.parse('2026-10-27T05:00:00Z'), endMs: Date.parse('2026-11-02T06:00:00Z') }, NOW, TZ)).toBeNull();
    expect(timePhrase(null, NOW, TZ)).toBeNull();
  });
});

describe('reaskQuestion', () => {
  it('each template', () => {
    expect(reaskQuestion('visit', 'ramen', 'in the last 30 days')).toBe('which pages about “ramen” did I open in the last 30 days?');
    expect(reaskQuestion('visit', 'ramen', '')).toBe('which pages about “ramen” did I open?');
    expect(reaskQuestion('visit', null, 'today')).toBe('which pages did I open today?');
    expect(reaskQuestion('search', null, 'yesterday')).toBe('what did I search yesterday?');
    expect(reaskQuestion('search', 'dune', 'last week')).toBe('what did I search about “dune” last week?');
    expect(reaskQuestion('any', null, 'today')).toBe('what did I look at today?');
    expect(reaskQuestion('any', 'denver', 'in the last 7 days')).toBe('what did I look at about “denver” in the last 7 days?');
  });
});
