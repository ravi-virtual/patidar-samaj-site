import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { systemThemeChanged } from '../store/slices/themeSlice';
import { applyTheme } from '../utils/theme';

/** Keeps <html data-theme> in sync with the store and follows OS changes while on "System". */
export const useThemeEffect = (): void => {
  const dispatch = useAppDispatch();
  const preference = useAppSelector((s) => s.theme.preference);

  useEffect(() => {
    applyTheme(preference);
    if (preference !== 'system' || typeof window.matchMedia !== 'function') return;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      applyTheme('system');
      dispatch(systemThemeChanged());
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [preference, dispatch]);
};
