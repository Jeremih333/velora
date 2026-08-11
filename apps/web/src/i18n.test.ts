import { describe, expect, it } from 'vitest';
import { getWebMessages, normalizeWebLocale } from './i18n';

describe('web internationalization', () => {
  it('normalizes supported browser and Telegram locale variants', () => {
    expect(normalizeWebLocale('en')).toBe('en');
    expect(normalizeWebLocale('en-US')).toBe('en');
    expect(normalizeWebLocale('EN_gb')).toBe('en');
    expect(normalizeWebLocale('ru-RU')).toBe('ru');
    expect(normalizeWebLocale(undefined)).toBe('ru');
  });

  it('provides complete typed shell, navigation, and settings dictionaries', () => {
    const russian = getWebMessages('ru');
    const english = getWebMessages('en');
    expect(english.shell.title).toBe('Enter a world that remembers you');
    expect(english.navigation.settings).toBe('Settings');
    expect(english.settings.prepaidText).toContain('no automatic charges');
    expect(Object.keys(english.common)).toEqual(Object.keys(russian.common));
    expect(Object.keys(english.shell)).toEqual(Object.keys(russian.shell));
    expect(Object.keys(english.navigation)).toEqual(Object.keys(russian.navigation));
    expect(Object.keys(english.onboarding)).toEqual(Object.keys(russian.onboarding));
    expect(Object.keys(english.settings)).toEqual(Object.keys(russian.settings));
    expect(Object.keys(english.billing)).toEqual(Object.keys(russian.billing));
    expect(Object.keys(english.discovery)).toEqual(Object.keys(russian.discovery));
    expect(Object.keys(english.lorebooks)).toEqual(Object.keys(russian.lorebooks));
    expect(Object.keys(english.profile)).toEqual(Object.keys(russian.profile));
    expect(Object.keys(english.reports)).toEqual(Object.keys(russian.reports));
    expect(Object.keys(english.support)).toEqual(Object.keys(russian.support));
    expect(Object.keys(english.legal)).toEqual(Object.keys(russian.legal));
    expect(Object.keys(english.dataControls)).toEqual(Object.keys(russian.dataControls));
    expect(Object.keys(english.personas)).toEqual(Object.keys(russian.personas));
    expect(Object.keys(english.characters)).toEqual(Object.keys(russian.characters));
    expect(Object.keys(english.chat)).toEqual(Object.keys(russian.chat));
  });
});
