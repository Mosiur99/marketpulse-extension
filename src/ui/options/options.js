import { CATEGORIES, categoryLabel } from '../../config/categories.js';
import { DEFAULT_FEEDS, feedOrigin, newFeedId, validateFeed } from '../../config/feeds.js';
import { LIMITS, validateSettings } from '../../config/settings.js';
import { createBackup, readBackup } from '../../core/backup.js';
import { safeHttpUrl } from '../../core/url.js';
import { h, replaceChildren } from '../shared/dom.js';
import { formatDateTime, plural, timeAgo, timeUntil } from '../shared/format.js';
import { icon } from '../shared/icons.js';
import { applyTheme, send, storage, toast } from '../shared/page.js';

const NUMBER_FIELDS = ['refreshMinutes', 'maxNotificationsPerRefresh', 'highThreshold', 'mediumThreshold', 'maxArticles', 'retentionDays'];
const SELECT_FIELDS = ['notifyMinPriority', 'notifyMode', 'theme'];
const SWITCH_FIELDS = ['notificationsEnabled', 'debugLogging'];
const MANIFEST_ORIGINS = new Set(chrome.runtime.getManifest().host_permissions);

const $ = (id) => document.getElementById(id);
const state = { saved: null, draft: null, feeds: [], feedState: {}, testResults: {}, confirmReset: false };

async function load() {
  const [settings, feeds, feedState] = await Promise.all([storage.getSettings(), storage.getFeeds(), storage.read('feedState')]);
  state.saved = settings;
  state.draft = structuredClone(settings);
  state.feeds = feeds;
  state.feedState = feedState;
  applyTheme(settings.theme);
  fillForm();
  renderFeeds();
  renderUsage();
  updateSavebar();
  if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
}

// ---------- settings form ----------

function fillForm() {
  const draft = state.draft;
  for (const field of [...NUMBER_FIELDS, ...SELECT_FIELDS]) $(field).value = String(draft[field]);
  for (const field of SWITCH_FIELDS) $(field).checked = draft[field];
  renderCategoryChecks('notifyCategories', draft.notifyCategories);
  renderCategoryChecks('enabledCategories', draft.enabledCategories);
  renderKeywords();
  showErrors([]);
}

function renderCategoryChecks(field, map) {
  replaceChildren($(field), CATEGORIES.map((category) => {
    const input = h('input', { type: 'checkbox', id: `${field}-${category.id}`, checked: map[category.id] !== false });
    input.addEventListener('change', () => {
      state.draft[field] = { ...state.draft[field], [category.id]: input.checked };
      updateSavebar();
    });
    return h('label', { class: 'check', for: input.id }, input, category.label);
  }));
}

function renderKeywords() {
  replaceChildren($('keywords'), state.draft.customKeywords.map((keyword, index) => {
    const remove = h('button', { type: 'button', 'aria-label': `Remove ${keyword.term}`, title: 'Remove' }, icon('x'));
    remove.addEventListener('click', () => {
      state.draft.customKeywords = state.draft.customKeywords.filter((_, i) => i !== index);
      renderKeywords();
      updateSavebar();
    });
    return h('span', { class: 'keyword' },
      keyword.alwaysNotify ? h('span', { class: 'bell', title: 'Always alert' }, icon('bell')) : null,
      keyword.term,
      h('span', { class: 'w', title: 'Weight' }, `×${keyword.weight}`),
      remove);
  }));
}

function addKeyword() {
  const term = $('keyword-term').value.trim();
  const weight = Number($('keyword-weight').value);
  const candidate = [...state.draft.customKeywords, { term, weight, alwaysNotify: $('keyword-alert').checked }];
  const { errors, settings } = validateSettings({ customKeywords: candidate });
  if (errors.length > 0) {
    showErrors(errors.map((error) => ({ ...error, field: 'customKeywords' })));
    return;
  }
  state.draft.customKeywords = settings.customKeywords;
  $('keyword-term').value = '';
  $('keyword-alert').checked = false;
  showErrors([]);
  renderKeywords();
  updateSavebar();
}

function readForm() {
  for (const field of NUMBER_FIELDS) {
    const raw = $(field).value.trim();
    state.draft[field] = raw === '' ? NaN : Number(raw);
  }
  for (const field of SELECT_FIELDS) state.draft[field] = $(field).value;
  for (const field of SWITCH_FIELDS) state.draft[field] = $(field).checked;
}

function isDirty() {
  return JSON.stringify(state.draft) !== JSON.stringify(state.saved);
}

