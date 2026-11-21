import { validateSettings } from '../config/settings.js';
import { MAX_BOOKMARKS } from './bookmarks.js';
import { safeHttpUrl } from './url.js';

export const BACKUP_FORMAT = 'marketpulse-backup';
export const BACKUP_VERSION = 1;

export function createBackup({ settings, feeds, bookmarks }, now) {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date(now).toISOString(), settings, feeds, bookmarks };
}

/** Reads a backup file. Feeds are validated later by the storage service; bookmarks keep only safe links. */
export function readBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'The file is not valid JSON.' };
  }
  if (data?.format !== BACKUP_FORMAT) return { ok: false, error: 'This is not a MarketPulse backup file.' };
  if (data.version > BACKUP_VERSION) return { ok: false, error: 'This backup was made by a newer version of MarketPulse.' };

  const bookmarks = (Array.isArray(data.bookmarks) ? data.bookmarks : [])
    .filter((bookmark) => typeof bookmark?.id === 'string' && typeof bookmark.title === 'string' && safeHttpUrl(bookmark.url))
    .slice(0, MAX_BOOKMARKS);
  return {
    ok: true,
    settings: validateSettings(data.settings).settings,
    feeds: Array.isArray(data.feeds) ? data.feeds : null,
    bookmarks,
  };
}
