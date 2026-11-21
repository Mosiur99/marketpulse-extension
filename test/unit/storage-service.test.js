import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_FEEDS } from '../../src/config/feeds.js';
import { DEFAULT_SETTINGS } from '../../src/config/settings.js';
import { SCHEMA_VERSION, STORAGE_KEYS, createStorageService } from '../../src/services/storage-service.js';
import { createFakeStorageArea } from '../helpers/fake-storage-area.js';

const customFeed = { id: 'custom', name: 'Custom', source: 'Custom', url: 'https://example.com/rss', categoryHint: 'crypto', enabled: true, weight: 1 };

describe('storage service', () => {
  describe('initialize', () => {
    it('seeds every key on a fresh install', async () => {
      const area = createFakeStorageArea();
      const { seeded } = await createStorageService(area).initialize();
      assert.deepEqual(seeded, STORAGE_KEYS);
      assert.deepEqual(area.data.settings, DEFAULT_SETTINGS);
      assert.deepEqual(area.data.feeds, DEFAULT_FEEDS);
      assert.deepEqual(area.data.articles, []);
      assert.equal(area.data.schemaVersion, SCHEMA_VERSION);
      assert.equal(area.writes.length, 1);
    });

    it('keeps existing user data on update', async () => {
      const area = createFakeStorageArea({
        settings: { ...DEFAULT_SETTINGS, refreshMinutes: 30 },
        feeds: [customFeed],
        bookmarks: [{ id: 'a_1' }],
      });
      const { seeded } = await createStorageService(area).initialize();
      assert.equal(area.data.settings.refreshMinutes, 30);
      assert.deepEqual(area.data.feeds, [customFeed]);
      assert.deepEqual(area.data.bookmarks, [{ id: 'a_1' }]);
      assert.ok(!seeded.includes('settings') && !seeded.includes('feeds'));
    });

    it('repairs invalid stored settings and drops invalid or duplicate feeds', async () => {
      const area = createFakeStorageArea({
        settings: { refreshMinutes: -1, theme: 'light', removedOption: true },
        feeds: [customFeed, { ...customFeed }, { id: 'bad', url: 'javascript:alert(1)' }],
      });
      await createStorageService(area).initialize();
      assert.equal(area.data.settings.refreshMinutes, 15);
      assert.equal(area.data.settings.theme, 'light');
      assert.equal('removedOption' in area.data.settings, false);
      assert.deepEqual(area.data.feeds, [customFeed]);
    });

    it('falls back to default feeds when stored feeds are not a list', async () => {
      const area = createFakeStorageArea({ feeds: 'broken' });
      await createStorageService(area).initialize();
      assert.deepEqual(area.data.feeds, DEFAULT_FEEDS);
    });
  });

  describe('read and write', () => {
    it('returns a default copy for keys not stored yet', async () => {
      const storage = createStorageService(createFakeStorageArea());
      const articles = await storage.read('articles');
      articles.push('changed');
      assert.deepEqual(await storage.read('articles'), []);
      assert.deepEqual(await storage.read('meta'), { lastRefreshAt: null, lastRefreshResult: null });
    });

    it('writes and reads back known keys', async () => {
      const storage = createStorageService(createFakeStorageArea());
      await storage.write({ notified: { a_1: 5 } });
      assert.deepEqual(await storage.read('notified'), { a_1: 5 });
    });

    it('rejects unknown keys', async () => {
      const storage = createStorageService(createFakeStorageArea());
      await assert.rejects(storage.read('nope'), /Unknown storage key: nope/);
      await assert.rejects(storage.write({ nope: 1 }), /Unknown storage key: nope/);
    });
  });

  describe('settings', () => {
    it('returns validated settings', async () => {
      const storage = createStorageService(createFakeStorageArea({ settings: { refreshMinutes: 0 } }));
      assert.equal((await storage.getSettings()).refreshMinutes, 15);
    });

    it('saves valid settings', async () => {
      const area = createFakeStorageArea();
      const result = await createStorageService(area).saveSettings({ ...DEFAULT_SETTINGS, theme: 'light' });
      assert.equal(result.ok, true);
      assert.equal(area.data.settings.theme, 'light');
    });

    it('does not save when any field is invalid', async () => {
      const area = createFakeStorageArea();
      const result = await createStorageService(area).saveSettings({ theme: 'light', refreshMinutes: 2 });
      assert.equal(result.ok, false);
      assert.deepEqual(result.errors.map((error) => error.field), ['refreshMinutes']);
      assert.equal(area.writes.length, 0);
    });
  });

  describe('feeds', () => {
    it('returns the default feeds before anything is saved', async () => {
      const storage = createStorageService(createFakeStorageArea());
      assert.deepEqual(await storage.getFeeds(), DEFAULT_FEEDS);
    });

    it('saves a valid list', async () => {
      const area = createFakeStorageArea();
      const result = await createStorageService(area).saveFeeds([customFeed]);
      assert.equal(result.ok, true);
      assert.deepEqual(area.data.feeds, [customFeed]);
    });

    it('reports errors with the feed position and does not save', async () => {
      const area = createFakeStorageArea();
      const result = await createStorageService(area).saveFeeds([customFeed, { ...customFeed, url: 'nope' }, { ...customFeed }]);
      assert.equal(result.ok, false);
      assert.deepEqual(result.errors.map((error) => error.field), ['feeds[1].url', 'feeds[1].id', 'feeds[2].id']);
      assert.equal(area.writes.length, 0);
    });

    it('rejects a value that is not a list', async () => {
      const result = await createStorageService(createFakeStorageArea()).saveFeeds({});
      assert.equal(result.ok, false);
    });
  });
});
