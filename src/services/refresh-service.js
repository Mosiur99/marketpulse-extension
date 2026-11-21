import { createClassifier } from '../core/classifier.js';
import { mergeArticles } from '../core/deduper.js';
import { isDue, recordFailure, recordSuccess } from '../core/feed-health.js';
import { createLogger } from '../core/log.js';
import { normalizeItems } from '../core/normalizer.js';
import { pruneArticles, pruneNotified } from '../core/retention.js';

const log = createLogger('refresh');

/**
 * The whole pipeline: fetch due feeds, parse, normalize, merge duplicates, classify, prune, save,
 * then notify. Concurrent calls share the refresh already in progress.
 */
export function createRefreshService({ storage, fetcher, notifier, now = Date.now, onProgress = () => {} }) {
  let running = null;

  function refresh({ reason = 'alarm' } = {}) {
    running ??= run(reason).finally(() => {
      running = null;
    });
    return running;
  }

  async function run(reason) {
    const started = now();
    const settings = await storage.getSettings();
    const allFeeds = await storage.getFeeds();
    const feedState = await storage.read('feedState');
    const feedsById = new Map(allFeeds.map((feed) => [feed.id, feed]));
    const intervalMs = settings.refreshMinutes * 60 * 1000;

    const enabled = allFeeds.filter((feed) => feed.enabled);
    const due = reason === 'manual' ? enabled : enabled.filter((feed) => isDue(feedState[feed.id], started));
    const results = await fetcher.fetchFeeds(due, feedState, onProgress);

    const fetchedAt = now();
    const incoming = [];
    const counts = { ok: 0, notModified: 0, failed: 0, skipped: 0 };
    const nextState = { ...feedState };
    for (const { feed, result } of results) {
      if (result.ok) {
        const { articles, skipped } = normalizeItems(result.items, feed, fetchedAt);
        incoming.push(...articles);
        counts.skipped += skipped;
        counts[result.notModified ? 'notModified' : 'ok'] += 1;
        nextState[feed.id] = recordSuccess(feedState[feed.id], { ...result, itemCount: articles.length }, fetchedAt);
      } else {
        counts.failed += 1;
        nextState[feed.id] = recordFailure(feedState[feed.id], result.error, fetchedAt, intervalMs);
        log.warn(`${feed.id}: ${result.error.message}`);
      }
    }
    for (const id of Object.keys(nextState)) {
      if (!feedsById.has(id)) delete nextState[id];
    }

    const stored = await storage.read('articles');
    const merged = mergeArticles(stored, incoming);
    const classifier = createClassifier(settings);
    for (const article of [...merged.added, ...merged.updated]) {
      Object.assign(article, classifier.classify(article, {
        feed: feedsById.get(article.feedId),
        otherSources: article.alsoReportedBy.length,
        now: fetchedAt,
      }));
    }
    const articles = pruneArticles(merged.articles, { now: fetchedAt, ...settings });
    const keptIds = new Set(articles.map((article) => article.id));
    const added = merged.added.filter((article) => keptIds.has(article.id));

    const coldStart = stored.length === 0;
    const candidates = [...added, ...merged.updated.filter((article) => keptIds.has(article.id))];

    let notified = await storage.read('notified');
    let notifiedCount = 0;
    if (coldStart) {
      notified = { ...notified, ...Object.fromEntries(articles.map((article) => [article.id, fetchedAt])) };
    } else {
      const sent = await notifier.notify(candidates, settings, notified, fetchedAt);
      notifiedCount = sent.shown;
      notified = { ...notified, ...Object.fromEntries(sent.ids.map((id) => [id, fetchedAt])) };
    }

    const summary = {
      reason,
      feeds: due.length,
      ...counts,
      added: added.length,
      duplicates: merged.duplicates,
      notified: notifiedCount,
      total: articles.length,
      durationMs: now() - started,
    };
    await storage.write({
      articles,
      feedState: nextState,
      notified: pruneNotified(notified, fetchedAt),
      meta: { lastRefreshAt: fetchedAt, lastRefreshResult: summary },
    });
    log.info(`refresh (${reason}): ${summary.ok} ok, ${summary.notModified} unchanged, ${summary.failed} failed, `
      + `${summary.added} new, ${summary.duplicates} duplicates, ${summary.notified} notified, ${summary.durationMs} ms`);
    return summary;
  }

  return Object.freeze({ refresh });
}
