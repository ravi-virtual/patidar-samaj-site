import { Moon, Sun } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { changeTheme } from '../../store/slices/themeSlice';
import { t } from '../../i18n';
import { HEADER_ICON_BUTTON } from './headerButton';

/**
 * One icon button that shows the mode you would switch TO: a moon while the portal is light, a sun
 * while it is dark. Clicking it applies that mode (and saves it to the account when signed in).
 */
export function ThemeToggle() {
  const dispatch = useAppDispatch();
  const resolved = useAppSelector((s) => s.theme.resolved);
  const next = resolved === 'dark' ? 'light' : 'dark';
  const label = next === 'dark' ? t('Switch to dark mode') : t('Switch to light mode');
  const Icon = next === 'dark' ? Moon : Sun;

  return (
    <button type="button" onClick={() => void dispatch(changeTheme(next))} aria-label={label} title={label} className={HEADER_ICON_BUTTON}>
      <Icon aria-hidden="true" className="h-4 w-4" />
    </button>
  );
}
