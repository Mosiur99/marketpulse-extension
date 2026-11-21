import { DEFAULT_FEEDS, validateFeed } from '../config/feeds.js';
import { DEFAULT_SETTINGS, validateSettings } from '../config/settings.js';

export const SCHEMA_VERSION = 1;

const STORAGE_DEFAULTS = Object.freeze({
  schemaVersion: SCHEMA_VERSION,
  settings: DEFAULT_SETTINGS,
  feeds: DEFAULT_FEEDS,
  articles: [],
  bookmarks: [],
  feedState: {},
  notified: {},
  meta: { lastRefreshAt: null, lastRefreshResult: null },
});

export const STORAGE_KEYS = Object.freeze(Object.keys(STORAGE_DEFAULTS));

export function createStorageService(area) {
  async function read(key) {
    assertKnownKey(key);
    const stored = await area.get(key);
    return key in stored ? stored[key] : structuredClone(STORAGE_DEFAULTS[key]);
  }

  async function write(values) {
    Object.keys(values).forEach(assertKnownKey);
    await area.set(values);
  }

  async function initialize() {
    const stored = await area.get(null);
    const updates = {};

    for (const key of STORAGE_KEYS) {
      if (!(key in stored)) updates[key] = structuredClone(STORAGE_DEFAULTS[key]);
    }
    if ('settings' in stored) {
      updates.settings = validateSettings(stored.settings).settings;
    }
    if ('feeds' in stored) {
      updates.feeds = keepValidFeeds(stored.feeds);
    }
    updates.schemaVersion = SCHEMA_VERSION;

    await area.set(updates);
    return { seeded: STORAGE_KEYS.filter((key) => !(key in stored)) };
  }

  async function getSettings() {
    return validateSettings(await read('settings')).settings;
  }

  async function saveSettings(input) {
    const { settings, errors } = validateSettings(input);
    if (errors.length > 0) return { ok: false, settings, errors };
    await area.set({ settings });
    return { ok: true, settings, errors };
  }

  async function getFeeds() {
    return keepValidFeeds(await read('feeds'));
  }

  async function saveFeeds(input) {
    if (!Array.isArray(input)) {
      return { ok: false, feeds: [], errors: [{ field: 'feeds', message: 'Feeds must be a list.' }] };
    }
    const errors = [];
    const feeds = [];
    const ids = new Set();
    input.forEach((candidate, index) => {
      const { feed, errors: feedErrors } = validateFeed(candidate);
      feedErrors.forEach((error) => errors.push({ ...error, field: `feeds[${index}].${error.field}` }));
      if (ids.has(feed.id)) {
        errors.push({ field: `feeds[${index}].id`, message: `Another feed already uses the id "${feed.id}".` });
      }
      ids.add(feed.id);
      feeds.push(feed);
    });
    if (errors.length > 0) return { ok: false, feeds, errors };
    await area.set({ feeds });
    return { ok: true, feeds, errors };
  }

  return Object.freeze({ read, write, initialize, getSettings, saveSettings, getFeeds, saveFeeds });
}

function keepValidFeeds(value) {
  if (!Array.isArray(value)) return structuredClone(DEFAULT_FEEDS);
  const ids = new Set();
  return value
    .map((candidate) => validateFeed(candidate))
    .filter(({ feed, errors }) => {
      if (errors.length > 0 || ids.has(feed.id)) return false;
      ids.add(feed.id);
      return true;
    })
    .map(({ feed }) => feed);
}

function assertKnownKey(key) {
  if (!STORAGE_KEYS.includes(key)) throw new Error(`Unknown storage key: ${key}`);
}
