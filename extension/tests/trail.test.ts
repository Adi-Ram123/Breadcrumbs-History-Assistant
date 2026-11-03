import { describe, expect, it } from 'vitest';
import { buildTrail, rankLabel } from '../lib/trail';

const TZ = 'America/Chicago';
const NOW = Date.parse('2026-11-02T15:30:00Z');
const SAT = { startMs: Date.parse('2026-10-31T05:00:00Z'), endMs: Date.parse('2026-11-01T05:00:00Z') };
const SUN = { startMs: Date.parse('2026-11-01T05:00:00Z'), endMs: Date.parse('2026-11-02T06:00:00Z') };
const WEEK = { startMs: Date.parse('2026-10-26T05:00:00Z'), endMs: Date.parse('2026-11-02T06:00:00Z') };
const base = { kind: 'visit', tz: TZ, nowMs: NOW, widthPx: 250, citedRanks: [] as number[] } as const;
const at = (iso: string) => ({ visitMs: Date.parse(iso) });

describe('buildTrail', () => {
  it('one local day gets an hour axis', () => {
    const t = buildTrail({ ...base, range: SAT, results: [] })!;
    expect(t.axis).toBe('hours');
    expect(t.labels.map((l) => l.text)).toEqual(['12 AM', '6 AM', 'noon', '6 PM', 'Sun 12 AM']);
    expect(t.labels.filter((l) => l.minor).map((l) => l.text)).toEqual(['6 AM', '6 PM']);
    expect(t.labels[0]!.anchor).toBe('start');
    expect(t.labels.at(-1)!.anchor).toBe('end');
    expect(t.empty).toBe('no matches');
  });
  it('the 25-hour Sun Nov 1 keeps true length', () => {
    const t = buildTrail({ ...base, range: SUN, results: [] })!;
    expect(t.labels.find((l) => l.text === '6 AM')!.x).toBeCloseTo((7 / 25) * 250, 5);
    expect(t.labels.at(-1)!.text).toBe('Mon 12 AM');
  });
  it('2-7 days get day labels', () => {
    const t = buildTrail({ ...base, range: WEEK, results: [] })!;
    expect(t.axis).toBe('days');
    expect(t.labels.map((l) => l.text)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(t.labels.map((l) => l.short)).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
  });
  it('more than 7 days or no range has no trail', () => {
    expect(buildTrail({ ...base, range: { startMs: WEEK.startMs, endMs: WEEK.endMs + 86_400_000 }, results: [] })).toBeNull();
    expect(buildTrail({ ...base, range: null, results: [] })).toBeNull();
  });
  it('ticks under 6px merge with rank labels', () => {
    const two = buildTrail({ ...base, range: SAT, citedRanks: [1, 2], results: [at('2026-11-01T03:47:00Z'), at('2026-11-01T03:52:00Z')] })!;
    expect(two.marks).toHaveLength(1);
    expect(two.marks[0]).toMatchObject({ width: 4, cited: true, label: '1, 2', ranks: [1, 2] });
    const three = buildTrail({
      ...base, range: SAT, citedRanks: [1, 2, 3],
      results: ['03:49', '03:55', '03:58'].map((m) => at(`2026-11-01T${m}:00Z`)),
    })!;
    expect(three.marks).toHaveLength(1);
    expect(three.marks[0]!.label).toBe('1–3');
    const apart = buildTrail({ ...base, range: SAT, citedRanks: [1, 2], results: [at('2026-11-01T02:00:00Z'), at('2026-11-01T02:40:00Z')] })!;
    expect(apart.marks).toHaveLength(2); // 40 min = 6.9px
    expect(apart.marks.every((m) => m.width === 2)).toBe(true);
  });
  it('uncited ticks have no label and do not merge with cited ones', () => {
    const t = buildTrail({ ...base, range: SAT, citedRanks: [1], results: [at('2026-11-01T03:47:00Z'), at('2026-11-01T03:48:00Z')] })!;
    expect(t.marks).toHaveLength(2);
    expect(t.marks.find((m) => !m.cited)!.label).toBeNull();
  });
  it('labels near an edge anchor inward', () => {
    const t = buildTrail({ ...base, range: SAT, citedRanks: [1, 2], results: [at('2026-11-01T04:59:00Z'), at('2026-10-31T05:05:00Z')] })!;
    expect(t.marks.map((m) => m.anchor).sort()).toEqual(['end', 'start']);
  });
  it('search kind with no results says no searches', () => {
    expect(buildTrail({ ...base, kind: 'search', range: SAT, results: [] })!.empty).toBe('no searches');
  });
  it('aria label spells out range and result times', () => {
    const t = buildTrail({ ...base, range: SAT, citedRanks: [1], results: [at('2026-11-01T03:52:00Z')] })!;
    expect(t.ariaLabel).toContain('Sat, Oct 31');
    expect(t.ariaLabel).toContain('Sat 10:52 PM');
  });
});

describe('rankLabel', () => {
  it('lists or runs', () => {
    expect(rankLabel([1, 2])).toBe('1, 2');
    expect(rankLabel([1, 3])).toBe('1, 3');
    expect(rankLabel([1, 3, 5])).toBe('1, 3, 5');
    expect(rankLabel([2, 3, 4])).toBe('2–4');
    expect(rankLabel([3, 1, 2])).toBe('1–3');
  });
});
