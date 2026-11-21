import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_FEEDS } from '../../src/config/feeds.js';
import { parseFeed } from '../../src/core/feed-parser.js';
import { normalizeItems } from '../../src/core/normalizer.js';

const FIXTURE_DAY = Date.UTC(2026, 10, 21, 8, 0, 0);
const load = (feed) => readFileSync(new URL(`../fixtures/feeds/${feed.id}.xml`, import.meta.url), 'utf8');
const articlesOf = (feed) => normalizeItems(parseFeed(load(feed)).items, feed, FIXTURE_DAY).articles;
const feedById = (id) => DEFAULT_FEEDS.find((feed) => feed.id === id);

describe('real feeds saved on 2026-11-21 (first 3 items each)', () => {
  for (const feed of DEFAULT_FEEDS) {
    it(`${feed.id} gives clean articles`, () => {
      const articles = articlesOf(feed);
      assert.ok(articles.length >= 1);
      for (const article of articles) {
        assert.ok(article.title.length > 0);
        assert.doesNotMatch(article.title, /<[a-z/]/i);
        assert.doesNotMatch(article.summary, /<\/?[a-z]+[\s>]/i);
        assert.match(article.url, /^https:\/\//);
        assert.equal(article.dateEstimated, false, `${article.title}: date not read`);
        assert.ok(article.publishedAt <= FIXTURE_DAY);
        assert.equal(article.source, feed.source);
      }
    });
  }

  it('reads Investing.com dates as UTC', () => {
    const [first] = articlesOf(feedById('investing-all'));
    assert.equal(new Date(first.publishedAt).toISOString(), '2026-11-21T07:38:34.000Z');
  });

  it('removes the HTML link The Daily Star puts inside titles', () => {
    const [first] = articlesOf(feedById('dailystar-business'));
    assert.equal(first.title, 'Tax revenue gap kept tax-GDP ratio below potential 13.5%');
  });

  it('accepts ECB items that have no description', () => {
    const [first] = articlesOf(feedById('ecb'));
    assert.equal(first.title, 'Christine Lagarde: Acting in time');
    assert.equal(first.summary, '');
  });

  it('reads US Eastern time from BEA', () => {
    const [first] = articlesOf(feedById('bea'));
    assert.equal(new Date(first.publishedAt).toISOString(), '2026-11-20T13:30:00.000Z');
  });
});
