import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { childElements, firstChild, parseXml, textOf } from '../../src/core/xml.js';

const rootOf = (xml) => parseXml(xml).children.find((node) => typeof node === 'object');

describe('parseXml', () => {
  it('reads nested elements, attributes and text', () => {
    const root = rootOf('<?xml version="1.0"?><rss version="2.0"><channel><title>News</title></channel></rss>');
    assert.equal(root.name, 'rss');
    assert.deepEqual(root.attrs, { version: '2.0' });
    assert.equal(textOf(firstChild(firstChild(root, 'channel'), 'title')), 'News');
  });

  it('lower-cases element and attribute names, keeping namespace prefixes', () => {
    const root = rootOf('<Item><pubDate>x</pubDate><dc:Date>y</dc:Date><guid isPermaLink="false">z</guid></Item>');
    assert.equal(root.name, 'item');
    assert.deepEqual(childElements(root).map((el) => el.name), ['pubdate', 'dc:date', 'guid']);
    assert.deepEqual(firstChild(root, 'guid').attrs, { ispermalink: 'false' });
  });

  it('decodes entities in text and attributes', () => {
    const root = rootOf('<a title="AT&amp;T &quot;x&quot;">5 &lt; 6 &amp; caf&#233; &#x2014; &rsquo;</a>');
    assert.equal(root.attrs.title, 'AT&T "x"');
    assert.equal(textOf(root), '5 < 6 & café — ’');
  });

  it('keeps CDATA content as is', () => {
    const root = rootOf('<d><![CDATA[<p>Fed &amp; ECB</p>]]></d>');
    assert.equal(textOf(root), '<p>Fed &amp; ECB</p>');
  });

  it('handles self-closing tags, single quotes and unquoted attributes', () => {
    const root = rootOf("<e><link href='https://x.test/a' rel=alternate/><content:encoded/></e>");
    assert.deepEqual(childElements(root).map((el) => el.name), ['link', 'content:encoded']);
    assert.deepEqual(firstChild(root, 'link').attrs, { href: 'https://x.test/a', rel: 'alternate' });
  });

  it('reads ">" inside quoted attribute values', () => {
    const root = rootOf('<a note="1 > 0">ok</a>');
    assert.equal(root.attrs.note, '1 > 0');
    assert.equal(textOf(root), 'ok');
  });

  it('skips comments, processing instructions and DOCTYPE with an internal subset', () => {
    const xml = '<!DOCTYPE rss [<!ENTITY x "y">]><!-- note --><?xml-stylesheet href="s.xsl"?><rss>ok</rss>';
    const root = rootOf(xml);
    assert.equal(root.name, 'rss');
    assert.equal(textOf(root), 'ok');
  });

  it('closes unclosed children at the parent end tag', () => {
    const root = rootOf('<item><title><a href="/x">Headline</title><link>https://x.test</link></item>');
    assert.equal(textOf(firstChild(root, 'title')), 'Headline');
    assert.equal(textOf(firstChild(root, 'link')), 'https://x.test');
  });

  it('ignores stray end tags', () => {
    const root = rootOf('<a>one</b>two</a>');
    assert.equal(textOf(root), 'onetwo');
  });

  it('keeps what it read from a truncated document', () => {
    const root = rootOf('<rss><item><title>First</title></item><item><title>Sec');
    assert.equal(childElements(root, 'item').length, 2);
    assert.equal(textOf(firstChild(root, 'item')), 'First');
  });

  it('treats a bare "<" in text as text', () => {
    assert.equal(textOf(rootOf('<a>x < y</a>')), 'x < y');
  });

  it('survives a tag with an unclosed quote', () => {
    const root = rootOf('<a><b href="x>text</b><c>ok</c></a>');
    assert.equal(textOf(firstChild(root, 'c')), 'ok');
  });

  it('reads deeply nested text without recursion', () => {
    const depth = 20000;
    const xml = '<a>'.repeat(depth) + 'deep' + '</a>'.repeat(depth);
    assert.equal(textOf(rootOf(xml)), 'deep');
  });
});
