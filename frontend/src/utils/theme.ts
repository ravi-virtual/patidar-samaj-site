export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'samaj.theme';
export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

export const isThemePreference = (value: unknown): value is ThemePreference =>
  value === 'system' || value === 'light' || value === 'dark';

/** Reads the locally cached preference. Storage can be blocked, so every access is guarded. */
export const readStoredTheme = (): ThemePreference => {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
};

export const writeStoredTheme = (preference: ThemePreference): void => {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    /* storage unavailable — the preference simply won't be cached on this device */
  }
};

export const systemPrefersDark = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-color-scheme: dark)').matches;

export const resolveTheme = (preference: ThemePreference): ResolvedTheme => {
  if (preference === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return preference;
};

export const applyTheme = (preference: ThemePreference): ResolvedTheme => {
  const resolved = resolveTheme(preference);
  const root = document.documentElement;
  root.setAttribute('data-theme', resolved);
  root.setAttribute('data-theme-pref', preference);
  root.style.colorScheme = resolved;
  return resolved;
};
