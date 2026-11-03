import { useLayoutEffect, useRef } from 'react';
import { composerKeyAction } from '../../../lib/composerKeys';
import { SendIcon, StopIcon } from './Icons';

const MAX_HEIGHT = 120; // about 6 lines

/** The question box. Enter sends, Shift+Enter breaks the line; Send turns into Stop while an answer is written. */
export function Composer(props: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  writing: boolean;
  busy: boolean;
  paused: boolean;
  lastQuestion: string | null;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const { value, onChange, onSend, onStop, writing, busy, paused, lastQuestion, inputRef } = props;
  const formRef = useRef<HTMLFormElement>(null);

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [value, inputRef]);

  const canSend = value.trim() !== '' && !busy && !paused;

  return (
    <>
      {paused && (
        <p className="cnote" id="send-note">
          Sending is paused until the backend is running.
        </p>
      )}
      <form
        ref={formRef}
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSend) onSend();
        }}
      >
        <label className="sr-only" htmlFor="ask">
          Ask about your history
        </label>
        <textarea
          id="ask"
          ref={inputRef}
          className="composer-input"
          rows={1}
          placeholder="Ask about your history"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            const action = composerKeyAction(
              { key: e.key, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing },
              { text: value, writing, lastQuestion },
            );
            if (action === 'send') {
              e.preventDefault();
              if (canSend) onSend();
            } else if (action === 'stop') {
              e.preventDefault();
              onStop();
            } else if (action === 'recall' && lastQuestion) {
              e.preventDefault();
              onChange(lastQuestion);
            } else if (action === null && e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault(); // Enter while an answer is written does nothing
            }
          }}
        />
        {writing ? (
          <button type="button" className="send" aria-label="Stop" title="Stop" onClick={onStop}>
            <StopIcon />
          </button>
        ) : (
          <button type="submit" className="send" aria-label="Send" title="Send" disabled={!canSend} aria-describedby={paused ? 'send-note' : undefined}>
            <SendIcon />
          </button>
        )}
      </form>
    </>
  );
}
