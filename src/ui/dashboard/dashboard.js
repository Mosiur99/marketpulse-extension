import { CATEGORIES, categoryLabel } from '../../config/categories.js';
import { isBookmarked, toggleBookmark } from '../../core/bookmarks.js';
import { externalLink, h, replaceChildren } from '../shared/dom.js';
import { formatClock, formatDateTime, plural, timeAgo } from '../shared/format.js';
import { icon } from '../shared/icons.js';
import { computeStats, filterArticles, isBreakingNow, topStories } from '../shared/news-view.js';
import { applyTheme, refreshMessage, send, storage, toast } from '../shared/page.js';

const PAGE_SIZE = 60;
const VIEWS = [
  { id: 'all', label: 'All news', icon: 'layers' },
  { id: 'breaking', label: 'Breaking', icon: 'bolt' },
  { id: 'high', label: 'High priority', icon: 'arrowUp' },
  { id: 'bookmarks', label: 'Bookmarks', icon: 'star' },
];

const state = {
  view: 'all',
  category: null,
  source: null,
  query: '',
  limit: PAGE_SIZE,
  refreshing: false,
  articles: [],
  bookmarks: [],
  settings: null,
  feeds: [],
  feedState: {},
  meta: {},
};

const $ = (id) => document.getElementById(id);

async function load() {
  const [settings, feeds, articles, bookmarks, feedState, meta] = await Promise.all([
    storage.getSettings(),
    storage.getFeeds(),
    storage.read('articles'),
    storage.read('bookmarks'),
    storage.read('feedState'),
    storage.read('meta'),
  ]);
  Object.assign(state, { settings, feeds, articles, bookmarks, feedState, meta });
  applyTheme(settings.theme);
  render();
}

function render() {
  const now = Date.now();
  const stats = computeStats(state.articles, { ...state, now });
  renderHeader(stats, now);
  renderSidebar(stats, now);
  renderFilters();
  renderOverview(now);
  renderFeed(now);
  renderStats(stats, now);
}

function renderHeader(stats, now) {
  const refresh = $('refresh');
  replaceChildren(refresh, icon('refresh'), state.refreshing ? 'Refreshing…' : 'Refresh');
  refresh.disabled = state.refreshing;
  refresh.querySelector('svg').classList.toggle('spin', state.refreshing);

  const on = state.settings.notificationsEnabled;
  const bell = $('notifications');
  replaceChildren(bell, icon(on ? 'bell' : 'bellOff'));
  bell.setAttribute('aria-pressed', String(on));
  bell.title = on ? 'Notifications are on. Click to turn them off.' : 'Notifications are off. Click to turn them on.';
  bell.setAttribute('aria-label', bell.title);

  const dark = state.settings.theme !== 'light';
  const theme = $('theme');
  replaceChildren(theme, icon(dark ? 'sun' : 'moon'));
  theme.title = dark ? 'Switch to light theme' : 'Switch to dark theme';
  theme.setAttribute('aria-label', theme.title);

  const status = $('refresh-status');
  if (!stats.lastRefreshAt) {
    replaceChildren(status, state.refreshing ? 'Collecting news…' : 'Not refreshed yet');
  } else {
    const failing = stats.feedHealth.failingFeeds.length;
    replaceChildren(status,
      'Updated ', h('time', { datetime: new Date(stats.lastRefreshAt).toISOString(), title: formatDateTime(stats.lastRefreshAt) }, timeAgo(stats.lastRefreshAt, now)),
      failing > 0 ? h('span', { class: 'warn' }, ` · ${plural(failing, 'feed')} failing`) : null);
  }
}

function renderSidebar(stats, now) {
  const counts = {
    all: state.articles.length,
    breaking: stats.breaking,
    high: stats.high,
    bookmarks: state.bookmarks.length,
  };
  replaceChildren($('views'), VIEWS.map((view) => navButton({
    label: view.label,
    leading: icon(view.icon),
    count: counts[view.id],
    current: state.view === view.id,
    onClick: () => setFilter({ view: view.id }),
  })));

  const enabled = state.settings.enabledCategories;
  const pool = state.view === 'bookmarks' ? state.bookmarks : state.articles;
  replaceChildren($('categories'), CATEGORIES.filter((category) => enabled[category.id] !== false).map((category) => {
    const count = pool.filter((article) => article.category === category.id).length;
    return navButton({
      label: category.label,
      leading: h('span', { class: 'dot' }),
      count,
      current: state.category === category.id,
      empty: count === 0,
      onClick: () => setFilter({ category: state.category === category.id ? null : category.id }),
    });
  }));

  const select = $('source');
  replaceChildren(select, h('option', { value: '' }, 'All sources'), stats.sources.map((source) => h('option', { value: source }, source)));
  select.value = state.source ?? '';
}

