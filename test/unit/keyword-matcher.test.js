import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createKeywordMatcher, normalizeText } from '../../src/core/keyword-matcher.js';

const termsIn = (entries, text) => createKeywordMatcher(entries.map((term) => ({ term })))(text).map((hit) => hit.entry.term);

describe('createKeywordMatcher', () => {
  it('matches whole words only, ignoring case', () => {
    assert.deepEqual(termsIn(['war', 'oil'], 'WAR fears lift Oil'), ['war', 'oil']);
    assert.deepEqual(termsIn(['war', 'oil'], 'Warning on soil quality'), []);
  });

  it('matches plurals of terms ending in a letter', () => {
    assert.deepEqual(termsIn(['tariff', 'rate hike'], 'New tariffs and two rate hikes'), ['tariff', 'rate hike']);
    assert.deepEqual(termsIn(['tax'], 'Taxes rise'), ['tax']);
  });

  it('treats hyphens and spaces as the same', () => {
    for (const text of ['A sell-off', 'A selloff', 'A sell off', 'A sell‑off']) {
      assert.deepEqual(termsIn(['sell-off'], text), ['sell-off'], text);
    }
  });

  it('handles terms with symbols', () => {
    assert.deepEqual(termsIn(['s&p 500', 'eur/usd', 'opec+'], 'S&P 500 falls; EUR/USD steady; OPEC+ meets'), ['s&p 500', 'eur/usd', 'opec+']);
  });

  it('matches before an apostrophe (possessives)', () => {
    assert.deepEqual(termsIn(['bangladesh'], 'Bangladesh’s GDP'), ['bangladesh']);
    assert.deepEqual(termsIn(['fed'], "Fed's Waller"), ['fed']);
  });

  it('keeps only the longest of overlapping matches', () => {
    assert.deepEqual(termsIn(['rate decision', 'interest rate decision', 'interest rate'], 'The interest rate decision is due'), ['interest rate decision']);
  });

  it('still counts a shorter term found elsewhere in the text', () => {
    assert.deepEqual(termsIn(['rate decision', 'interest rate decision'], 'Interest rate decision today; next rate decision in March'), ['interest rate decision', 'rate decision']);
  });

  it('returns hits in text order, each term once, with its first position', () => {
    const match = createKeywordMatcher([{ term: 'gold' }, { term: 'fed' }]);
    assert.deepEqual(match('Fed hikes; gold drops; Fed again').map((hit) => [hit.entry.term, hit.start]), [['fed', 0], ['gold', 11]]);
  });

  it('copes with empty text and no terms', () => {
    assert.deepEqual(createKeywordMatcher([])('anything'), []);
    assert.deepEqual(termsIn(['gold'], ''), []);
    assert.deepEqual(termsIn(['gold'], undefined), []);
  });
});

describe('normalizeText', () => {
  it('lower-cases and unifies curly apostrophes and dashes', () => {
    assert.equal(normalizeText('Fed’s – Sell‐Off'), "fed's - sell-off");
  });
});
