import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFeedFetcher, decode, parseRetryAfter } from '../../src/services/feed-fetcher.js';

const NOW = Date.UTC(2026, 10, 21, 8, 0, 0);
const feed = { id: 'test', name: 'Test', source: 'Test', url: 'https://feeds.test/rss', categoryHint: 'stocks' };
const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>
  <item><title>Fed holds rates</title><link>https://x.test/1</link><pubDate>Sat, 21 Nov 2026 07:00:00 GMT</pubDate></item>
  <item><title>Gold rises</title><link>https://x.test/2</link><pubDate>Sat, 21 Nov 2026 07:30:00 GMT</pubDate></item>
</channel></rss>`;

function fakeFetch(respond) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return respond(url, init);
  };
  return { fetch, calls };
}

const fetcherWith = (respond, options = {}) => {
  const fake = fakeFetch(respond);
  return { ...fake, fetcher: createFeedFetcher({ fetch: fake.fetch, now: () => NOW, ...options }) };
};

describe('fetchFeed', () => {
  it('returns parsed items and caching headers', async () => {
    const { fetcher } = fetcherWith(() => new Response(RSS, { headers: { ETag: '"v1"', 'Last-Modified': 'Sat, 21 Nov 2026 07:30:00 GMT' } }));
    const result = await fetcher.fetchFeed(feed);
    assert.equal(result.ok, true);
    assert.equal(result.notModified, false);
    assert.equal(result.items.length, 2);
    assert.equal(result.etag, '"v1"');
    assert.equal(result.lastModified, 'Sat, 21 Nov 2026 07:30:00 GMT');
  });

  it('sends a privacy-safe request without cookies or referrer', async () => {
    const { fetcher, calls } = fetcherWith(() => new Response(RSS));
    await fetcher.fetchFeed(feed);
    const { init } = calls[0];
    assert.equal(init.credentials, 'omit');
    assert.equal(init.referrerPolicy, 'no-referrer');
    assert.equal(init.cache, 'no-store');
    assert.match(init.headers.Accept, /application\/rss\+xml/);
    assert.equal('If-None-Match' in init.headers, false);
  });

  it('sends the saved ETag and Last-Modified and handles 304', async () => {
    const { fetcher, calls } = fetcherWith(() => new Response(null, { status: 304 }));
    const result = await fetcher.fetchFeed(feed, { etag: '"v1"', lastModified: 'Sat, 21 Nov 2026 07:30:00 GMT' });
    assert.deepEqual(result, { ok: true, notModified: true, items: [], httpStatus: 304 });
    assert.equal(calls[0].init.headers['If-None-Match'], '"v1"');
    assert.equal(calls[0].init.headers['If-Modified-Since'], 'Sat, 21 Nov 2026 07:30:00 GMT');
  });

  it('explains HTTP errors and passes on Retry-After', async () => {
    const { fetcher } = fetcherWith(() => new Response('slow down', { status: 429, headers: { 'Retry-After': '120' } }));
    const { ok, error } = await fetcher.fetchFeed(feed);
    assert.equal(ok, false);
    assert.equal(error.kind, 'http');
    assert.equal(error.httpStatus, 429);
    assert.equal(error.retryAfterMs, 120_000);
    assert.equal(error.message, 'The site answered with HTTP 429 (too many requests, will retry later).');
  });

  it('gives hints for common HTTP failures', async () => {
    for (const [status, text] of [[403, 'blocks automated readers'], [404, 'may have moved'], [503, 'a problem on the site'], [418, 'HTTP 418.']]) {
      const { fetcher } = fetcherWith(() => new Response('', { status }));
      const { error } = await fetcher.fetchFeed(feed);
      assert.ok(error.message.includes(text), error.message);
    }
  });

  it('reports a web page instead of a feed as a parse error', async () => {
    const { fetcher } = fetcherWith(() => new Response('<!doctype html><html><body>Login</body></html>', { headers: { 'Content-Type': 'text/html' } }));
    const { ok, error } = await fetcher.fetchFeed(feed);
    assert.equal(ok, false);
    assert.equal(error.kind, 'parse');
    assert.equal(error.message, 'The address returned a web page, not a feed.');
  });

  it('reports network failures', async () => {
    const { fetcher } = fetcherWith(() => { throw new TypeError('Failed to fetch'); });
    const { error } = await fetcher.fetchFeed(feed);
    assert.equal(error.kind, 'network');
    assert.match(error.message, /Could not reach the site/);
  });

  it('gives up after the timeout', async () => {
    const { fetcher } = fetcherWith((url, init) => new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason));
    }), { timeoutMs: 30 });
    const { error } = await fetcher.fetchFeed(feed);
    assert.equal(error.kind, 'timeout');
    assert.equal(error.message, 'The feed did not answer within 0.03 seconds.');
  });

  it('times out while the body is still arriving', async () => {
    const { fetcher } = fetcherWith((url, init) => {
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('<rss>'));
          init.signal.addEventListener('abort', () => controller.error(init.signal.reason));
        },
      });
      return new Response(body);
    }, { timeoutMs: 30 });
    const { error } = await fetcher.fetchFeed(feed);
    assert.equal(error.kind, 'timeout');
  });

  it('refuses bodies over the size limit, by header or while reading', async () => {
    const declared = fetcherWith(() => new Response('x', { headers: { 'Content-Length': '5000' } }), { maxBytes: 1000 });
    assert.equal((await declared.fetcher.fetchFeed(feed)).error.kind, 'too-large');

    let cancelled = false;
    const streamed = fetcherWith(() => new Response(new ReadableStream({
      pull(controller) { controller.enqueue(new Uint8Array(400)); },
      cancel() { cancelled = true; },
    })), { maxBytes: 1000 });
    assert.equal((await streamed.fetcher.fetchFeed(feed)).error.kind, 'too-large');
    assert.equal(cancelled, true);
  });
});

describe('fetchFeeds', () => {
  it('fetches every feed, keeps going after failures and passes each feed its own state', async () => {
    const feeds = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ ...feed, id, url: `https://feeds.test/${id}` }));
    const { fetcher, calls } = fetcherWith((url) => (url.endsWith('/c') ? new Response('', { status: 500 }) : new Response(RSS)), { concurrency: 2 });
    const results = await fetcher.fetchFeeds(feeds, { b: { etag: '"b"' } });
    assert.deepEqual(results.map(({ feed: f, result }) => [f.id, result.ok]), [['a', true], ['b', true], ['c', false], ['d', true], ['e', true]]);
    assert.equal(calls.find((call) => call.url.endsWith('/b')).init.headers['If-None-Match'], '"b"');
  });
});

