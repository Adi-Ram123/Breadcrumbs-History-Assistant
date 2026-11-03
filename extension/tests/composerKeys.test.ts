import { describe, expect, it } from 'vitest';
import { composerKeyAction } from '../lib/composerKeys';

const key = (k: string, o: { shiftKey?: boolean; isComposing?: boolean } = {}) => ({ key: k, shiftKey: false, isComposing: false, ...o });
const ctx = (o: { text?: string; writing?: boolean; lastQuestion?: string | null } = {}) => ({ text: 'hi', writing: false, lastQuestion: 'q', ...o });

describe('composerKeyAction', () => {
  it('ignores Enter while composing', () => {
    expect(composerKeyAction(key('Enter', { isComposing: true }), ctx())).toBeNull();
  });
  it('Enter sends', () => expect(composerKeyAction(key('Enter'), ctx())).toBe('send'));
  it('Shift+Enter makes a new line', () => expect(composerKeyAction(key('Enter', { shiftKey: true }), ctx())).toBe('newline'));
  it('Enter while writing does nothing', () => expect(composerKeyAction(key('Enter'), ctx({ writing: true }))).toBeNull());
  it('Escape while writing stops', () => {
    expect(composerKeyAction(key('Escape'), ctx({ writing: true }))).toBe('stop');
    expect(composerKeyAction(key('Escape'), ctx())).toBeNull();
  });
  it('ArrowUp in an empty composer recalls the last question', () => {
    expect(composerKeyAction(key('ArrowUp'), ctx({ text: '' }))).toBe('recall');
    expect(composerKeyAction(key('ArrowUp'), ctx({ text: 'x' }))).toBeNull();
    expect(composerKeyAction(key('ArrowUp'), ctx({ text: '', lastQuestion: null }))).toBeNull();
  });
  it('other keys do nothing', () => expect(composerKeyAction(key('a'), ctx())).toBeNull());
});
