import { normalizeText } from './keyword-matcher.js';

export const DEDUPE_DEFAULTS = Object.freeze({
  windowMs: 48 * 60 * 60 * 1000,
  threshold: 0.5,
  minSharedWords: 4,
});

const STOP_WORDS = new Set(('a an and are as at be by for from has have in into is it its of on or over says '
  + 'that the this to up was were will with after amid as but can could may more new not than what why how '
  + 'here heres you your we our their they he she his her who about out off down via vs under').split(' '));

export function titleWords(title) {
  const words = normalizeText(title)
    .replace(/'s\b/g, '')
    .split(/[^\p{L}\p{N}%$.]+/u)
    .map((word) => word.replace(/^\.+|\.+$/g, '').replace(/^((?:\p{L}\.)+\p{L})$/u, (abbr) => abbr.replaceAll('.', '')))
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word))
    .map(stem);
  return new Set(words);
}

function stem(word) {
  if (/\d/.test(word) || word.length <= 3) return word;
  const suffix = /(?:ing|ed)$/.exec(word);
  if (suffix && word.length - suffix[0].length >= 4) return word.slice(0, -suffix[0].length);
  return /[^s]s$/.test(word) ? word.slice(0, -1) : word;
}

export function similarity(a, b) {
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  const union = a.size + b.size - shared;
  return { shared, score: union === 0 ? 0 : shared / union };
}

/**
 * Adds new articles to the stored list. An article whose canonical URL is already stored is skipped.
 * One whose headline closely matches another publisher's story from within 48 hours is merged into
 * it: the first report stays and the new publisher joins its alsoReportedBy list. Only different
 * publishers are compared, because one publisher's similar titles are usually separate releases
 * ("Personal Income and Outlays, May 2026" and "..., June 2026").
 * `updated` lists stored stories that gained a source, so they can be scored again.
 */
export function mergeArticles(stored, incoming, options = {}) {
  const { windowMs, threshold, minSharedWords } = { ...DEDUPE_DEFAULTS, ...options };
  const articles = stored.map((article) => ({ ...article }));
  const byId = new Map(articles.map((article) => [article.id, article]));
  const words = new Map(articles.map((article) => [article.id, titleWords(article.title)]));
  const added = [];
  const updated = new Set();
  let duplicates = 0;

  for (const article of incoming) {
    if (byId.has(article.id)) {
      duplicates += 1;
      continue;
    }

    const own = titleWords(article.title);
    const match = findSameStory(articles, words, article, own, { windowMs, threshold, minSharedWords });
    if (match) {
      duplicates += 1;
      const sources = match.alsoReportedBy ?? [];
      if (!sources.includes(article.source)) {
        match.alsoReportedBy = [...sources, article.source];
        if (!added.includes(match)) updated.add(match.id);
      }
      continue;
    }

    const fresh = { ...article, alsoReportedBy: article.alsoReportedBy ?? [] };
    articles.push(fresh);
    byId.set(fresh.id, fresh);
    words.set(fresh.id, own);
    added.push(fresh);
  }

  return { articles, added, updated: [...updated].map((id) => byId.get(id)), duplicates };
}

function findSameStory(articles, words, article, own, { windowMs, threshold, minSharedWords }) {
  let best = null;
  for (const candidate of articles) {
    if (candidate.source === article.source || Math.abs(candidate.publishedAt - article.publishedAt) > windowMs) continue;
    const { shared, score } = similarity(own, words.get(candidate.id));
    if (shared >= minSharedWords && score >= threshold && (!best || score > best.score)) {
      best = { candidate, score };
    }
  }
  return best?.candidate ?? null;
}
