export const CATEGORIES = Object.freeze([
  {
    id: 'global-economy',
    label: 'Global Economy',
    keywords: ['global economy', 'world economy', 'economic growth', 'gdp', 'recession', 'imf', 'world bank', 'economic outlook', 'slowdown', 'stimulus', 'debt ceiling', 'sovereign debt', 'eurozone', 'emerging markets'],
  },
  {
    id: 'stocks',
    label: 'Stock Market',
    keywords: ['stock', 'stocks', 'shares', 'equities', 's&p 500', 'dow jones', 'dow', 'nasdaq', 'wall street', 'ftse', 'nikkei', 'dax', 'hang seng', 'sensex', 'ipo', 'market rally', 'sell-off', 'selloff', 'bull market', 'bear market', 'stock market crash'],
  },
  {
    id: 'forex',
    label: 'Forex Market',
    keywords: ['forex', 'currency', 'currencies', 'exchange rate', 'dollar index', 'dxy', 'eur/usd', 'usd/jpy', 'gbp/usd', 'usd/cny', 'yen', 'euro', 'sterling', 'yuan', 'greenback', 'aud/usd', 'usd/chf'],
  },
  {
    id: 'crypto',
    label: 'Cryptocurrency',
    keywords: ['bitcoin', 'btc', 'ethereum', 'ether', 'crypto', 'cryptocurrency', 'stablecoin', 'blockchain', 'solana', 'xrp', 'binance', 'coinbase', 'token', 'defi', 'crypto etf'],
  },
  {
    id: 'metals',
    label: 'Gold & Silver',
    keywords: ['gold', 'gold price', 'silver', 'bullion', 'precious metals', 'platinum', 'palladium', 'xau/usd', 'xag/usd'],
  },
  {
    id: 'energy',
    label: 'Oil & Energy',
    keywords: ['oil', 'oil price', 'crude', 'brent', 'wti', 'opec', 'opec+', 'natural gas', 'lng', 'gasoline', 'refinery', 'energy prices', 'oil output'],
  },
  {
    id: 'central-banks',
    label: 'Central Banks & Interest Rates',
    keywords: ['federal reserve', 'the fed', 'fed', 'fomc', 'powell', 'ecb', 'lagarde', 'bank of england', 'boe', 'bank of japan', 'boj', 'pboc', 'rba', 'central bank', 'interest rate', 'interest rates', 'rate cut', 'rate hike', 'rate decision', 'monetary policy', 'basis points', 'quantitative easing', 'balance sheet'],
  },
  {
    id: 'inflation-jobs',
    label: 'Inflation & Employment',
    keywords: ['inflation', 'cpi', 'consumer price index', 'ppi', 'pce', 'core inflation', 'deflation', 'nonfarm payrolls', 'payrolls', 'jobs report', 'unemployment', 'jobless claims', 'labor market', 'labour market', 'wages', 'employment'],
  },
  {
    id: 'earnings',
    label: 'Corporate Earnings',
    keywords: ['earnings', 'quarterly results', 'revenue', 'profit', 'eps', 'guidance', 'earnings surprise', 'beats estimates', 'misses estimates', 'quarterly profit', 'outlook', 'dividend', 'buyback'],
  },
  {
    id: 'geopolitics-trade',
    label: 'Geopolitical & Trade News',
    keywords: ['tariff', 'tariffs', 'trade war', 'trade deal', 'sanctions', 'export controls', 'geopolitical', 'war', 'conflict', 'embargo', 'wto', 'trade talks', 'trade deficit', 'supply chain'],
  },
  {
    id: 'bangladesh',
    label: 'Bangladesh Economy',
    keywords: ['bangladesh', 'bangladeshi', 'dhaka', 'chattogram', 'chittagong', 'taka', 'bdt', 'bangladesh bank', 'dse', 'dhaka stock exchange', 'cse', 'nbr', 'rmg', 'garment', 'remittance', 'remittances', 'bgmea', 'ecnec', 'bsec'],
  },
]);

export const CATEGORY_IDS = Object.freeze(CATEGORIES.map((category) => category.id));

export const DEFAULT_CATEGORY_ID = 'global-economy';

export function isCategoryId(value) {
  return CATEGORY_IDS.includes(value);
}

export function categoryLabel(id) {
  return CATEGORIES.find((category) => category.id === id)?.label ?? id;
}
