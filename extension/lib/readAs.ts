/** The "Read as …" caption under each answer, and the diagnostics view of the time range. */

import type { Intent } from './api/client';
import { rangeLabel, toRange, wholeLocalDays } from './timeLabel';
import { localParts } from './zoned';

const KIND_NOUN: Record<Intent['kind'], string> = { search: 'searches', visit: 'pages', any: 'anything' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** { what: 'pages about “ramen”', range: 'Mon, Oct 26 – Sun, Nov 1' }; one whole day reads "all of Sat, Oct 31". */
export function readAsCaption(intent: Intent, tz: string): { what: string; range: string } {
  const noun = KIND_NOUN[intent.kind];
  const what = intent.topic ? `${noun} about “${intent.topic}”` : noun;
  const range = toRange(intent.time_range);
  const label = rangeLabel(range, tz);
  return { what, range: range && wholeLocalDays(range, tz) === 1 ? `all of ${label}` : label };
}

function zoneAbbr(ms: number, tz: string): string {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
    .formatToParts(ms)
    .find((p) => p.type === 'timeZoneName');
  return part?.value ?? tz;
}

function stamp(ms: number, tz: string): string {
  const p = localParts(ms, tz);
  const hh = String(p.hour).padStart(2, '0');
  const mm = String(p.minute).padStart(2, '0');
  return `${MONTHS[p.month - 1]} ${p.day} ${hh}:${mm}`;
}

/** "Oct 31 00:00 → Nov 1 00:00 CDT", or one abbreviation per end when they differ. "—" with no range. */
export function diagTimeRange(intent: Intent, tz: string): string {
  const range = toRange(intent.time_range);
  if (!range) return '—';
  const a = zoneAbbr(range.startMs, tz);
  const b = zoneAbbr(range.endMs, tz);
  if (a === b) return `${stamp(range.startMs, tz)} → ${stamp(range.endMs, tz)} ${b}`;
  return `${stamp(range.startMs, tz)} ${a} → ${stamp(range.endMs, tz)} ${b}`;
}
