import { describe, expect, it } from 'vitest';
import { dateLabel, rangeLabel, rowTimeLabel, spanLabel, toRange, wholeLocalDays } from '../lib/timeLabel';

const TZ = 'America/Chicago';
const NOW = Date.parse('2026-11-02T15:30:00Z'); // Mon, Nov 2 2026, 9:30 AM CST

const sat = { startMs: Date.parse('2026-10-31T05:00:00Z'), endMs: Date.parse('2026-11-01T05:00:00Z') };
const week = { startMs: Date.parse('2026-10-26T05:00:00Z'), endMs: Date.parse('2026-11-02T06:00:00Z') };
const night = { startMs: Date.parse('2026-10-31T23:00:00Z'), endMs: Date.parse('2026-11-01T10:00:00Z') };

describe('rowTimeLabel', () => {
  it('today is the clock time', () => {
    expect(rowTimeLabel(Date.parse('2026-11-02T14:00:00Z'), NOW, TZ)).toBe('8:00 AM');
  });
  it('yesterday', () => {
    expect(rowTimeLabel(Date.parse('2026-11-02T03:14:00Z'), NOW, TZ)).toBe('Yesterday 9:14 PM');
  });
  it('2 to 6 days back use the weekday', () => {
    expect(rowTimeLabel(Date.parse('2026-11-01T03:52:00Z'), NOW, TZ)).toBe('Sat 10:52 PM');
    expect(rowTimeLabel(Date.parse('2026-10-28T00:05:00Z'), NOW, TZ)).toBe('Tue 7:05 PM');
  });
  it('7 days back uses the full date', () => {
    expect(rowTimeLabel(Date.parse('2026-10-26T23:30:00Z'), NOW, TZ)).toBe('Mon, Oct 26, 6:30 PM');
  });
  it('another year adds the year', () => {
    expect(rowTimeLabel(Date.parse('2025-12-31T18:00:00Z'), NOW, TZ)).toBe('Wed, Dec 31, 2025, 12:00 PM');
  });
});

describe('dates and ranges', () => {
  it('dateLabel', () => {
    expect(dateLabel(Date.parse('2026-08-04T14:12:00Z'), TZ)).toBe('Tue, Aug 4');
  });
  it('rangeLabel', () => {
    expect(rangeLabel(sat, TZ)).toBe('Sat, Oct 31');
    expect(rangeLabel(week, TZ)).toBe('Mon, Oct 26 – Sun, Nov 1');
    expect(rangeLabel(night, TZ)).toBe('Sat, Oct 31, 6 PM – Sun, Nov 1, 4 AM');
    expect(rangeLabel(null, TZ)).toBe('any time');
  });
  it('spanLabel', () => {
    expect(spanLabel(sat, TZ)).toBe('on Sat, Oct 31');
    expect(spanLabel(week, TZ)).toBe('from Mon, Oct 26 – Sun, Nov 1');
  });
  it('wholeLocalDays', () => {
    expect(wholeLocalDays(week, TZ)).toBe(7);
    expect(wholeLocalDays(sat, TZ)).toBe(1);
    expect(wholeLocalDays(night, TZ)).toBe(0);
  });
  it('toRange parses ISO strings with offsets', () => {
    expect(toRange({ start: '2026-10-31T00:00:00-05:00', end: '2026-11-01T00:00:00-05:00' })).toEqual(sat);
    expect(toRange(null)).toBeNull();
    expect(toRange(undefined)).toBeNull();
  });
});
