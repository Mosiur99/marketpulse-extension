import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_FEEDS } from '../../src/config/feeds.js';
import { DEFAULT_SETTINGS, validateSettings } from '../../src/config/settings.js';
import { BREAKING_WINDOW_MS, createClassifier, priorityFor } from '../../src/core/classifier.js';
import { parseFeed } from '../../src/core/feed-parser.js';
import { normalizeItems } from '../../src/core/normalizer.js';

const NOW = Date.UTC(2026, 10, 21, 8, 0, 0);
const feedById = (id) => DEFAULT_FEEDS.find((feed) => feed.id === id);
const article = (title, summary = '', publishedAt = NOW - 2 * BREAKING_WINDOW_MS) => ({ title, summary, publishedAt });
const classifier = createClassifier(DEFAULT_SETTINGS);
const classify = (title, feedId = 'cnbc-top', options = {}) =>
  classifier.classify(article(title, options.summary, options.publishedAt), { feed: feedById(feedId), now: NOW, otherSources: options.otherSources });

describe('classifier on real headlines from 2026-11-20/21', () => {
  const cases = [
    ['Federal Reserve issues FOMC statement', 'fed', 'central-banks', 'high'],
    ['Bank rate increased to 4% - November 2026 Monetary Policy Summary and Minutes', 'boe', 'central-banks', 'high'],
    ['Bank of England hikes interest rate for the first time since Iran war, warns inflation will stay high', 'cnbc-economy', 'central-banks', 'high'],
    ['Australia hikes rates to 18-year high to fight inflation', 'cnbc-economy', 'central-banks', 'high'],
    ['U.S. economy added 165,000 jobs in October, way more than expected; unemployment rate falls', 'cnbc-economy', 'inflation-jobs', 'high',
      'Nonfarm payrolls were expected to increase by 59,000 in October as the unemployment rate was expected to hold steady at 4.2%.'],
    ['Japan core inflation soars to highest this year as energy subsidy expiry pushes up consumer prices', 'cnbc-economy', 'inflation-jobs', 'high'],
    ['Euro zone inflation hits 4% for first time in three years as interest rate hike looms', 'cnbc-economy', 'global-economy', 'high'],
    ['Gold heads for worst week since March as Fed rate hike bets and forced selling weigh', 'fxstreet', 'metals', 'high'],
    ['Bitcoin crashes below $56,000 as liquidity squeeze deepens crypto selloff', 'investing-crypto', 'crypto', 'high'],
    ['GDP (Advance Estimate), 3rd Quarter 2026', 'bea', 'global-economy', 'high'],
    ['Oil Prices Caught Between a Looming Glut and Middle East Turmoil', 'oilprice', 'energy', 'medium'],
    ["Lowe's posts strong online sales, raises outlook despite slow housing market", 'cnbc-earnings', 'earnings', 'medium'],
    ['ECB publishes consolidated banking data for end-June 2026', 'ecb', 'central-banks', 'medium'],
    ['Federal Reserve Board announces approval of application by Isabella Bank Corporation', 'fed', 'central-banks', 'medium'],
    ['Bank of England announces new office space in Leeds', 'boe', 'central-banks', 'medium'],
    ['Chinese Yuan: Brief dip against US Dollar prompts controls - Commerzbank', 'fxstreet', 'forex', 'low'],
    ['Ledger CTO Charles Guillemet to leave after nine years at company', 'cointelegraph', 'crypto', 'low'],
    ['Tax revenue gap kept tax-GDP ratio below potential 13.5%', 'dailystar-business', 'bangladesh', 'high'],
    ['Honor launches 600S 5G in Bangladesh', 'dhakatribune-business', 'bangladesh', 'low'],
    ['Bangladesh garment exports fall as US tariffs bite', 'cnbc-world', 'bangladesh', 'high'],
  ];
  for (const [title, feedId, category, priority, summary] of cases) {
    it(`${title.slice(0, 60)} -> ${category}, ${priority}`, () => {
      const result = classify(title, feedId, { summary });
      assert.equal(result.category, category);
      assert.equal(result.priority, priority, `score ${result.score}: ${result.matched.join(', ')}`);
    });
  }

  it('gives every saved fixture article a category and a priority', () => {
    for (const feed of DEFAULT_FEEDS) {
      const xml = readFileSync(new URL(`../fixtures/feeds/${feed.id}.xml`, import.meta.url), 'utf8');
      for (const item of normalizeItems(parseFeed(xml).items, feed, NOW).articles) {
        const result = classifier.classify(item, { feed, now: NOW });
        assert.ok(result.category && ['high', 'medium', 'low'].includes(result.priority), item.title);
      }
    }
  });
});

