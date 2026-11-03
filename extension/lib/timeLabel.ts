/**
 * Row and caption time labels, relative to a passed-in `now` in the panel's time zone.
 * Labels are built from local parts rather than Intl output, so they never contain
 * the narrow no-break spaces some ICU versions put before AM/PM.
 */

import { addLocalDays, localDayDiff, localParts, startOfLocalDay } from './zoned';

export interface Range {
  startMs: number;
  endMs: number;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function weekdayLabel(ms: number, tz: string): string {
  return WEEKDAYS[localParts(ms, tz).weekday]!;
}

/** "9:14 PM", or "6 PM" with dropZeroMinutes on the hour. */
export function clockLabel(ms: number, tz: string, opts: { dropZeroMinutes?: boolean } = {}): string {
  const { hour, minute } = localParts(ms, tz);
  const h12 = hour % 12 || 12;
  const ampm = hour < 12 ? 'AM' : 'PM';
  if (minute === 0 && opts.dropZeroMinutes) return `${h12} ${ampm}`;
  return `${h12}:${String(minute).padStart(2, '0')} ${ampm}`;
}

/** "Sat, Oct 31" */
export function dateLabel(ms: number, tz: string): string {
  const p = localParts(ms, tz);
  return `${WEEKDAYS[p.weekday]}, ${MONTHS[p.month - 1]} ${p.day}`;
}

/** "8:00 AM", "Yesterday 9:14 PM", "Sat 10:52 PM" (2-6 days back), "Mon, Oct 26, 6:30 PM". */
export function rowTimeLabel(ms: number, nowMs: number, tz: string): string {
  const clock = clockLabel(ms, tz);
  const back = localDayDiff(ms, nowMs, tz);
  if (back === 0) return clock;
  if (back === 1) return `Yesterday ${clock}`;
  if (back >= 2 && back <= 6) return `${weekdayLabel(ms, tz)} ${clock}`;
  const year = localParts(ms, tz).year;
  const yearPart = year === localParts(nowMs, tz).year ? '' : `, ${year}`;
  return `${dateLabel(ms, tz)}${yearPart}, ${clock}`;
}

/** Whole local days the range covers, or 0 if either end is not a local midnight. */
export function wholeLocalDays(range: Range, tz: string): number {
  if (startOfLocalDay(range.startMs, tz) !== range.startMs) return 0;
  if (startOfLocalDay(range.endMs, tz) !== range.endMs) return 0;
  return localDayDiff(range.startMs, range.endMs, tz);
}

/** "Sat, Oct 31", "Mon, Oct 26 – Sun, Nov 1", "Sat, Oct 31, 6 PM – Sun, Nov 1, 4 AM", "any time". */
export function rangeLabel(range: Range | null, tz: string): string {
  if (range === null) return 'any time';
  const days = wholeLocalDays(range, tz);
  if (days === 1) return dateLabel(range.startMs, tz);
  if (days > 1) return `${dateLabel(range.startMs, tz)} – ${dateLabel(addLocalDays(range.endMs, -1, tz), tz)}`;
  const end = (ms: number) => `${dateLabel(ms, tz)}, ${clockLabel(ms, tz, { dropZeroMinutes: true })}`;
  return `${end(range.startMs)} – ${end(range.endMs)}`;
}

/** "on Sun, Nov 1" for one whole day, otherwise "from <rangeLabel>". Empty for no range. */
export function spanLabel(range: Range | null, tz: string): string {
  if (range === null) return '';
  return wholeLocalDays(range, tz) === 1 ? `on ${dateLabel(range.startMs, tz)}` : `from ${rangeLabel(range, tz)}`;
}

export function toRange(tr: { start: string; end: string } | null | undefined): Range | null {
  return tr ? { startMs: Date.parse(tr.start), endMs: Date.parse(tr.end) } : null;
}
