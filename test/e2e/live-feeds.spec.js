import { expect, test } from './fixtures.js';

// These sites refuse automated (headless) browsers with 403; a normal Chrome profile can read them.
const BLOCKS_HEADLESS = new Set(['fxstreet', 'boe']);

test.describe('@live real feeds in Chrome', () => {
  test('every default feed downloads and parses through the extension permissions', async ({ page, extensionUrl }) => {
    await page.goto(extensionUrl('src/ui/dashboard/dashboard.html'));
    const results = await page.evaluate(async () => {
      const { DEFAULT_FEEDS } = await import('/src/config/feeds.js');
      const { createFeedFetcher } = await import('/src/services/feed-fetcher.js');
      const fetcher = createFeedFetcher();
      return Promise.all(DEFAULT_FEEDS.map(async (feed) => ({ id: feed.id, ...(await fetcher.testFeed(feed)) })));
    });
    for (const result of results) {
      console.log(`${result.ok ? 'ok  ' : 'FAIL'} ${result.id.padEnd(22)} ${String(result.httpStatus).padEnd(4)} ${String(result.itemCount ?? '').padStart(3)} items ${String(result.durationMs).padStart(5)} ms  ${result.error ?? result.sampleTitle}`);
    }
    const unexpected = results.filter((result) => !result.ok && !(BLOCKS_HEADLESS.has(result.id) && result.httpStatus === 403));
    expect(unexpected).toEqual([]);
  });

  test('a site without granted permission is blocked', async ({ page, extensionUrl }) => {
    await page.goto(extensionUrl('src/ui/dashboard/dashboard.html'));
    const result = await page.evaluate(async () => {
      const { createFeedFetcher } = await import('/src/services/feed-fetcher.js');
      return createFeedFetcher().testFeed({ id: 'x', source: 'X', url: 'https://example.com/' });
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Could not reach the site/);
  });

  test('the second download of a feed with an ETag gets 304 Not Modified', async ({ page, extensionUrl }) => {
    await page.goto(extensionUrl('src/ui/dashboard/dashboard.html'));
    const statuses = await page.evaluate(async () => {
      const { DEFAULT_FEEDS } = await import('/src/config/feeds.js');
      const { createFeedFetcher } = await import('/src/services/feed-fetcher.js');
      const fetcher = createFeedFetcher();
      const feed = DEFAULT_FEEDS.find((candidate) => candidate.id === 'investing-all');
      const first = await fetcher.fetchFeed(feed);
      const second = await fetcher.fetchFeed(feed, { etag: first.etag, lastModified: first.lastModified });
      return [first.httpStatus, Boolean(first.etag), second.httpStatus];
    });
    expect(statuses).toEqual([200, true, 304]);
  });
});
