import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FeedParseError, MAX_ITEMS, parseFeed } from '../../src/core/feed-parser.js';

const rss = (items, extra = '') => `<?xml version="1.0"?><rss version="2.0" ${extra}><channel><title>Test</title>${items}</channel></rss>`;

describe('parseFeed', () => {
  it('reads RSS 2.0 items', () => {
    const feed = parseFeed(rss(`<item><title>Fed holds</title><link>https://x.test/1</link>
      <description><![CDATA[<p>Rates unchanged</p>]]></description><pubDate>Fri, 20 Nov 2026 21:04:48 GMT</pubDate>
      <guid isPermaLink="false">abc</guid></item>`));
    assert.equal(feed.format, 'rss');
    assert.equal(feed.title, 'Test');
    assert.deepEqual(feed.items, [{
      title: 'Fed holds',
      link: 'https://x.test/1',
      summary: '<p>Rates unchanged</p>',
      published: 'Fri, 20 Nov 2026 21:04:48 GMT',
      guid: 'abc',
    }]);
  });

  it('falls back to a permalink guid, then an atom:link, when <link> is missing', () => {
    const feed = parseFeed(rss(`
      <item><title>A</title><guid>https://x.test/a</guid></item>
      <item><title>B</title><guid isPermaLink="false">https://x.test/b</guid><atom:link href="https://x.test/b2"/></item>
      <item><title>C</title><guid>not-a-url</guid></item>`));
    assert.deepEqual(feed.items.map((item) => item.link), ['https://x.test/a', 'https://x.test/b2', '']);
  });

  it('uses dc:date and content:encoded when pubDate and description are missing', () => {
    const feed = parseFeed(rss('<item><title>A</title><link>https://x.test</link><dc:date>2026-11-21T07:00:00Z</dc:date><content:encoded>Body</content:encoded></item>'));
    assert.equal(feed.items[0].published, '2026-11-21T07:00:00Z');
    assert.equal(feed.items[0].summary, 'Body');
  });

  it('skips an empty description and uses the next field', () => {
    const feed = parseFeed(rss('<item><title>A</title><link>https://x.test</link><description> </description><content:encoded>Body</content:encoded></item>'));
    assert.equal(feed.items[0].summary, 'Body');
  });

  it('reads RSS 1.0 (RDF) feeds where items sit beside the channel', () => {
    const feed = parseFeed(`<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><channel><title>R</title></channel>
      <item><title>One</title><link>https://x.test/1</link><dc:date>2026-11-21</dc:date></item></rdf:RDF>`);
    assert.equal(feed.format, 'rss');
    assert.equal(feed.items[0].title, 'One');
  });

  it('reads Atom feeds and prefers the alternate link', () => {
    const feed = parseFeed(`<feed xmlns="http://www.w3.org/2005/Atom"><title>A</title>
      <entry><title type="html">ECB &amp;lt;b&amp;gt;decision&amp;lt;/b&amp;gt;</title>
        <link rel="self" href="https://x.test/self"/><link rel="alternate" type="text/html" href="https://x.test/post"/>
        <id>urn:1</id><updated>2026-11-21T08:00:00Z</updated><published>2026-11-21T07:00:00Z</published>
        <summary>Short</summary><content>Long</content></entry></feed>`);
    assert.equal(feed.format, 'atom');
    assert.deepEqual(feed.items[0], {
      title: 'ECB &lt;b&gt;decision&lt;/b&gt;',
      link: 'https://x.test/post',
      summary: 'Short',
      published: '2026-11-21T07:00:00Z',
      guid: 'urn:1',
    });
  });

  it('uses the first Atom link when none is alternate', () => {
    const feed = parseFeed('<feed><entry><title>A</title><link rel="related" href="https://x.test/r"/></entry></feed>');
    assert.equal(feed.items[0].link, 'https://x.test/r');
  });

  it(`keeps at most ${MAX_ITEMS} items`, () => {
    const items = '<item><title>x</title><link>https://x.test</link></item>'.repeat(MAX_ITEMS + 5);
    assert.equal(parseFeed(rss(items)).items.length, MAX_ITEMS);
  });

  it('returns an empty list for a feed with no items', () => {
    assert.deepEqual(parseFeed(rss('')).items, []);
  });

  it('explains when the response is a web page', () => {
    assert.throws(() => parseFeed('<!DOCTYPE html><html><body>Blocked</body></html>'), {
      name: 'FeedParseError',
      message: 'The address returned a web page, not a feed.',
    });
  });

  it('rejects empty responses, plain text and other XML documents', () => {
    assert.throws(() => parseFeed(''), FeedParseError);
    assert.throws(() => parseFeed('Service unavailable'), /not XML/);
    assert.throws(() => parseFeed('<sitemap/>'), /found <sitemap>/);
    assert.throws(() => parseFeed(undefined), FeedParseError);
  });
});
