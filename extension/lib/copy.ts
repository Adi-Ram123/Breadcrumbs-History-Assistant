/** Fixed panel copy (spec §2 and the mockups), kept out of the components so it is tested. */

import { dateLabel, rowTimeLabel } from './timeLabel';

export type PlainReason = 'llm_off' | 'stopped' | 'rejected_citation' | 'llm_error';

const REASONS: Record<PlainReason, string> = {
  llm_off: 'Plain answer: the local model is off.',
  stopped: 'Plain answer: you stopped the local model.',
  rejected_citation: "Plain answer: the model's reply named a page that isn't in your history, so it was set aside.",
  llm_error: "Plain answer: the local model didn't respond.",
};

export function reasonText(reason: PlainReason): string {
  return REASONS[reason];
}

export function formatCount(n: number): string {
  return n.toLocaleString('en-US');
}

/** The first-open sentence under "Find something you browsed". */
/** `entryCount` is null until /health answers (or while the backend is offline). */
export function firstOpenSentence(
  entryCount: number | null,
  historyStartIso: string | null,
  tz: string,
  platform: 'mac' | 'other',
): string {
  const device = platform === 'mac' ? 'this Mac' : 'this computer';
  if (entryCount === null) return `Answers come from the pages and searches Chrome kept. Nothing leaves ${device}.`;
  if (entryCount === 0 || historyStartIso === null) {
    return `No history is synced yet. Breadcrumbs copies your Chrome history while this panel is open. Nothing leaves ${device}.`;
  }
  const since = dateLabel(Date.parse(historyStartIso), tz);
  return `Answers come from the ${formatCount(entryCount)} pages and searches Chrome kept since ${since}. Nothing leaves ${device}.`;
}

/** The collapsed diagnostics line: "LLM, verified · 1,160 ms", "Plain · 52 ms" or "No match · 9 ms". */
export function diagSummary(mode: 'llm' | 'template' | 'no-match', totalMs: number): string {
  const label = mode === 'llm' ? 'LLM, verified' : mode === 'template' ? 'Plain' : 'No match';
  return `${label} · ${formatCount(Math.round(totalMs))} ms`;
}

/** The last-sync time in the "⋯" menu: "just now", "2 min ago", then a row-style time. */
export function syncAgoLabel(lastSyncedMs: number | null, nowMs: number, tz: string): string {
  if (lastSyncedMs === null) return 'never';
  const minutes = Math.floor((nowMs - lastSyncedMs) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  return rowTimeLabel(lastSyncedMs, nowMs, tz);
}
