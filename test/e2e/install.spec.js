import { expect, test } from './fixtures.js';

test('seeds storage with defaults on install', async ({ serviceWorker }) => {
  await expect.poll(() => serviceWorker.evaluate(async () => {
    const stored = await chrome.storage.local.get(null);
    return {
      schemaVersion: stored.schemaVersion,
      refreshMinutes: stored.settings?.refreshMinutes,
      feeds: stored.feeds?.length,
      articles: stored.articles?.length,
    };
  })).toEqual({ schemaVersion: 1, refreshMinutes: 15, feeds: 25, articles: 0 });
});

test('popup opens the dashboard', async ({ context, page, extensionUrl }) => {
  await page.goto(extensionUrl('src/ui/popup/popup.html'));
  await expect(page.getByRole('heading', { name: 'MarketPulse' })).toBeVisible();
  const [dashboard] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('button', { name: 'Open dashboard' }).click(),
  ]);
  await expect(dashboard).toHaveURL(/src\/ui\/dashboard\/dashboard\.html$/);
  await expect(dashboard.getByRole('heading', { name: 'MarketPulse Dashboard' })).toBeVisible();
});

test('settings page loads', async ({ page, extensionUrl }) => {
  await page.goto(extensionUrl('src/ui/options/options.html'));
  await expect(page.getByRole('heading', { name: 'MarketPulse Settings' })).toBeVisible();
});