function navButton({ label, leading, count, current, empty = false, onClick }) {
  const button = h('button', { type: 'button', class: `nav-item${empty ? ' is-empty' : ''}`, 'aria-current': String(current) },
    leading, h('span', {}, label), h('span', { class: 'n' }, String(count)));
  button.addEventListener('click', onClick);
  return button;
}

function renderFilters() {
  const chips = [];
  const chip = (text, clear) => {
    const button = h('button', { type: 'button', class: 'chip', 'aria-label': `Remove filter ${text}` }, text, icon('x'));
    button.addEventListener('click', clear);
    chips.push(button);
  };
  if (state.category) chip(categoryLabel(state.category), () => setFilter({ category: null }));
  if (state.source) chip(state.source, () => setFilter({ source: null }));
  if (state.query) chip(`“${state.query}”`, () => { $('search').value = ''; setFilter({ query: '' }); });
  if (chips.length > 1) {
    const all = h('button', { type: 'button', class: 'chip clear' }, 'Clear all');
    all.addEventListener('click', clearFilters);
    chips.push(all);
  }
  replaceChildren($('active-filters'), chips);
}

function renderOverview(now) {
  const overview = $('overview');
  const unfiltered = state.view === 'all' && !state.category && !state.source && !state.query;
  if (!unfiltered || state.articles.length === 0) {
    replaceChildren(overview);
    return;
  }

  const visible = filterArticles(state.articles, { enabledCategories: state.settings.enabledCategories, now });
  const breaking = visible.filter((article) => isBreakingNow(article, now)).slice(0, 3);
  const top = topStories(visible, now);

  replaceChildren(overview,
    breaking.length > 0 ? h('div', { class: 'breaking-strip', role: 'region', 'aria-label': 'Breaking news' },
      h('div', { class: 'head' }, icon('bolt', { filled: true }), 'Breaking now'),
      h('ul', {}, breaking.map((article) => h('li', {},
        h('time', { datetime: new Date(article.publishedAt).toISOString() }, timeAgo(article.publishedAt, now)),
        externalLink(article.url, article.title))))) : null,
    top.length > 0 ? h('div', { class: 'section-title' }, h('h2', {}, 'Top stories'), h('span', {}, 'highest importance in the last 24 hours, one per category')) : null,
    top.length > 0 ? h('div', { class: 'top-grid' }, top.map((article) => h('article', { class: 'top-card' },
      h('span', { class: 'cat' }, categoryLabel(article.category)),
      externalLink(article.url, article.title),
      h('div', { class: 'foot' },
        h('span', {}, article.source),
        h('span', {}, '·'),
        h('time', { datetime: new Date(article.publishedAt).toISOString() }, timeAgo(article.publishedAt, now)),
        h('span', { class: 'score', title: 'Importance score' }, article.score.toFixed(article.score % 1 ? 1 : 0)))))) : null);
}

function renderFeed(now) {
  const bookmarksView = state.view === 'bookmarks';
  const source = bookmarksView ? state.bookmarks : state.articles;
  const list = filterArticles(source, {
    view: bookmarksView ? 'all' : state.view,
    category: state.category,
    source: state.source,
    query: state.query,
    enabledCategories: bookmarksView ? {} : state.settings.enabledCategories,
    now,
  });

  $('feed-title').textContent = { all: 'Latest news', breaking: 'Breaking news', high: 'High priority', bookmarks: 'Bookmarks' }[state.view];
  $('feed-count').textContent = list.length === source.length ? plural(list.length, 'story', 'stories') : `${list.length} of ${source.length}`;

  const feed = $('feed');
  if (list.length === 0) {
    replaceChildren(feed, emptyState(source.length));
    $('more').hidden = true;
    return;
  }
  replaceChildren(feed, list.slice(0, state.limit).map((article) => storyRow(article, now)));
  const more = $('more');
  more.hidden = list.length <= state.limit;
  more.textContent = `Show more (${list.length - state.limit} left)`;
}

