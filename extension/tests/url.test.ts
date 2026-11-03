import { describe, expect, it } from 'vitest';
import { extractGoogleQuery, isIngestible } from '../lib/url';

describe('extractGoogleQuery', () => {
  it('reads q from a Google search URL', () => {
    expect(extractGoogleQuery('https://www.google.com/search?q=cheap+flights&oq=x')).toBe('cheap flights');
  });
  it('works on country domains', () => {
    expect(extractGoogleQuery('https://www.google.co.uk/search?q=ramen')).toBe('ramen');
  });
  it('ignores non-search Google pages', () => {
    expect(extractGoogleQuery('https://www.google.com/maps?q=x')).toBeNull();
  });
  it('ignores blank queries and lookalike hosts', () => {
    expect(extractGoogleQuery('https://www.google.com/search?q=%20')).toBeNull();
    expect(extractGoogleQuery('https://notgoogle.com/search?q=x')).toBeNull();
  });
});

describe('isIngestible', () => {
  it('skips browser-internal and local pages', () => {
    for (const url of ['chrome://settings', 'chrome-extension://abc/x.html', 'about:blank', 'file:///tmp/a.html',
      'edge://flags', 'http://localhost:3000', 'http://127.0.0.1:8000/health', 'https://accounts.google.com/signin']) {
      expect(isIngestible(url), url).toBe(false);
    }
  });
  it('accepts normal pages', () => {
    expect(isIngestible('https://example.com')).toBe(true);
  });
  it('rejects unparseable input', () => {
    expect(isIngestible('not a url')).toBe(false);
  });
});
