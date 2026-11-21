import { expect, test } from './fixtures.js';

test('seeds storage with defaults on install', async ({ serviceWorker }) => {
  const stored = await serviceWorker.evaluate(() => chrome.storage.local.get(null));
  expect(stored.schemaVersion).toBe(1);
  expect(stored.settings.refreshMinutes).toBe(15);
  expect(stored.feeds).toHaveLength(24);
});

test('popup opens the dashboard', async ({ context, page, extensionUrl }) => {
  await page.goto(extensionUrl('src/ui/popup/popup.html'));
  await expect(page.getByRole('heading', { name: 'MarketPulse' })).toBeVisible();
  const [dashboard] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('button', { name: 'Open dashboard' }).click(),
  ]);
  await expect(dashboard).toHaveURL(/src\/ui\/dashboard\/dashboard\.html$/);
});
