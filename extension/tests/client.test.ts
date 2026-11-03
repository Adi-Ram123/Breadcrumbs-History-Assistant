import { afterEach, describe, expect, it, vi } from 'vitest';
import { getHealth, postIngest } from '../lib/api/client';

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
