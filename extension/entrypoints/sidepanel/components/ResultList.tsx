import type { Result } from '../../../lib/api/client';
import { faviconUrl } from '../../../lib/favicon';
import { rowDomain, rowTitle, splitRows } from '../../../lib/rows';
import { rowTimeLabel } from '../../../lib/timeLabel';
import { ChevIcon, OutIcon, SearchIcon } from './Icons';

export type OpenUrl = (url: string) => void;

/** Left click opens a background tab so the panel keeps its place; modified clicks keep their browser meaning. */
export function openHandler(url: string, onOpen: OpenUrl) {
  return (e: React.MouseEvent) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onOpen(url);
  };
}

function Row({ r, rank, cited, tz, nowMs, onOpen }: { r: Result; rank: number; cited: boolean; tz: string; nowMs: number; onOpen: OpenUrl }) {
  const isSearch = r.kind === 'search';
  const where = isSearch ? 'Google search' : rowDomain(r.url);
  return (
    <li className={cited ? 'cited' : undefined}>
      <a className="row" href={r.url} target="_blank" rel="noopener" onClick={openHandler(r.url, onOpen)}>
        {cited ? (
          <span className="rank" aria-label={`Source ${rank}.`}>
            {rank}
          </span>
        ) : (
          <span className="rank" aria-hidden="true">
            {rank}
          </span>
        )}
        <span className="tx">
          <span className="t">{rowTitle(r)}</span>
          <span className="m">
            {isSearch ? (
              <SearchIcon className="fav srch" />
            ) : (
              <img className="fav" src={faviconUrl(r.url)} width={14} height={14} alt="" />
            )}
            <span className="mt">
              {where} · {rowTimeLabel(Date.parse(r.visit_time), nowMs, tz)}
            </span>
          </span>
        </span>
        <span className="sr-only">, opens in a new tab</span>
        <OutIcon className="go" />
      </a>
    </li>
  );
}

/** Rows: cited first (at most 3), the rest behind "N more results". Badges stay grey until `cited` is set. */
export function ResultList(props: {
  results: Result[];
  cited: string[];
  moreOpen: boolean;
  onToggleMore: () => void;
  tz: string;
  nowMs: number;
  onOpen: OpenUrl;
}) {
  const { results, cited, moreOpen, onToggleMore, tz, nowMs, onOpen } = props;
  const citedSet = new Set(cited);
  const { visible, hidden } = splitRows(results, cited);
  const shown = moreOpen ? results : visible;
  const rankOf = new Map(results.map((r, i) => [r.id, i + 1]));
  const hiddenUncited = cited.length > 0 && hidden.every((r) => !citedSet.has(r.id));

  return (
    <>
      <ol className="rows">
        {shown.map((r) => (
          <Row key={r.id} r={r} rank={rankOf.get(r.id)!} cited={citedSet.has(r.id)} tz={tz} nowMs={nowMs} onOpen={onOpen} />
        ))}
      </ol>
      {hidden.length > 0 && (
        <button type="button" className="more" aria-expanded={moreOpen} onClick={onToggleMore}>
          <ChevIcon />
          {moreOpen ? (
            'Show fewer'
          ) : (
            <>
              {hidden.length} more {hidden.length === 1 ? 'result' : 'results'}
              {hiddenUncited && <span className="n">· not cited</span>}
            </>
          )}
        </button>
      )}
    </>
  );
}
