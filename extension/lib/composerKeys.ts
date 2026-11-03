/** What a key press in the composer does (spec §3 "Keyboard"). */

export type ComposerKeyAction = 'send' | 'newline' | 'stop' | 'recall' | null;

export function composerKeyAction(
  e: { key: string; shiftKey: boolean; isComposing: boolean },
  ctx: { text: string; writing: boolean; lastQuestion: string | null },
): ComposerKeyAction {
  if (e.isComposing) return null; // Enter confirms an IME candidate; it must not send
  if (e.key === 'Enter') {
    if (e.shiftKey) return 'newline';
    return ctx.writing ? null : 'send';
  }
  if (e.key === 'Escape') return ctx.writing ? 'stop' : null;
  if (e.key === 'ArrowUp' && ctx.text === '' && ctx.lastQuestion) return 'recall';
  return null;
}
