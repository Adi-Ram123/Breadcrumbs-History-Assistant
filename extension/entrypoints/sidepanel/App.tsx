import { useEffect, useState } from 'react';
import { getHealth, type HealthResponse } from '../../lib/api/client';

type Status = { state: 'loading' } | { state: 'ok'; health: HealthResponse } | { state: 'offline' };

export default function App() {
  const [status, setStatus] = useState<Status>({ state: 'loading' });

  useEffect(() => {
    // Sync on open: picks up any history the backend missed while it was down.
    browser.runtime.sendMessage({ type: 'sync' }).catch(() => {});
    getHealth().then((health) => setStatus(health ? { state: 'ok', health } : { state: 'offline' }));
  }, []);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 16 }}>
      <h1 style={{ fontSize: 18, margin: '0 0 12px' }}>Breadcrumbs</h1>
      {status.state === 'loading' && <p>Checking backend…</p>}
      {status.state === 'ok' && (
        <p>
          Backend: {status.health.status} · embedder {status.health.embedder_version} · parser {status.health.parser}
        </p>
      )}
      {status.state === 'offline' && (
        <p>
          Backend offline. Start it with: <code>uv run uvicorn app.main:app --app-dir backend</code>
        </p>
      )}
    </main>
  );
}
