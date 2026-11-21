import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mapWithConcurrency } from '../../src/core/concurrency.js';

const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

describe('mapWithConcurrency', () => {
  it('keeps result order and never runs more than the limit at once', async () => {
    let running = 0;
    let peak = 0;
    const results = await mapWithConcurrency([5, 1, 4, 2, 3, 6, 7], 3, async (value) => {
      running += 1;
      peak = Math.max(peak, running);
      for (let i = 0; i < value; i += 1) await tick();
      running -= 1;
      return value * 10;
    });
    assert.deepEqual(results, [50, 10, 40, 20, 30, 60, 70]);
    assert.equal(peak, 3);
  });

  it('handles an empty list', async () => {
    assert.deepEqual(await mapWithConcurrency([], 4, async () => 1), []);
  });
});
