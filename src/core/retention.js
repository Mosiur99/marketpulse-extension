export const NOTIFIED_LIMITS = Object.freeze({ maxAgeMs: 7 * 24 * 60 * 60 * 1000, maxEntries: 2000 });
const DAY_MS = 24 * 60 * 60 * 1000;

/** Newest first; drops stories older than retentionDays, then keeps at most maxArticles. */
export function pruneArticles(articles, { now, retentionDays, maxArticles }) {
  const oldest = now - retentionDays * DAY_MS;
  return articles
    .filter((article) => article.publishedAt >= oldest)
    .sort((a, b) => b.publishedAt - a.publishedAt || b.fetchedAt - a.fetchedAt)
    .slice(0, maxArticles);
}

export function pruneNotified(notified, now, { maxAgeMs, maxEntries } = NOTIFIED_LIMITS) {
  const entries = Object.entries(notified)
    .filter(([, at]) => now - at <= maxAgeMs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxEntries);
  return Object.fromEntries(entries);
}
