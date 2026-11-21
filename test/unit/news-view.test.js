import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_BOOKMARKS, isBookmarked, removeBookmark, toggleBookmark } from '../../src/core/bookmarks.js';
import { BREAKING_DISPLAY_MS, computeStats, filterArticles, isBreakingNow, topStories } from '../../src/ui/shared/news-view.js';

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 21, 8, 0, 0);
const article = (id, overrides = {}) => ({
  id, title: `Story ${id}`, summary: '', source: 'CNBC', category: 'stocks', priority: 'low', score: 0,
  breaking: false, publishedAt: NOW - HOUR, alsoReportedBy: [], ...overrides,
});
const ids = (list) => list.map((a) => a.id);

const ARTICLES = [
  article('fed', { title: 'Fed raises rates', category: 'central-banks', priority: 'high', score: 20, breaking: true }),
  article('btc', { title: 'Bitcoin slides', summary: 'Crypto rout deepens', source: 'CoinDesk', category: 'crypto', priority: 'medium', score: 6, alsoReportedBy: ['Cointelegraph'] }),
  article('old', { title: 'Old breaking story', priority: 'high', score: 15, breaking: true, publishedAt: NOW - BREAKING_DISPLAY_MS - 1 }),
  article('dhaka', { title: 'Taka steadies', source: 'Dhaka Tribune', category: 'bangladesh', score: 2, publishedAt: NOW - 30 * HOUR }),
];

describe('filterArticles', () => {
  const filter = (options) => ids(filterArticles(ARTICLES, { now: NOW, ...options }));

  it('shows everything by default', () => {
    assert.deepEqual(filter({}), ['fed', 'btc', 'old', 'dhaka']);
  });

  it('filters by view', () => {
    assert.deepEqual(filter({ view: 'breaking' }), ['fed']);
    assert.deepEqual(filter({ view: 'high' }), ['fed', 'old']);
  });

  it('filters by category and hides disabled categories', () => {
    assert.deepEqual(filter({ category: 'crypto' }), ['btc']);
    assert.deepEqual(filter({ enabledCategories: { crypto: false, bangladesh: false } }), ['fed', 'old']);
  });

  it('filters by source, including other sources of a merged story', () => {
    assert.deepEqual(filter({ source: 'Cointelegraph' }), ['btc']);
    assert.deepEqual(filter({ source: 'CNBC' }), ['fed', 'old']);
  });

  it('searches title, summary and source; every word must match', () => {
    assert.deepEqual(filter({ query: 'rout' }), ['btc']);
    assert.deepEqual(filter({ query: '  BITCOIN   coindesk ' }), ['btc']);
    assert.deepEqual(filter({ query: 'bitcoin fed' }), []);
  });

  it('combines filters', () => {
    assert.deepEqual(filter({ view: 'high', query: 'old' }), ['old']);
  });
});

describe('isBreakingNow', () => {
  it('keeps the label for six hours', () => {
    assert.equal(isBreakingNow(ARTICLES[0], NOW), true);
    assert.equal(isBreakingNow(ARTICLES[2], NOW), false);
    assert.equal(isBreakingNow(ARTICLES[1], NOW), false);
  });
});

describe('topStories', () => {
  it('picks the highest scores of the last 24 hours, one per category', () => {
    const extra = article('fed2', { category: 'central-banks', score: 18 });
    assert.deepEqual(ids(topStories([...ARTICLES, extra], NOW)), ['fed', 'old', 'btc']);
  });

  it('respects the limit and skips zero scores', () => {
    assert.deepEqual(ids(topStories(ARTICLES, NOW, 1)), ['fed']);
    assert.deepEqual(topStories([article('z')], NOW), []);
  });
});

describe('computeStats', () => {
  const feeds = [
    { id: 'cnbc', name: 'CNBC', enabled: true },
    { id: 'bbc', name: 'BBC', enabled: true },
    { id: 'off', name: 'Off', enabled: false },
  ];
  const stats = computeStats(ARTICLES, {
    feeds,
    feedState: { cnbc: { failures: 0 }, bbc: { failures: 2, lastError: 'HTTP 503' }, off: { failures: 5 } },
    meta: { lastRefreshAt: NOW, lastRefreshResult: { added: 3 } },
    now: NOW,
  });

  it('counts totals', () => {
    assert.equal(stats.total, 4);
    assert.equal(stats.breaking, 1);
    assert.equal(stats.high, 2);
    assert.equal(stats.last24h, 3);
    assert.equal(stats.lastRefreshAt, NOW);
  });

  it('counts every category in a fixed order', () => {
    assert.equal(stats.byCategory.length, 11);
    assert.deepEqual(stats.byCategory.find((c) => c.id === 'stocks'), { id: 'stocks', label: 'Stock Market', count: 1 });
    assert.equal(stats.byCategory[0].id, 'global-economy');
  });

  it('lists every source once, sorted', () => {
    assert.deepEqual(stats.sources, ['CNBC', 'CoinDesk', 'Cointelegraph', 'Dhaka Tribune']);
  });

  it('reports failing enabled feeds only', () => {
    assert.deepEqual(stats.feedHealth, { enabled: 2, ok: 1, failingFeeds: [{ id: 'bbc', name: 'BBC', error: 'HTTP 503' }] });
  });

  it('handles an empty start', () => {
    const empty = computeStats([], { now: NOW });
    assert.equal(empty.total, 0);
    assert.equal(empty.lastRefreshAt, null);
    assert.deepEqual(empty.feedHealth, { enabled: 0, ok: 0, failingFeeds: [] });
  });
});

describe('bookmarks', () => {
  it('adds a full copy with the time, newest first, and removes it again', () => {
    const first = toggleBookmark([], ARTICLES[0], NOW);
    assert.deepEqual(first, [{ ...ARTICLES[0], bookmarkedAt: NOW }]);
    const second = toggleBookmark(first, ARTICLES[1], NOW + 1);
    assert.deepEqual(ids(second), ['btc', 'fed']);
    assert.ok(isBookmarked(second, 'fed'));
    assert.deepEqual(ids(toggleBookmark(second, ARTICLES[0], NOW + 2)), ['btc']);
    assert.deepEqual(ids(removeBookmark(second, 'btc')), ['fed']);
  });

  it(`keeps at most ${MAX_BOOKMARKS}`, () => {
    const many = Array.from({ length: MAX_BOOKMARKS }, (_, i) => article(`b${i}`));
    const result = toggleBookmark(many, article('new'), NOW);
    assert.equal(result.length, MAX_BOOKMARKS);
    assert.equal(result[0].id, 'new');
  });
});
