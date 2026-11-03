// Chrome's history is the single source of visit timestamps, so live capture and
// history sync produce the same entry id for the same visit (the backend hashes
// kind + url + visit time). Reloads are not new visits.

export interface VisitLike {
  visitTime?: number;
  transition?: string;
}

const counted = (v: VisitLike): v is VisitLike & { visitTime: number } =>
  v.visitTime !== undefined && v.transition !== 'reload';

/** Time of the latest non-reload visit, or null if there is none. */
export function pickVisitTime(visits: VisitLike[]): number | null {
  const times = visits.filter(counted).map((v) => v.visitTime);
  return times.length ? Math.max(...times) : null;
}

/** Non-reload visit times at or after `sinceMs`. */
export function countedVisitTimes(visits: VisitLike[], sinceMs: number): number[] {
  return visits.filter(counted).map((v) => v.visitTime).filter((t) => t >= sinceMs);
}