describe('score', () => {
  it('counts a keyword twice in the title and once in the summary', () => {
    assert.equal(classify('Inflation is back').score, 6);
    assert.equal(classify('Prices are back', 'cnbc-top', { summary: 'Inflation rose.' }).score, 3);
    assert.equal(classify('Inflation is back', 'cnbc-top', { summary: 'Inflation rose.' }).score, 6);
  });

  it('multiplies keyword points by the feed weight', () => {
    assert.equal(classify('Inflation is back', 'fed').score, 9);
  });

  it('adds 2 per other source reporting the story, up to 3', () => {
    assert.equal(classify('Quiet day', 'cnbc-top', { otherSources: 1 }).score, 2);
    assert.equal(classify('Quiet day', 'cnbc-top', { otherSources: 10 }).score, 6);
  });

  it('lists matched terms, strongest first, for the "why" view', () => {
    assert.deepEqual(classify('Bitcoin slides as recession fears grow').matched, ['recession', 'bitcoin']);
  });

  it('gives zero for an unrelated headline', () => {
    const result = classify('How long will humans be needed for translation?', 'bbc-business');
    assert.deepEqual([result.score, result.priority, result.matched], [0, 'low', []]);
  });
});

describe('custom keywords', () => {
  const { settings } = validateSettings({
    customKeywords: [{ term: 'Nvidia', weight: 4 }, { term: 'remittance', weight: 2, alwaysNotify: true }],
  });
  const custom = createClassifier(settings);

  it('add their weight, doubled in the title, without the feed multiplier', () => {
    const result = custom.classify(article('Nvidia stock plunges 14%'), { feed: feedById('fed'), now: NOW });
    assert.equal(result.score, 14);
    assert.deepEqual(result.matched, ['plunge', 'nvidia']);
  });

  it('report always-notify keywords separately', () => {
    const result = custom.classify(article('Remittances hit record', 'Nvidia mentioned'), { feed: feedById('tbs-economy'), now: NOW });
    assert.deepEqual(result.alertKeywords, ['remittance']);
    assert.deepEqual(classify('Remittances hit record').alertKeywords, []);
  });
});

describe('priority thresholds', () => {
  it('uses the configured thresholds', () => {
    assert.equal(priorityFor(8, DEFAULT_SETTINGS), 'high');
    assert.equal(priorityFor(7.9, DEFAULT_SETTINGS), 'medium');
    assert.equal(priorityFor(4, DEFAULT_SETTINGS), 'medium');
    assert.equal(priorityFor(3.9, DEFAULT_SETTINGS), 'low');
    assert.equal(priorityFor(5, { highThreshold: 5, mediumThreshold: 2 }), 'high');
  });

  it('follow the user settings in the classifier', () => {
    const strict = createClassifier({ ...DEFAULT_SETTINGS, highThreshold: 20, mediumThreshold: 10 });
    assert.equal(strict.classify(article('Inflation is back'), { feed: feedById('cnbc-top'), now: NOW }).priority, 'low');
  });
});

describe('breaking', () => {
  const recent = NOW - 10 * 60 * 1000;

  it('marks recent high-priority news as breaking', () => {
    assert.equal(classify('Federal Reserve issues FOMC statement', 'fed', { publishedAt: recent }).breaking, true);
  });

  it('never marks old news as breaking', () => {
    assert.equal(classify('Federal Reserve issues FOMC statement', 'fed').breaking, false);
    assert.equal(classify('Breaking: markets halt', 'cnbc-top', { publishedAt: NOW - BREAKING_WINDOW_MS - 1 }).breaking, false);
  });

  it('marks recent stories with an urgent phrase in the title', () => {
    assert.equal(classify('Trading halted on Dhaka exchange', 'cnbc-top', { publishedAt: recent }).breaking, true);
    assert.equal(classify('Quiet day', 'cnbc-top', { publishedAt: recent }).breaking, false);
  });

  it('marks recent stories reported by three or more sources', () => {
    assert.equal(classify('Quiet day', 'cnbc-top', { publishedAt: recent, otherSources: 2 }).breaking, true);
    assert.equal(classify('Quiet day', 'cnbc-top', { publishedAt: recent, otherSources: 1 }).breaking, false);
  });
});

describe('category choice', () => {
  it('uses the first topic word in the headline', () => {
    assert.equal(classify('Oil jumps as dollar index slides').category, 'energy');
    assert.equal(classify('Dollar index slides as oil jumps').category, 'forex');
  });

  it('falls back to the feed hint, then Global Economy', () => {
    assert.equal(classify('Quiet day', 'coindesk').category, 'crypto');
    assert.equal(classifier.classify(article('Quiet day'), { feed: undefined, now: NOW }).category, 'global-economy');
  });

  it('does not use the summary to choose the category', () => {
    assert.equal(classify('Quiet day', 'cnbc-top', { summary: 'Bitcoin moved.' }).category, 'stocks');
  });
});
