import { decodeEntities } from './entities.js';

const HIDDEN_BLOCKS = /<(script|style|noscript|template)\b[\s\S]*?<\/\1\s*>/gi;
const COMMENTS = /<!--[\s\S]*?-->/g;
const INLINE_TAGS = /<\/?(a|abbr|b|bdi|bdo|cite|code|data|em|font|i|kbd|mark|q|s|small|span|strong|sub|sup|time|u)\b[^>]*>/gi;
const TAGS = /<\/?[a-z][^>]*>/gi;

export function htmlToText(html) {
  if (typeof html !== 'string' || html === '') return '';
  return decodeEntities(html.replace(HIDDEN_BLOCKS, ' ').replace(COMMENTS, ' ').replace(INLINE_TAGS, '').replace(TAGS, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncate(text, maxLength) {
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > maxLength / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
