import { describe, expect, it } from 'vitest';
import { diagSummary, firstOpenSentence, formatCount, reasonText, syncAgoLabel } from '../lib/copy';

const TZ = 'America/Chicago';

describe('copy', () => {
  it('reasonText', () => {
    expect(reasonText('llm_off')).toBe('Plain answer: the local model is off.');
    expect(reasonText('stopped')).toBe('Plain answer: you stopped the local model.');
    expect(reasonText('rejected_citation')).toBe("Plain answer: the model's reply named a page that isn't in your history, so it was set aside.");
    expect(reasonText('llm_error')).toBe("Plain answer: the local model didn't respond.");
  });
  it('firstOpenSentence', () => {
    expect(firstOpenSentence(4812, '2026-08-04T14:12:00Z', TZ, 'mac'))
      .toBe('Answers come from the 4,812 pages and searches Chrome kept since Tue, Aug 4. Nothing leaves this Mac.');
  });
  it('firstOpenSentence with no history', () => {
    expect(firstOpenSentence(0, null, TZ, 'other'))
      .toBe('No history is synced yet. Breadcrumbs copies your Chrome history while this panel is open. Nothing leaves this computer.');
  });
  it('firstOpenSentence before the backend answers', () => {
    expect(firstOpenSentence(null, null, TZ, 'mac')).toBe('Answers come from the pages and searches Chrome kept. Nothing leaves this Mac.');
  });
  it('diagSummary', () => {
    expect(diagSummary('llm', 1160)).toBe('LLM, verified · 1,160 ms');
    expect(diagSummary('template', 52.4)).toBe('Plain · 52 ms');
    expect(diagSummary('no-match', 9)).toBe('No match · 9 ms');
  });
  it('formatCount', () => {
    expect(formatCount(4812)).toBe('4,812');
  });
});

describe('syncAgoLabel', () => {
  const NOW = Date.parse('2026-11-02T15:30:00Z');
  it('reads like the mockup menu', () => {
    expect(syncAgoLabel(null, NOW, TZ)).toBe('never');
    expect(syncAgoLabel(NOW - 20_000, NOW, TZ)).toBe('just now');
    expect(syncAgoLabel(NOW - 2 * 60_000, NOW, TZ)).toBe('2 min ago');
    expect(syncAgoLabel(NOW - 59 * 60_000, NOW, TZ)).toBe('59 min ago');
    expect(syncAgoLabel(Date.parse('2026-11-02T03:14:00Z'), NOW, TZ)).toBe('Yesterday 9:14 PM');
  });
});
