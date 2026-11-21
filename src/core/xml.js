import { decodeEntities } from './entities.js';

/*
 * A small, forgiving XML reader for RSS and Atom. MV3 service workers have no DOMParser.
 * Element and attribute names are lower-cased; text is entity-decoded; CDATA is kept as is.
 * Broken markup never throws: unclosed elements are closed by their parent's end tag,
 * stray end tags are ignored and a truncated document keeps what was read.
 */

const NAME_START = /[A-Za-z_:]/;
const ATTRIBUTE = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

export function parseXml(text) {
  const root = { name: '#document', attrs: {}, children: [] };
  const stack = [root];
  const current = () => stack[stack.length - 1];
  const addText = (value) => {
    if (value) current().children.push(value);
  };

  let index = 0;
  while (index < text.length) {
    const open = text.indexOf('<', index);
    if (open === -1) {
      addText(decodeEntities(text.slice(index)));
      break;
    }
    if (open > index) addText(decodeEntities(text.slice(index, open)));

    if (text.startsWith('<![CDATA[', open)) {
      const end = text.indexOf(']]>', open + 9);
      addText(text.slice(open + 9, end === -1 ? text.length : end));
      index = end === -1 ? text.length : end + 3;
    } else if (text.startsWith('<!--', open)) {
      index = skipPast(text, '-->', open + 4);
    } else if (text.startsWith('<?', open)) {
      index = skipPast(text, '?>', open + 2);
    } else if (text.startsWith('<!', open)) {
      index = skipDeclaration(text, open);
    } else if (text[open + 1] === '/') {
      const end = text.indexOf('>', open);
      if (end === -1) break;
      closeElement(stack, text.slice(open + 2, end).trim().toLowerCase());
      index = end + 1;
    } else if (NAME_START.test(text[open + 1] ?? '')) {
      const end = findTagEnd(text, open + 1);
      if (end === -1) break;
      const element = readStartTag(text.slice(open + 1, end));
      current().children.push(element);
      if (!element.selfClosing) stack.push(element);
      delete element.selfClosing;
      index = end + 1;
    } else {
      addText('<');
      index = open + 1;
    }
  }

  return root;
}

export function isElement(node) {
  return typeof node === 'object' && node !== null;
}

export function childElements(node, name) {
  return node.children.filter((child) => isElement(child) && (name === undefined || child.name === name));
}

export function firstChild(node, ...names) {
  for (const name of names) {
    const found = node.children.find((child) => isElement(child) && child.name === name);
    if (found) return found;
  }
  return undefined;
}

export function textOf(node) {
  if (!node) return '';
  let text = '';
  const pending = [...node.children].reverse();
  while (pending.length > 0) {
    const next = pending.pop();
    if (typeof next === 'string') text += next;
    else for (let i = next.children.length - 1; i >= 0; i -= 1) pending.push(next.children[i]);
  }
  return text;
}

function readStartTag(body) {
  const selfClosing = body.endsWith('/');
  const content = selfClosing ? body.slice(0, -1) : body;
  const nameEnd = content.search(/[\s/]|$/);
  const element = { name: content.slice(0, nameEnd).toLowerCase(), attrs: {}, children: [], selfClosing };
  for (const match of content.slice(nameEnd).matchAll(ATTRIBUTE)) {
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    element.attrs[match[1].toLowerCase()] = decodeEntities(value);
  }
  return element;
}

function closeElement(stack, name) {
  for (let depth = stack.length - 1; depth > 0; depth -= 1) {
    if (stack[depth].name === name) {
      stack.length = depth;
      return;
    }
  }
}

function findTagEnd(text, from) {
  let quote = null;
  for (let i = from; i < text.length; i += 1) {
    const char = text[i];
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '>') {
      return i;
    }
  }
  return text.indexOf('>', from);
}

function skipPast(text, marker, from) {
  const end = text.indexOf(marker, from);
  return end === -1 ? text.length : end + marker.length;
}

function skipDeclaration(text, open) {
  const end = text.indexOf('>', open);
  const subsetStart = text.indexOf('[', open);
  if (subsetStart !== -1 && (end === -1 || subsetStart < end)) return skipPast(text, ']>', subsetStart);
  return end === -1 ? text.length : end + 1;
}
