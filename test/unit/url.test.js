import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { articleId, canonicalUrl, safeHttpUrl } from '../../src/core/url.js';

describe('safeHttpUrl', () => {
  it('accepts http and https URLs', () => {
    assert.equal(safeHttpUrl(' https://www.cnbc.com/a.html '), 'https://www.cnbc.com/a.html');
    assert.equal(safeHttpUrl('http://example.com'), 'http://example.com/');
  });

  it('rejects other schemes and junk', () => {
    for (const value of ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'chrome://settings', 'not a url', '', null, 7]) {
      assert.equal(safeHttpUrl(value), null, String(value));
    }
  });

  it('rejects URLs with embedded credentials', () => {
    assert.equal(safeHttpUrl('https://bank.com@evil.test/'), null);
  });

  it('resolves relative links against the feed address', () => {
    assert.equal(safeHttpUrl('/business/news/x', 'https://www.thedailystar.net/business/rss.xml'), 'https://www.thedailystar.net/business/news/x');
  });

  it('does not let a relative javascript: link through', () => {
    assert.equal(safeHttpUrl('javascript:alert(1)', 'https://x.test/'), null);
  });
});

describe('canonicalUrl and articleId', () => {
  it('removes tracking parameters, fragment, www, protocol and trailing slash', () => {
    assert.equal(
      canonicalUrl('https://www.bbc.co.uk/news/articles/c1/?at_medium=RSS&at_campaign=rss&utm_source=x#top'),
      'bbc.co.uk/news/articles/c1',
    );
  });

  it('keeps meaningful query parameters in a stable order', () => {
    assert.equal(canonicalUrl('https://x.test/a?id=2&b=1&fbclid=9'), 'x.test/a?b=1&id=2');
  });

  it('collapses repeated slashes in the path', () => {
    assert.equal(canonicalUrl('https://www.ecb.europa.eu//press/key/x.html'), 'ecb.europa.eu/press/key/x.html');
  });

  it('gives the same id to variants of one article and different ids to different articles', () => {
    const id = articleId('https://www.cnbc.com/2026/11/20/fed.html');
    assert.match(id, /^a_[0-9a-f]{16}$/);
    assert.equal(articleId('http://cnbc.com/2026/11/20/fed.html?utm_source=rss#x'), id);
    assert.notEqual(articleId('https://www.cnbc.com/2026/11/20/ecb.html'), id);
  });
});
