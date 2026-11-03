import { useLayoutEffect, useRef, useState } from 'react';
import { buildTrail, type TrailInput } from '../../../lib/trail';

type Input = Omit<TrailInput, 'widthPx'>;

/** The time trail, or nothing for ranges longer than 7 days and for no range. */
export function Trail({ input }: { input: Input }) {
  if (buildTrail({ ...input, widthPx: 100 }) === null) return null;
  return <TrailBody input={input} />;
}

/** Measures its own width, then draws what lib/trail.ts lays out. */
function TrailBody({ input }: { input: Input }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const trail = width > 0 ? buildTrail({ ...input, widthPx: width }) : null;

  return (
    <div ref={ref} style={{ minHeight: 44 }}>
      {trail && (
        <>
          <div className="track" role="img" aria-label={trail.ariaLabel}>
            {trail.marks.map((m) => (
              <span
                key={`${m.cited}-${m.ranks.join('-')}`}
                className={`tick${m.width === 4 ? ' wide' : ''}${m.cited ? '' : ' grey'}`}
                style={{ left: m.x }}
              />
            ))}
            {trail.marks
              .filter((m) => m.label)
              .map((m) => (
                <span key={`l-${m.ranks.join('-')}`} className={`tlab a-${m.anchor}`} style={{ left: m.x }}>
                  {m.label}
                </span>
              ))}
            {trail.empty && (
              <span className="tlab grey a-middle" style={{ left: '50%' }}>
                {trail.empty}
              </span>
            )}
          </div>
          <div className="axis" aria-hidden="true">
            {trail.labels.map((l) => (
              <span key={`${l.text}-${l.x}`} className={`a-${l.anchor}${l.minor ? ' minor' : ''}`} style={{ left: l.x }}>
                {l.short ? (
                  <>
                    <span className="long">{l.text}</span>
                    <span className="short">{l.short}</span>
                  </>
                ) : (
                  l.text
                )}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
