import { expect, readStorage, sendMessage, test } from './fixtures.js';

test('schedules the refresh alarm every 15 minutes and follows the setting', async ({ serviceWorker }) => {
  const alarm = await serviceWorker.evaluate(() => chrome.alarms.get('refresh'));
  expect(alarm.periodInMinutes).toBe(15);

  await serviceWorker.evaluate(async () => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...settings, refreshMinutes: 30 } });
  });
  await expect.poll(() => serviceWorker.evaluate(async () => (await chrome.alarms.get('refresh'))?.periodInMinutes)).toBe(30);
});

test('a manual refresh fetches, classifies, dedupes and saves articles', async ({ feeds, serviceWorker, extensionPage }) => {
  feeds.set('cnbc-economy', [
    { title: 'Bank of England hikes interest rate as inflation stays high', slug: 'boe' },
    { title: 'Hong Kong moves to extend crypto licensing rules to brokers, advisers', slug: 'hk1' },
  ]);
  feeds.set('cointelegraph', [{ title: 'Hong Kong pushes to bring crypto custodians, advisers under licensing rules', slug: 'hk2' }]);
  feeds.set('bbc-business', [], 503);

  const response = await sendMessage(extensionPage, { type: 'refresh' });
  expect(response.ok).toBe(true);
  expect(response.summary).toMatchObject({ reason: 'manual', added: 2, duplicates: 1, failed: 1, notified: 0 });

  const articles = await readStorage(serviceWorker, 'articles');
  const boe = articles.find((article) => article.url === 'https://news.test/boe');
  expect(boe).toMatchObject({ category: 'central-banks', priority: 'high', breaking: true, source: 'CNBC' });
  const hk = articles.find((article) => article.url === 'https://news.test/hk1');
  expect(hk.alsoReportedBy).toEqual(['Cointelegraph']);

  const feedState = await readStorage(serviceWorker, 'feedState');
  expect(feedState['bbc-business']).toMatchObject({ failures: 1, lastError: 'The site answered with HTTP 503 (a problem on the site).' });
  expect(feedState['cnbc-economy']).toMatchObject({ failures: 0, lastItemCount: 2 });
});

test('the first refresh is silent; later high-priority news raises one notification each', async ({ feeds, serviceWorker, extensionPage }) => {
  feeds.set('cnbc-top', [{ title: 'Quiet day on Wall Street', slug: 'quiet' }]);
  await sendMessage(extensionPage, { type: 'refresh' });
  expect(await serviceWorker.evaluate(() => chrome.notifications.getAll())).toEqual({});

  feeds.set('cnbc-top', [
    { title: 'Quiet day on Wall Street', slug: 'quiet' },
    { title: 'Federal Reserve issues FOMC statement', slug: 'fomc', minutesAgo: 1 },
  ]);
  const second = await sendMessage(extensionPage, { type: 'refresh' });
  expect(second.summary.notified).toBe(1);
  const shown = Object.keys(await serviceWorker.evaluate(() => chrome.notifications.getAll()));
  expect(shown).toHaveLength(1);
  expect(shown[0]).toMatch(/^a_[0-9a-f]{16}$/);

  const third = await sendMessage(extensionPage, { type: 'refresh' });
  expect(third.summary.notified).toBe(0);
});

test('tests a feed on request and rejects unsafe addresses', async ({ feeds, extensionPage }) => {
  feeds.set('fed', [{ title: 'Federal Reserve issues FOMC statement', slug: 'fomc' }]);
  const good = await sendMessage(extensionPage, { type: 'test-feed', feed: { url: 'https://www.federalreserve.gov/feeds/press_all.xml', name: 'Fed' } });
  expect(good.result).toMatchObject({ ok: true, httpStatus: 200, itemCount: 1, sampleTitle: 'Federal Reserve issues FOMC statement' });

  const bad = await sendMessage(extensionPage, { type: 'test-feed', feed: { url: 'javascript:alert(1)' } });
  expect(bad).toEqual({ ok: false, error: 'Enter a full http:// or https:// feed address.' });
});

test('shows a test notification', async ({ serviceWorker, extensionPage }) => {
  const response = await sendMessage(extensionPage, { type: 'test-notification' });
  expect(response.ok).toBe(true);
  expect(Object.keys(await serviceWorker.evaluate(() => chrome.notifications.getAll()))).toContain(response.id);
});
