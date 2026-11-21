import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NOTIFIED_LIMITS, pruneArticles, pruneNotified } from '../../src/core/retention.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 21, 8, 0, 0);
const at = (id, ageDays, fetchedAt = NOW) => ({ id, publishedAt: NOW - ageDays * DAY, fetchedAt });

describe('pruneArticles', () => {
  it('drops stories older than the retention period and sorts newest first', () => {
    const kept = pruneArticles([at('old', 8), at('mid', 3), at('new', 0.1), at('edge', 7)], { now: NOW, retentionDays: 7, maxArticles: 500 });
    assert.deepEqual(kept.map((a) => a.id), ['new', 'mid', 'edge']);
  });

  it('keeps only the newest maxArticles', () => {
    const many = Array.from({ length: 10 }, (_, i) => at(`a${i}`, i / 10));
    assert.deepEqual(pruneArticles(many, { now: NOW, retentionDays: 7, maxArticles: 3 }).map((a) => a.id), ['a0', 'a1', 'a2']);
  });

  it('breaks publish-time ties by fetch time', () => {
    const kept = pruneArticles([at('first', 1, NOW - 10), at('second', 1, NOW)], { now: NOW, retentionDays: 7, maxArticles: 5 });
    assert.deepEqual(kept.map((a) => a.id), ['second', 'first']);
  });

  it('does not change the input array', () => {
    const input = [at('a', 1), at('b', 0)];
    pruneArticles(input, { now: NOW, retentionDays: 7, maxArticles: 5 });
    assert.deepEqual(input.map((a) => a.id), ['a', 'b']);
  });
});

describe('pruneNotified', () => {
  it('forgets ids older than 7 days', () => {
    assert.deepEqual(pruneNotified({ a: NOW - 8 * DAY, b: NOW - DAY }, NOW), { b: NOW - DAY });
  });

  it('keeps at most the newest 2000 ids', () => {
    const many = Object.fromEntries(Array.from({ length: NOTIFIED_LIMITS.maxEntries + 5 }, (_, i) => [`a${i}`, NOW - i]));
    const kept = pruneNotified(many, NOW);
    assert.equal(Object.keys(kept).length, NOTIFIED_LIMITS.maxEntries);
    assert.ok('a0' in kept && !(`a${NOTIFIED_LIMITS.maxEntries}` in kept));
  });
});
