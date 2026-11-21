import { safeHttpUrl } from '../../core/url.js';

/**
 * Builds elements without innerHTML: every string child becomes a text node, so feed text can never
 * become markup. Attributes starting with "on" are refused for the same reason.
 */
export function h(tag, props = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on')) throw new Error(`Use addEventListener instead of ${key}`);
    if (key === 'class') element.className = value;
    else if (key === 'dataset') Object.assign(element.dataset, value);
    else if (key in element && typeof value !== 'string') element[key] = value;
    else element.setAttribute(key, value === true ? '' : String(value));
  }
  append(element, children);
  return element;
}

function append(parent, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** An external link, or plain text when the URL is not http(s). */
export function externalLink(url, ...children) {
  const href = safeHttpUrl(url);
  if (!href) return h('span', {}, ...children);
  return h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, ...children);
}

export function replaceChildren(parent, ...children) {
  parent.replaceChildren();
  append(parent, children);
}
