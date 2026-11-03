import { describe, expect, it } from 'vitest';
import type { AnswerResponse, AskResponse } from '../lib/api/client';
import { type Action, canStillAnswer, initialThread, isBusy, lastQuestion, nextAnnouncement, statusText, type ThreadState, threadReducer } from '../lib/thread';

const result = (id: string) => ({ id, kind: 'visit' as const, title: id, url: `https://e.com/${id}`, visit_time: '2026-11-01T12:00:00Z' });
const askResults: AskResponse = {
  ask_id: 'a_1', question: 'q', intent: { kind: 'any', order: 'relevance' }, results: [result('e1'), result('e2'), result('e3')],
  template_answer: { text: 'Found 3 matching entries.', cited: [] }, mode: 'results', window_counts: null, history_start: null,
  timings_ms: { parse: 1, execute: 2 },
};
const askNoMatch: AskResponse = {
  ...askResults, results: [], template_answer: null, mode: 'no-match', window_counts: { search: 0, visit: 0 },
};
const llm: AnswerResponse = { answer: { text: 'You read e1 [1].', cited: ['e1'] }, mode: 'llm', fallback_reason: null, timings_ms: { write: 900 } };

const run = (...actions: Action[]) => actions.reduce(threadReducer, initialThread);
const last = (s: ThreadState) => s.exchanges.at(-1)!;
const writing = () => run({ type: 'send', question: 'q1' }, { type: 'askOk', id: 0, ask: askResults, nowMs: 1000 });

describe('threadReducer', () => {
  it('send appends an asking exchange and folds earlier rows', () => {
    let s = run({ type: 'send', question: 'q1' }, { type: 'askOk', id: 0, ask: askResults, nowMs: 0 }, { type: 'stop', id: 0 },
      { type: 'toggleMore', id: 0 });
    s = threadReducer(s, { type: 'send', question: ' q2 ' });
    expect(s.exchanges).toHaveLength(2);
    expect(last(s)).toMatchObject({ id: 1, question: 'q2', card: { phase: 'asking' }, rowsOpen: true });
    expect(s.exchanges[0]).toMatchObject({ rowsOpen: false, moreOpen: false });
  });
  it('send is ignored while busy', () => {
    expect(threadReducer(writing(), { type: 'send', question: 'q2' }).exchanges).toHaveLength(1);
    expect(isBusy(run({ type: 'send', question: 'q1' }))).toBe(true);
  });
  it('send ignores a blank question', () => {
    expect(run({ type: 'send', question: '   ' }).exchanges).toEqual([]);
  });
  it('askOk with results enters writing; with no-match enters no-match', () => {
    expect(last(writing()).card).toEqual({ phase: 'writing', ask: askResults, startedMs: 1000 });
    const s = run({ type: 'send', question: 'q' }, { type: 'askOk', id: 0, ask: askNoMatch, nowMs: 0 });
    expect(last(s).card).toEqual({ phase: 'no-match', ask: askNoMatch });
    expect(isBusy(s)).toBe(false);
  });
  it('askFailed offline and rejected', () => {
    expect(last(run({ type: 'send', question: 'q' }, { type: 'askFailed', id: 0, status: 'offline' })).card).toEqual({ phase: 'offline' });
    expect(last(run({ type: 'send', question: 'q' }, { type: 'askFailed', id: 0, status: 'rejected', detail: 'bad tz' })).card)
      .toEqual({ phase: 'rejected', detail: 'bad tz' });
  });
  it('answerOk gives llm answer', () => {
    const s = threadReducer(writing(), { type: 'answerOk', id: 0, res: llm });
    expect(last(s).card).toEqual({ phase: 'answered', ask: askResults, answer: llm.answer, mode: 'llm', reason: null, writeMs: 900 });
  });
  it('answerOk with fallback keeps the reason', () => {
    const res: AnswerResponse = { answer: askResults.template_answer!, mode: 'template', fallback_reason: 'rejected_citation', timings_ms: { write: 5 } };
    expect(last(threadReducer(writing(), { type: 'answerOk', id: 0, res })).card).toMatchObject({ mode: 'template', reason: 'rejected_citation' });
  });
  it('answerFailed gives template with llm_error', () => {
    expect(last(threadReducer(writing(), { type: 'answerFailed', id: 0 })).card).toEqual({
      phase: 'answered', ask: askResults, answer: askResults.template_answer, mode: 'template', reason: 'llm_error', writeMs: null,
    });
  });
  it('skipAnswer gives template with llm_off', () => {
    expect(last(threadReducer(writing(), { type: 'skipAnswer', id: 0 })).card).toMatchObject({ mode: 'template', reason: 'llm_off' });
  });
  it('stop gives template with stopped', () => {
    expect(last(threadReducer(writing(), { type: 'stop', id: 0 })).card).toMatchObject({
      phase: 'answered', answer: askResults.template_answer, mode: 'template', reason: 'stopped',
    });
  });
  it('answerOk after stop is ignored', () => {
    const stopped = threadReducer(writing(), { type: 'stop', id: 0 });
    expect(threadReducer(stopped, { type: 'answerOk', id: 0, res: llm })).toEqual(stopped);
  });
  it('answerOk for a cleared exchange is ignored', () => {
    const cleared = threadReducer(writing(), { type: 'newChat' });
    const s = threadReducer(cleared, { type: 'answerOk', id: 0, res: llm });
    expect(s.exchanges).toEqual([]);
    expect(s).toEqual(cleared);
  });
  it('only the newest card is unfolded after two sends', () => {
    let s = threadReducer(writing(), { type: 'stop', id: 0 });
    s = threadReducer(s, { type: 'send', question: 'q2' });
    s = threadReducer(s, { type: 'askOk', id: 1, ask: askResults, nowMs: 0 });
    expect(s.exchanges.map((e) => e.rowsOpen)).toEqual([false, true]);
    s = threadReducer(s, { type: 'toggleRows', id: 0 });
    expect(s.exchanges[0]!.rowsOpen).toBe(true);
  });
  it('toggleDiag keeps one panel open', () => {
    let s = threadReducer(writing(), { type: 'stop', id: 0 });
    s = threadReducer(s, { type: 'send', question: 'q2' });
    s = threadReducer(s, { type: 'toggleDiag', id: 0 });
    s = threadReducer(s, { type: 'toggleDiag', id: 1 });
    expect(s.exchanges.map((e) => e.diagOpen)).toEqual([false, true]);
    s = threadReducer(s, { type: 'toggleDiag', id: 1 });
    expect(s.exchanges.map((e) => e.diagOpen)).toEqual([false, false]);
  });
  it('newChat then undo restores the thread; dropUndo clears it', () => {
    const before = threadReducer(writing(), { type: 'stop', id: 0 });
    const cleared = threadReducer(before, { type: 'newChat' });
    expect(cleared.exchanges).toEqual([]);
    expect(threadReducer(cleared, { type: 'undo' }).exchanges).toEqual(before.exchanges);
    const dropped = threadReducer(cleared, { type: 'dropUndo' });
    expect(dropped.undo).toBeNull();
    expect(threadReducer(dropped, { type: 'undo' }).exchanges).toEqual([]);
  });
  it('undo after a reply was dropped does not restore a stuck asking card', () => {
    let s = run({ type: 'send', question: 'q1' }, { type: 'newChat' });
    s = threadReducer(s, { type: 'askOk', id: 0, ask: askResults, nowMs: 0 }); // dropped: exchange is gone
    s = threadReducer(s, { type: 'undo' });
    expect(isBusy(s)).toBe(false);
    expect(s.exchanges.some((e) => e.card.phase === 'asking')).toBe(false);
  });
  it('undo of a chat cleared while writing restores a settled card', () => {
    const s = threadReducer(threadReducer(writing(), { type: 'newChat' }), { type: 'undo' });
    expect(isBusy(s)).toBe(false);
    expect(last(s).card).toMatchObject({ phase: 'answered', mode: 'template', reason: 'stopped' });
  });
  it('sending after New chat drops the undo, so Undo cannot discard the new question', () => {
    let s = threadReducer(threadReducer(writing(), { type: 'stop', id: 0 }), { type: 'newChat' });
    s = threadReducer(s, { type: 'send', question: 'q2' });
    expect(s.undo).toBeNull();
    s = threadReducer(s, { type: 'undo' });
    expect(s.exchanges.map((e) => e.question)).toEqual(['q2']);
  });
  it('ids keep counting after newChat', () => {
    const s = run({ type: 'send', question: 'q1' }, { type: 'askFailed', id: 0, status: 'offline' }, { type: 'newChat' }, { type: 'send', question: 'q2' });
    expect(last(s).id).toBe(1);
  });
  it('lastQuestion', () => {
    expect(lastQuestion(initialThread)).toBeNull();
    expect(lastQuestion(writing())).toBe('q1');
  });
});

