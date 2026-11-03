import type { components } from './api/schema';
import { extractGoogleQuery, isIngestible } from './url';

export type IngestEntry = components['schemas']['IngestEntry'];

export interface CapturedPage {
  url: string;
  title: string;
  visitTime: Date;
  text?: string | null;
  source: 'live' | 'backfill';
}

// Lone UTF-16 surrogates (e.g. an emoji cut in half) cannot be stored by the backend.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function wellFormed(s: string): string {
  return s.replace(LONE_SURROGATE, '\uFFFD');
}

const pad = (n: number) => String(Math.abs(n)).padStart(2, '0');

/** Local wall-clock time with its UTC offset, e.g. 2026-11-03T10:00:00-06:00. */
export function formatLocalIso(d: Date): string {
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return `${date}T${time}${sign}${pad(Math.trunc(offsetMin / 60))}:${pad(offsetMin % 60)}`;
}

/** Turn a captured page into an ingest entry, or null if it should not be stored. */
export function toIngestEntry(page: CapturedPage): IngestEntry | null {
  if (!isIngestible(page.url)) return null;
  const query = extractGoogleQuery(page.url);
  return {
    kind: query ? 'search' : 'visit',
    url: wellFormed(page.url),
    query: query === null ? null : wellFormed(query),
    title: wellFormed(page.title ?? ''),
    visit_time: formatLocalIso(page.visitTime),
    text: query || page.text == null ? null : wellFormed(page.text),
    source: page.source,
  };
}
