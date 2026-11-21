import { createLogger, setDebugLogging } from './core/log.js';
import { createStorageService } from './services/storage-service.js';

const log = createLogger('background');
const storage = createStorageService(chrome.storage.local);

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const { seeded } = await storage.initialize();
  const settings = await storage.getSettings();
  setDebugLogging(settings.debugLogging);
  log.info(`Installed (${reason}); seeded: ${seeded.join(', ') || 'nothing'}`);
});
