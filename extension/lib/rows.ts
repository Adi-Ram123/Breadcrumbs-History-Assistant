/** Row text and which rows show before "N more results". */

import type { Result } from './api/client';

function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** Host without "www.", or the input unchanged when it isn't a URL. Never throws. */
export function rowDomain(url: string): string {
  const u = parse(url);
  return u ? u.hostname.replace(/^www\./, '') : url;
}

/** Searches show their query; untitled pages show host and path. */
export function rowTitle(r: Result): string {
  if (r.kind === 'search' && r.query?.trim()) return r.query.trim();
  const title = r.title.trim();
  if (title) return title;
  const u = parse(r.url);
  if (!u) return r.url;
  const path = u.pathname === '/' ? '' : u.pathname;
  return `${u.hostname.replace(/^www\./, '')}${path}`;
}

/**
 * Visible: the cited rows in rank order, at most 3, or the top 3 when nothing is cited.
 * Hidden: every other row, in rank order.
 */
export function splitRows(results: Result[], cited: string[]): { visible: Result[]; hidden: Result[] } {
  const citedSet = new Set(cited);
  const pick = citedSet.size ? results.filter((r) => citedSet.has(r.id)).slice(0, 3) : results.slice(0, 3);
  const shown = new Set(pick);
  return { visible: pick, hidden: results.filter((r) => !shown.has(r)) };
}
