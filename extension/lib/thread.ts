/**
 * The session thread as a pure reducer: one exchange per question, each with a card
 * that moves asking → writing → answered (or no-match / offline / rejected).
 * Late replies for a stopped or cleared exchange are ignored.
 */

import type { Answer, AnswerResponse, AskResponse } from './api/client';
import type { PlainReason } from './copy';

export type Card =
  | { phase: 'asking' }
  | { phase: 'writing'; ask: AskResponse; startedMs: number }
  | { phase: 'answered'; ask: AskResponse; answer: Answer; mode: 'llm' | 'template'; reason: PlainReason | null; writeMs: number | null }
  | { phase: 'no-match'; ask: AskResponse }
  | { phase: 'offline' }
  | { phase: 'rejected'; detail: string };

export interface Exchange {
  id: number;
  question: string;
  card: Card;
  rowsOpen: boolean;
  moreOpen: boolean;
  diagOpen: boolean;
}

export interface ThreadState {
  exchanges: Exchange[];
  nextId: number;
  undo: Exchange[] | null;
}

export type Action =
  | { type: 'send'; question: string }
  | { type: 'askOk'; id: number; ask: AskResponse; nowMs: number }
  | { type: 'askFailed'; id: number; status: 'offline' }
  | { type: 'askFailed'; id: number; status: 'rejected'; detail: string }
  | { type: 'answerOk'; id: number; res: AnswerResponse }
  | { type: 'answerFailed'; id: number }
  | { type: 'skipAnswer'; id: number }
  | { type: 'stop'; id: number }
  | { type: 'toggleRows' | 'toggleMore' | 'toggleDiag'; id: number }
  | { type: 'newChat' }
  | { type: 'undo' }
  | { type: 'dropUndo' };

export const initialThread: ThreadState = { exchanges: [], nextId: 0, undo: null };

function update(s: ThreadState, id: number, fn: (e: Exchange) => Exchange | null): ThreadState {
  const i = s.exchanges.findIndex((e) => e.id === id);
  if (i < 0) return s;
  const next = fn(s.exchanges[i]!);
  if (next === null) return s;
  const exchanges = [...s.exchanges];
  exchanges[i] = next;
  return { ...s, exchanges };
}

/** Finish a writing card with the template answer; ignored unless the card is still writing. */
function plain(s: ThreadState, id: number, reason: PlainReason): ThreadState {
  return update(s, id, (e) =>
    e.card.phase === 'writing' && e.card.ask.template_answer
      ? {
          ...e,
          card: { phase: 'answered', ask: e.card.ask, answer: e.card.ask.template_answer, mode: 'template', reason, writeMs: null },
        }
      : null,
  );
}

/**
 * New chat cancels whatever is in flight, so the Undo snapshot must not keep a card
 * waiting for a reply that will never come: a question still being asked is dropped,
 * and an answer still being written becomes the plain answer, as if stopped.
 */
function settle(exchanges: Exchange[]): Exchange[] {
  return exchanges.flatMap((e): Exchange[] => {
    if (e.card.phase === 'asking') return [];
    if (e.card.phase === 'writing' && e.card.ask.template_answer) {
      const { ask } = e.card;
      return [{ ...e, card: { phase: 'answered', ask, answer: ask.template_answer!, mode: 'template', reason: 'stopped', writeMs: null } }];
    }
    return [e];
  });
}

/** Whether a reply for exchange `id` can still land: it exists and is still asking or writing. */
export function canStillAnswer(s: ThreadState, id: number): boolean {
  const phase = s.exchanges.find((e) => e.id === id)?.card.phase;
  return phase === 'asking' || phase === 'writing';
}

/**
 * The text for the role="status" line. A live region only speaks when its text changes,
 * so a repeated message gets a trailing no-break space to be announced again.
 */
export function nextAnnouncement(prev: string, next: string): string {
  return next === prev ? `${next}\u00a0` : next;
}

export function isBusy(s: ThreadState): boolean {
  const phase = s.exchanges.at(-1)?.card.phase;
  return phase === 'asking' || phase === 'writing';
}

export function lastQuestion(s: ThreadState): string | null {
  return s.exchanges.at(-1)?.question ?? null;
}

export function threadReducer(s: ThreadState, a: Action): ThreadState {
  switch (a.type) {
    case 'send': {
      const question = a.question.trim();
      if (!question || isBusy(s)) return s;
      const folded = s.exchanges.map((e) => ({ ...e, rowsOpen: false, moreOpen: false }));
      const fresh: Exchange = { id: s.nextId, question, card: { phase: 'asking' }, rowsOpen: true, moreOpen: false, diagOpen: false };
      // A new question ends the Undo window, so Undo can never discard it.
      return { ...s, exchanges: [...folded, fresh], nextId: s.nextId + 1, undo: null };
    }
    case 'askOk':
      return update(s, a.id, (e) =>
        e.card.phase !== 'asking'
          ? null
          : {
              ...e,
              card: a.ask.mode === 'results' ? { phase: 'writing', ask: a.ask, startedMs: a.nowMs } : { phase: 'no-match', ask: a.ask },
            },
      );
    case 'askFailed':
      return update(s, a.id, (e) =>
        e.card.phase !== 'asking'
          ? null
          : { ...e, card: a.status === 'offline' ? { phase: 'offline' } : { phase: 'rejected', detail: a.detail } },
      );
    case 'answerOk':
      return update(s, a.id, (e) =>
        e.card.phase !== 'writing'
          ? null
          : {
              ...e,
              card: {
                phase: 'answered',
                ask: e.card.ask,
                answer: a.res.answer,
                mode: a.res.mode,
                reason: a.res.fallback_reason ?? null,
                writeMs: a.res.timings_ms.write ?? null,
              },
            },
      );
    case 'answerFailed':
      return plain(s, a.id, 'llm_error');
    case 'skipAnswer':
      return plain(s, a.id, 'llm_off');
    case 'stop':
      return plain(s, a.id, 'stopped');
    case 'toggleRows':
      return update(s, a.id, (e) => ({ ...e, rowsOpen: !e.rowsOpen }));
    case 'toggleMore':
      return update(s, a.id, (e) => ({ ...e, moreOpen: !e.moreOpen }));
    case 'toggleDiag': {
      const target = s.exchanges.find((e) => e.id === a.id);
      if (!target) return s;
      const open = !target.diagOpen;
      return { ...s, exchanges: s.exchanges.map((e) => ({ ...e, diagOpen: e.id === a.id ? open : false })) };
    }
    case 'newChat':
      return s.exchanges.length ? { ...s, exchanges: [], undo: settle(s.exchanges) } : s;
    case 'undo':
      return s.undo ? { ...s, exchanges: s.undo, undo: null } : s;
    case 'dropUndo':
      return s.undo ? { ...s, undo: null } : s;
  }
}

/** The single role="status" line for an exchange's current phase, or null while it is still working. */
export function statusText(e: Exchange): string | null {
  switch (e.card.phase) {
    case 'answered': {
      if (e.card.reason === 'stopped') return 'Stopped.';
      const n = e.card.answer.cited.length;
      return `Answer ready, ${n} ${n === 1 ? 'source' : 'sources'}.`;
    }
    case 'no-match':
      return 'No matches.';
    case 'offline':
      return "Couldn't reach the backend. Question not asked.";
    case 'rejected':
      return "Couldn't read that question.";
    default:
      return null;
  }
}
