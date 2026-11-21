const ESCAPE = /[.*+?^${}()|[\]\\/]/g;
const LETTER_OR_DIGIT = '[\\p{L}\\p{N}]';

/**
 * Whole-word, case-insensitive matching. "sell-off" also matches "selloff" and "sell off";
 * a term ending in a letter also matches its plural ("tariff" -> "tariffs").
 * Where matches overlap ("rate decision" inside "interest rate decision"), only the longest counts.
 * Returns hits in text order, each entry at most once (its first position).
 */
export function createKeywordMatcher(entries) {
  const compiled = entries.map((entry) => ({ entry, pattern: termPattern(entry.term) }));

  return function match(text) {
    const normalized = normalizeText(text);
    const found = [];
    for (const { entry, pattern } of compiled) {
      for (const hit of normalized.matchAll(pattern)) {
        found.push({ entry, start: hit.index, end: hit.index + hit[0].length });
      }
    }
    found.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start);
    const kept = [];
    for (const candidate of found) {
      if (!kept.some((other) => candidate.start < other.end && other.start < candidate.end)) kept.push(candidate);
    }
    kept.sort((a, b) => a.start - b.start);
    const seen = new Set();
    return kept.filter((hit) => !seen.has(hit.entry) && seen.add(hit.entry)).map(({ entry, start }) => ({ entry, start }));
  };
}

export function normalizeText(text) {
  return (text ?? '').toLowerCase().replace(/[‘’ʼ]/g, "'").replace(/[‐-―]/g, '-');
}

function termPattern(term) {
  const body = term
    .trim()
    .toLowerCase()
    .split(/[\s-]+/)
    .map((part) => part.replace(ESCAPE, '\\$&'))
    .join('[\\s-]?');
  const plural = /\p{L}$/u.test(term) ? '(?:s|es)?' : '';
  return new RegExp(`(?<!${LETTER_OR_DIGIT})${body}${plural}(?!${LETTER_OR_DIGIT})`, 'gu');
}
