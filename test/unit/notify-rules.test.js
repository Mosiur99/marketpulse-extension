import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, validateSettings } from '../../src/config/settings.js';
import { MAX_NOTIFY_AGE_MS, selectNotifications } from '../../src/core/notify-rules.js';

const NOW = Date.UTC(2026, 10, 21, 8, 0, 0);
const settings = (overrides = {}) => validateSettings({ ...DEFAULT_SETTINGS, ...overrides }).settings;
let n = 0;
const article = (overrides = {}) => {
  n += 1;
  return { id: `a_${n}`, title: `Story ${n}`, category: 'stocks', priority: 'high', score: 10, breaking: false, publishedAt: NOW - 60_000, alertKeywords: [], ...overrides };
};
const ids = (list) => list.map((a) => a.id);

describe('selectNotifications', () => {
  it('notifies high-priority stories', () => {
    const high = article();
    const result = selectNotifications([high, article({ priority: 'medium' })], settings(), {}, NOW);
    assert.deepEqual(ids(result.single), [high.id]);
    assert.deepEqual(result.summary, []);
    assert.deepEqual(result.ids, [high.id]);
  });

  it('does nothing when notifications are off', () => {
    assert.deepEqual(selectNotifications([article()], settings({ notificationsEnabled: false }), {}, NOW), { single: [], summary: [], ids: [] });
  });

  it('never notifies the same article twice', () => {
    const a = article();
    assert.deepEqual(selectNotifications([a, a], settings(), {}, NOW).ids, [a.id]);
    assert.deepEqual(selectNotifications([a], settings(), { [a.id]: NOW - 1000 }, NOW).ids, []);
  });

  it('skips stories older than 24 hours', () => {
    const old = article({ publishedAt: NOW - MAX_NOTIFY_AGE_MS - 1 });
    assert.deepEqual(selectNotifications([old], settings(), {}, NOW).ids, []);
  });

  it('respects the minimum priority', () => {
    const medium = article({ priority: 'medium' });
    assert.deepEqual(selectNotifications([medium], settings(), {}, NOW).ids, []);
    assert.deepEqual(selectNotifications([medium], settings({ notifyMinPriority: 'medium' }), {}, NOW).ids, [medium.id]);
  });

  it('respects per-category notification switches and hidden categories', () => {
    const crypto = article({ category: 'crypto' });
    assert.deepEqual(selectNotifications([crypto], settings({ notifyCategories: { crypto: false } }), {}, NOW).ids, []);
    assert.deepEqual(selectNotifications([crypto], settings({ enabledCategories: { crypto: false } }), {}, NOW).ids, []);
  });

  it('always notifies custom alert keywords, even low priority or in a muted category', () => {
    const alert = article({ priority: 'low', category: 'crypto', alertKeywords: ['remittance'] });
    const result = selectNotifications([alert], settings({ notifyCategories: { crypto: false } }), {}, NOW);
    assert.deepEqual(result.ids, [alert.id]);
  });

  it('shows at most maxNotificationsPerRefresh single alerts and summarizes the rest', () => {
    const list = Array.from({ length: 5 }, (_, i) => article({ score: 10 + i }));
    const result = selectNotifications(list, settings(), {}, NOW);
    assert.deepEqual(ids(result.single), ids([list[4], list[3], list[2]]));
    assert.deepEqual(ids(result.summary), ids([list[1], list[0]]));
    assert.equal(result.ids.length, 5);
  });

  it('puts breaking news and alert keywords first, then higher scores', () => {
    const plain = article({ score: 30 });
    const keyword = article({ score: 9, alertKeywords: ['nvidia'] });
    const breaking = article({ score: 8, breaking: true });
    assert.deepEqual(ids(selectNotifications([plain, keyword, breaking], settings(), {}, NOW).single), [breaking.id, keyword.id, plain.id]);
  });

  it('in digest mode shows one story alone, or one summary for several', () => {
    const one = article();
    assert.deepEqual(ids(selectNotifications([one], settings({ notifyMode: 'digest' }), {}, NOW).single), [one.id]);
    const many = selectNotifications([article(), article()], settings({ notifyMode: 'digest' }), {}, NOW);
    assert.equal(many.single.length, 0);
    assert.equal(many.summary.length, 2);
  });
});
