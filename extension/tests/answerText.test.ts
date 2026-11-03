import { describe, expect, it } from 'vitest';
import type { Result } from '../lib/api/client';
import { answerSegments } from '../lib/answerText';

const r = (id: string) => ({ id, kind: 'visit', title: id, url: `https://e.com/${id}`, visit_time: '2026-11-01T12:00:00Z' }) as Result;
const results = [r('e1'), r('e2'), r('e3')];

describe('answerSegments', () => {
  it('turns [n] markers into chips numbered by row', () => {
    const segs = answerSegments({ text: 'Kayak [1] and Google Flights [2].', cited: ['e3', 'e1'] }, results);
    expect(segs).toEqual([
      { kind: 'text', text: 'Kayak ' },
      { kind: 'cite', rank: 3, result: results[2] },
      { kind: 'text', text: ' and Google Flights ' },
      { kind: 'cite', rank: 1, result: results[0] },
      { kind: 'text', text: '.' },
    ]);
  });
  it('appends cited ids that no marker names', () => {
    expect(answerSegments({ text: 'You read it.', cited: ['e2'] }, results)).toEqual([
      { kind: 'text', text: 'You read it. ' },
      { kind: 'cite', rank: 2, result: results[1] },
    ]);
  });
  it('keeps a marker with no matching citation as text', () => {
    expect(answerSegments({ text: 'See [4].', cited: [] }, results)).toEqual([{ kind: 'text', text: 'See [4].' }]);
  });
  it('a template answer is plain text', () => {
    expect(answerSegments({ text: 'Found 3 matching entries.', cited: [] }, results)).toEqual([{ kind: 'text', text: 'Found 3 matching entries.' }]);
  });
});
