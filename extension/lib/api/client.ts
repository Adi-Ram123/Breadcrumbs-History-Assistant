import type { components } from './schema';

export const API_BASE = 'http://localhost:8000';

type Schemas = components['schemas'];
export type HealthResponse = Schemas['HealthResponse'];
export type IngestEntry = Schemas['IngestEntry'];
export type AskResponse = Schemas['AskResponse'];
export type AnswerResponse = Schemas['AnswerResponse'];
export type Intent = Schemas['Intent'];
export type Result = Schemas['Result'];
export type Answer = Schemas['Answer'];
export type WindowCounts = Schemas['WindowCounts'];

/**
 * ok: the backend answered. offline: no connection, a 5xx, or a body that isn't JSON.
 * rejected: a 4xx other than 404, with the backend's reason. not_found: 404.
 * aborted: the caller's signal stopped the request.
 */
export type ApiResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'offline' }
  | { status: 'rejected'; detail: string }
  | { status: 'not_found' }
  | { status: 'aborted' };

/** FastAPI puts a string in `detail`, or a list of validation errors with `msg`. */
async function rejectionDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: unknown };
    if (typeof body.detail === 'string') return body.detail;
    if (Array.isArray(body.detail) && typeof body.detail[0]?.msg === 'string') return body.detail[0].msg;
  } catch {
    // not JSON: fall through
  }
  return `HTTP ${res.status}`;
}

async function request<T>(path: string, body: unknown, signal?: AbortSignal): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    if (res.ok) return { status: 'ok', data: (await res.json()) as T };
    if (res.status === 404) return { status: 'not_found' };
    if (res.status >= 400 && res.status < 500) return { status: 'rejected', detail: await rejectionDetail(res) };
    return { status: 'offline' };
  } catch (e) {
    if (signal?.aborted || (e instanceof DOMException && e.name === 'AbortError')) return { status: 'aborted' };
    return { status: 'offline' };
  }
}

/** Parse and fetch rows for a question. Never throws. */
export function postAsk(question: string, tz: string): Promise<ApiResult<AskResponse>> {
  return request<AskResponse>('/ask', { question, tz });
}

/** Write the answer sentence for an earlier ask. Abort `signal` to stop it. Never throws. */
export function postAnswer(askId: string, signal?: AbortSignal): Promise<ApiResult<AnswerResponse>> {
  return request<AnswerResponse>('/answer', { ask_id: askId }, signal);
}

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
