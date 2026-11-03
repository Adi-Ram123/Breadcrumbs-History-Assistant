import { afterEach, describe, expect, it, vi } from 'vitest';
import { getHealth, postAnswer, postAsk, postIngest } from '../lib/api/client';

afterEach(() => vi.unstubAllGlobals());

describe('api client', () => {
  it('getHealth returns null when fetch rejects', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
    await expect(getHealth()).resolves.toBeNull();
  });
  it('getHealth returns null on a non-2xx response', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('nope', { status: 500 })));
    await expect(getHealth()).resolves.toBeNull();
  });
  it('postIngest reports failed when the backend is offline', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
    await expect(postIngest([])).resolves.toBe('failed');
  });
  it('postIngest reports rejected on a 4xx and failed on a 5xx', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('bad', { status: 422 })));
    await expect(postIngest([])).resolves.toBe('rejected');
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('busy', { status: 500 })));
    await expect(postIngest([])).resolves.toBe('failed');
  });
  it('postIngest reports ok on 2xx', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('{"ids":[]}', { status: 200 })));
    await expect(postIngest([])).resolves.toBe('ok');
  });
});

describe('postAsk and postAnswer', () => {
  const json = (body: unknown, status = 200) => () => Promise.resolve(new Response(JSON.stringify(body), { status }));

  it('postAsk returns ok with data on 200', async () => {
    vi.stubGlobal('fetch', json({ ask_id: 'a_1', mode: 'results' }));
    await expect(postAsk('q', 'America/Chicago')).resolves.toEqual({ status: 'ok', data: { ask_id: 'a_1', mode: 'results' } });
  });
  it('postAsk maps a rejected fetch to offline', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
    await expect(postAsk('q', 'America/Chicago')).resolves.toEqual({ status: 'offline' });
  });
  it('postAsk maps 5xx to offline', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('boom', { status: 500 })));
    await expect(postAsk('q', 'America/Chicago')).resolves.toEqual({ status: 'offline' });
  });
  it('postAsk maps 422 to rejected with the first detail msg', async () => {
    vi.stubGlobal('fetch', json({ detail: [{ msg: 'Value error, unknown timezone: Mars/Base' }] }, 422));
    await expect(postAsk('q', 'Mars/Base')).resolves.toEqual({ status: 'rejected', detail: 'Value error, unknown timezone: Mars/Base' });
  });
  it('postAsk maps 400 with a string detail to rejected', async () => {
    vi.stubGlobal('fetch', json({ detail: 'bad' }, 400));
    await expect(postAsk('q', 'UTC')).resolves.toEqual({ status: 'rejected', detail: 'bad' });
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('<html>', { status: 400 })));
    await expect(postAsk('q', 'UTC')).resolves.toEqual({ status: 'rejected', detail: 'HTTP 400' });
  });
  it('postAnswer maps 404 to not_found', async () => {
    vi.stubGlobal('fetch', json({ detail: 'ask not found or expired' }, 404));
    await expect(postAnswer('a_x')).resolves.toEqual({ status: 'not_found' });
  });
  it('postAnswer maps an aborted signal to aborted', async () => {
    const ac = new AbortController();
    ac.abort();
    vi.stubGlobal('fetch', () => Promise.reject(new DOMException('x', 'AbortError')));
    await expect(postAnswer('a_x', ac.signal)).resolves.toEqual({ status: 'aborted' });
  });
  it('postAsk and postAnswer never throw', async () => {
    vi.stubGlobal('fetch', () => {
      throw new Error('sync throw');
    });
    await expect(postAsk('q', 'UTC')).resolves.toEqual({ status: 'offline' });
    vi.stubGlobal('fetch', () => Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new SyntaxError('bad json')) }));
    await expect(postAnswer('a_x')).resolves.toEqual({ status: 'offline' });
  });
});