describe('testFeed', () => {
  it('summarizes a working feed and ignores the saved ETag', async () => {
    const { fetcher, calls } = fetcherWith(() => new Response(RSS));
    const result = await fetcher.testFeed(feed);
    assert.deepEqual(result, {
      ok: true, durationMs: 0, httpStatus: 200, itemCount: 2, sampleTitle: 'Fed holds rates',
      newestAt: Date.UTC(2026, 10, 21, 7, 30), error: null,
    });
    assert.equal('If-None-Match' in calls[0].init.headers, false);
  });

  it('reports a failing feed', async () => {
    const { fetcher } = fetcherWith(() => new Response('', { status: 404 }));
    const result = await fetcher.testFeed(feed);
    assert.equal(result.ok, false);
    assert.equal(result.httpStatus, 404);
    assert.match(result.error, /may have moved/);
  });

  it('fails a feed that parses but has no usable items', async () => {
    const { fetcher } = fetcherWith(() => new Response('<rss><channel><item><title>No link</title></item></channel></rss>'));
    const result = await fetcher.testFeed(feed);
    assert.equal(result.ok, false);
    assert.equal(result.itemCount, 0);
    assert.equal(result.error, 'The feed has no readable items.');
  });
});

describe('decode', () => {
  const latin1 = new Uint8Array([...new TextEncoder().encode('<?xml version="1.0" encoding="ISO-8859-1"?><t>caf'), 0xe9, ...new TextEncoder().encode('</t>')]);

  it('uses UTF-8 by default', () => {
    assert.equal(decode(new TextEncoder().encode('<t>café</t>'), 'application/xml'), '<t>café</t>');
  });

  it('uses the XML declaration encoding', () => {
    assert.ok(decode(latin1, 'text/xml').includes('café'));
  });

  it('prefers the Content-Type charset and ignores unknown labels', () => {
    assert.ok(decode(latin1, 'text/xml; charset="windows-1252"').includes('café'));
    assert.equal(decode(new TextEncoder().encode('ok'), 'text/xml; charset=nonsense'), 'ok');
  });
});

describe('parseRetryAfter', () => {
  it('reads seconds and HTTP dates', () => {
    assert.equal(parseRetryAfter('30', NOW), 30_000);
    assert.equal(parseRetryAfter(new Date(NOW + 90_000).toUTCString(), NOW), 90_000);
    assert.equal(parseRetryAfter(new Date(NOW - 90_000).toUTCString(), NOW), 0);
    assert.equal(parseRetryAfter(null, NOW), null);
    assert.equal(parseRetryAfter('soon', NOW), null);
  });
});
