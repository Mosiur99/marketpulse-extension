import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mergeArticles, similarity, titleWords } from '../../src/core/deduper.js';

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 21, 8, 0, 0);
let counter = 0;
const story = (title, source, overrides = {}) => {
  counter += 1;
  return { id: `a_${counter}`, title, source, publishedAt: NOW, fetchedAt: NOW, alsoReportedBy: [], ...overrides };
};

describe('titleWords', () => {
  it('stems gently: plural s always, -ing/-ed only when 4+ letters remain', () => {
    assert.deepEqual([...titleWords('rules licensing bring pass moved red')], ['rule', 'licens', 'bring', 'pass', 'moved', 'red']);
  });

  it('drops stop words, possessives and punctuation', () => {
    assert.deepEqual([...titleWords("Fed's Powell says rates are rising, markets fall")], ['fed', 'powell', 'rate', 'rising', 'market', 'fall']);
  });

  it('keeps numbers, percentages and prices, and joins abbreviations', () => {
    assert.deepEqual([...titleWords('U.S. CPI rises 0.4% to $5.2bn')], ['us', 'cpi', 'rise', '0.4%', '$5.2bn']);
  });
});

describe('similarity', () => {
  it('returns shared word count and Jaccard score', () => {
    assert.deepEqual(similarity(new Set(['a', 'b', 'c']), new Set(['b', 'c', 'd'])), { shared: 2, score: 0.5 });
    assert.deepEqual(similarity(new Set(), new Set()), { shared: 0, score: 0 });
  });
});

describe('mergeArticles', () => {
  it('adds new stories and skips ones already stored by id', () => {
    const stored = [story('Gold rises on weak dollar', 'CNBC', { id: 'a_gold' })];
    const result = mergeArticles(stored, [story('Gold rises on weak dollar', 'CNBC', { id: 'a_gold' }), story('Oil slips', 'BBC')]);
    assert.equal(result.articles.length, 2);
    assert.deepEqual(result.added.map((a) => a.title), ['Oil slips']);
    assert.equal(result.duplicates, 1);
  });

  it('merges the same story from another publisher into the first report (real pair, 2026-11-21)', () => {
    const first = story('Hong Kong moves to extend crypto licensing rules to brokers, advisers', 'CoinDesk');
    const second = story('Hong Kong pushes to bring crypto custodians, advisers under licensing rules', 'Cointelegraph');
    const result = mergeArticles([first], [second]);
    assert.equal(result.articles.length, 1);
    assert.deepEqual(result.articles[0].alsoReportedBy, ['Cointelegraph']);
    assert.deepEqual(result.updated.map((a) => a.id), [first.id]);
    assert.deepEqual(result.added, []);
  });

  it('does not change the stored input', () => {
    const first = story('Fed holds rates steady as inflation cools further', 'CNBC');
    mergeArticles([first], [story('Fed holds rates steady as inflation cools', 'BBC')]);
    assert.deepEqual(first.alsoReportedBy, []);
  });

  it('merges duplicates inside one batch without reporting them as updates', () => {
    const result = mergeArticles([], [
      story('Fed holds rates steady as inflation cools further', 'CNBC'),
      story('Fed holds rates steady as inflation cools', 'BBC'),
      story('Fed holds interest rates steady as inflation cools', 'FXStreet'),
    ]);
    assert.equal(result.added.length, 1);
    assert.deepEqual(result.added[0].alsoReportedBy, ['BBC', 'FXStreet']);
    assert.deepEqual(result.updated, []);
  });

  it('lists each extra publisher once', () => {
    const first = story('Fed holds rates steady as inflation cools further', 'CNBC');
    const again = mergeArticles([first], [story('Fed holds rates steady as inflation cools', 'BBC')]);
    const twice = mergeArticles(again.articles, [story('Fed holds rates steady, inflation cools', 'BBC')]);
    assert.deepEqual(twice.articles[0].alsoReportedBy, ['BBC']);
    assert.deepEqual(twice.updated, []);
  });

  it('never merges similar titles from the same publisher (separate releases)', () => {
    const result = mergeArticles([story('Personal Income and Outlays, May 2026', 'US BEA')], [story('Personal Income and Outlays, June 2026', 'US BEA')]);
    assert.equal(result.articles.length, 2);
  });

  it('keeps different stories apart (real near-miss, 2026-11-21)', () => {
    const result = mergeArticles(
      [story('Minutes of the Federal Open Market Committee, September 15-16, 2026', 'Federal Reserve')],
      [story('Minutes of the Money Market Committee meeting – September 2026', 'Bank of England')],
    );
    assert.equal(result.articles.length, 2);
  });

  it('needs at least four shared words', () => {
    const result = mergeArticles([story('Bitcoin slides again', 'CoinDesk')], [story('Bitcoin slides again!', 'Cointelegraph')]);
    assert.equal(result.articles.length, 2);
  });

  it('only compares stories published within 48 hours of each other', () => {
    const old = story('Fed holds rates steady as inflation cools further', 'CNBC', { publishedAt: NOW - 49 * HOUR });
    const result = mergeArticles([old], [story('Fed holds rates steady as inflation cools', 'BBC')]);
    assert.equal(result.articles.length, 2);
  });

  it('picks the closest match when several are similar', () => {
    const loose = story('Fed holds rates steady while markets wait for jobs data', 'CNBC');
    const close = story('Fed holds rates steady as inflation cools further', 'FXStreet');
    const result = mergeArticles([loose, close], [story('Fed holds rates steady as inflation cools', 'BBC')]);
    assert.deepEqual(result.updated.map((a) => a.id), [close.id]);
  });
});
