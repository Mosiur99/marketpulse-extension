import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_FEEDS, newFeedId } from '../../src/config/feeds.js';
import { DEFAULT_SETTINGS } from '../../src/config/settings.js';
import { createBackup, readBackup } from '../../src/core/backup.js';

const NOW = Date.UTC(2026, 10, 21, 8, 0, 0);
const bookmark = { id: 'a_1', title: 'Fed holds', url: 'https://news.test/fed' };

describe('backup', () => {
  it('round-trips settings, feeds and bookmarks', () => {
    const backup = createBackup({ settings: { ...DEFAULT_SETTINGS, theme: 'light' }, feeds: DEFAULT_FEEDS, bookmarks: [bookmark] }, NOW);
    assert.equal(backup.exportedAt, '2026-11-21T08:00:00.000Z');
    const restored = readBackup(JSON.stringify(backup));
    assert.equal(restored.ok, true);
    assert.equal(restored.settings.theme, 'light');
    assert.equal(restored.feeds.length, DEFAULT_FEEDS.length);
    assert.deepEqual(restored.bookmarks, [bookmark]);
  });

  it('rejects files that are not MarketPulse backups', () => {
    assert.deepEqual(readBackup('not json'), { ok: false, error: 'The file is not valid JSON.' });
    assert.deepEqual(readBackup('{"a":1}'), { ok: false, error: 'This is not a MarketPulse backup file.' });
    assert.match(readBackup(JSON.stringify({ format: 'marketpulse-backup', version: 99 })).error, /newer version/);
  });

  it('repairs invalid settings and drops unsafe bookmarks', () => {
    const restored = readBackup(JSON.stringify({
      format: 'marketpulse-backup',
      version: 1,
      settings: { refreshMinutes: 0, theme: 'light' },
      bookmarks: [bookmark, { id: 'x', title: 'Bad', url: 'javascript:alert(1)' }, { title: 'no id', url: 'https://x.test' }],
    }));
    assert.equal(restored.settings.refreshMinutes, 15);
    assert.equal(restored.settings.theme, 'light');
    assert.deepEqual(restored.bookmarks, [bookmark]);
    assert.equal(restored.feeds, null);
  });
});

describe('newFeedId', () => {
  it('makes a readable unique id from the name', () => {
    assert.equal(newFeedId('Reuters Business News!', []), 'reuters-business-news');
    assert.equal(newFeedId('CNBC Top', ['cnbc-top']), 'cnbc-top-2');
    assert.equal(newFeedId('CNBC Top', ['cnbc-top', 'cnbc-top-2']), 'cnbc-top-3');
    assert.equal(newFeedId('Café Économie', []), 'cafe-economie');
    assert.equal(newFeedId('!!!', []), 'feed');
  });
});
