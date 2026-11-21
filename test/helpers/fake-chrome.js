export function createFakeNotifications() {
  const shown = new Map();
  const cleared = [];
  return {
    shown,
    cleared,
    async create(id, options) { shown.set(id, options); return id; },
    async clear(id) { cleared.push(id); shown.delete(id); return true; },
  };
}

export function createFakeTabs() {
  const opened = [];
  return { opened, async create({ url }) { opened.push(url); return { id: opened.length }; } };
}

export const fakeRuntime = Object.freeze({
  id: 'ext',
  getURL: (path) => `chrome-extension://ext/${path}`,
});