describe('statusText', () => {
  const ex = (s: ThreadState) => last(s);
  it('for each phase', () => {
    expect(statusText(ex(run({ type: 'send', question: 'q' })))).toBeNull();
    expect(statusText(ex(writing()))).toBeNull();
    expect(statusText(ex(threadReducer(writing(), { type: 'answerOk', id: 0, res: llm })))).toBe('Answer ready, 1 source.');
    const two: AnswerResponse = { ...llm, answer: { text: 't', cited: ['e1', 'e2'] } };
    expect(statusText(ex(threadReducer(writing(), { type: 'answerOk', id: 0, res: two })))).toBe('Answer ready, 2 sources.');
    expect(statusText(ex(threadReducer(writing(), { type: 'skipAnswer', id: 0 })))).toBe('Answer ready, 0 sources.');
    expect(statusText(ex(threadReducer(writing(), { type: 'stop', id: 0 })))).toBe('Stopped.');
    expect(statusText(ex(run({ type: 'send', question: 'q' }, { type: 'askOk', id: 0, ask: askNoMatch, nowMs: 0 })))).toBe('No matches.');
    expect(statusText(ex(run({ type: 'send', question: 'q' }, { type: 'askFailed', id: 0, status: 'offline' }))))
      .toBe("Couldn't reach the backend. Question not asked.");
    expect(statusText(ex(run({ type: 'send', question: 'q' }, { type: 'askFailed', id: 0, status: 'rejected', detail: 'x' }))))
      .toBe("Couldn't read that question.");
  });
});

describe('canStillAnswer', () => {
  it('is false once the exchange was cleared or settled', () => {
    const asking = run({ type: 'send', question: 'q1' });
    expect(canStillAnswer(asking, 0)).toBe(true);
    expect(canStillAnswer(threadReducer(asking, { type: 'newChat' }), 0)).toBe(false);
    expect(canStillAnswer(writing(), 0)).toBe(true);
    expect(canStillAnswer(threadReducer(writing(), { type: 'stop', id: 0 }), 0)).toBe(false);
  });
});

describe('nextAnnouncement', () => {
  it('changes the live text when the same message repeats, so it is announced again', () => {
    expect(nextAnnouncement('', 'No matches.')).toBe('No matches.');
    const again = nextAnnouncement('No matches.', 'No matches.');
    expect(again).not.toBe('No matches.');
    expect(again.trim()).toBe('No matches.');
    expect(nextAnnouncement(again, 'No matches.')).toBe('No matches.');
    expect(nextAnnouncement('Stopped.', 'No matches.')).toBe('No matches.');
  });
});
