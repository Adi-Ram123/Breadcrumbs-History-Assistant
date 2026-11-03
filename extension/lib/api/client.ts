import type { components } from './schema';

export const API_BASE = 'http://localhost:8000';

export type HealthResponse = components['schemas']['HealthResponse'];
export type IngestEntry = components['schemas']['IngestEntry'];

/** Backend health, or null when the backend is offline or unhealthy. Never throws. */
export async function getHealth(): Promise<HealthResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/health`);
    return res.ok ? ((await res.json()) as HealthResponse) : null;
  } catch {
    return null;
  }
}

/** ok: stored. rejected: the backend refused the input (4xx), don't retry it. failed: offline or 5xx, retry later. */
export type PostResult = 'ok' | 'rejected' | 'failed';

/** POST entries to /ingest. Never throws. */
export async function postIngest(entries: IngestEntry[]): Promise<PostResult> {
  try {
    const res = await fetch(`${API_BASE}/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries }),
    });
    if (res.ok) return 'ok';
    return res.status >= 400 && res.status < 500 ? 'rejected' : 'failed';
  } catch {
    return 'failed';
  }
}
