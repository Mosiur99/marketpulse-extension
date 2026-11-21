import { createLogger, setDebugLogging } from './core/log.js';
import { safeHttpUrl } from './core/url.js';
import { createFeedFetcher } from './services/feed-fetcher.js';
import { createNotificationService } from './services/notification-service.js';
import { createRefreshService } from './services/refresh-service.js';
import { createStorageService } from './services/storage-service.js';

const ALARM = 'refresh';
const log = createLogger('background');
const storage = createStorageService(chrome.storage.local);
const fetcher = createFeedFetcher();
const notifier = createNotificationService({
  notifications: chrome.notifications,
  tabs: chrome.tabs,
  runtime: chrome.runtime,
  storage,
});
// An extension API call resets the service worker's idle timer while slow feeds download.
const keepAlive = () => chrome.runtime.getPlatformInfo().catch(() => {});
const refresher = createRefreshService({ storage, fetcher, notifier, onProgress: keepAlive });

async function applySettings() {
  const settings = await storage.getSettings();
  setDebugLogging(settings.debugLogging);
  const alarm = await chrome.alarms.get(ALARM);
  if (alarm?.periodInMinutes !== settings.refreshMinutes) {
    await chrome.alarms.create(ALARM, { delayInMinutes: settings.refreshMinutes, periodInMinutes: settings.refreshMinutes });
    log.info(`Refresh scheduled every ${settings.refreshMinutes} min`);
  }
}

async function refresh(reason) {
  try {
    return { ok: true, summary: await refresher.refresh({ reason }) };
  } catch (error) {
    log.error('Refresh failed', error);
    return { ok: false, error: error.message };
  }
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const { seeded } = await storage.initialize();
  await applySettings();
  log.info(`Installed (${reason}); seeded: ${seeded.join(', ') || 'nothing'}`);
  if (reason === 'install') await refresh('install');
});

chrome.runtime.onStartup.addListener(async () => {
  await applySettings();
  await refresh('startup');
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM) await refresh('alarm');
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) applySettings().catch((error) => log.error('Could not apply settings', error));
});

chrome.notifications.onClicked.addListener((id) => {
  notifier.handleClick(id).catch((error) => log.error('Could not open notification', error));
});

const handlers = {
  refresh: () => refresh('manual'),
  'test-feed': async ({ feed }) => {
    const url = safeHttpUrl(feed?.url);
    if (!url) return { ok: false, error: 'Enter a full http:// or https:// feed address.' };
    return { ok: true, result: await fetcher.testFeed({ id: 'test', source: feed.name || 'Test', ...feed, url }) };
  },
  'test-notification': async () => ({ ok: true, id: await notifier.showTest() }),
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = sender.id === chrome.runtime.id ? handlers[message?.type] : undefined;
  if (!handler) return false;
  handler(message)
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});
