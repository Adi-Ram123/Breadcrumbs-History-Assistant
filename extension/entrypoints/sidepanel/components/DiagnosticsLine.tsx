import type { Intent } from '../../../lib/api/client';
import { diagSummary, formatCount } from '../../../lib/copy';
import { diagTimeRange } from '../../../lib/readAs';
import { ChevIcon } from './Icons';

/** "LLM, verified · 1,160 ms", opening the raw Intent and timings under their real field names. */
export function DiagnosticsLine(props: {
  mode: 'llm' | 'template' | 'no-match';
  intent: Intent;
  timings: { parse?: number; execute?: number };
  writeMs: number | null;
  tz: string;
  open: boolean;
  onToggle: () => void;
}) {
  const { mode, intent, timings, writeMs, tz, open, onToggle } = props;
  const parse = timings.parse ?? 0;
  const fetch = timings.execute ?? 0;
  const write = writeMs ?? 0;
  const ms = (n: number) => formatCount(Math.round(n));
  const dash = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
  return (
    <>
      <button type="button" className="dline" aria-expanded={open} onClick={onToggle}>
        <ChevIcon />
        {diagSummary(mode, parse + fetch + write)}
      </button>
      {open && (
        <dl className="diag">
          <div>
            <dt>kind</dt>
            <dd>{intent.kind}</dd>
          </div>
          <div>
            <dt>time_range</dt>
            <dd>{diagTimeRange(intent, tz)}</dd>
          </div>
          <div>
            <dt>topic · order · limit</dt>
            <dd>
              {dash(intent.topic)} · {intent.order} · {dash(intent.limit)}
            </dd>
          </div>
          <div>
            <dt>parse · fetch · write</dt>
            <dd>
              {ms(parse)} · {ms(fetch)} · {writeMs === null ? '—' : ms(write)} ms
            </dd>
          </div>
        </dl>
      )}
    </>
  );
}
