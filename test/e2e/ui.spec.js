import { expect, sendMessage, test } from './fixtures.js';

async function seed(feeds, extensionPage) {
  feeds.set('cnbc-economy', [
    { title: 'Bank of England hikes interest rate as inflation stays high', slug: 'boe', summary: 'The Bank raised rates to 4%.' },
    { title: 'Quiet day for European shares', slug: 'quiet' },
  ]);
  feeds.set('coindesk', [{ title: 'Bitcoin plunges below $59,000 in crypto sell-off', slug: 'btc' }]);
  feeds.set('tbs-economy', [{ title: 'Remittance inflow rises in November', slug: 'remit' }]);
  await sendMessage(extensionPage, { type: 'refresh' });
}

test.describe('dashboard', () => {
  test.beforeEach(async ({ feeds, extensionPage }) => {
    await seed(feeds, extensionPage);
    await extensionPage.reload();
  });

  test('shows the news with priority, category, source and overview', async ({ extensionPage: page }) => {
    await expect(page.locator('.story')).toHaveCount(4);
    const boe = page.locator('.story', { hasText: 'Bank of England hikes' });
    await expect(boe.locator('.pill-breaking')).toBeVisible();
    await expect(boe.locator('.pill-high')).toHaveText('High');
    await expect(boe.locator('.pill-category')).toHaveText('Central Banks & Interest Rates');
    await expect(boe.locator('.source')).toHaveText('CNBC');
    await expect(boe.locator('.why')).toContainText('hikes interest rate');
    await expect(boe.getByRole('link')).toHaveAttribute('href', 'https://news.test/boe');
    await expect(boe.getByRole('link')).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(page.locator('.breaking-strip')).toContainText('Bank of England hikes');
    await expect(page.locator('.top-card').first()).toBeVisible();
    await expect(page.locator('#refresh-status')).toContainText('Updated');
    await expect(page.locator('.kpi').first()).toContainText('4');
  });

  test('filters by view, category, source and search', async ({ extensionPage: page }) => {
    await page.getByRole('button', { name: /High priority/ }).click();
    await expect(page.locator('.story')).toHaveCount(2);

    await page.getByRole('button', { name: /All news/ }).click();
    await page.locator('#categories').getByRole('button', { name: /Bangladesh Economy/ }).click();
    await expect(page.locator('.story')).toHaveCount(1);
    await expect(page.locator('.story')).toContainText('Remittance');
    await page.locator('.chip', { hasText: 'Bangladesh Economy' }).click();

    await page.selectOption('#source', 'CoinDesk');
    await expect(page.locator('.story')).toHaveCount(1);
    await page.selectOption('#source', '');

    await page.fill('#search', 'european shares');
    await expect(page.locator('.story')).toHaveCount(1);
    await page.fill('#search', 'nothing matches this');
    await expect(page.getByText('No stories match these filters')).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page.locator('.story')).toHaveCount(4);
  });

  test('bookmarks survive a reload and can be removed', async ({ extensionPage: page }) => {
    const story = page.locator('.story', { hasText: 'Quiet day' });
    await story.getByRole('button', { name: 'Bookmark this story' }).click();
    await page.reload();
    await page.getByRole('button', { name: /Bookmarks/ }).click();
    await expect(page.locator('.story')).toHaveCount(1);
    await page.getByRole('button', { name: 'Remove bookmark' }).click();
    await expect(page.getByText('No bookmarks yet')).toBeVisible();
  });

  test('theme and notification toggles are saved', async ({ extensionPage: page, serviceWorker }) => {
    await page.getByRole('button', { name: 'Switch to light theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.getByRole('button', { name: /Notifications are on/ }).click();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    const settings = await serviceWorker.evaluate(async () => (await chrome.storage.local.get('settings')).settings);
    expect(settings).toMatchObject({ theme: 'light', notificationsEnabled: false });
  });

  test('the refresh button fetches and reports the result', async ({ feeds, extensionPage: page }) => {
    feeds.set('fed', [{ title: 'Federal Reserve issues FOMC statement', slug: 'fomc' }]);
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(page.locator('#toast')).toContainText('1 new story');
    await expect(page.locator('.story', { hasText: 'FOMC statement' })).toBeVisible();
  });
});

test('dashboard shows an empty state before the first refresh', async ({ extensionPage: page }) => {
  await expect(page.getByText('No news yet')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh now' })).toBeVisible();
});

test('the popup lists important stories', async ({ feeds, extensionPage, page, extensionUrl }) => {
  await seed(feeds, extensionPage);
  await page.goto(extensionUrl('src/ui/popup/popup.html'));
  await expect(page.locator('.item')).toHaveCount(2);
  await expect(page.locator('.item').first()).toContainText('Breaking');
  await expect(page.locator('#status')).toContainText('Updated');
});

test.describe('settings', () => {
  test.beforeEach(async ({ page, extensionUrl }) => {
    await page.goto(extensionUrl('src/ui/options/options.html'));
  });

  test('saves valid settings and reschedules the alarm', async ({ page, serviceWorker }) => {
    await expect(page.locator('#savebar')).not.toHaveClass(/show/);
    await page.fill('#refreshMinutes', '30');
    await page.selectOption('#notifyMode', 'digest');
    await page.locator('#enabledCategories').getByText('Cryptocurrency').click();
    await expect(page.locator('#savebar')).toHaveClass(/show/);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.locator('#toast')).toHaveText('Settings saved.');

    const settings = await serviceWorker.evaluate(async () => (await chrome.storage.local.get('settings')).settings);
    expect(settings).toMatchObject({ refreshMinutes: 30, notifyMode: 'digest' });
    expect(settings.enabledCategories.crypto).toBe(false);
    await expect.poll(() => serviceWorker.evaluate(async () => (await chrome.alarms.get('refresh')).periodInMinutes)).toBe(30);

    await page.reload();
    await expect(page.locator('#refreshMinutes')).toHaveValue('30');
  });

  test('shows errors and does not save invalid values', async ({ page, serviceWorker }) => {
    await page.fill('#refreshMinutes', '2');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.locator('[data-for="refreshMinutes"]')).toHaveText('Must be a whole number from 5 to 120.');
    await expect(page.locator('#refreshMinutes')).toHaveAttribute('aria-invalid', 'true');
    const settings = await serviceWorker.evaluate(async () => (await chrome.storage.local.get('settings')).settings);
    expect(settings.refreshMinutes).toBe(15);
    await page.getByRole('button', { name: 'Undo changes' }).click();
    await expect(page.locator('#refreshMinutes')).toHaveValue('15');
  });

  test('adds custom keywords', async ({ page, serviceWorker }) => {
    await page.fill('#keyword-term', 'Nvidia');
    await page.fill('#keyword-weight', '5');
    await page.locator('label.switch', { hasText: 'Always alert' }).click();
    await page.getByRole('button', { name: 'Add keyword' }).click();
    await expect(page.locator('.keyword')).toContainText('nvidia');
    await page.fill('#keyword-term', 'NVIDIA');
    await page.getByRole('button', { name: 'Add keyword' }).click();
    await expect(page.locator('[data-for="customKeywords"]')).toContainText('already in the list');
    await page.getByRole('button', { name: 'Save changes' }).click();
    const settings = await serviceWorker.evaluate(async () => (await chrome.storage.local.get('settings')).settings);
    expect(settings.customKeywords).toEqual([{ term: 'nvidia', weight: 5, alwaysNotify: true }]);
  });

  test('turns a feed off and tests one', async ({ feeds, page, serviceWorker }) => {
    feeds.set('fed', [{ title: 'Federal Reserve issues FOMC statement', slug: 'fomc' }]);
    const fed = page.locator('.feed', { hasText: 'Federal Reserve Press Releases' });
    await fed.getByRole('button', { name: 'Test' }).click();
    await expect(page.locator('.test-result')).toContainText('Works: HTTP 200, 1 item');
    await fed.locator('label.switch').click();
    await expect(fed).toHaveClass(/is-off/);
    const stored = await serviceWorker.evaluate(async () => (await chrome.storage.local.get('feeds')).feeds);
    expect(stored.find((feed) => feed.id === 'fed').enabled).toBe(false);
  });

  test('refuses an invalid feed address', async ({ page }) => {
    await page.fill('#feed-url', 'not a url');
    await page.fill('#feed-name', 'Bad');
    await page.getByRole('button', { name: 'Test and add' }).click();
    await expect(page.locator('#feed-error')).toHaveText('Enter a full http:// or https:// feed address.');
  });
});
