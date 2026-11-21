import { childElements, firstChild, isElement, parseXml, textOf } from './xml.js';

export const MAX_ITEMS = 200;

export class FeedParseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FeedParseError';
  }
}

export function parseFeed(text) {
  if (typeof text !== 'string' || text.trim() === '') throw new FeedParseError('The feed was empty.');

  const root = parseXml(text).children.find(isElement);
  switch (root && localName(root.name)) {
    case 'rss':
    case 'rdf':
      return readRss(root, firstChild(root, 'channel') ?? root);
    case 'feed':
      return readAtom(root);
    case 'html':
      throw new FeedParseError('The address returned a web page, not a feed.');
    case undefined:
      throw new FeedParseError('The response is not XML.');
    default:
      throw new FeedParseError(`Not an RSS or Atom feed (found <${root.name}>).`);
  }
}

function readRss(root, channel) {
  const itemParent = childElements(channel, 'item').length > 0 ? channel : root;
  const items = childElements(itemParent, 'item').slice(0, MAX_ITEMS).map((item) => ({
    title: text(item, 'title'),
    link: text(item, 'link') || permalinkGuid(item) || atomLink(item),
    summary: text(item, 'description', 'dc:description', 'content:encoded', 'summary'),
    published: text(item, 'pubdate', 'dc:date', 'published', 'atom:updated', 'a10:updated', 'updated'),
    guid: text(item, 'guid'),
  }));
  return { format: 'rss', title: text(channel, 'title'), items };
}

function readAtom(feed) {
  const items = childElements(feed, 'entry').slice(0, MAX_ITEMS).map((entry) => ({
    title: text(entry, 'title'),
    link: atomLink(entry),
    summary: text(entry, 'summary', 'content'),
    published: text(entry, 'published', 'updated', 'issued'),
    guid: text(entry, 'id'),
  }));
  return { format: 'atom', title: text(feed, 'title'), items };
}

function text(node, ...names) {
  for (const name of names) {
    const value = textOf(firstChild(node, name)).trim();
    if (value) return value;
  }
  return '';
}

function permalinkGuid(item) {
  const guid = firstChild(item, 'guid');
  if (!guid || guid.attrs.ispermalink === 'false') return '';
  const value = textOf(guid).trim();
  return /^https?:\/\//i.test(value) ? value : '';
}

function atomLink(node) {
  const links = node.children.filter((child) => isElement(child) && ['link', 'atom:link'].includes(child.name) && child.attrs.href);
  const alternate = links.find((link) => !link.attrs.rel || link.attrs.rel === 'alternate');
  return (alternate ?? links[0])?.attrs.href ?? '';
}

function localName(name) {
  return name.slice(name.indexOf(':') + 1);
}
