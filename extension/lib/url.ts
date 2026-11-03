// Pure URL helpers used by ingestion. No chrome.* calls, so they are unit tested.
// URL normalization and ids happen in the backend (app/index/urls.py), not here.

const SKIP_PROTOCOLS = new Set(['chrome:', 'chrome-extension:', 'about:', 'file:', 'edge:', 'data:', 'blob:', 'view-source:', 'devtools:']);
const SKIP_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', 'accounts.google.com']);
const GOOGLE_HOST = /(^|\.)google\.[a-z.]+$/;

function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

export function isIngestible(url: string): boolean {
  const u = parse(url);
  if (!u) return false;
  if (SKIP_PROTOCOLS.has(u.protocol)) return false;
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  return !SKIP_HOSTS.has(u.hostname);
}

export function extractGoogleQuery(url: string): string | null {
  const u = parse(url);
  if (!u || !GOOGLE_HOST.test(u.hostname) || u.pathname !== '/search') return null;
  const q = u.searchParams.get('q')?.trim();
  return q ? q : null;
}
