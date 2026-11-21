import { test as base, chromium } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_FEEDS } from '../../src/config/feeds.js';

const extensionPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const live = process.env.LIVE === '1';

export function rss(items) {
  const entries = items.map(({ title, slug, minutesAgo = 5, summary = '' }) => `
    <item><title>${title}</title><link>https://news.test/${slug}</link>
    <description>${summary}</description><pubDate>${new Date(Date.now() - minutesAgo * 60_000).toUTCString()}</pubDate></item>`);
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>Test</title>${entries.join('')}</channel></rss>`;
}

/** Serves generated feeds for every default feed URL so tests never touch the real sites. */
class FeedServer {
  constructor() {
    this.responses = new Map(DEFAULT_FEEDS.map((feed) => [feed.url, { status: 200, body: rss([]) }]));
  }

  set(feedId, items, status = 200) {
    const feed = DEFAULT_FEEDS.find((candidate) => candidate.id === feedId);
    this.responses.set(feed.url, { status, body: status === 200 ? rss(items) : 'error' });
  }

  async attach(context) {
    await context.route(/^https?:\/\//, (route) => {
      const response = this.responses.get(route.request().url());
      if (!response) return route.abort();
      return route.fulfill({ status: response.status, contentType: 'application/rss+xml', body: response.body });
    });
  }
}

export const test = base.extend({
  feeds: async ({}, use) => {
    await use(new FeedServer());
  },
  context: async ({ feeds }, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    if (!live) await feeds.attach(context);
    await use(context);
    await context.close();
  },
  serviceWorker: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    if (!live) {
      await worker.evaluate(async () => {
        for (let i = 0; i < 100; i += 1) {
          const { meta } = await chrome.storage.local.get('meta');
          if (meta?.lastRefreshAt) break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        await chrome.storage.local.set({ articles: [], notified: {}, feedState: {}, meta: { lastRefreshAt: null, lastRefreshResult: null } });
      });
    }
    await use(worker);
  },
  extensionUrl: async ({ serviceWorker }, use) => {
    const extensionId = new URL(serviceWorker.url()).host;
    await use((path) => `chrome-extension://${extensionId}/${path}`);
  },
  extensionPage: async ({ page, extensionUrl }, use) => {
    await page.goto(extensionUrl('src/ui/dashboard/dashboard.html'));
    await use(page);
  },
});

export async function sendMessage(page, message) {
  return page.evaluate((payload) => chrome.runtime.sendMessage(payload), message);
}

export async function readStorage(worker, key) {
  return worker.evaluate(async (name) => (await chrome.storage.local.get(name))[name], key);
}

export { expect } from '@playwright/test';
