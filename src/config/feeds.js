import { isCategoryId } from './categories.js';

const OFFICIAL_WEIGHT = 1.5;

export const DEFAULT_FEEDS = Object.freeze([
  { id: 'cnbc-top', name: 'CNBC Top News', source: 'CNBC', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', categoryHint: 'stocks' },
  { id: 'cnbc-world', name: 'CNBC International', source: 'CNBC', url: 'https://www.cnbc.com/id/100727362/device/rss/rss.html', categoryHint: 'global-economy' },
  { id: 'cnbc-economy', name: 'CNBC Economy', source: 'CNBC', url: 'https://www.cnbc.com/id/20910258/device/rss/rss.html', categoryHint: 'global-economy' },
  { id: 'cnbc-finance', name: 'CNBC Finance', source: 'CNBC', url: 'https://www.cnbc.com/id/10000664/device/rss/rss.html', categoryHint: 'stocks' },
  { id: 'cnbc-earnings', name: 'CNBC Earnings', source: 'CNBC', url: 'https://www.cnbc.com/id/15839135/device/rss/rss.html', categoryHint: 'earnings' },
  { id: 'mw-top', name: 'MarketWatch Top Stories', source: 'MarketWatch', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', categoryHint: 'stocks' },
  { id: 'mw-pulse', name: 'MarketWatch MarketPulse', source: 'MarketWatch', url: 'https://feeds.content.dowjones.io/public/rss/mw_marketpulse', categoryHint: 'stocks' },
  { id: 'investing-all', name: 'Investing.com All News', source: 'Investing.com', url: 'https://www.investing.com/rss/news.rss', categoryHint: 'stocks' },
  { id: 'investing-forex', name: 'Investing.com Forex', source: 'Investing.com', url: 'https://www.investing.com/rss/news_1.rss', categoryHint: 'forex' },
  { id: 'investing-commodities', name: 'Investing.com Commodities', source: 'Investing.com', url: 'https://www.investing.com/rss/news_11.rss', categoryHint: 'metals' },
  { id: 'investing-crypto', name: 'Investing.com Crypto', source: 'Investing.com', url: 'https://www.investing.com/rss/news_301.rss', categoryHint: 'crypto' },
  { id: 'investing-indicators', name: 'Investing.com Economic Indicators', source: 'Investing.com', url: 'https://www.investing.com/rss/news_95.rss', categoryHint: 'inflation-jobs' },
  { id: 'coindesk', name: 'CoinDesk', source: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss', categoryHint: 'crypto' },
  { id: 'cointelegraph', name: 'Cointelegraph', source: 'Cointelegraph', url: 'https://cointelegraph.com/rss', categoryHint: 'crypto' },
  { id: 'bbc-business', name: 'BBC Business', source: 'BBC', url: 'https://feeds.bbci.co.uk/news/business/rss.xml', categoryHint: 'global-economy' },
  { id: 'fxstreet', name: 'FXStreet News', source: 'FXStreet', url: 'https://www.fxstreet.com/rss/news', categoryHint: 'forex' },
  { id: 'oilprice', name: 'OilPrice.com', source: 'OilPrice.com', url: 'https://oilprice.com/rss/main', categoryHint: 'energy' },
  { id: 'fed', name: 'Federal Reserve Press Releases', source: 'Federal Reserve', url: 'https://www.federalreserve.gov/feeds/press_all.xml', categoryHint: 'central-banks', weight: OFFICIAL_WEIGHT },
  { id: 'ecb', name: 'ECB Press', source: 'European Central Bank', url: 'https://www.ecb.europa.eu/rss/press.html', categoryHint: 'central-banks', weight: OFFICIAL_WEIGHT },
  { id: 'boe', name: 'Bank of England News', source: 'Bank of England', url: 'https://www.bankofengland.co.uk/rss/news', categoryHint: 'central-banks', weight: OFFICIAL_WEIGHT },
  { id: 'bea', name: 'US BEA Releases', source: 'US BEA', url: 'https://apps.bea.gov/rss/rss.xml', categoryHint: 'inflation-jobs', weight: OFFICIAL_WEIGHT },
  { id: 'dailystar-business', name: 'The Daily Star Business', source: 'The Daily Star', url: 'https://www.thedailystar.net/business/rss.xml', categoryHint: 'bangladesh' },
  { id: 'tbs-economy', name: 'The Business Standard Economy', source: 'The Business Standard', url: 'https://www.tbsnews.net/economy/rss.xml', categoryHint: 'bangladesh' },
  { id: 'dhakatribune-business', name: 'Dhaka Tribune Business', source: 'Dhaka Tribune', url: 'https://www.dhakatribune.com/feed/business', categoryHint: 'bangladesh' },
  { id: 'prothomalo-en', name: 'Prothom Alo English', source: 'Prothom Alo', url: 'https://en.prothomalo.com/stories.rss', categoryHint: 'bangladesh', enabled: false },
].map((feed) => Object.freeze({ enabled: true, weight: 1, ...feed })));

export const FEED_WEIGHT_RANGE = Object.freeze({ min: 0.5, max: 2 });

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_NAME_LENGTH = 80;

export function feedOrigin(url) {
  return `${new URL(url).origin}/*`;
}

export function validateFeed(input) {
  const errors = [];
  const feed = {
    id: typeof input?.id === 'string' ? input.id.trim() : '',
    name: typeof input?.name === 'string' ? input.name.trim() : '',
    source: typeof input?.source === 'string' ? input.source.trim() : '',
    url: typeof input?.url === 'string' ? input.url.trim() : '',
    categoryHint: input?.categoryHint,
    enabled: input?.enabled !== false,
    weight: input?.weight ?? 1,
  };

  if (!ID_PATTERN.test(feed.id)) {
    errors.push({ field: 'id', message: 'Use lowercase letters, digits and hyphens (max 64).' });
  }
  if (!feed.name || feed.name.length > MAX_NAME_LENGTH) {
    errors.push({ field: 'name', message: `Name is required (max ${MAX_NAME_LENGTH} characters).` });
  }
  if (!feed.source) {
    feed.source = feed.name;
  }
  if (!isFeedUrl(feed.url)) {
    errors.push({ field: 'url', message: 'Enter a full http:// or https:// feed address.' });
  }
  if (!isCategoryId(feed.categoryHint)) {
    errors.push({ field: 'categoryHint', message: 'Choose one of the news categories.' });
  }
  if (typeof feed.weight !== 'number' || !Number.isFinite(feed.weight)
    || feed.weight < FEED_WEIGHT_RANGE.min || feed.weight > FEED_WEIGHT_RANGE.max) {
    errors.push({ field: 'weight', message: `Weight must be between ${FEED_WEIGHT_RANGE.min} and ${FEED_WEIGHT_RANGE.max}.` });
  }

  return { feed, errors };
}

function isFeedUrl(value) {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && Boolean(url.hostname);
  } catch {
    return false;
  }
}
