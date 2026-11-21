import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../../src/config/settings.js';
import { SUMMARY_PREFIX, createNotificationService } from '../../src/services/notification-service.js';
import { createStorageService } from '../../src/services/storage-service.js';
import { createFakeNotifications, createFakeTabs, fakeRuntime } from '../helpers/fake-chrome.js';
import { createFakeStorageArea } from '../helpers/fake-storage-area.js';

const NOW = Date.UTC(2026, 10, 21, 8, 0, 0);
const article = (id, overrides = {}) => ({
  id, title: `Headline ${id}`, url: `https://news.test/${id}`, source: 'CNBC', category: 'central-banks',
  priority: 'high', score: 12, breaking: false, publishedAt: NOW - 60_000, alertKeywords: [], alsoReportedBy: [], ...overrides,
});

function setup(stored = {}) {
  const notifications = createFakeNotifications();
  const tabs = createFakeTabs();
  const storage = createStorageService(createFakeStorageArea(stored));
  const service = createNotificationService({ notifications, tabs, runtime: fakeRuntime, storage, now: () => NOW });
  return { notifications, tabs, service };
}

describe('notification service', () => {
  it('shows the headline with priority, category and source, using the article id', async () => {
    const { notifications, service } = setup();
    const result = await service.notify([article('a_1', { alsoReportedBy: ['BBC', 'FXStreet'] })], DEFAULT_SETTINGS, {}, NOW);
    assert.deepEqual(result, { ids: ['a_1'], shown: 1 });
    assert.deepEqual(notifications.shown.get('a_1'), {
      type: 'basic',
      iconUrl: 'chrome-extension://ext/icons/icon128.png',
      title: 'High priority · Central Banks & Interest Rates',
      message: 'Headline a_1',
      contextMessage: 'CNBC + 2 more',
      priority: 1,
    });
  });

  it('labels breaking news and raises its priority', async () => {
    const { notifications, service } = setup();
    await service.notify([article('a_1', { breaking: true })], DEFAULT_SETTINGS, {}, NOW);
    assert.equal(notifications.shown.get('a_1').title, 'Breaking · Central Banks & Interest Rates');
    assert.equal(notifications.shown.get('a_1').priority, 2);
  });

  it('adds one summary for stories over the limit', async () => {
    const { notifications, service } = setup();
    const list = Array.from({ length: 7 }, (_, i) => article(`a_${i}`, { score: 20 - i }));
    const result = await service.notify(list, DEFAULT_SETTINGS, {}, NOW);
    assert.equal(result.shown, 4);
    assert.equal(result.ids.length, 7);
    const summary = notifications.shown.get(`${SUMMARY_PREFIX}${NOW}`);
    assert.equal(summary.title, '4 more important stories');
    assert.equal(summary.message, '• Headline a_3\n• Headline a_4\n• Headline a_5\nand 1 more');
  });

  it('shows nothing when nothing qualifies', async () => {
    const { notifications, service } = setup();
    assert.deepEqual(await service.notify([article('a_1', { priority: 'low' })], DEFAULT_SETTINGS, {}, NOW), { ids: [], shown: 0 });
    assert.equal(notifications.shown.size, 0);
  });

  describe('clicks', () => {
    it('open the stored article and clear the notification', async () => {
      const { tabs, notifications, service } = setup({ articles: [article('a_1')] });
      assert.equal(await service.handleClick('a_1'), 'https://news.test/a_1');
      assert.deepEqual(tabs.opened, ['https://news.test/a_1']);
      assert.deepEqual(notifications.cleared, ['a_1']);
    });

    it('find bookmarked articles that were pruned from the feed', async () => {
      const { tabs, service } = setup({ articles: [], bookmarks: [article('a_9')] });
      await service.handleClick('a_9');
      assert.deepEqual(tabs.opened, ['https://news.test/a_9']);
    });

    it('never open an unsafe or missing link', async () => {
      const { tabs, service } = setup({ articles: [article('a_1', { url: 'javascript:alert(1)' })] });
      assert.equal(await service.handleClick('a_1'), null);
      assert.equal(await service.handleClick('a_missing'), null);
      assert.deepEqual(tabs.opened, []);
    });

    it('open the dashboard for a summary', async () => {
      const { tabs, service } = setup();
      await service.handleClick(`${SUMMARY_PREFIX}${NOW}`);
      assert.deepEqual(tabs.opened, ['chrome-extension://ext/src/ui/dashboard/dashboard.html']);
    });
  });

  it('shows a test notification', async () => {
    const { notifications, service } = setup();
    const id = await service.showTest();
    assert.ok(id.startsWith(SUMMARY_PREFIX));
    assert.equal(notifications.shown.get(id).title, 'MarketPulse notifications are working');
  });
});
