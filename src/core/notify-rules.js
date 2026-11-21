const PRIORITY_RANK = Object.freeze({ low: 0, medium: 1, high: 2 });
export const MAX_NOTIFY_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Decides what to show for this refresh. Every chosen article is marked as notified, including the
 * ones only counted in the summary, so nothing is announced twice.
 * mode "each": up to maxNotificationsPerRefresh single alerts, the rest in one summary.
 * mode "digest": one alert when a single story qualifies, otherwise one summary of all of them.
 */
export function selectNotifications(candidates, settings, notified, now) {
  if (!settings.notificationsEnabled) return { single: [], summary: [], ids: [] };

  const seen = new Set();
  const eligible = candidates
    .filter((article) => {
      if (seen.has(article.id) || notified[article.id]) return false;
      seen.add(article.id);
      return isEligible(article, settings, now);
    })
    .sort((a, b) => Number(b.breaking) - Number(a.breaking) || (b.alertKeywords?.length ?? 0) - (a.alertKeywords?.length ?? 0)
      || b.score - a.score || b.publishedAt - a.publishedAt);

  const singleCount = settings.notifyMode === 'digest'
    ? (eligible.length === 1 ? 1 : 0)
    : settings.maxNotificationsPerRefresh;
  return {
    single: eligible.slice(0, singleCount),
    summary: eligible.slice(singleCount),
    ids: eligible.map((article) => article.id),
  };
}

function isEligible(article, settings, now) {
  if (now - article.publishedAt > MAX_NOTIFY_AGE_MS) return false;
  if (settings.enabledCategories[article.category] === false) return false;
  if (article.alertKeywords?.length > 0) return true;
  return settings.notifyCategories[article.category] !== false
    && PRIORITY_RANK[article.priority] >= PRIORITY_RANK[settings.notifyMinPriority];
}
