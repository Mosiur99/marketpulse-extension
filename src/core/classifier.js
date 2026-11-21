import { CATEGORIES, DEFAULT_CATEGORY_ID } from '../config/categories.js';
import { IMPORTANCE_RULES, URGENT_PHRASES } from '../config/keywords.js';
import { createKeywordMatcher } from './keyword-matcher.js';

export const BREAKING_WINDOW_MS = 60 * 60 * 1000;
export const MAX_SOURCE_BONUS = 3;
const TITLE_FACTOR = 2;
const SOURCE_BONUS = 2;
const BREAKING_SOURCE_COUNT = 3;

/**
 * Build once per refresh: it compiles every keyword, including the user's own.
 * classify() is pure, so a merged duplicate can simply be classified again.
 */
export function createClassifier(settings, { rules = IMPORTANCE_RULES, categories = CATEGORIES, urgentPhrases = URGENT_PHRASES } = {}) {
  const matchImportance = createKeywordMatcher(rules);
  const matchCustom = createKeywordMatcher(settings.customKeywords);
  const matchUrgent = createKeywordMatcher(urgentPhrases.map((term) => ({ term })));
  const matchTopic = createKeywordMatcher(categories.flatMap((category) => category.keywords.map((term) => ({ term, category }))));

  function classify(article, { feed, otherSources = 0, now }) {
    const title = article.title;
    const summary = article.summary ?? '';

    const importance = weigh(matchImportance, title, summary);
    const custom = weigh(matchCustom, title, summary);
    const sourceBonus = SOURCE_BONUS * Math.min(otherSources, MAX_SOURCE_BONUS);
    const score = round(importance.total * (feed?.weight ?? 1) + sourceBonus + custom.total);
    const priority = priorityFor(score, settings);

    const recent = now - article.publishedAt <= BREAKING_WINDOW_MS;
    const urgent = matchUrgent(title).length > 0;
    const breaking = recent && (priority === 'high' || urgent || otherSources + 1 >= BREAKING_SOURCE_COUNT);

    return {
      category: chooseCategory(matchTopic(title), feed?.categoryHint, categories),
      score,
      priority,
      breaking,
      matched: [...importance.terms, ...custom.terms],
      alertKeywords: custom.entries.filter((entry) => entry.alwaysNotify).map((entry) => entry.term),
    };
  }

  return Object.freeze({ classify });
}

export function priorityFor(score, { highThreshold, mediumThreshold }) {
  if (score >= highThreshold) return 'high';
  if (score >= mediumThreshold) return 'medium';
  return 'low';
}

function weigh(match, title, summary) {
  const inTitle = match(title).map((hit) => hit.entry);
  const titleSet = new Set(inTitle);
  const inSummary = match(summary).map((hit) => hit.entry).filter((entry) => !titleSet.has(entry));
  const entries = [...inTitle, ...inSummary];
  const total = inTitle.reduce((sum, entry) => sum + entry.weight * TITLE_FACTOR, 0)
    + inSummary.reduce((sum, entry) => sum + entry.weight, 0);
  const terms = [...entries].sort((a, b) => b.weight - a.weight).map((entry) => entry.term);
  return { total, entries, terms };
}

/**
 * A regional category (Bangladesh) wins when its feed or headline points to it, because a local
 * story about gold or GDP still belongs there. Otherwise the first topic word in the headline
 * decides, since headlines lead with their subject. Then the feed's own hint, then the default.
 */
function chooseCategory(titleHits, hint, categories) {
  const regional = categories.find((category) => category.regional
    && (hint === category.id || titleHits.some((hit) => hit.entry.category === category)));
  return regional?.id ?? titleHits[0]?.entry.category.id ?? hint ?? DEFAULT_CATEGORY_ID;
}

function round(value) {
  return Math.round(value * 10) / 10;
}
