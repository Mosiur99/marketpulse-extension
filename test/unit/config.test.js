import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, CATEGORY_IDS, DEFAULT_CATEGORY_ID, categoryLabel, isCategoryId } from '../../src/config/categories.js';
import { DEFAULT_FEEDS, feedOrigin, validateFeed } from '../../src/config/feeds.js';
import { IMPORTANCE_RULES, URGENT_PHRASES } from '../../src/config/keywords.js';

const validFeed = { id: 'my-feed', name: 'My Feed', url: 'https://example.com/rss', categoryHint: 'crypto' };

describe('categories', () => {
  it('has the 11 categories from the spec', () => {
    assert.deepEqual(CATEGORIES.map((category) => category.label), [
      'Global Economy', 'Stock Market', 'Forex Market', 'Cryptocurrency', 'Gold & Silver', 'Oil & Energy',
      'Central Banks & Interest Rates', 'Inflation & Employment', 'Corporate Earnings',
      'Geopolitical & Trade News', 'Bangladesh Economy',
    ]);
  });

  it('uses unique ids and lower-case keywords without duplicates inside a category', () => {
    assert.equal(new Set(CATEGORY_IDS).size, CATEGORY_IDS.length);
    for (const category of CATEGORIES) {
      assert.ok(category.keywords.length > 0, category.id);
      assert.equal(new Set(category.keywords).size, category.keywords.length, category.id);
      for (const keyword of category.keywords) assert.equal(keyword, keyword.trim().toLowerCase(), keyword);
    }
  });

  it('has a valid default category', () => {
    assert.ok(isCategoryId(DEFAULT_CATEGORY_ID));
    assert.equal(isCategoryId('sports'), false);
  });

  it('looks up labels and falls back to the id', () => {
    assert.equal(categoryLabel('metals'), 'Gold & Silver');
    assert.equal(categoryLabel('unknown'), 'unknown');
  });
});

describe('importance keywords', () => {
  it('covers the high-priority keywords from the spec', () => {
    const terms = IMPORTANCE_RULES.map((rule) => rule.term);
    for (const term of ['federal reserve', 'interest rate decision', 'inflation', 'cpi', 'gdp', 'recession',
      'stock market crash', 'market rally', 'bitcoin', 'gold price', 'oil price', 'earnings surprise',
      'trade war', 'tariffs', 'central bank', 'banking crisis', 'dollar index']) {
      assert.ok(terms.includes(term), term);
    }
  });

  it('uses unique lower-case terms with positive whole-number weights', () => {
    const terms = IMPORTANCE_RULES.map((rule) => rule.term);
    assert.equal(new Set(terms).size, terms.length);
    for (const { term, weight } of IMPORTANCE_RULES) {
      assert.equal(term, term.toLowerCase());
      assert.ok(Number.isInteger(weight) && weight > 0, term);
    }
    assert.ok(URGENT_PHRASES.every((phrase) => phrase === phrase.toLowerCase()));
  });
});

describe('default feeds', () => {
  it('are all valid, with unique ids and https URLs', () => {
    const ids = DEFAULT_FEEDS.map((feed) => feed.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const feed of DEFAULT_FEEDS) {
      assert.deepEqual(validateFeed(feed).errors, [], feed.id);
      assert.ok(feed.url.startsWith('https://'), feed.id);
    }
  });

  it('give a category hint for every category except geopolitics and trade', () => {
    const hinted = new Set(DEFAULT_FEEDS.map((feed) => feed.categoryHint));
    for (const id of ['global-economy', 'stocks', 'forex', 'crypto', 'metals', 'energy', 'central-banks', 'inflation-jobs', 'earnings', 'bangladesh']) {
      assert.ok(hinted.has(id), id);
    }
  });

  it('weight official sources higher', () => {
    const weightOf = (id) => DEFAULT_FEEDS.find((feed) => feed.id === id).weight;
    assert.equal(weightOf('fed'), 1.5);
    assert.equal(weightOf('cnbc-top'), 1);
  });
});

describe('validateFeed', () => {
  it('accepts a valid feed and fills in defaults', () => {
    const { feed, errors } = validateFeed(validFeed);
    assert.deepEqual(errors, []);
    assert.deepEqual(feed, { ...validFeed, source: 'My Feed', enabled: true, weight: 1 });
  });

  it('trims text fields and keeps enabled false', () => {
    const { feed } = validateFeed({ ...validFeed, name: '  My Feed ', url: ' https://example.com/rss ', enabled: false });
    assert.equal(feed.name, 'My Feed');
    assert.equal(feed.url, 'https://example.com/rss');
    assert.equal(feed.enabled, false);
  });

  it('rejects unsafe or malformed URLs', () => {
    for (const url of ['javascript:alert(1)', 'ftp://example.com/rss', 'example.com/rss', 'file:///etc/passwd', '']) {
      assert.deepEqual(validateFeed({ ...validFeed, url }).errors.map((error) => error.field), ['url'], url);
    }
  });

  it('allows plain http feeds', () => {
    assert.deepEqual(validateFeed({ ...validFeed, url: 'http://example.com/rss' }).errors, []);
  });

  it('rejects bad ids, missing names, unknown categories and weights out of range', () => {
    const { errors } = validateFeed({ id: 'Bad Id', name: '', url: validFeed.url, categoryHint: 'sports', weight: 3 });
    assert.deepEqual(errors.map((error) => error.field), ['id', 'name', 'categoryHint', 'weight']);
  });

  it('handles missing input', () => {
    assert.ok(validateFeed(undefined).errors.length > 0);
  });
});

describe('feedOrigin', () => {
  it('turns a feed URL into a host permission pattern', () => {
    assert.equal(feedOrigin('https://www.cnbc.com/id/1/device/rss/rss.html'), 'https://www.cnbc.com/*');
  });
});
