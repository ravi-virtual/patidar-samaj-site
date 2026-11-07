import { useSyncExternalStore } from 'react';
import en from './en.json';
import guj from './guj.json';

export type Language = 'en' | 'gu';

/** Every UI text, keyed by its English wording: `en.json` for English, `guj.json` for Gujarati. */
const messages: Record<Language, Record<string, string>> = { en, gu: guj };

export const LANGUAGES: readonly Language[] = ['en', 'gu'];
export const LANGUAGE_STORAGE_KEY = 'samaj.language';

const isLanguage = (value: unknown): value is Language => value === 'en' || value === 'gu';

const readStoredLanguage = (): Language => {
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguage(stored) ? stored : 'en';
  } catch {
    return 'en';
  }
};

let current: Language = readStoredLanguage();
const listeners = new Set<() => void>();

const applyToDocument = (lang: Language) => {
  if (typeof document !== 'undefined') document.documentElement.setAttribute('lang', lang);
};
applyToDocument(current);

export const getLanguage = (): Language => current;

export const setLanguage = (lang: Language): void => {
  if (lang === current) return;
  current = lang;
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {
    /* storage unavailable: the choice still applies until the page is closed */
  }
  applyToDocument(lang);
  listeners.forEach((l) => l());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The active language; the component re-renders when it changes. */
export const useLanguage = (): Language =>
  useSyncExternalStore(subscribe, getLanguage, getLanguage);

/**
 * Translates an English UI string. The English text itself is the key, so a string with no
 * entry in the active language's JSON file simply shows in English. `{name}` placeholders are filled from `vars`.
 * Never call this at module scope (the language can change): call it while rendering.
 */
export const t = (text: string, vars?: Record<string, string | number>): string => {
  const translated = messages[current][text] ?? text;
  if (!vars) return translated;
  return translated.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
};
