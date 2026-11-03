/**
 * Re-ask questions, built from an Intent so they go back through /ask like typed text.
 * They use only time phrases from docs/time-rules.md; a range with no such phrase
 * gets no button.
 */

import type { Intent } from './api/client';
import { type Range, wholeLocalDays } from './timeLabel';
import { addLocalDays, localDayDiff, localParts, startOfLocalDay } from './zoned';

/** Monday 00:00 of the week containing `nowMs` (weeks run Monday to Sunday). */
export function startOfLocalWeek(nowMs: number, tz: string): number {
  const today = startOfLocalDay(nowMs, tz);
  return addLocalDays(today, -((localParts(today, tz).weekday + 6) % 7), tz);
}

/** "today", "yesterday", "N days ago" or "last week" when the range is exactly that; otherwise null. */
export function timePhrase(range: Range | null, nowMs: number, tz: string): string | null {
  if (range === null) return null;
  const days = wholeLocalDays(range, tz);
  if (days === 1) {
    const back = localDayDiff(range.startMs, nowMs, tz);
    if (back === 0) return 'today';
    if (back === 1) return 'yesterday';
    if (back >= 2) return `${back} days ago`;
    return null;
  }
  if (days === 7) {
    const thisWeek = startOfLocalWeek(nowMs, tz);
    if (range.startMs === addLocalDays(thisWeek, -7, tz) && range.endMs === thisWeek) return 'last week';
  }
  return null;
}

/** The question a re-ask button sends. An empty phrase means all history. */
export function reaskQuestion(kind: Intent['kind'], topic: string | null, phrase: string): string {
  const about = topic ? ` about “${topic}”` : '';
  const base =
    kind === 'visit' ? `which pages${about} did I open` : kind === 'search' ? `what did I search${about}` : `what did I look at${about}`;
  return `${base}${phrase ? ` ${phrase}` : ''}?`;
}
