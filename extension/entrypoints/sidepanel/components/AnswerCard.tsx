import { useEffect, useState } from 'react';
import { answerSegments } from '../../../lib/answerText';
import { reasonText } from '../../../lib/copy';
import { rowTitle } from '../../../lib/rows';
import type { Exchange } from '../../../lib/thread';
import { DiagnosticsLine } from './DiagnosticsLine';
import { InfoIcon } from './Icons';
import { ReadAs } from './ReadAs';
import { type OpenUrl, openHandler, ResultList } from './ResultList';

/** Seconds spent writing, shown from 2 s on. Uses the performance clock, so no wall-clock read. */
function Elapsed() {
  const [start] = useState(() => performance.now());
  const [s, setS] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setS(Math.floor((performance.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [start]);
  return s >= 2 ? <span className="elapsed">· {s} s</span> : null;
}

/** The final layout with flat grey bars, so nothing jumps when rows arrive. */
function AskingCard() {
  return (
    <article className="card2" aria-busy="true">
      <div className="bars" aria-hidden="true">
        <span className="bar" style={{ width: '92%' }} />
        <span className="bar" style={{ width: '64%' }} />
      </div>
      <div className="read" aria-hidden="true">
        <span className="bar" style={{ width: '58%', height: 10 }} />
      </div>
      <ol className="rows" aria-hidden="true">
        {[70, 55, 62].map((w) => (
          <li key={w}>
            <div className="row">
              <span className="rank bar" style={{ width: 20, height: 20 }} />
              <span className="tx" style={{ display: 'grid', gap: 6 }}>
                <span className="bar" style={{ width: `${w}%` }} />
                <span className="bar" style={{ width: '40%', height: 8 }} />
              </span>
            </div>
          </li>
        ))}
      </ol>
    </article>
  );
}

export function AnswerCard(props: {
  exchange: Exchange;
  tz: string;
  nowMs: number;
  latest: boolean;
  showDiag: boolean;
  onToggleRows: () => void;
  onToggleMore: () => void;
  onToggleDiag: () => void;
  onOpen: OpenUrl;
}) {
  const { exchange, tz, nowMs, latest, showDiag, onToggleRows, onToggleMore, onToggleDiag, onOpen } = props;
  const { card } = exchange;
  if (card.phase !== 'writing' && card.phase !== 'answered') return card.phase === 'asking' ? <AskingCard /> : null;

  const { ask } = card;
  const results = ask.results;
  const cited = card.phase === 'answered' ? card.answer.cited : [];
  const rankOf = new Map(results.map((r, i) => [r.id, i + 1]));
  const citedRanks = cited.map((id) => rankOf.get(id)).filter((n): n is number => n !== undefined);
  const fold = latest ? null : { open: exchange.rowsOpen, count: results.length, onToggle: onToggleRows };
  const rowsShown = fold ? fold.open : true;

  return (
    <article className="card2" aria-busy={card.phase === 'writing'}>
      {card.phase === 'writing' ? (
        <div className="writing">
          <span>Writing an answer</span>
          <Elapsed />
        </div>
      ) : (
        <>
          <p className={latest ? 'ans' : 'ans clamp'}>
            {answerSegments(card.answer, results).map((seg, i) =>
              seg.kind === 'text' ? (
                <span key={i}>{seg.text}</span>
              ) : (
                <a
                  key={i}
                  className="cite"
                  href={seg.result.url}
                  target="_blank"
                  rel="noopener"
                  aria-label={`Source ${seg.rank}: ${rowTitle(seg.result)}`}
                  title={rowTitle(seg.result)}
                  onClick={openHandler(seg.result.url, onOpen)}
                >
                  {seg.rank}
                </a>
              ),
            )}
          </p>
          {card.mode === 'template' && card.reason && (
            <p className="why">
              <InfoIcon />
              {reasonText(card.reason)}
            </p>
          )}
        </>
      )}
      <ReadAs intent={ask.intent} tz={tz} nowMs={nowMs} results={results} citedRanks={citedRanks} fold={fold} />
      {rowsShown && (
        <ResultList results={results} cited={cited} moreOpen={exchange.moreOpen} onToggleMore={onToggleMore} tz={tz} nowMs={nowMs} onOpen={onOpen} />
      )}
      {showDiag && card.phase === 'answered' && (
        <DiagnosticsLine
          mode={card.mode}
          intent={ask.intent}
          timings={ask.timings_ms}
          writeMs={card.writeMs}
          tz={tz}
          open={exchange.diagOpen}
          onToggle={onToggleDiag}
        />
      )}
    </article>
  );
}
