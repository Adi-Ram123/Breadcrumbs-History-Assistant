import { describe, expect, it } from 'vitest';
import { addLocalDays, localDayDiff, localParts, startOfLocalDay, zonedMs } from '../lib/zoned';

const TZ = 'America/Chicago';
const NOW = Date.parse('2026-11-02T15:30:00Z'); // Mon, Nov 2 2026, 9:30 AM CST

describe('zoned', () => {
  it('startOfLocalDay finds local midnight', () => {
    expect(startOfLocalDay(Date.parse('2026-11-01T15:00:00Z'), TZ)).toBe(Date.parse('2026-11-01T05:00:00Z'));
  });
  it('addLocalDays keeps the 25-hour day', () => {
    expect(addLocalDays(Date.parse('2026-11-01T05:00:00Z'), 1, TZ)).toBe(Date.parse('2026-11-02T06:00:00Z'));
    expect(addLocalDays(Date.parse('2026-11-02T06:00:00Z'), -7, TZ)).toBe(Date.parse('2026-10-26T05:00:00Z'));
  });
  it('zonedMs resolves wall time after the fall-back change', () => {
    expect(zonedMs({ year: 2026, month: 11, day: 1, hour: 6 }, TZ)).toBe(Date.parse('2026-11-01T12:00:00Z'));
  });
  it('zonedMs moves a time in the spring-forward gap forward', () => {
    expect(zonedMs({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, TZ)).toBe(Date.parse('2026-03-08T08:30:00Z'));
  });
  it('zonedMs takes the earlier instant for an ambiguous time', () => {
    expect(zonedMs({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 }, TZ)).toBe(Date.parse('2026-11-01T06:30:00Z'));
  });
  it('localDayDiff counts calendar days', () => {
    expect(localDayDiff(Date.parse('2026-11-01T03:52:00Z'), NOW, TZ)).toBe(2);
    expect(localDayDiff(NOW, NOW, TZ)).toBe(0);
  });
  it('localParts reads the local wall clock', () => {
    expect(localParts(NOW, TZ)).toMatchObject({ year: 2026, month: 11, day: 2, weekday: 1, hour: 9, minute: 30 });
    expect(localParts(Date.parse('2026-11-02T06:00:00Z'), TZ).hour).toBe(0);
  });
});
