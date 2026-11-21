import { CATEGORIES } from '../../config/categories.js';

export const BREAKING_DISPLAY_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A story keeps its Breaking label for six hours after publication. */
export function isBreakingNow(article, now) {
  return Boolean(article.breaking) && now - article.publishedAt <= BREAKING_DISPLAY_MS;
}

export function filterArticles(articles, { view = 'all', category = null, source = null, query = '', enabledCategories = {}, now }) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return articles.filter((article) => {
    if (enabledCategories[article.category] === false) return false;
    if (view === 'breaking' && !isBreakingNow(article, now)) return false;
    if (view === 'high' && article.priority !== 'high') return false;
    if (category && article.category !== category) return false;
    if (source && article.source !== source && !(article.alsoReportedBy ?? []).includes(source)) return false;
    if (words.length > 0) {
      const text = `${article.title} ${article.summary ?? ''} ${article.source}`.toLowerCase();
      if (!words.every((word) => text.includes(word))) return false;
    }
    return true;
  });
}

/** The highest-scoring stories of the last 24 hours, at most one per category. */
export function topStories(articles, now, limit = 4) {
  const picked = [];
  const categories = new Set();
  const recent = articles
    .filter((article) => now - article.publishedAt <= DAY_MS && article.score > 0)
    .sort((a, b) => b.score - a.score || b.publishedAt - a.publishedAt);
  for (const article of recent) {
    if (categories.has(article.category)) continue;
    categories.add(article.category);
    picked.push(article);
    if (picked.length === limit) break;
  }
  return picked;
}

export function computeStats(articles, { feeds = [], feedState = {}, meta = {}, now }) {
  const byCategory = CATEGORIES.map(({ id, label }) => ({ id, label, count: articles.filter((article) => article.category === id).length }));
  const sources = [...new Set(articles.flatMap((article) => [article.source, ...(article.alsoReportedBy ?? [])]))].sort((a, b) => a.localeCompare(b));
  const enabled = feeds.filter((feed) => feed.enabled);
  const failingFeeds = enabled
    .filter((feed) => (feedState[feed.id]?.failures ?? 0) > 0)
    .map((feed) => ({ id: feed.id, name: feed.name, error: feedState[feed.id].lastError }));
  return {
    total: articles.length,
    breaking: articles.filter((article) => isBreakingNow(article, now)).length,
    high: articles.filter((article) => article.priority === 'high').length,
    last24h: articles.filter((article) => now - article.publishedAt <= DAY_MS).length,
    byCategory,
    sources,
    feedHealth: { enabled: enabled.length, ok: enabled.length - failingFeeds.length, failingFeeds },
    lastRefreshAt: meta.lastRefreshAt ?? null,
    lastRefreshResult: meta.lastRefreshResult ?? null,
  };
}
