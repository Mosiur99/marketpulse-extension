import { CATEGORY_IDS } from './categories.js';

export const LIMITS = Object.freeze({
  refreshMinutes: { min: 5, max: 120 },
  maxNotificationsPerRefresh: { min: 1, max: 10 },
  highThreshold: { min: 1, max: 100 },
  mediumThreshold: { min: 1, max: 100 },
  maxArticles: { min: 100, max: 2000 },
  retentionDays: { min: 1, max: 30 },
  customKeywordWeight: { min: 1, max: 10 },
  customKeywordCount: 50,
  customKeywordLength: 60,
});

export const NOTIFY_MODES = Object.freeze(['each', 'digest']);
export const PRIORITIES = Object.freeze(['high', 'medium', 'low']);
export const THEMES = Object.freeze(['dark', 'light']);

const allCategories = (value) => Object.fromEntries(CATEGORY_IDS.map((id) => [id, value]));

export const DEFAULT_SETTINGS = Object.freeze({
  refreshMinutes: 15,
  notificationsEnabled: true,
  notifyMode: 'each',
  maxNotificationsPerRefresh: 3,
  notifyMinPriority: 'high',
  notifyCategories: Object.freeze(allCategories(true)),
  enabledCategories: Object.freeze(allCategories(true)),
  highThreshold: 8,
  mediumThreshold: 4,
  customKeywords: Object.freeze([]),
  theme: 'dark',
  maxArticles: 500,
  retentionDays: 7,
  debugLogging: false,
});

const INTEGER_FIELDS = ['refreshMinutes', 'maxNotificationsPerRefresh', 'highThreshold', 'mediumThreshold', 'maxArticles', 'retentionDays'];
const BOOLEAN_FIELDS = ['notificationsEnabled', 'debugLogging'];
const CHOICE_FIELDS = { notifyMode: NOTIFY_MODES, notifyMinPriority: PRIORITIES, theme: THEMES };
const CATEGORY_MAP_FIELDS = ['notifyCategories', 'enabledCategories'];

/**
 * Returns a complete settings object: defaults for missing or invalid fields, unknown fields dropped.
 * `errors` lists every invalid field so a form can show it; storage loads can ignore them.
 */
export function validateSettings(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const errors = [];
  const settings = structuredClone(DEFAULT_SETTINGS);

  for (const field of INTEGER_FIELDS) {
    if (!(field in source)) continue;
    const { min, max } = LIMITS[field];
    const value = source[field];
    if (Number.isInteger(value) && value >= min && value <= max) {
      settings[field] = value;
    } else {
      errors.push({ field, message: `Must be a whole number from ${min} to ${max}.` });
    }
  }

  for (const field of BOOLEAN_FIELDS) {
    if (!(field in source)) continue;
    if (typeof source[field] === 'boolean') {
      settings[field] = source[field];
    } else {
      errors.push({ field, message: 'Must be on or off.' });
    }
  }

  for (const [field, choices] of Object.entries(CHOICE_FIELDS)) {
    if (!(field in source)) continue;
    if (choices.includes(source[field])) {
      settings[field] = source[field];
    } else {
      errors.push({ field, message: `Must be one of: ${choices.join(', ')}.` });
    }
  }

  for (const field of CATEGORY_MAP_FIELDS) {
    if (!(field in source)) continue;
    const map = source[field];
    if (!map || typeof map !== 'object' || Array.isArray(map)) {
      errors.push({ field, message: 'Must list categories as on or off.' });
      continue;
    }
    for (const id of CATEGORY_IDS) {
      if (typeof map[id] === 'boolean') settings[field][id] = map[id];
    }
  }

  if ('customKeywords' in source) {
    const result = validateCustomKeywords(source.customKeywords);
    settings.customKeywords = result.keywords;
    errors.push(...result.errors);
  }

  if (settings.mediumThreshold >= settings.highThreshold) {
    errors.push({ field: 'mediumThreshold', message: 'Medium threshold must be lower than the high threshold.' });
    settings.highThreshold = DEFAULT_SETTINGS.highThreshold;
    settings.mediumThreshold = DEFAULT_SETTINGS.mediumThreshold;
  }

  return { settings, errors };
}

function validateCustomKeywords(value) {
  if (!Array.isArray(value)) {
    return { keywords: [], errors: [{ field: 'customKeywords', message: 'Must be a list of keywords.' }] };
  }

  const errors = [];
  const keywords = [];
  const seen = new Set();
  const { min, max } = LIMITS.customKeywordWeight;

  for (const [index, entry] of value.entries()) {
    const term = typeof entry?.term === 'string' ? entry.term.trim().toLowerCase().replace(/\s+/g, ' ') : '';
    const field = `customKeywords[${index}]`;
    if (!term || term.length > LIMITS.customKeywordLength) {
      errors.push({ field, message: `Keyword must be 1 to ${LIMITS.customKeywordLength} characters.` });
      continue;
    }
    if (seen.has(term)) {
      errors.push({ field, message: `"${term}" is already in the list.` });
      continue;
    }
    if (!Number.isInteger(entry.weight) || entry.weight < min || entry.weight > max) {
      errors.push({ field, message: `Weight must be a whole number from ${min} to ${max}.` });
      continue;
    }
    seen.add(term);
    keywords.push({ term, weight: entry.weight, alwaysNotify: entry.alwaysNotify === true });
  }

  if (keywords.length > LIMITS.customKeywordCount) {
    errors.push({ field: 'customKeywords', message: `Keep at most ${LIMITS.customKeywordCount} keywords.` });
    keywords.length = LIMITS.customKeywordCount;
  }

  return { keywords, errors };
}
