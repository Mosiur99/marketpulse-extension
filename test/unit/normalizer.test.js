import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FIELD_LIMITS, normalizeItem, normalizeItems, parseFeedDate } from '../../src/core/normalizer.js';

const NOW = Date.UTC(2026, 10, 21, 8, 0, 0);
const feed = { id: 'cnbc-top', source: 'CNBC', url: 'https://www.cnbc.com/id/1/device/rss/rss.html' };
const raw = (overrides = {}) => ({
  title: 'Fed holds rates',
  link: 'https://www.cnbc.com/2026/11/20/fed.html',
  summary: '<p>The Fed kept rates <b>unchanged</b>.</p>',
  published: 'Fri, 20 Nov 2026 21:04:48 GMT',
  guid: '1',
  ...overrides,
});

describe('normalizeItem', () => {
  it('builds a clean article', () => {
    const article = normalizeItem(raw(), feed, NOW);
    assert.match(article.id, /^a_[0-9a-f]{16}$/);
    assert.deepEqual({ ...article, id: undefined }, {
      id: undefined,
      title: 'Fed holds rates',
      summary: 'The Fed kept rates unchanged.',
      url: 'https://www.cnbc.com/2026/11/20/fed.html',
      source: 'CNBC',
      feedId: 'cnbc-top',
      publishedAt: Date.UTC(2026, 10, 20, 21, 4, 48),
      dateEstimated: false,
      fetchedAt: NOW,
    });
  });

  it('skips items without a title or a safe link', () => {
    assert.equal(normalizeItem(raw({ title: '  ' }), feed, NOW), null);
    assert.equal(normalizeItem(raw({ title: '<b></b>' }), feed, NOW), null);
    assert.equal(normalizeItem(raw({ link: '' }), feed, NOW), null);
    assert.equal(normalizeItem(raw({ link: 'javascript:alert(1)' }), feed, NOW), null);
    assert.equal(normalizeItem(null, feed, NOW), null);
  });

  it('strips HTML from titles and resolves relative links', () => {
    const article = normalizeItem(raw({ title: '<a href="/x">Tax gap</a>', link: '/business/x' }), feed, NOW);
    assert.equal(article.title, 'Tax gap');
    assert.equal(article.url, 'https://www.cnbc.com/business/x');
  });

  it('allows an empty summary', () => {
    assert.equal(normalizeItem(raw({ summary: '' }), feed, NOW).summary, '');
  });

  it('cuts long fields', () => {
    const article = normalizeItem(raw({ title: 'word '.repeat(100), summary: 'word '.repeat(200) }), feed, NOW);
    assert.ok(article.title.length <= FIELD_LIMITS.title);
    assert.ok(article.summary.length <= FIELD_LIMITS.summary);
    assert.ok(article.summary.endsWith('…'));
  });
});

describe('normalizeItems', () => {
  it('drops invalid items and repeats of the same article, counting them', () => {
    const items = [raw(), raw({ link: 'https://cnbc.com/2026/11/20/fed.html?utm_source=rss' }), raw({ title: '' }), raw({ link: 'https://www.cnbc.com/b.html' })];
    const { articles, skipped } = normalizeItems(items, feed, NOW);
    assert.equal(articles.length, 2);
    assert.equal(skipped, 2);
  });
});

describe('parseFeedDate', () => {
  const cases = [
    ['RFC 822 GMT', 'Fri, 20 Nov 2026 21:04:48 GMT', Date.UTC(2026, 10, 20, 21, 4, 48)],
    ['RFC 822 offset', 'Sat, 21 Nov 2026 06:36:38 +0600', Date.UTC(2026, 10, 21, 0, 36, 38)],
    ['two-digit year (Daily Star)', 'Sat, 21 Nov 26 13:41:06 +0600', Date.UTC(2026, 10, 21, 7, 41, 6)],
    ['no seconds (TBS)', 'Sat, 21 Nov 2026 11:00 +0600', Date.UTC(2026, 10, 21, 5, 0, 0)],
    ['US zone name (BEA)', 'Fri, 20 Nov 2026 08:30:00 EST', Date.UTC(2026, 10, 20, 13, 30, 0)],
    ['Z zone (Bank of England)', 'Thu, 19 Nov 2026 08:00:00 Z', Date.UTC(2026, 10, 19, 8, 0, 0)],
    ['ISO with Z', '2026-11-21T07:01:11Z', Date.UTC(2026, 10, 21, 7, 1, 11)],
    ['ISO with offset', '2026-11-21T07:01:11+06:00', Date.UTC(2026, 10, 21, 1, 1, 11)],
    ['no zone (Investing.com) is UTC', '2026-11-21 07:01:11', Date.UTC(2026, 10, 21, 7, 1, 11)],
    ['ISO without zone is UTC', '2026-11-21T07:01', Date.UTC(2026, 10, 21, 7, 1, 0)],
    ['surrounding whitespace', '\n Fri, 20 Nov 2026 21:04:48 GMT \n', Date.UTC(2026, 10, 20, 21, 4, 48)],
  ];
  for (const [name, value, expected] of cases) {
    it(`reads ${name}`, () => {
      assert.deepEqual(parseFeedDate(value, NOW), { time: expected, estimated: false });
    });
  }

  it('uses now, marked estimated, for missing, invalid, ancient or far-future dates', () => {
    for (const value of [undefined, '', 'yesterday', 'Mon, 01 Jan 1990 00:00:00 GMT', '2026-11-21 09:00:00']) {
      assert.deepEqual(parseFeedDate(value, NOW), { time: NOW, estimated: true }, String(value));
    }
  });

  it('accepts a date slightly in the future (clock skew)', () => {
    assert.deepEqual(parseFeedDate('2026-11-21 08:05:00', NOW), { time: NOW + 5 * 60_000, estimated: false });
  });
});
