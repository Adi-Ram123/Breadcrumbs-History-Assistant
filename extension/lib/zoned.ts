/**
 * Local calendar math in a named IANA time zone, on epoch milliseconds.
 *
 * Day boundaries are local midnights, so a day that crosses a DST change is
 * 23 or 25 hours long (docs/time-rules.md). Nothing here reads the clock.
 */

export interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
  weekday: number; // 0 = Sunday
}

const DAY_MS = 86_400_000;
const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      weekday: 'short',
    });
    formatters.set(tz, f);
  }
  return f;
}

export function localParts(ms: number, tz: string): LocalParts {
  const p: Record<string, string> = {};
  for (const { type, value } of formatter(tz).formatToParts(ms)) p[type] = value;
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    weekday: WEEKDAY_INDEX[p.weekday ?? ''] ?? 0,
  };
}

/** The zone's UTC offset at `ms`, in ms (local wall time minus UTC). */
function offsetMs(ms: number, tz: string): number {
  const p = localParts(ms, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(ms / 60_000) * 60_000;
}

/**
 * Epoch ms of a local wall time. A time skipped by a spring-forward change moves
 * forward; a time repeated by a fall-back change takes the earlier instant.
 */
export function zonedMs(p: { year: number; month: number; day: number; hour?: number; minute?: number }, tz: string): number {
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour ?? 0, p.minute ?? 0);
  const before = wall - offsetMs(wall - DAY_MS, tz);
  const after = wall - offsetMs(wall + DAY_MS, tz);
  const valid = [before, after].filter((c) => c + offsetMs(c, tz) === wall);
  return valid.length ? Math.min(...valid) : before;
}

function dayIndex(ms: number, tz: string): number {
  const p = localParts(ms, tz);
  return Date.UTC(p.year, p.month - 1, p.day) / DAY_MS;
}

export function startOfLocalDay(ms: number, tz: string): number {
  const p = localParts(ms, tz);
  return zonedMs({ year: p.year, month: p.month, day: p.day }, tz);
}

/** The local midnight `n` days after the local date of `dayStartMs`. */
export function addLocalDays(dayStartMs: number, n: number, tz: string): number {
  const p = localParts(dayStartMs, tz);
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + n));
  return zonedMs({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }, tz);
}

/** Calendar days from `fromMs`'s local date to `toMs`'s local date. */
export function localDayDiff(fromMs: number, toMs: number, tz: string): number {
  return dayIndex(toMs, tz) - dayIndex(fromMs, tz);
}
