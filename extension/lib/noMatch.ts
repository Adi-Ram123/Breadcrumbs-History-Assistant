/** Which of the four no-match cases an empty /ask is, and what the card says (spec §2). */

import type { AskResponse } from './api/client';
import { formatCount } from './copy';
import { reaskQuestion, timePhrase } from './reask';
import { dateLabel, rangeLabel, spanLabel, toRange, wholeLocalDays } from './timeLabel';
import { addLocalDays, startOfLocalDay } from './zoned';

export interface ReAsk {
  label: string;
  question: string;
}
export type NoMatchKind = 'before-history' | 'topic' | 'wrong-kind' | 'empty-window';
export interface NoMatch {
  kind: NoMatchKind;
  sentence: string;
  sub: string;
  showTrail: boolean;
  reasks: ReAsk[];
}

const plural = (n: number, one: string, many: string) => `${formatCount(n)} ${n === 1 ? one : many}`;
const join = (...parts: string[]) => parts.filter(Boolean).join(' ');
/** Phrases that read well as a possessive: "yesterday's searches". */
const POSSESSIVE = new Set(['today', 'yesterday', 'last week']);

export function describeNoMatch(ask: AskResponse, nowMs: number, tz: string): NoMatch {
  const { intent } = ask;
  const kind = intent.kind;
  const topic = intent.topic ?? null;
  const range = toRange(intent.time_range);
  const counts = ask.window_counts ?? { search: 0, visit: 0 };
  const phrase = timePhrase(range, nowMs, tz);
  const span = spanLabel(range, tz);
  const historyStart = ask.history_start ? Date.parse(ask.history_start) : null;
  const reask = (label: string, p: string): ReAsk => ({ label, question: reaskQuestion(kind, topic, p) });

  if (range && historyStart !== null && range.endMs <= historyStart) {
    const today = startOfLocalDay(nowMs, tz);
    const pick =
      addLocalDays(today, -7, tz) >= historyStart
        ? reask('Last 7 days', 'in the last 7 days')
        : addLocalDays(today, -1, tz) >= historyStart
          ? reask('Yesterday', 'yesterday')
          : reask('Today', 'today');
    return {
      kind: 'before-history',
      showTrail: false,
      sentence: `Your history here starts on ${dateLabel(historyStart, tz)}.`,
      sub: `The first sync copied the last 90 days from Chrome, so ${rangeLabel(range, tz)} isn't in Breadcrumbs.`,
      reasks: [pick],
    };
  }

  const empty = (): NoMatch => ({
    kind: 'empty-window',
    showTrail: true,
    sentence: range ? `Nothing in your history for ${phrase ?? rangeLabel(range, tz)}.` : 'Nothing in your history.',
    sub: 'Chrome kept no visits or searches then.',
    reasks: range ? [reask('Last 30 days', 'in the last 30 days')] : [],
  });

  if (counts.search === 0 && counts.visit === 0) return empty();

  if (kind !== 'any') {
    const own = counts[kind];
    const other = kind === 'search' ? counts.visit : counts.search;
    if (own === 0 && other > 0) {
      const when = phrase ?? span;
      const sentence = kind === 'search' ? join('No Google searches', when) + '.' : join('No pages opened', when) + '.';
      const sub =
        kind === 'search'
          ? `${join('You opened', plural(other, 'page', 'pages'), span)}, but didn't search for anything.`
          : `${join('You made', plural(other, 'Google search', 'Google searches'), span)}, but didn't open any pages.`;
      const otherKind = kind === 'search' ? 'visit' : 'search';
      const label =
        otherKind === 'visit'
          ? other === 1 ? 'Show the page' : `Show the ${formatCount(other)} pages`
          : other === 1 ? 'Show the search' : `Show the ${formatCount(other)} searches`;
      const reasks = phrase ? [{ label, question: reaskQuestion(otherKind, null, phrase) }] : [];
      return { kind: 'wrong-kind', showTrail: true, sentence, sub, reasks };
    }
  }

  if (topic) {
    const n = kind === 'any' ? counts.search + counts.visit : counts[kind];
    const noun = kind === 'search' ? 'searches' : kind === 'visit' ? 'pages' : 'history';
    let sentence: string;
    if (!range) sentence = `Nothing about “${topic}” in your ${noun}.`;
    else if (phrase && POSSESSIVE.has(phrase)) sentence = `Nothing about “${topic}” in ${phrase}'s ${noun}.`;
    else sentence = `Nothing about “${topic}” in your ${noun} from ${rangeLabel(range, tz)}.`;
    const when = !range ? '' : phrase === 'last week' ? 'that week' : wholeLocalDays(range, tz) === 1 ? 'that day' : 'then';
    const sub =
      kind === 'search'
        ? `${join('You made', plural(n, 'search', 'searches'), when)}; none of them mention “${topic}”.`
        : kind === 'visit'
          ? `${join('You opened', plural(n, 'page', 'pages'), when)}; none of their titles or text mention “${topic}”.`
          : `${join('You have', plural(n, 'entry', 'entries'), when)}; none of their titles or text mention “${topic}”.`;
    const reasks = range ? [reask('Search all history', ''), reask('Last 30 days', 'in the last 30 days')] : [];
    return { kind: 'topic', showTrail: true, sentence, sub, reasks };
  }

  return empty();
}
