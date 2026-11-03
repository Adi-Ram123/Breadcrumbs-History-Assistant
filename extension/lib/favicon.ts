/**
 * Favicons from Chrome's own local cache (the `favicon` permission), never from an
 * outside service, so opening the panel sends nothing off the machine.
 */

export function faviconUrl(
  pageUrl: string,
  getURL: (path: string) => string = (path) => browser.runtime.getURL(path as never),
): string {
  return `${getURL('/_favicon/')}?pageUrl=${encodeURIComponent(pageUrl)}&size=32`;
}
