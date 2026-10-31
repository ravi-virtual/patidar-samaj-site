import { useAppSelector } from '../store/hooks';
import { isTabOn } from '../lib/publicTabs';
import type { PublicTabKey } from '../api/types';

/** True unless an administrator has switched the public tab off. Use it to hide links and sections. */
export function useTabEnabled(tab: PublicTabKey): boolean {
  return useAppSelector((s) => isTabOn(s.site.settings, tab));
}
