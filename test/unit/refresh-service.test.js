import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../../src/config/settings.js';
import { createRefreshService } from '../../src/services/refresh-service.js';
import { createStorageService } from '../../src/services/storage-service.js';
import { FetchError } from '../../src/services/feed-fetcher.js';
import { createFakeStorageArea } from '../helpers/fake-storage-area.js';

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 21, 8, 0, 0);
const feed = (id, source, overrides = {}) => ({ id, name: source, source, url: `https://${id}.test/rss`, categoryHint: 'stocks', enabled: true, weight: 1, ...overrides });
const FEEDS = [feed('cnbc', 'CNBC'), feed('bbc', 'BBC', { categoryHint: 'global-economy' }), feed('off', 'Off', { enabled: false })];
const item = (title, slug, published = 'Sat, 21 Nov 2026 07:50:00 GMT') => ({ title, link: `https://news.test/${slug}`, summary: '', published, guid: slug });

function setup({ stored = {}, responses = {} } = {}) {
  const area = createFakeStorageArea({ settings: DEFAULT_SETTINGS, feeds: FEEDS, ...stored });
  const storage = createStorageService(area);
  const fetched = [];
  const fetcher = {
    async fetchFeeds(feeds, states, onEach) {
      return feeds.map((f) => {
        fetched.push({ id: f.id, state: states[f.id] });
        const result = responses[f.id] ?? { ok: true, notModified: true, items: [], httpStatus: 304 };
        onEach?.(f, result);
        return { feed: f, result };
      });
    },
  };
  const notifyCalls = [];
  const notifier = {
    async notify(candidates, settings, notified, at) {
      notifyCalls.push(candidates.map((a) => a.title));
      const ids = candidates.filter((a) => a.priority === 'high' && !notified[a.id]).map((a) => a.id);
      return { ids, shown: ids.length };
    },
  };
  let clock = NOW;
  const progress = [];
  const service = createRefreshService({ storage, fetcher, notifier, now: () => clock, onProgress: (f) => progress.push(f.id) });
  return { area, service, fetched, notifyCalls, progress, tick: (ms) => { clock += ms; } };
}

const ok = (...items) => ({ ok: true, notModified: false, items, httpStatus: 200, etag: '"v1"', lastModified: null });

