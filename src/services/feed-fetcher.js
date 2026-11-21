import { mapWithConcurrency } from '../core/concurrency.js';
import { FeedParseError, parseFeed } from '../core/feed-parser.js';
import { normalizeItems } from '../core/normalizer.js';

export const FETCH_DEFAULTS = Object.freeze({
  timeoutMs: 10_000,
  maxBytes: 2 * 1024 * 1024,
  concurrency: 4,
});

const ACCEPT = 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.1';
const HTTP_HINTS = Object.freeze({
  401: 'the feed needs a login',
  403: 'the site blocks automated readers',
  404: 'the feed address may have moved',
  410: 'the feed was removed',
  429: 'too many requests, will retry later',
});

export class FetchError extends Error {
  constructor(kind, message, { httpStatus = null, retryAfterMs = null } = {}) {
    super(message);
    this.name = 'FetchError';
    this.kind = kind;
    this.httpStatus = httpStatus;
    this.retryAfterMs = retryAfterMs;
  }
}

export function createFeedFetcher({ fetch = globalThis.fetch, now = Date.now, ...options } = {}) {
  const { timeoutMs, maxBytes, concurrency } = { ...FETCH_DEFAULTS, ...options };

  async function download(url, conditional = {}) {
    const headers = { Accept: ACCEPT };
    if (conditional.etag) headers['If-None-Match'] = conditional.etag;
    if (conditional.lastModified) headers['If-Modified-Since'] = conditional.lastModified;

    const controller = new AbortController();
    const { signal } = controller;
    const timer = setTimeout(() => controller.abort(new DOMException('Feed timed out', 'TimeoutError')), timeoutMs);
    try {
      const response = await fetch(url, {
        headers,
        signal,
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
      if (response.status === 304) return { notModified: true, httpStatus: 304 };
      if (!response.ok) {
        throw new FetchError('http', httpMessage(response.status), {
          httpStatus: response.status,
          retryAfterMs: parseRetryAfter(response.headers.get('Retry-After'), now()),
        });
      }
      const text = await readText(response, maxBytes);
      return {
        notModified: false,
        httpStatus: response.status,
        text,
        etag: response.headers.get('ETag'),
        lastModified: response.headers.get('Last-Modified'),
      };
    } catch (error) {
      throw toFetchError(error, signal, timeoutMs);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Fetches and parses one feed. Never throws: failures come back as { ok: false, error }. */
  async function fetchFeed(feed, state) {
    try {
      const result = await download(feed.url, state ?? {});
      if (result.notModified) return { ok: true, notModified: true, items: [], httpStatus: 304 };
      const parsed = parseFeed(result.text);
      return {
        ok: true,
        notModified: false,
        items: parsed.items,
        httpStatus: result.httpStatus,
        etag: result.etag,
        lastModified: result.lastModified,
      };
    } catch (error) {
      const failure = error instanceof FeedParseError ? new FetchError('parse', error.message) : error;
      return { ok: false, error: failure };
    }
  }

  function fetchFeeds(feeds, states = {}) {
    return mapWithConcurrency(feeds, concurrency, async (feed) => ({ feed, result: await fetchFeed(feed, states[feed.id]) }));
  }

  /** Used by the Test button: a fresh download, ignoring the saved ETag. */
  async function testFeed(feed) {
    const started = now();
    const result = await fetchFeed(feed, null);
    const durationMs = now() - started;
    if (!result.ok) {
      return { ok: false, durationMs, httpStatus: result.error.httpStatus, error: result.error.message };
    }
    const { articles } = normalizeItems(result.items, feed, now());
    return {
      ok: articles.length > 0,
      durationMs,
      httpStatus: result.httpStatus,
      itemCount: articles.length,
      sampleTitle: articles[0]?.title ?? null,
      newestAt: articles.reduce((newest, article) => Math.max(newest, article.publishedAt), 0) || null,
      error: articles.length > 0 ? null : 'The feed has no readable items.',
    };
  }

  return Object.freeze({ fetchFeed, fetchFeeds, testFeed });
}

async function readText(response, maxBytes) {
  const declared = Number(response.headers.get('Content-Length'));
  if (declared > maxBytes) throw tooLarge(maxBytes);

  const chunks = [];
  let total = 0;
  if (response.body) {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw tooLarge(maxBytes);
      }
      chunks.push(value);
    }
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return decode(bytes, response.headers.get('Content-Type'));
}

export function decode(bytes, contentType) {
  const fromHeader = /charset\s*=\s*"?([\w-]+)/i.exec(contentType ?? '')?.[1];
  const prolog = new TextDecoder('ascii').decode(bytes.subarray(0, 200));
  const fromProlog = /^\s*<\?xml[^>]*encoding\s*=\s*["']([\w-]+)["']/i.exec(prolog)?.[1];
  for (const label of [fromHeader, fromProlog, 'utf-8']) {
    if (!label) continue;
    try {
      return new TextDecoder(label).decode(bytes);
    } catch {
      continue;
    }
  }
  return new TextDecoder().decode(bytes);
}

export function parseRetryAfter(value, now) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(date - now, 0);
}

function httpMessage(status) {
  const hint = HTTP_HINTS[status] ?? (status >= 500 ? 'a problem on the site' : null);
  return `The site answered with HTTP ${status}${hint ? ` (${hint})` : ''}.`;
}

function tooLarge(maxBytes) {
  return new FetchError('too-large', `The feed is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`);
}

function toFetchError(error, signal, timeoutMs) {
  if (error instanceof FetchError) return error;
  if (signal.aborted && signal.reason?.name === 'TimeoutError') {
    return new FetchError('timeout', `The feed did not answer within ${timeoutMs / 1000} seconds.`);
  }
  return new FetchError('network', 'Could not reach the site (offline, blocked, or access not allowed).');
}
