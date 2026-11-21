import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORY_IDS } from '../../src/config/categories.js';
import { DEFAULT_SETTINGS, validateSettings } from '../../src/config/settings.js';

const fieldsOf = (errors) => errors.map((error) => error.field);

describe('validateSettings', () => {
  it('returns the defaults with no errors for empty input', () => {
    const { settings, errors } = validateSettings({});
    assert.deepEqual(settings, DEFAULT_SETTINGS);
    assert.deepEqual(errors, []);
  });

  it('treats null and non-objects as empty input', () => {
    assert.deepEqual(validateSettings(null).settings, DEFAULT_SETTINGS);
    assert.deepEqual(validateSettings('x').settings, DEFAULT_SETTINGS);
  });

  it('returns a copy that does not share state with the defaults', () => {
    const { settings } = validateSettings({});
    settings.notifyCategories.crypto = false;
    assert.equal(DEFAULT_SETTINGS.notifyCategories.crypto, true);
  });

  it('defaults to a 15 minute refresh, dark theme and all categories on', () => {
    assert.equal(DEFAULT_SETTINGS.refreshMinutes, 15);
    assert.equal(DEFAULT_SETTINGS.theme, 'dark');
    assert.deepEqual(Object.keys(DEFAULT_SETTINGS.enabledCategories), CATEGORY_IDS);
    assert.ok(Object.values(DEFAULT_SETTINGS.enabledCategories).every(Boolean));
  });

  it('accepts valid values', () => {
    const { settings, errors } = validateSettings({
      refreshMinutes: 30,
      notificationsEnabled: false,
      notifyMode: 'digest',
      notifyMinPriority: 'medium',
      theme: 'light',
      maxArticles: 1000,
      retentionDays: 3,
      highThreshold: 10,
      mediumThreshold: 5,
      debugLogging: true,
    });
    assert.deepEqual(errors, []);
    assert.equal(settings.refreshMinutes, 30);
    assert.equal(settings.notificationsEnabled, false);
    assert.equal(settings.notifyMode, 'digest');
    assert.equal(settings.notifyMinPriority, 'medium');
    assert.equal(settings.theme, 'light');
    assert.equal(settings.maxArticles, 1000);
    assert.equal(settings.retentionDays, 3);
    assert.equal(settings.highThreshold, 10);
    assert.equal(settings.debugLogging, true);
  });

  it('rejects numbers outside their range, fractions and strings, keeping the default', () => {
    const { settings, errors } = validateSettings({ refreshMinutes: 1, maxArticles: 150.5, retentionDays: '7' });
    assert.deepEqual(fieldsOf(errors), ['refreshMinutes', 'maxArticles', 'retentionDays']);
    assert.equal(settings.refreshMinutes, 15);
    assert.equal(settings.maxArticles, 500);
    assert.equal(settings.retentionDays, 7);
  });

  it('accepts the range limits themselves', () => {
    assert.deepEqual(validateSettings({ refreshMinutes: 5 }).errors, []);
    assert.deepEqual(validateSettings({ refreshMinutes: 120 }).errors, []);
    assert.equal(validateSettings({ refreshMinutes: 121 }).errors.length, 1);
  });

  it('rejects unknown choices and non-boolean switches', () => {
    const { errors } = validateSettings({ theme: 'blue', notifyMode: 'all', notificationsEnabled: 'yes' });
    assert.deepEqual(fieldsOf(errors).sort(), ['notificationsEnabled', 'notifyMode', 'theme']);
  });

  it('drops unknown fields', () => {
    const { settings } = validateSettings({ evil: '<script>' });
    assert.equal('evil' in settings, false);
  });

  it('merges category maps and ignores unknown categories and non-boolean values', () => {
    const { settings, errors } = validateSettings({ notifyCategories: { crypto: false, nope: false, forex: 'off' } });
    assert.deepEqual(errors, []);
    assert.equal(settings.notifyCategories.crypto, false);
    assert.equal(settings.notifyCategories.forex, true);
    assert.equal('nope' in settings.notifyCategories, false);
  });

  it('rejects a category map that is not an object', () => {
    assert.deepEqual(fieldsOf(validateSettings({ enabledCategories: ['crypto'] }).errors), ['enabledCategories']);
  });

  it('requires the medium threshold to be below the high threshold', () => {
    const { settings, errors } = validateSettings({ highThreshold: 5, mediumThreshold: 5 });
    assert.deepEqual(fieldsOf(errors), ['mediumThreshold']);
    assert.equal(settings.highThreshold, 8);
    assert.equal(settings.mediumThreshold, 4);
  });

  describe('custom keywords', () => {
    it('normalizes terms to lower case with single spaces', () => {
      const { settings, errors } = validateSettings({ customKeywords: [{ term: '  Bangladesh   Bank ', weight: 5, alwaysNotify: true }] });
      assert.deepEqual(errors, []);
      assert.deepEqual(settings.customKeywords, [{ term: 'bangladesh bank', weight: 5, alwaysNotify: true }]);
    });

    it('defaults alwaysNotify to false', () => {
      const { settings } = validateSettings({ customKeywords: [{ term: 'nvidia', weight: 3 }] });
      assert.equal(settings.customKeywords[0].alwaysNotify, false);
    });

    it('skips empty, too long, duplicate and badly weighted keywords with an error each', () => {
      const { settings, errors } = validateSettings({
        customKeywords: [
          { term: 'gold', weight: 2 },
          { term: '', weight: 2 },
          { term: 'x'.repeat(61), weight: 2 },
          { term: 'GOLD', weight: 3 },
          { term: 'oil', weight: 0 },
          { term: 'silver', weight: 2.5 },
          null,
        ],
      });
      assert.deepEqual(settings.customKeywords.map((keyword) => keyword.term), ['gold']);
      assert.equal(errors.length, 6);
    });

    it('caps the list at 50 keywords', () => {
      const many = Array.from({ length: 51 }, (_, index) => ({ term: `term ${index}`, weight: 1 }));
      const { settings, errors } = validateSettings({ customKeywords: many });
      assert.equal(settings.customKeywords.length, 50);
      assert.deepEqual(fieldsOf(errors), ['customKeywords']);
    });

    it('rejects a value that is not a list', () => {
      const { settings, errors } = validateSettings({ customKeywords: 'gold' });
      assert.deepEqual(settings.customKeywords, []);
      assert.deepEqual(fieldsOf(errors), ['customKeywords']);
    });
  });
});