describe('refresh service', () => {
  it('fetches enabled feeds, classifies and saves articles, and records the run', async () => {
    const { area, service, fetched, progress } = setup({
      responses: { cnbc: ok(item('Federal Reserve issues FOMC statement', 'fomc'), item('Quiet day on Wall Street', 'quiet')) },
    });
    const summary = await service.refresh({ reason: 'alarm' });
    assert.deepEqual(fetched.map((f) => f.id), ['cnbc', 'bbc']);
    assert.deepEqual(progress, ['cnbc', 'bbc']);
    assert.equal(summary.added, 2);
    assert.equal(summary.ok, 1);
    assert.equal(summary.notModified, 1);
    const [fomc] = area.data.articles;
    assert.equal(fomc.title, 'Federal Reserve issues FOMC statement');
    assert.equal(fomc.category, 'central-banks');
    assert.equal(fomc.priority, 'high');
    assert.equal(fomc.breaking, true);
    assert.equal(area.data.feedState.cnbc.etag, '"v1"');
    assert.equal(area.data.feedState.cnbc.lastItemCount, 2);
    assert.equal(area.data.meta.lastRefreshAt, NOW);
    assert.equal(area.data.meta.lastRefreshResult.added, 2);
  });

  it('stays silent on a cold start but marks everything as seen', async () => {
    const { area, service, notifyCalls } = setup({ responses: { cnbc: ok(item('Federal Reserve issues FOMC statement', 'fomc')) } });
    const summary = await service.refresh();
    assert.equal(summary.notified, 0);
    assert.deepEqual(notifyCalls, []);
    assert.deepEqual(Object.values(area.data.notified), [NOW]);
  });

  it('notifies only new articles once there is history', async () => {
    const { area, service, notifyCalls, tick } = setup({ responses: { cnbc: ok(item('Quiet day on Wall Street', 'quiet')) } });
    await service.refresh();
    tick(15 * 60 * 1000);
    area.data.feedState = {};
    const second = setup({ stored: { ...area.data }, responses: { cnbc: ok(item('Quiet day on Wall Street', 'quiet'), item('Bank of England hikes interest rate', 'boe')) } });
    const summary = await second.service.refresh();
    assert.deepEqual(second.notifyCalls, [['Bank of England hikes interest rate']]);
    assert.equal(summary.notified, 1);
    assert.equal(summary.duplicates, 1);
    assert.ok(Object.keys(second.area.data.notified).length === 2);
    assert.deepEqual(notifyCalls, []);
  });

  it('merges the same story from two sources and scores it higher', async () => {
    const { area, service } = setup({
      responses: {
        cnbc: ok(item('Hong Kong moves to extend crypto licensing rules to brokers, advisers', 'hk1')),
        bbc: ok(item('Hong Kong pushes to bring crypto custodians, advisers under licensing rules', 'hk2')),
      },
    });
    const summary = await service.refresh();
    assert.equal(area.data.articles.length, 1);
    assert.deepEqual(area.data.articles[0].alsoReportedBy, ['BBC']);
    assert.equal(area.data.articles[0].score, 2);
    assert.equal(summary.duplicates, 1);
  });

  it('re-scores a stored story when another source reports it later', async () => {
    const first = setup({ responses: { cnbc: ok(item('Hong Kong moves to extend crypto licensing rules to brokers, advisers', 'hk1')) } });
    await first.service.refresh();
    const second = setup({
      stored: { ...first.area.data, feedState: {} },
      responses: { bbc: ok(item('Hong Kong pushes to bring crypto custodians, advisers under licensing rules', 'hk2')) },
    });
    await second.service.refresh();
    assert.equal(second.area.data.articles[0].score, 2);
    assert.deepEqual(second.notifyCalls, [['Hong Kong moves to extend crypto licensing rules to brokers, advisers']]);
  });

  it('records failures with backoff and keeps going', async () => {
    const { area, service } = setup({
      responses: { cnbc: { ok: false, error: new FetchError('http', 'The site answered with HTTP 503.', { httpStatus: 503 }) }, bbc: ok(item('Oil slips', 'oil')) },
    });
    const summary = await service.refresh();
    assert.equal(summary.failed, 1);
    assert.equal(area.data.feedState.cnbc.failures, 1);
    assert.equal(area.data.feedState.cnbc.nextAttemptAt, NOW + 30 * 60 * 1000);
    assert.equal(area.data.articles.length, 1);
  });

  it('skips feeds that are backing off, except on a manual refresh', async () => {
    const stored = { feedState: { cnbc: { failures: 2, nextAttemptAt: NOW + HOUR } } };
    const alarm = setup({ stored });
    await alarm.service.refresh({ reason: 'alarm' });
    assert.deepEqual(alarm.fetched.map((f) => f.id), ['bbc']);
    const manual = setup({ stored });
    await manual.service.refresh({ reason: 'manual' });
    assert.deepEqual(manual.fetched.map((f) => f.id), ['cnbc', 'bbc']);
  });

  it('drops articles older than the retention period and forgets removed feeds', async () => {
    const { area, service } = setup({
      stored: { feedState: { removed: { failures: 0 } } },
      responses: { cnbc: ok(item('Old news', 'old', 'Mon, 02 Nov 2026 08:00:00 GMT'), item('New news', 'new')) },
    });
    const summary = await service.refresh();
    assert.deepEqual(area.data.articles.map((a) => a.title), ['New news']);
    assert.equal(summary.added, 1);
    assert.equal('removed' in area.data.feedState, false);
  });

  it('shares one run between overlapping calls', async () => {
    const { service, fetched } = setup();
    const [a, b] = await Promise.all([service.refresh({ reason: 'alarm' }), service.refresh({ reason: 'manual' })]);
    assert.equal(a, b);
    assert.equal(fetched.length, 2);
    await service.refresh();
    assert.equal(fetched.length, 4);
  });
});