function storyRow(article, now) {
  const breaking = isBreakingNow(article, now);
  const saved = isBookmarked(state.bookmarks, article.id);
  const others = article.alsoReportedBy ?? [];
  const bookmark = h('button', {
    type: 'button',
    class: 'btn icon-btn btn-ghost bookmark',
    'aria-pressed': String(saved),
    'aria-label': saved ? 'Remove bookmark' : 'Bookmark this story',
    title: saved ? 'Remove bookmark' : 'Bookmark',
  }, icon('star', { filled: saved }));
  bookmark.addEventListener('click', () => toggle(article));

  const published = h('time', {
    datetime: new Date(article.publishedAt).toISOString(),
    title: `${formatDateTime(article.publishedAt)}${article.dateEstimated ? ' (time estimated: the feed gave no date)' : ''}`,
  }, timeAgo(article.publishedAt, now));

  return h('article', { class: `story prio-${article.priority}` },
    h('div', { class: 'story-main' },
      h('div', { class: 'story-meta' },
        breaking ? h('span', { class: 'pill pill-breaking' }, 'Breaking') : null,
        h('span', { class: `pill pill-${article.priority}` }, `${article.priority[0].toUpperCase()}${article.priority.slice(1)}`),
        h('span', { class: 'pill pill-category' }, categoryLabel(article.category)),
        h('span', { class: 'source' }, article.source),
        others.length > 0 ? h('span', { title: `Also reported by ${others.join(', ')}` }, `+${plural(others.length, 'source')}`) : null,
        h('span', { class: 'sep' }, '·'),
        published),
      h('h3', {}, externalLink(article.url, article.title)),
      article.summary ? h('p', { class: 'summary' }, article.summary) : null,
      article.matched?.length ? h('p', { class: 'why' }, 'Why: ', h('b', {}, article.matched.join(', ')), ` · score ${article.score}`) : null),
    bookmark);
}

function emptyState(sourceCount) {
  if (state.view === 'bookmarks' && sourceCount === 0) {
    return empty('star', 'No bookmarks yet', 'Click the star on any story to save it here. Bookmarks are kept even after old news is removed.');
  }
  if (sourceCount === 0) {
    const failing = state.feeds.filter((feed) => feed.enabled).every((feed) => (state.feedState[feed.id]?.failures ?? 0) > 0);
    if (state.meta.lastRefreshAt && failing) {
      return empty('alert', 'No feed could be reached', 'Check your internet connection, or open Settings to see each feed’s error.', settingsLink());
    }
    return empty('inbox', state.refreshing ? 'Collecting the first headlines…' : 'No news yet',
      'MarketPulse checks your feeds every few minutes. You can also fetch them now.', refreshButton());
  }
  const button = h('button', { type: 'button', class: 'btn' }, 'Clear filters');
  button.addEventListener('click', clearFilters);
  return empty('search', 'No stories match these filters', 'Try another category, source or search term.', button);
}

function empty(iconName, title, text, action = null) {
  return h('div', { class: 'empty' }, icon(iconName), h('h3', {}, title), h('p', {}, text), action);
}

function refreshButton() {
  const button = h('button', { type: 'button', class: 'btn btn-primary' }, icon('refresh'), 'Refresh now');
  button.addEventListener('click', refresh);
  return button;
}

function settingsLink() {
  return h('a', { class: 'btn', href: '../options/options.html#feeds' }, 'Open feed settings');
}

