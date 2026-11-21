import { defineConfig } from '@playwright/test';

const live = process.env.LIVE === '1';

export default defineConfig({
  testDir: 'test/e2e',
  timeout: live ? 120_000 : 30_000,
  workers: 1,
  reporter: 'list',
  grep: live ? /@live/ : undefined,
  grepInvert: live ? undefined : /@live/,
});
