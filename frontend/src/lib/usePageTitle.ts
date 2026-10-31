import { useEffect } from 'react';
import { t } from '../i18n';

/** Sets the browser tab / screen-reader page title. Each page should have its own (WCAG 2.4.2). */
export function usePageTitle(title: string | null | undefined, siteName = t('Kadva Patidar Samaj')) {
  useEffect(() => {
    if (!title) return;
    document.title = `${title} · ${siteName}`;
  }, [title, siteName]);
}
