import { test as base, chromium } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const extensionPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const test = base.extend({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    await use(context);
    await context.close();
  },
  serviceWorker: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    await use(worker);
  },
  extensionUrl: async ({ serviceWorker }, use) => {
    const extensionId = new URL(serviceWorker.url()).host;
    await use((path) => `chrome-extension://${extensionId}/${path}`);
  },
});

export { expect } from '@playwright/test';
