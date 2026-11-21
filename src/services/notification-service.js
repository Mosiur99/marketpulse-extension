import { categoryLabel } from '../config/categories.js';
import { selectNotifications } from '../core/notify-rules.js';
import { safeHttpUrl } from '../core/url.js';

export const SUMMARY_PREFIX = 'summary:';
const ICON = 'icons/icon128.png';
const SUMMARY_LINES = 3;

export function createNotificationService({ notifications, tabs, runtime, storage, now = Date.now }) {
  async function notify(candidates, settings, notified, at) {
    const { single, summary, ids } = selectNotifications(candidates, settings, notified, at);
    for (const article of single) {
      await notifications.create(article.id, articleNotification(article, runtime));
    }
    if (summary.length > 0) {
      await notifications.create(`${SUMMARY_PREFIX}${at}`, summaryNotification(summary, single.length > 0, runtime));
    }
    return { ids, shown: single.length + (summary.length > 0 ? 1 : 0) };
  }

  async function showTest() {
    const id = `${SUMMARY_PREFIX}test-${now()}`;
    await notifications.create(id, {
      type: 'basic',
      iconUrl: runtime.getURL(ICON),
      title: 'MarketPulse notifications are working',
      message: 'Important market news will appear like this. Click to open the dashboard.',
    });
    return id;
  }

  /** Opens the article (or the dashboard for a summary). Only http(s) links are ever opened. */
  async function handleClick(notificationId) {
    await notifications.clear(notificationId);
    if (notificationId.startsWith(SUMMARY_PREFIX)) {
      await tabs.create({ url: runtime.getURL('src/ui/dashboard/dashboard.html') });
      return 'dashboard';
    }
    const [articles, bookmarks] = await Promise.all([storage.read('articles'), storage.read('bookmarks')]);
    const article = [...articles, ...bookmarks].find((candidate) => candidate.id === notificationId);
    const url = safeHttpUrl(article?.url);
    if (!url) return null;
    await tabs.create({ url });
    return url;
  }

  return Object.freeze({ notify, showTest, handleClick });
}

function articleNotification(article, runtime) {
  const label = article.breaking ? 'Breaking' : `${capitalize(article.priority)} priority`;
  return {
    type: 'basic',
    iconUrl: runtime.getURL(ICON),
    title: `${label} · ${categoryLabel(article.category)}`,
    message: article.title,
    contextMessage: article.alsoReportedBy?.length ? `${article.source} + ${article.alsoReportedBy.length} more` : article.source,
    priority: article.breaking ? 2 : 1,
  };
}

function summaryNotification(articles, afterSingles, runtime) {
  const count = articles.length;
  const lines = articles.slice(0, SUMMARY_LINES).map((article) => `• ${article.title}`);
  if (count > SUMMARY_LINES) lines.push(`and ${count - SUMMARY_LINES} more`);
  return {
    type: 'basic',
    iconUrl: runtime.getURL(ICON),
    title: `${count} ${afterSingles ? 'more ' : ''}important ${count === 1 ? 'story' : 'stories'}`,
    message: lines.join('\n'),
    contextMessage: 'Click to open the dashboard',
    priority: 1,
  };
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
