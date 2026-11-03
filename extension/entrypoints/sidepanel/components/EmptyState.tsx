import { SendIcon } from './Icons';

const EXAMPLES = [
  'What did I search 2 days ago?',
  'What was the last movie I watched?',
  'Which ramen pages did I open last week?',
  'What was I reading yesterday afternoon?',
];

/** First open: where answers come from, and example questions that ask right away. */
export function EmptyState({ sentence, onAsk, disabled }: { sentence: string; onAsk: (q: string) => void; disabled: boolean }) {
  return (
    <div className="empty">
      <h2>Find something you browsed</h2>
      <p>{sentence}</p>
      {EXAMPLES.map((q) => (
        <button key={q} type="button" className="ex" onClick={() => onAsk(q)} disabled={disabled}>
          <span>{q}</span>
          <span className="askicon" aria-hidden="true">
            <SendIcon size={14} />
          </span>
        </button>
      ))}
    </div>
  );
}
