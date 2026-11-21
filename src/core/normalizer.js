import { htmlToText, truncate } from './text.js';
import { articleId, safeHttpUrl } from './url.js';

export const FIELD_LIMITS = Object.freeze({ title: 300, summary: 400 });

const FUTURE_TOLERANCE_MS = 10 * 60 * 1000;
const EARLIEST_VALID_DATE = Date.UTC(2000, 0, 1);
const DATE_TIME_WITHOUT_ZONE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/;

export function normalizeItems(rawItems, feed, now) {
  const articles = [];
  const ids = new Set();
  let skipped = 0;
  for (const raw of rawItems) {
    const article = normalizeItem(raw, feed, now);
    if (!article || ids.has(article.id)) {
      skipped += 1;
      continue;
    }
    ids.add(article.id);
    articles.push(article);
  }
  return { articles, skipped };
}

export function normalizeItem(raw, feed, now) {
  const title = truncate(htmlToText(raw?.title), FIELD_LIMITS.title);
  const url = safeHttpUrl(raw?.link, feed.url);
  if (!title || !url) return null;

  const { time, estimated } = parseFeedDate(raw.published, now);
  return {
    id: articleId(url),
    title,
    summary: truncate(htmlToText(raw.summary), FIELD_LIMITS.summary),
    url,
    source: feed.source,
    feedId: feed.id,
    publishedAt: time,
    dateEstimated: estimated,
    fetchedAt: now,
  };
}

/**
 * Dates without a time zone (Investing.com sends "2026-11-21 07:01:11") are read as UTC.
 * Chrome would read them as local time. Other formats (RFC 822 with GMT, EST, +0600, Z,
 * two-digit years; ISO 8601) are left to Date.parse.
 */
export function parseFeedDate(value, now) {
  const text = typeof value === 'string' ? value.trim() : '';
  const noZone = DATE_TIME_WITHOUT_ZONE.exec(text);
  const time = noZone
    ? Date.UTC(+noZone[1], +noZone[2] - 1, +noZone[3], +noZone[4], +noZone[5], +(noZone[6] ?? 0))
    : Date.parse(text);

  if (Number.isNaN(time) || time < EARLIEST_VALID_DATE || time > now + FUTURE_TOLERANCE_MS) {
    return { time: now, estimated: true };
  }
  return { time, estimated: false };
}
