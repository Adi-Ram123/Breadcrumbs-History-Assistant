import { useEffect, useRef, useState } from 'react';
import { MarkIcon, MoreIcon, NewIcon, SyncIcon } from './Icons';

/** Mark and name, New chat, and the "⋯" menu with Sync history now and Show diagnostics. */
export function TopBar(props: {
  onNewChat: () => void;
  onSync: () => void;
  syncLabel: string;
  showDiag: boolean;
  onToggleDiag: (on: boolean) => void;
}) {
  const { onNewChat, onSync, syncLabel, showDiag, onToggleDiag } = props;
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const moreBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation(); // Esc closes the menu here, not a running answer
      setOpen(false);
      moreBtn.current?.focus();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <div className="top" ref={wrap}>
      <MarkIcon />
      <h1 className="name">Breadcrumbs</h1>
      <button type="button" className="iconbtn ml-auto" aria-label="New chat" title="New chat" onClick={onNewChat}>
        <NewIcon />
      </button>
      <button
        ref={moreBtn}
        type="button"
        className="iconbtn"
        aria-label="More"
        title="More"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="more-pop"
        onClick={() => setOpen((o) => !o)}
      >
        <MoreIcon />
      </button>
      {open && (
        <div className="menu" id="more-pop">
          <button type="button" className="mi" onClick={onSync}>
            <SyncIcon />
            Sync history now<span className="k">{syncLabel}</span>
          </button>
          <div className="msep" aria-hidden="true" />
          <button
            type="button"
            className="mi"
            role="switch"
            aria-checked={showDiag}
            aria-describedby="diag-note"
            onClick={() => onToggleDiag(!showDiag)}
          >
            <span className="w-4 flex-none" />
            Show diagnostics
            <span className="sw" aria-hidden="true" />
          </button>
          <div className="mnote" id="diag-note">
            Adds how each answer was made: the parsed Intent, LLM or plain, and timings.
          </div>
        </div>
      )}
    </div>
  );
}
