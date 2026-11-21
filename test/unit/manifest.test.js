import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_FEEDS, feedOrigin } from '../../src/config/feeds.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));

describe('manifest.json', () => {
  it('is Manifest V3 with a module service worker', () => {
    assert.equal(manifest.manifest_version, 3);
    assert.equal(manifest.background.type, 'module');
    assert.equal('scripts' in manifest.background, false);
  });

  it('asks only for the permissions the plan lists', () => {
    assert.deepEqual([...manifest.permissions].sort(), ['alarms', 'notifications', 'storage']);
    assert.deepEqual(manifest.optional_host_permissions, ['https://*/*', 'http://*/*']);
  });

  it('has host access to exactly the default feed hosts', () => {
    const expected = [...new Set(DEFAULT_FEEDS.map((feed) => feedOrigin(feed.url)))].sort();
    assert.deepEqual([...manifest.host_permissions].sort(), expected);
  });

  it('points only at files that exist', () => {
    const paths = [
      manifest.background.service_worker,
      manifest.action.default_popup,
      manifest.options_ui.page,
      ...Object.values(manifest.icons),
      ...Object.values(manifest.action.default_icon),
    ];
    for (const path of paths) assert.ok(existsSync(join(root, path)), path);
  });

  it('does not loosen the default content security policy', () => {
    assert.equal('content_security_policy' in manifest, false);
  });
});
