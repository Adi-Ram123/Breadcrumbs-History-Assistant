import { describe, expect, it } from 'vitest';
import { countedVisitTimes, pickVisitTime } from '../lib/visits';

const v = (visitTime: number, transition = 'link') => ({ visitTime, transition });

describe('pickVisitTime', () => {
  it('returns the latest visit that is not a reload', () => {
    expect(pickVisitTime([v(100), v(300, 'reload'), v(200, 'typed')])).toBe(200);
  });
  it('returns null when there are no counted visits', () => {
    expect(pickVisitTime([v(100, 'reload')])).toBeNull();
    expect(pickVisitTime([])).toBeNull();
  });
});

describe('countedVisitTimes', () => {
  it('drops reloads and visits before the cutoff', () => {
    expect(countedVisitTimes([v(50), v(100), v(150, 'reload'), v(200), { transition: 'link' }], 100)).toEqual([100, 200]);
  });
});
