const TRACKING_PARAMS = /^(utm_.+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|_hsenc|_hsmi|yclid|igshid|at_medium|at_campaign)$/i;
const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

export function safeHttpUrl(value, base) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  let url;
  try {
    url = new URL(value.trim(), base);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password) return null;
  return url.href;
}

export function canonicalUrl(href) {
  const url = new URL(href);
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  const host = url.hostname.replace(/^www\./, '');
  const path = url.pathname.replace(/\/{2,}/g, '/').replace(/(.)\/$/, '$1');
  return `${host}${path}${url.search}`;
}

export function articleId(href) {
  return `a_${fnv1a64(canonicalUrl(href))}`;
}

function fnv1a64(text) {
  let hash = FNV_OFFSET;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return hash.toString(16).padStart(16, '0');
}
