import type { Intent, Result } from '../../../lib/api/client';
import { readAsCaption } from '../../../lib/readAs';
import { toRange } from '../../../lib/timeLabel';
import { ChevIcon } from './Icons';
import { Trail } from './Trail';

export interface Fold {
  open: boolean;
  count: number;
  onToggle: () => void;
}

/** "Read as <what>, <range>", then the trail. Older cards get a fold button that hides the trail and rows. */
export function ReadAs(props: { intent: Intent; tz: string; nowMs: number; results: Result[]; citedRanks: number[]; fold?: Fold | null }) {
  const { intent, tz, nowMs, results, citedRanks, fold } = props;
  const { what, range } = readAsCaption(intent, tz);
  const caption = (
    <div className="cap">
      Read as <b>{what}</b>, <b>{range}</b>
    </div>
  );
  const trail = (
    <Trail
      input={{
        range: toRange(intent.time_range),
        results: results.map((r) => ({ visitMs: Date.parse(r.visit_time) })),
        citedRanks,
        kind: intent.kind,
        tz,
        nowMs,
      }}
    />
  );
  if (!fold) {
    return (
      <div className="read">
        {caption}
        {trail}
      </div>
    );
  }
  return (
    <>
      <div className="foldline">
        {caption}
        <button type="button" className="srcbtn" aria-expanded={fold.open} onClick={fold.onToggle}>
          {fold.count} {fold.count === 1 ? 'result' : 'results'}
          <ChevIcon size={12} />
        </button>
      </div>
      {fold.open && <div className="read">{trail}</div>}
    </>
  );
}
