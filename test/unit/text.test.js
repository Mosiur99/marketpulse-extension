import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decodeEntities } from '../../src/core/entities.js';
import { htmlToText, truncate } from '../../src/core/text.js';

describe('decodeEntities', () => {
  it('decodes named, decimal and hex entities', () => {
    assert.equal(decodeEntities('&amp; &nbsp;&hellip; &#8217; &#x20AC; &EURO;'), '&  … ’ € €');
  });

  it('leaves unknown entities and bare ampersands alone', () => {
    assert.equal(decodeEntities('AT&T &unknown; R&D'), 'AT&T &unknown; R&D');
  });

  it('drops invalid code points', () => {
    assert.equal(decodeEntities('a&#0;b&#xD800;c&#x110000;d'), 'abcd');
  });
});

describe('htmlToText', () => {
  it('removes tags and collapses whitespace', () => {
    assert.equal(htmlToText('<p>Gold <b>rises</b></p>\n\n<p>again</p>'), 'Gold rises again');
  });

  it('joins inline tags without adding spaces', () => {
    assert.equal(htmlToText('<p>Rates <b>unchanged</b>. <a href="/x">Read</a>, <em>now</em>!</p>'), 'Rates unchanged. Read, now!');
  });

  it('drops script, style and comments with their content', () => {
    const html = '<script>alert(1)</script><style>p{}</style><!-- hidden -->Visible';
    assert.equal(htmlToText(html), 'Visible');
  });

  it('decodes entities, including double-encoded ones left after XML decoding', () => {
    assert.equal(htmlToText('Fed&#8217;s &quot;pause&quot;'), 'Fed’s "pause"');
  });

  it('turns markup entered as text into plain text, never into tags', () => {
    assert.equal(htmlToText('&lt;img src=x onerror=alert(1)&gt;Hi'), '<img src=x onerror=alert(1)>Hi');
  });

  it('keeps comparison signs in plain text', () => {
    assert.equal(htmlToText('CPI < 3% and > 2%'), 'CPI < 3% and > 2%');
  });

  it('returns an empty string for non-strings', () => {
    assert.equal(htmlToText(undefined), '');
    assert.equal(htmlToText(42), '');
  });
});

describe('truncate', () => {
  it('leaves short text alone', () => {
    assert.equal(truncate('short', 10), 'short');
  });

  it('cuts at a word boundary and adds an ellipsis within the limit', () => {
    const result = truncate('Federal Reserve holds rates steady again', 20);
    assert.equal(result, 'Federal Reserve…');
    assert.ok(result.length <= 20);
  });

  it('cuts inside a word when there is no good boundary', () => {
    assert.equal(truncate('Supercalifragilistic', 10), 'Supercali…');
  });
});
