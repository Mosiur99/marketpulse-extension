import { categoryLabel } from '../../config/categories.js';
import { externalLink, h, replaceChildren } from '../shared/dom.js';
import { timeAgo } from '../shared/format.js';
import { icon } from '../shared/icons.js';
import { isBreakingNow } from '../shared/news-view.js';
import { applyTheme, openDashboard, refreshMessage, send, storage } from '../shared/page.js';

const LIMIT = 8;
const DAY_MS = 24 * 60 * 60 * 1000;
const $ = (id) => document.getElementById(id);
let settings;
let refreshing = false;

async function render(message) {
  const [articles, meta] = await Promise.all([storage.read('articles'), storage.read('meta')]);
  settings = await storage.getSettings();
  applyTheme(settings.theme);
  $('notify').checked = settings.notificationsEnabled;

  const now = Date.now();
  const button = $('refresh');
  replaceChildren(button, icon('refresh'));
  button.querySelector('svg').classList.toggle('spin', refreshing);
  button.disabled = refreshing;

  $('status').textContent = message
    ?? (refreshing ? 'Refreshing…' : meta.lastRefreshAt ? `Updated ${timeAgo(meta.lastRefreshAt, now)}` : 'Not refreshed yet');

  const important = articles
    .filter((article) => settings.enabledCategories[article.category] !== false && now - article.publishedAt <= DAY_MS
      && (article.priority === 'high' || isBreakingNow(article, now)))
    .sort((a, b) => Number(isBreakingNow(b, now)) - Number(isBreakingNow(a, now)) || b.publishedAt - a.publishedAt)
    .slice(0, LIMIT);

  if (important.length === 0) {
    replaceChildren($('list'), h('li', { class: 'empty' },
      h('h3', {}, articles.length === 0 ? 'No news yet' : 'Nothing important in the last 24 hours'),
      h('p', {}, articles.length === 0 ? 'Click refresh to fetch the feeds now.' : 'The dashboard has every story.')));
    return;
  }
  replaceChildren($('list'), important.map((article) => h('li', { class: `item prio-${article.priority}` },
    h('div', { class: 'meta' },
      isBreakingNow(article, now) ? h('span', { class: 'pill pill-breaking' }, 'Breaking') : null,
      h('span', {}, categoryLabel(article.category)),
      h('span', {}, '·'),
      h('span', {}, article.source),
      h('span', {}, '·'),
      h('time', { datetime: new Date(article.publishedAt).toISOString() }, timeAgo(article.publishedAt, now))),
    externalLink(article.url, article.title))));
}

$('logo').append(icon('pulse'));
$('refresh').addEventListener('click', async () => {
  refreshing = true;
  await render();
  const response = await send('refresh');
  refreshing = false;
  await render(refreshMessage(response)[0]);
});
$('notify').addEventListener('change', async (event) => {
  await storage.saveSettings({ ...settings, notificationsEnabled: event.target.checked });
});
$('open-dashboard').addEventListener('click', async () => {
  await openDashboard();
  window.close();
});
$('open-options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

render();
