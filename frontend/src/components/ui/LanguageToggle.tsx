import { setLanguage, t, useLanguage } from '../../i18n';
import { HEADER_ICON_BUTTON } from './headerButton';

/**
 * One button that shows the language you would switch TO ("ગુ" while the portal is in English,
 * "EN" while it is in Gujarati). Clicking it changes the whole portal's language.
 */
export function LanguageToggle() {
  const language = useLanguage();
  const next = language === 'en' ? 'gu' : 'en';
  const label = next === 'gu' ? t('Switch to Gujarati') : t('Switch to English');

  return (
    <button
      type="button"
      onClick={() => setLanguage(next)}
      aria-label={label}
      title={label}
      lang={next}
      className={`${HEADER_ICON_BUTTON} text-sm font-semibold`}
    >
      <span aria-hidden="true">{next === 'gu' ? 'ગુ' : 'EN'}</span>
    </button>
  );
}
