/**
 * Split an answer sentence into text and citation chips.
 *
 * A marker "[n]" names the n-th id in `answer.cited` (1-based). Each chip shows
 * that result's row rank, so chips and rows use the same numbers. Cited ids no
 * marker names are appended as chips; a marker with no citation stays as text.
 */

import type { Answer, Result } from './api/client';

export type Segment = { kind: 'text'; text: string } | { kind: 'cite'; rank: number; result: Result };

export function answerSegments(answer: Answer, results: Result[]): Segment[] {
  const rankOf = new Map(results.map((r, i) => [r.id, i + 1]));
  const cite = (id: string | undefined): Segment | null => {
    const rank = id === undefined ? undefined : rankOf.get(id);
    return rank === undefined ? null : { kind: 'cite', rank, result: results[rank - 1]! };
  };
  const out: Segment[] = [];
  const pushText = (text: string) => {
    if (!text) return;
    const prev = out.at(-1);
    if (prev?.kind === 'text') prev.text += text;
    else out.push({ kind: 'text', text });
  };
  const used = new Set<string>();
  let last = 0;
  for (const m of answer.text.matchAll(/\[(\d+)\]/g)) {
    const id = answer.cited[Number(m[1]) - 1];
    const seg = cite(id);
    pushText(answer.text.slice(last, m.index));
    if (seg && id !== undefined) {
      out.push(seg);
      used.add(id);
    } else {
      pushText(m[0]);
    }
    last = m.index + m[0].length;
  }
  pushText(answer.text.slice(last));
  const extra = answer.cited.filter((id) => !used.has(id)).map(cite).filter((s): s is Segment => s !== null);
  if (extra.length) {
    pushText(' ');
    out.push(...extra);
  }
  return out;
}
