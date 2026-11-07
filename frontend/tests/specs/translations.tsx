import { describe, expect, it } from 'vitest';
import en from '../../src/i18n/en.json';
import guj from '../../src/i18n/guj.json';

describe('translation files', () => {
  it('list the same texts in English and Gujarati', () => {
    expect(Object.keys(guj).sort()).toEqual(Object.keys(en).sort());
  });

  it('have no empty entries', () => {
    for (const file of [en, guj]) {
      for (const [key, value] of Object.entries(file)) expect(value.trim(), key).not.toBe('');
    }
  });

  it('keep the same {placeholders} in both languages', () => {
    const holes = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const [key, value] of Object.entries(guj)) expect(holes(value), key).toEqual(holes(key));
  });
});
