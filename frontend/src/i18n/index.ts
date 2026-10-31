import { useSyncExternalStore } from 'react';
import { gu } from './locales/gu';

export type Language = 'en' | 'gu';

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
export const useLanguage = (): Language => useSyncExternalStore(subscribe, getLanguage, getLanguage);

/**
 * Translates an English UI string. The English text itself is the key, so a string with no
 * Gujarati entry simply shows in English. `{name}` placeholders are filled from `vars`.
 * Never call this at module scope (the language can change): call it while rendering.
 */
export const t = (text: string, vars?: Record<string, string | number>): string => {
  const translated = current === 'gu' ? (gu[text] ?? text) : text;
  if (!vars) return translated;
  return translated.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
};
