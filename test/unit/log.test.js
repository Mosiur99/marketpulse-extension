import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createLogger, setDebugLogging, setLogSink } from '../../src/core/log.js';

function recordingSink() {
  const lines = [];
  const record = (level) => (...args) => lines.push([level, ...args]);
  return { lines, debug: record('debug'), info: record('info'), warn: record('warn'), error: record('error') };
}

describe('logger', () => {
  afterEach(() => {
    setDebugLogging(false);
    setLogSink(console);
  });

  it('prefixes lines with the module name', () => {
    const sink = recordingSink();
    setLogSink(sink);
    createLogger('fetcher').warn('feed failed', 404);
    assert.deepEqual(sink.lines, [['warn', '[MarketPulse:fetcher]', 'feed failed', 404]]);
  });

  it('hides debug lines until debug logging is on', () => {
    const sink = recordingSink();
    setLogSink(sink);
    const log = createLogger('x');
    log.debug('hidden');
    setDebugLogging(true);
    log.debug('shown');
    assert.deepEqual(sink.lines, [['debug', '[MarketPulse:x]', 'shown']]);
  });
});