function renderStats(stats, now) {
  const max = Math.max(1, ...stats.byCategory.map((category) => category.count));
  const lastResult = stats.lastRefreshResult;
  replaceChildren($('stats'),
    h('section', { class: 'panel' },
      h('h2', {}, 'Statistics'),
      h('div', { class: 'kpis' },
        kpi(stats.total, 'Articles stored'),
        kpi(stats.breaking, 'Breaking now', stats.breaking > 0),
        kpi(stats.high, 'High priority'),
        kpi(stats.last24h, 'Last 24 hours'))),
    h('section', { class: 'panel' },
      h('h2', {}, 'Articles by category'),
      h('div', { class: 'bars' }, stats.byCategory.filter((category) => category.count > 0).map((category) => {
        const bar = h('button', { type: 'button', class: 'bar', title: `Show ${category.label}` },
          h('span', {}, category.label),
          h('span', { class: 'n' }, String(category.count)),
          h('span', { class: 'track' }, h('span', { class: 'fill', style: `width:${(category.count / max) * 100}%` })));
        bar.addEventListener('click', () => setFilter({ category: category.id }));
        return bar;
      }))),
    h('section', { class: 'panel' },
      h('h2', {}, 'Feeds'),
      h('div', { class: 'health' },
        h('div', { class: 'line' },
          h('span', { class: `pill ${stats.feedHealth.failingFeeds.length ? 'pill-medium' : 'pill-ok'}` }, `${stats.feedHealth.ok} of ${stats.feedHealth.enabled} OK`),
          h('a', { href: '../options/options.html#feeds' }, 'Manage feeds')),
        stats.feedHealth.failingFeeds.length ? h('ul', {}, stats.feedHealth.failingFeeds.map((feed) => h('li', {}, h('b', {}, feed.name), ': ', feed.error))) : null),
      h('div', { class: 'refresh-info' },
        stats.lastRefreshAt
          ? [h('span', {}, 'Last refresh ', h('time', { datetime: new Date(stats.lastRefreshAt).toISOString() }, formatDateTime(stats.lastRefreshAt))),
            lastResult ? h('span', {}, `${plural(lastResult.added, 'new story', 'new stories')}, ${plural(lastResult.duplicates, 'duplicate')} merged, ${lastResult.durationMs} ms`) : null]
          : h('span', {}, 'No refresh yet'),
        h('span', {}, `Checks every ${state.settings.refreshMinutes} minutes`))));
}

function kpi(value, name, alert = false) {
  return h('div', { class: `kpi${alert ? ' alert' : ''}` }, h('span', { class: 'value' }, String(value)), h('span', { class: 'name' }, name));
}

function setFilter(changes) {
  Object.assign(state, changes, { limit: PAGE_SIZE });
  render();
}

function clearFilters() {
  $('search').value = '';
  setFilter({ category: null, source: null, query: '' });
}

async function toggle(article) {
  state.bookmarks = toggleBookmark(state.bookmarks, article, Date.now());
  render();
  await storage.write({ bookmarks: state.bookmarks });
}

async function refresh() {
  if (state.refreshing) return;
  state.refreshing = true;
  render();
  const response = await send('refresh');
  state.refreshing = false;
  render();
  toast(...refreshMessage(response));
}

async function updateSettings(changes) {
  const result = await storage.saveSettings({ ...state.settings, ...changes });
  if (!result.ok) toast('Could not save the setting.', 'error');
}

function tickClock() {
  const { date, time, utc } = formatClock(Date.now());
  $('clock-date').textContent = date;
  $('clock-time').textContent = time;
  $('clock-utc').textContent = `${utc} UTC`;
}

function setup() {
  $('logo').append(icon('pulse'));
  $('settings').append(icon('settings'));
  $('search-icon').append(icon('search'));
  $('refresh').addEventListener('click', refresh);
  $('notifications').addEventListener('click', () => updateSettings({ notificationsEnabled: !state.settings.notificationsEnabled }));
  $('theme').addEventListener('click', () => updateSettings({ theme: state.settings.theme === 'light' ? 'dark' : 'light' }));
  $('source').addEventListener('change', (event) => setFilter({ source: event.target.value || null }));
  $('more').addEventListener('click', () => {
    state.limit += PAGE_SIZE;
    render();
  });

  let searchTimer;
  $('search').addEventListener('input', (event) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => setFilter({ query: event.target.value.trim() }), 150);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === '/' && document.activeElement !== $('search')) {
      event.preventDefault();
      $('search').focus();
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (key === 'settings') state.settings = { ...state.settings, ...newValue };
      else if (key in state) state[key] = newValue;
    }
    if (changes.settings) applyTheme(state.settings.theme);
    render();
  });

  tickClock();
  setInterval(tickClock, 1000);
  setInterval(render, 60_000);
}

setup();
load();
