import { Readability } from '@mozilla/readability';
import { isIngestible } from '../lib/url';

const MAX_TEXT_CHARS = 100_000;

function mainText(): string | null {
  try {
    const article = new Readability(document.cloneNode(true) as Document).parse();
    const text = article?.textContent?.trim();
    return text ? text.slice(0, MAX_TEXT_CHARS) : null;
  } catch {
    return null; // stored by title only (text_status 'none')
  }
}

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    try {
      if (!isIngestible(location.href)) return;
      // The background worker takes the visit time from Chrome's history, so a reload
      // or restored tab updates the existing entry instead of creating a new one.
      browser.runtime
        .sendMessage({ type: 'page', url: location.href, title: document.title, text: mainText() })
        .catch(() => {});
    } catch {
      // Never break the page we are running on.
    }
  },
});
