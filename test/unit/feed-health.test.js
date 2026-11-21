import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_BACKOFF_MS, isDue, recordFailure, recordSuccess } from '../../src/core/feed-health.js';

const NOW = 1_000_000_000;
const MINUTE = 60_000;
const INTERVAL = 15 * MINUTE;

describe('feed health', () => {
  it('treats a feed with no record or no wait as due', () => {
    assert.equal(isDue(undefined, NOW), true);
    assert.equal(isDue({ nextAttemptAt: 0 }, NOW), true);
    assert.equal(isDue({ nextAttemptAt: NOW + 1 }, NOW), false);
    assert.equal(isDue({ nextAttemptAt: NOW }, NOW), true);
  });

  it('records a success and stores the caching headers', () => {
    const state = recordSuccess(undefined, { etag: '"v1"', lastModified: 'Sat, 21 Nov 2026 07:00:00 GMT', itemCount: 30 }, NOW);
    assert.deepEqual(state, {
      etag: '"v1"', lastModified: 'Sat, 21 Nov 2026 07:00:00 GMT', lastSuccessAt: NOW, lastErrorAt: null,
      lastError: null, failures: 0, nextAttemptAt: 0, lastItemCount: 30,
    });
  });

  it('keeps the previous headers and item count on 304 Not Modified', () => {
    const before = recordSuccess(undefined, { etag: '"v1"', lastModified: null, itemCount: 30 }, NOW);
    const after = recordSuccess(before, { notModified: true }, NOW + INTERVAL);
    assert.equal(after.etag, '"v1"');
    assert.equal(after.lastItemCount, 30);
    assert.equal(after.lastSuccessAt, NOW + INTERVAL);
  });

  it('doubles the wait after each failure, up to 6 hours', () => {
    let state;
    const waits = [];
    for (let i = 0; i < 6; i += 1) {
      state = recordFailure(state, { message: 'down' }, NOW, INTERVAL);
      waits.push((state.nextAttemptAt - NOW) / MINUTE);
    }
    assert.deepEqual(waits, [30, 60, 120, 240, 360, 360]);
    assert.equal(state.failures, 6);
    assert.equal(state.lastError, 'down');
    assert.equal(state.lastErrorAt, NOW);
  });

  it('waits at least as long as the site asks with Retry-After', () => {
    const state = recordFailure(undefined, { message: '429', retryAfterMs: 2 * 60 * MINUTE }, NOW, INTERVAL);
    assert.equal(state.nextAttemptAt, NOW + 2 * 60 * MINUTE);
    const capped = recordFailure(undefined, { message: '429', retryAfterMs: 48 * 60 * MINUTE }, NOW, INTERVAL);
    assert.equal(capped.nextAttemptAt, NOW + MAX_BACKOFF_MS);
  });

  it('resets failures after one success but remembers when the last error happened', () => {
    const failed = recordFailure(recordFailure(undefined, { message: 'x' }, NOW, INTERVAL), { message: 'y' }, NOW, INTERVAL);
    const recovered = recordSuccess(failed, { etag: null, lastModified: null, itemCount: 5 }, NOW + 1);
    assert.equal(recovered.failures, 0);
    assert.equal(recovered.nextAttemptAt, 0);
    assert.equal(recovered.lastError, null);
    assert.equal(recovered.lastErrorAt, NOW);
  });

  it('keeps the caching headers through failures', () => {
    const ok = recordSuccess(undefined, { etag: '"v1"', lastModified: null, itemCount: 3 }, NOW);
    assert.equal(recordFailure(ok, { message: 'x' }, NOW, INTERVAL).etag, '"v1"');
  });
});