function updateSavebar() {
  readForm();
  const dirty = isDirty();
  $('savebar').classList.toggle('show', dirty);
  $('save-status').textContent = dirty ? 'You have unsaved changes' : '';
}

function showErrors(errors) {
  for (const element of document.querySelectorAll('[data-for]')) element.textContent = '';
  for (const element of document.querySelectorAll('[aria-invalid]')) element.removeAttribute('aria-invalid');
  for (const { field, message } of errors) {
    const name = field.replace(/\[.*$/, '');
    const slot = document.querySelector(`[data-for="${name}"]`);
    if (slot) slot.textContent = message;
    $(name)?.setAttribute('aria-invalid', 'true');
  }
}

async function save(event) {
  event.preventDefault();
  readForm();
  const result = await storage.saveSettings(state.draft);
  if (!result.ok) {
    showErrors(result.errors);
    const invalid = document.querySelector('[aria-invalid="true"]');
    invalid?.scrollIntoView({ block: 'center' });
    invalid?.focus({ preventScroll: true });
    toast('Some values need fixing before they can be saved.', 'error');
    return;
  }
  state.saved = result.settings;
  state.draft = structuredClone(result.settings);
  applyTheme(result.settings.theme);
  fillForm();
  updateSavebar();
  toast('Settings saved.', 'ok');
}

function revert() {
  state.draft = structuredClone(state.saved);
  fillForm();
  updateSavebar();
}

// ---------- feeds ----------

function renderFeeds() {
  const now = Date.now();
  replaceChildren($('feed-list'), state.feeds.map((feed, index) => {
    const toggle = h('input', { type: 'checkbox', checked: feed.enabled, 'aria-label': `Use ${feed.name}` });
    toggle.addEventListener('change', () => updateFeeds(state.feeds.map((f, i) => (i === index ? { ...f, enabled: toggle.checked } : f))));

    const test = h('button', { type: 'button', class: 'btn btn-ghost', title: 'Test this feed' }, 'Test');
    test.addEventListener('click', () => testFeed(feed, test));
    const remove = h('button', { type: 'button', class: 'btn icon-btn btn-ghost btn-danger', 'aria-label': `Remove ${feed.name}`, title: 'Remove' }, icon('trash'));
    remove.addEventListener('click', () => removeFeed(feed));

    const result = state.testResults[feed.id];
    return h('div', { class: `feed${feed.enabled ? '' : ' is-off'}` },
      h('label', { class: 'switch' }, toggle, h('span', { class: 'track' })),
      h('div', { class: 'feed-info' },
        h('div', { class: 'feed-name' }, feed.name,
          h('span', { class: 'pill pill-category' }, categoryLabel(feed.categoryHint)),
          feed.weight > 1 ? h('span', { class: 'pill pill-ok', title: 'Counts 1.5 times in scoring' }, 'Official') : null),
        h('span', { class: 'feed-url', title: feed.url }, feed.url),
        healthLine(state.feedState[feed.id], feed.enabled, now)),
      h('div', { class: 'feed-actions' }, test, remove),
      result ? h('div', { class: `test-result${result.ok ? '' : ' bad'}` }, describeTest(result)) : null);
  }));
}

function healthLine(health, enabled, now) {
  if (!enabled) return h('span', { class: 'feed-health' }, 'Turned off');
  if (!health) return h('span', { class: 'feed-health' }, 'Not checked yet');
  if (health.failures > 0) {
    const retry = health.nextAttemptAt > now ? ` Next try ${timeUntil(health.nextAttemptAt, now)}.` : '';
    return h('span', { class: 'feed-health bad' }, `${health.lastError} (${plural(health.failures, 'failure')} in a row).${retry}`);
  }
  return h('span', { class: 'feed-health good' }, `OK · ${plural(health.lastItemCount ?? 0, 'item')} · checked ${timeAgo(health.lastSuccessAt, now)}`);
}

function describeTest(result) {
  if (!result.ok) return `Failed: ${result.error}`;
  const newest = result.newestAt ? `, newest from ${formatDateTime(result.newestAt)}` : '';
  return `Works: HTTP ${result.httpStatus}, ${plural(result.itemCount, 'item')} in ${result.durationMs} ms${newest}. Latest: “${result.sampleTitle}”`;
}

async function testFeed(feed, button) {
  button.disabled = true;
  button.textContent = 'Testing…';
  const response = await send('test-feed', { feed });
  state.testResults[feed.id] = response.ok ? response.result : { ok: false, error: response.error };
  renderFeeds();
}

async function testAll() {
  const button = $('test-all');
  button.disabled = true;
  const enabled = state.feeds.filter((feed) => feed.enabled);
  let done = 0;
  button.textContent = `Testing 0 of ${enabled.length}…`;
  await Promise.all(enabled.map(async (feed) => {
    const response = await send('test-feed', { feed });
    state.testResults[feed.id] = response.ok ? response.result : { ok: false, error: response.error };
    done += 1;
    button.textContent = `Testing ${done} of ${enabled.length}…`;
  }));
  button.disabled = false;
  button.textContent = 'Test all feeds';
  renderFeeds();
  const failed = enabled.filter((feed) => !state.testResults[feed.id].ok).length;
  toast(failed ? `${plural(failed, 'feed')} failed the test.` : 'All feeds work.', failed ? 'warn' : 'ok');
}

async function updateFeeds(feeds) {
  const result = await storage.saveFeeds(feeds);
  if (!result.ok) {
    toast(result.errors[0]?.message ?? 'Could not save the feeds.', 'error');
    return false;
  }
  state.feeds = result.feeds;
  renderFeeds();
  return true;
}

async function removeFeed(feed) {
  if (!await updateFeeds(state.feeds.filter((candidate) => candidate.id !== feed.id))) return;
  await releasePermission(feed.url);
  toast(`Removed ${feed.name}.`, 'ok');
}

/** Gives back a site permission the user granted for a feed, once no remaining feed needs it. */
async function releasePermission(url) {
  const origin = feedOrigin(url);
  const stillUsed = state.feeds.some((feed) => feedOrigin(feed.url) === origin);
  if (!stillUsed && !MANIFEST_ORIGINS.has(origin)) {
    await chrome.permissions.remove({ origins: [origin] }).catch(() => {});
  }
}

async function addFeed(event) {
  event.preventDefault();
  const error = $('feed-error');
  error.textContent = '';
  const url = safeHttpUrl($('feed-url').value);
  const name = $('feed-name').value.trim();
  if (!url) {
    error.textContent = 'Enter a full http:// or https:// feed address.';
    $('feed-url').focus();
    return;
  }
  if (!name) {
    error.textContent = 'Give the feed a name.';
    $('feed-name').focus();
    return;
  }
  if (state.feeds.some((feed) => feed.url === url)) {
    error.textContent = 'This feed is already in your list.';
    return;
  }

  const origin = feedOrigin(url);
  let granted = false;
  try {
    granted = await chrome.permissions.request({ origins: [origin] });
  } catch (requestError) {
    error.textContent = `Chrome could not ask for access: ${requestError.message}`;
    return;
  }
  if (!granted) {
    error.textContent = `MarketPulse needs your permission to read ${new URL(url).host}. The feed was not added.`;
    return;
  }

  const button = $('feed-add');
  button.disabled = true;
  replaceChildren(button, 'Testing…');
  const feed = {
    id: newFeedId(name, state.feeds.map((candidate) => candidate.id)),
    name,
    source: name,
    url,
    categoryHint: $('feed-category').value,
    enabled: true,
    weight: 1,
  };
  const { errors } = validateFeed(feed);
  const response = errors.length ? { ok: false, error: errors[0].message } : await send('test-feed', { feed });
  button.disabled = false;
  replaceChildren(button, icon('plus'), 'Test and add');

  const result = response.ok ? response.result : { ok: false, error: response.error };
  if (!result.ok) {
    error.textContent = `The feed did not work: ${result.error}`;
    await releasePermission(url);
    return;
  }
  if (await updateFeeds([...state.feeds, feed])) {
    state.testResults[feed.id] = result;
    renderFeeds();
    $('add-feed').reset();
    toast(`Added ${name} (${plural(result.itemCount, 'item')}).`, 'ok');
  }
}

async function resetFeeds() {
  const button = $('reset-feeds');
  if (!state.confirmReset) {
    state.confirmReset = true;
    button.textContent = 'Click again to replace your list with the default feeds';
    setTimeout(() => {
      state.confirmReset = false;
      button.textContent = 'Reset to default feeds';
    }, 5000);
    return;
  }
  state.confirmReset = false;
  button.textContent = 'Reset to default feeds';
  const removed = state.feeds.filter((feed) => !DEFAULT_FEEDS.some((d) => d.url === feed.url));
  if (await updateFeeds(structuredClone(DEFAULT_FEEDS))) {
    for (const feed of removed) await releasePermission(feed.url);
    toast('Default feeds restored.', 'ok');
  }
}

// ---------- storage, backup, test notification ----------

async function renderUsage() {
  const [bytes, articles, bookmarks] = await Promise.all([
    chrome.storage.local.getBytesInUse(null),
    storage.read('articles'),
    storage.read('bookmarks'),
  ]);
  $('usage').textContent = `Using ${(bytes / 1024 / 1024).toFixed(2)} MB of 10 MB: ${plural(articles.length, 'story', 'stories')} and ${plural(bookmarks.length, 'bookmark')}.`;
}

let confirmClear = false;
async function clearNews() {
  const button = $('clear-news');
  if (!confirmClear) {
    confirmClear = true;
    button.textContent = 'Click again to delete all stored stories (bookmarks stay)';
    setTimeout(() => {
      confirmClear = false;
      button.textContent = 'Delete stored news';
    }, 5000);
    return;
  }
  confirmClear = false;
  button.textContent = 'Delete stored news';
  await storage.write({ articles: [], notified: {}, feedState: {}, meta: { lastRefreshAt: null, lastRefreshResult: null } });
  renderUsage();
  toast('Stored news deleted. The next refresh starts fresh without alerts.', 'ok');
}

async function exportBackup() {
  const [settings, feeds, bookmarks] = await Promise.all([storage.getSettings(), storage.getFeeds(), storage.read('bookmarks')]);
  const blob = new Blob([JSON.stringify(createBackup({ settings, feeds, bookmarks }, Date.now()), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = h('a', { href: url, download: `marketpulse-backup-${new Date().toISOString().slice(0, 10)}.json` });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importBackup(event) {
  const [file] = event.target.files;
  event.target.value = '';
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    toast('That file is too large to be a MarketPulse backup.', 'error');
    return;
  }
  const backup = readBackup(await file.text());
  if (!backup.ok) {
    toast(backup.error, 'error');
    return;
  }
  if (backup.feeds) {
    const missing = [...new Set(backup.feeds.map((feed) => safeHttpUrl(feed?.url)).filter(Boolean).map(feedOrigin))]
      .filter((origin) => !MANIFEST_ORIGINS.has(origin));
    if (missing.length > 0 && !await chrome.permissions.request({ origins: missing }).catch(() => false)) {
      toast('Import cancelled: the backup has feeds from sites MarketPulse may not read yet.', 'error');
      return;
    }
    const result = await storage.saveFeeds(backup.feeds);
    if (!result.ok) {
      toast(`Import stopped: ${result.errors[0].message}`, 'error');
      return;
    }
  }
  await storage.saveSettings(backup.settings);
  await storage.write({ bookmarks: backup.bookmarks });
  await load();
  toast('Backup imported.', 'ok');
}

async function testNotification() {
  const response = await send('test-notification');
  toast(response.ok ? 'Test notification sent. If you do not see it, check your system notification settings for Chrome.' : `Could not send: ${response.error}`, response.ok ? 'ok' : 'error');
}

// ---------- wiring ----------

function setup() {
  $('logo').append(icon('pulse'));
  replaceChildren($('feed-add'), icon('plus'), 'Test and add');
  replaceChildren($('keyword-add'), icon('plus'), 'Add keyword');
  replaceChildren($('feed-category'), CATEGORIES.map((category) => h('option', { value: category.id }, category.label)));
  for (const field of NUMBER_FIELDS) {
    const { min, max } = LIMITS[field];
    Object.assign($(field), { min, max });
  }

  const form = $('settings-form');
  form.addEventListener('input', updateSavebar);
  form.addEventListener('change', updateSavebar);
  form.addEventListener('submit', save);
  $('revert').addEventListener('click', revert);
  $('keyword-add').addEventListener('click', addKeyword);
  $('keyword-term').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addKeyword();
    }
  });
  $('add-feed').addEventListener('submit', addFeed);
  $('test-all').addEventListener('click', testAll);
  $('reset-feeds').addEventListener('click', resetFeeds);
  $('clear-news').addEventListener('click', clearNews);
  $('export').addEventListener('click', exportBackup);
  $('import-file').addEventListener('change', importBackup);
  $('test-notification').addEventListener('click', testNotification);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.feedState) {
      state.feedState = changes.feedState.newValue ?? {};
      renderFeeds();
    }
    if (changes.articles || changes.bookmarks) renderUsage();
  });
  window.addEventListener('beforeunload', (event) => {
    if (isDirty()) event.preventDefault();
  });
}

setup();
load();
