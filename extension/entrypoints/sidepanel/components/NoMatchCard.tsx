import type { AskResponse } from '../../../lib/api/client';
import { describeNoMatch } from '../../../lib/noMatch';
import { RedoIcon } from './Icons';
import { ReadAs } from './ReadAs';

/** Why nothing matched, the range picture, and one or two re-asks. */
export function NoMatchCard(props: { ask: AskResponse; tz: string; nowMs: number; onReask: (q: string) => void; children?: React.ReactNode }) {
  const { ask, tz, nowMs, onReask, children } = props;
  const m = describeNoMatch(ask, nowMs, tz);
  return (
    <article className="card2">
      <p className="ans">{m.sentence}</p>
      <p className="sub">{m.sub}</p>
      {m.showTrail && <ReadAs intent={ask.intent} tz={tz} nowMs={nowMs} results={[]} citedRanks={[]} />}
      {m.reasks.length > 0 && (
        <div className="reasks">
          {m.reasks.map((r) => (
            <button key={r.label} type="button" className="reask" onClick={() => onReask(r.question)} title={r.question}>
              <RedoIcon />
              {r.label}
            </button>
          ))}
        </div>
      )}
      {children}
    </article>
  );
}
