import { describe, expect, it } from 'vitest';
import type { Result } from '../lib/api/client';
import { rowDomain, rowTitle, splitRows } from '../lib/rows';

const r = (id: string) => ({ id, kind: 'visit', title: id, url: `https://example.com/${id}`, visit_time: '2026-11-01T12:00:00Z' }) as Result;
const ten = Array.from({ length: 10 }, (_, i) => r(`r${i + 1}`));
const ids = (rs: Result[]) => rs.map((x) => x.id);

describe('rowTitle falls back', () => {
  it('search rows use the query', () => {
    expect(rowTitle({ kind: 'search', query: 'dune showtimes', title: '', url: 'https://www.google.com/search?q=dune' } as Result)).toBe('dune showtimes');
  });
  it('an empty title uses host and path', () => {
    expect(rowTitle({ kind: 'visit', title: '', url: 'https://example.com/a' } as Result)).toBe('example.com/a');
    expect(rowTitle({ kind: 'visit', title: '   ', url: 'https://www.example.com/' } as Result)).toBe('example.com');
    expect(rowTitle({ kind: 'visit', title: '', url: 'not a url' } as Result)).toBe('not a url');
  });
});

describe('rowDomain never throws', () => {
  it('strips www and returns bad input unchanged', () => {
    expect(rowDomain('https://www.kayak.com/flights')).toBe('kayak.com');
    expect(rowDomain('not a url')).toBe('not a url');
  });
});

describe('splitRows', () => {
  it('cited rows first, in rank order', () => {
    const { visible, hidden } = splitRows(ten, ['r5', 'r2']);
    expect(ids(visible)).toEqual(['r2', 'r5']);
    expect(ids(hidden)).toEqual(['r1', 'r3', 'r4', 'r6', 'r7', 'r8', 'r9', 'r10']);
  });
  it('no citations shows the top 3', () => {
    const { visible, hidden } = splitRows(ten, []);
    expect(ids(visible)).toEqual(['r1', 'r2', 'r3']);
    expect(hidden).toHaveLength(7);
  });
  it('at most 3 cited rows show', () => {
    const { visible, hidden } = splitRows(ten, ['r9', 'r1', 'r4', 'r7', 'r2']);
    expect(ids(visible)).toEqual(['r1', 'r2', 'r4']);
    expect(ids(hidden)).toEqual(['r3', 'r5', 'r6', 'r7', 'r8', 'r9', 'r10']);
  });
});
