/**
 * The time trail under "Read as": where each result sits inside the asked range.
 *
 * Positions use true elapsed time, so a 25-hour DST day keeps its length. The
 * component measures its own width and passes it in; everything else is here.
 */

import { type Range, clockLabel, rangeLabel, rowTimeLabel, weekdayLabel } from './timeLabel';
import { addLocalDays, localDayDiff, localParts, startOfLocalDay, zonedMs } from './zoned';

export interface TrailInput {
  range: Range | null;
  results: { visitMs: number }[]; // rank = index + 1
  citedRanks: number[];
  kind: 'search' | 'visit' | 'any';
  tz: string;
  nowMs: number;
  widthPx: number;
}
export type Anchor = 'start' | 'middle' | 'end';
export interface AxisLabel {
  x: number;
  text: string;
  short?: string;
  minor?: boolean;
  anchor: Anchor;
}
export interface TrailMark {
  x: number;
  width: 2 | 4;
  cited: boolean;
  ranks: number[];
  label: string | null;
  anchor: Anchor;
}
export interface Trail {
  axis: 'hours' | 'days';
  labels: AxisLabel[];
  marks: TrailMark[];
  empty: string | null;
  ariaLabel: string;
}

const HOUR_MS = 3_600_000;
const MERGE_PX = 6;
const EDGE_PX = 12;
const HOUR_TICKS: { hour: number; text: string; minor?: boolean }[] = [
  { hour: 0, text: '12 AM' },
  { hour: 6, text: '6 AM', minor: true },
  { hour: 12, text: 'noon' },
  { hour: 18, text: '6 PM', minor: true },
];

function anchorFor(x: number, width: number): Anchor {
  if (x < EDGE_PX) return 'start';
  if (x > width - EDGE_PX) return 'end';
  return 'middle';
}

/** "1, 2" or "1, 3, 5"; "1–3" when the ranks are one run of three or more. */
export function rankLabel(ranks: number[]): string {
  const r = [...ranks].sort((a, b) => a - b);
  const isRun = r.length >= 3 && r.every((n, i) => i === 0 || n === r[i - 1]! + 1);
  return isRun ? `${r[0]}–${r.at(-1)}` : r.join(', ');
}

function hourLabels(range: Range, tz: string, xOf: (ms: number) => number, width: number): AxisLabel[] {
  const labels: AxisLabel[] = [];
  for (let day = startOfLocalDay(range.startMs, tz); day < range.endMs; day = addLocalDays(day, 1, tz)) {
    const p = localParts(day, tz);
    for (const tick of HOUR_TICKS) {
      const t = zonedMs({ year: p.year, month: p.month, day: p.day, hour: tick.hour }, tz);
      if (t < range.startMs || t >= range.endMs) continue;
      const x = xOf(t);
      labels.push({ x, text: tick.text, ...(tick.minor ? { minor: true } : {}), anchor: anchorFor(x, width) });
    }
  }
  const end = `${weekdayLabel(range.endMs, tz)} ${clockLabel(range.endMs, tz, { dropZeroMinutes: true })}`;
  labels.push({ x: width, text: end, anchor: 'end' });
  return labels;
}

function dayLabels(range: Range, tz: string, xOf: (ms: number) => number, width: number): AxisLabel[] {
  const labels: AxisLabel[] = [];
  for (let day = startOfLocalDay(range.startMs, tz); day < range.endMs; day = addLocalDays(day, 1, tz)) {
    const from = Math.max(day, range.startMs);
    const to = Math.min(addLocalDays(day, 1, tz), range.endMs);
    const x = (xOf(from) + xOf(to)) / 2;
    const text = weekdayLabel(day, tz);
    labels.push({ x, text, short: text[0], anchor: anchorFor(x, width) });
  }
  return labels;
}

function buildMarks(input: TrailInput, xOf: (ms: number) => number): TrailMark[] {
  const cited = new Set(input.citedRanks);
  const ticks = input.results
    .map((r, i) => ({ x: Math.min(Math.max(xOf(r.visitMs), 0), input.widthPx), rank: i + 1, cited: cited.has(i + 1) }))
    .sort((a, b) => a.x - b.x);
  const marks: TrailMark[] = [];
  for (const group of [ticks.filter((t) => t.cited), ticks.filter((t) => !t.cited)]) {
    let run: typeof ticks = [];
    const flush = () => {
      if (!run.length) return;
      const x = (run[0]!.x + run.at(-1)!.x) / 2;
      const ranks = run.map((t) => t.rank).sort((a, b) => a - b);
      const isCited = run[0]!.cited;
      marks.push({
        x,
        width: run.length > 1 ? 4 : 2,
        cited: isCited,
        ranks,
        label: isCited ? rankLabel(ranks) : null,
        anchor: anchorFor(x, input.widthPx),
      });
      run = [];
    };
    for (const t of group) {
      if (run.length && t.x - run.at(-1)!.x >= MERGE_PX) flush();
      run.push(t);
    }
    flush();
  }
  return marks;
}

export function buildTrail(input: TrailInput): Trail | null {
  const { range, tz, widthPx } = input;
  if (range === null || range.endMs <= range.startMs) return null;
  const span = range.endMs - range.startMs;
  const days = localDayDiff(range.startMs, range.endMs - 1, tz) + 1;
  let axis: Trail['axis'];
  if (span <= 25 * HOUR_MS) axis = 'hours';
  else if (days >= 2 && days <= 7) axis = 'days';
  else return null;

  const xOf = (ms: number) => ((ms - range.startMs) / span) * widthPx;
  const labels = axis === 'hours' ? hourLabels(range, tz, xOf, widthPx) : dayLabels(range, tz, xOf, widthPx);
  const marks = buildMarks(input, xOf);
  const noneText = input.kind === 'search' ? 'no searches' : 'no matches';
  const n = input.results.length;
  const times = input.results.map((r) => rowTimeLabel(r.visitMs, input.nowMs, tz)).join(', ');
  const what = n === 0 ? `${noneText[0]!.toUpperCase()}${noneText.slice(1)}.` : `${n} ${n === 1 ? 'result' : 'results'}: ${times}.`;
  return {
    axis,
    labels,
    marks,
    empty: n === 0 ? noneText : null,
    ariaLabel: `${rangeLabel(range, tz)}. ${what}`,
  };
}
