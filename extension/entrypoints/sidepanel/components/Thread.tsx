import { useLayoutEffect, useRef, useState } from 'react';
import type { Exchange } from '../../../lib/thread';
import { DownIcon } from './Icons';

const BOTTOM_TOLERANCE = 24;

/**
 * The conversation. Sending scrolls the new question to the top; otherwise nothing
 * pulls the reader down, and "Latest answer" appears while they are away from the bottom.
 */
export function Thread(props: {
  exchanges: Exchange[];
  renderCard: (e: Exchange, latest: boolean) => React.ReactNode;
  empty: React.ReactNode;
  overlay?: React.ReactNode;
}) {
  const { exchanges, renderCard, empty, overlay } = props;
  const scroller = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [viewH, setViewH] = useState(0);
  const [atBottom, setAtBottom] = useState(true);
  const lastId = exchanges.at(-1)?.id;

  const measure = () => {
    const el = scroller.current;
    if (!el) return;
    setViewH(el.clientHeight);
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_TOLERANCE);
  };

  useLayoutEffect(() => {
    const ro = new ResizeObserver(measure);
    if (scroller.current) ro.observe(scroller.current);
    if (content.current) ro.observe(content.current);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (lastId === undefined || !el) return;
    const q = el.querySelector<HTMLElement>(`[data-xid="${lastId}"]`);
    if (!q) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ top: Math.max(q.offsetTop - 4, 0), behavior: reduce ? 'instant' : 'smooth' });
  }, [lastId]);

  const toBottom = () => {
    const el = scroller.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ top: el.scrollHeight, behavior: reduce ? 'instant' : 'smooth' });
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <main ref={scroller} className="thread relative" aria-label="Conversation" onScroll={measure}>
        <div ref={content}>
          {exchanges.length === 0
            ? empty
            : exchanges.map((e, i) => {
                const latest = i === exchanges.length - 1;
                return (
                  <div
                    key={e.id}
                    className="xg"
                    data-xid={e.id}
                    // Room below the newest question, so it can sit at the top while its answer arrives.
                    style={latest && viewH > 0 ? { minHeight: viewH - 16 } : undefined}
                  >
                    <h2 className="q">{e.question}</h2>
                    {renderCard(e, latest)}
                  </div>
                );
              })}
        </div>
      </main>
      {overlay ??
        (!atBottom && exchanges.length > 0 && (
          <button type="button" className="jump" style={{ bottom: 12 }} onClick={toBottom}>
            <DownIcon />
            Latest answer
          </button>
        ))}
    </div>
  );
}
