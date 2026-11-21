import { createStorageService } from '../../services/storage-service.js';
import { h } from './dom.js';

export const storage = createStorageService(chrome.storage.local);

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark';
}

export async function send(type, payload = {}) {
  try {
    return await chrome.runtime.sendMessage({ type, ...payload });
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export function openDashboard() {
  return chrome.tabs.create({ url: chrome.runtime.getURL('src/ui/dashboard/dashboard.html') });
}

let toastTimer = null;
export function toast(message, kind = 'info') {
  let region = document.getElementById('toast');
  if (!region) {
    region = h('div', { id: 'toast', class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(region);
  }
  region.textContent = message;
  region.dataset.kind = kind;
  region.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => region.classList.remove('show'), 4000);
}

export function refreshMessage(response) {
  if (!response?.ok) return [`Refresh failed: ${response?.error ?? 'no answer from the extension'}`, 'error'];
  const { added, failed } = response.summary;
  const news = added === 0 ? 'No new stories' : `${added} new ${added === 1 ? 'story' : 'stories'}`;
  return [failed > 0 ? `${news}. ${failed} ${failed === 1 ? 'feed' : 'feeds'} failed.` : `${news}.`, failed > 0 ? 'warn' : 'ok'];
}
