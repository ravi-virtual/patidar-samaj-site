import type { ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import NotFoundPage from '../../pages/NotFoundPage';
import { useTabEnabled } from '../../hooks/useTabEnabled';
import { useAppSelector } from '../../store/hooks';
import type { PublicTabKey } from '../../api/types';
import { PageLoading } from './PageLoading';

/**
 * Route guard for a public tab. Shows the loading state until the site settings arrive (so a
 * switched-off page never flashes), the Not found page when the tab is off, and otherwise the
 * page. Use it as a layout route (renders the nested routes) or wrap a single element. If the
 * settings could not be loaded the tab counts as on; the server still answers 404 for a hidden tab.
 */
export function TabGate({ tab, children }: { tab: PublicTabKey; children?: ReactNode }) {
  const enabled = useTabEnabled(tab);
  const waiting = useAppSelector((s) => s.site.settings === null && (s.site.status === 'idle' || s.site.status === 'loading'));
  if (waiting) return <PageLoading />;
  if (!enabled) return <NotFoundPage />;
  return <>{children ?? <Outlet />}</>;
}
