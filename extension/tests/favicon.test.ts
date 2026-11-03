import { describe, expect, it } from 'vitest';
import { faviconUrl } from '../lib/favicon';

describe('faviconUrl', () => {
  it("uses Chrome's local favicon cache", () => {
    expect(faviconUrl('https://www.kayak.com/a?b=1', (p) => `chrome-extension://id${p}`))
      .toBe('chrome-extension://id/_favicon/?pageUrl=https%3A%2F%2Fwww.kayak.com%2Fa%3Fb%3D1&size=32');
  });
});
