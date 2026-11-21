const NAMED_ENTITIES = Object.freeze({
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', bull: '•', middot: '·',
  copy: '©', reg: '®', trade: '™', deg: '°', percnt: '%',
  euro: '€', pound: '£', yen: '¥', cent: '¢', dollar: '$',
});

const ENTITY = /&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);/gi;
const MAX_CODE_POINT = 0x10ffff;

export function decodeEntities(text) {
  if (!text.includes('&')) return text;
  return text.replace(ENTITY, (match, body) => {
    if (body[0] === '#') {
      const codePoint = body[1] === 'x' || body[1] === 'X'
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      const valid = codePoint > 0 && codePoint <= MAX_CODE_POINT && !(codePoint >= 0xd800 && codePoint <= 0xdfff);
      return valid ? String.fromCodePoint(codePoint) : '';
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}
