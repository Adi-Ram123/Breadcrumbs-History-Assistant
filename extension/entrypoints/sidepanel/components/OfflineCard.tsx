import { useEffect, useState } from 'react';
import { CopyIcon, WarnIcon } from './Icons';

const COMMAND = 'uv run uvicorn app.main:app --app-dir backend';

/** The backend isn't running: say so, give the start command, and offer Try again. */
export function OfflineCard({ onRetry }: { onRetry: () => void }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <article className="card2">
      <div className="err">
        <WarnIcon />
        <div className="min-w-0 flex-1">
          <p>Couldn't reach the Breadcrumbs backend on localhost:8000, so this question wasn't asked. Start it in a terminal from the repo:</p>
          <div className="codebox">
            <code>
              uv run uvicorn app.main:app <span className="whitespace-nowrap">--app-dir</span> backend
            </code>
            <button
              type="button"
              className="copy"
              aria-label={copied ? 'Copied' : 'Copy command'}
              title={copied ? 'Copied' : 'Copy'}
              onClick={() => navigator.clipboard.writeText(COMMAND).then(() => setCopied(true), () => {})}
            >
              {copied ? 'Copied' : <CopyIcon />}
            </button>
          </div>
        </div>
      </div>
      <div className="erractions">
        <button type="button" className="reask" onClick={onRetry}>
          Try again
        </button>
      </div>
    </article>
  );
}
