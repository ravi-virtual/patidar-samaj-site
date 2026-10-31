import { useLocation } from 'react-router-dom';
import { Breadcrumbs, type Crumb } from '../ui/Breadcrumbs';
import {
  Bell,
  CalendarDays,
  FileText,
  History,
  Image,
  Inbox,
  LayoutDashboard,
  Settings,
  ShieldUser,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { AppShell, type NavSection } from './AppShell';
import { HeaderActions } from './HeaderActions';
import { SidebarAccount } from './SidebarAccount';
import { Toaster } from '../overlays/Toaster';
import { useAppSelector } from '../../store/hooks';
import { usePageTitle } from '../../lib/usePageTitle';
import { t } from '../../i18n';

interface AdminItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  /** The user needs at least one of these. */
  anyOf: string[];
}

const items: AdminItem[] = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true, anyOf: ['dashboard.view'] },
  { to: '/admin/members', label: 'Members', icon: UsersRound, anyOf: ['members.read'] },
  { to: '/admin/users', label: 'Admins', icon: ShieldUser, anyOf: ['users.read', 'users.reset_password'] },
  { to: '/admin/events', label: 'Events', icon: CalendarDays, anyOf: ['events.read'] },
  { to: '/admin/announcements', label: 'Announcements', icon: Bell, anyOf: ['announcements.read'] },
  { to: '/admin/content', label: 'Content', icon: FileText, anyOf: ['content.read'] },
  { to: '/admin/media', label: 'Media library', icon: Image, anyOf: ['content.read'] },
  { to: '/admin/contacts', label: 'Contact inbox', icon: Inbox, anyOf: ['contacts.read'] },
  { to: '/admin/settings', label: 'Settings', icon: Settings, anyOf: ['settings.manage'] },
  { to: '/admin/audit', label: 'Audit log', icon: History, anyOf: ['audit.read'] },
];

const labelFor = (pathname: string) =>
  t([...items].reverse().find((i) => (i.end ? pathname === i.to : pathname.startsWith(i.to)))?.label ?? 'Admin');

const subPageLabel = (pathname: string): string | undefined => {
  const path = pathname.replace(/\/+$/, '');
  if (path === '/admin/users/new') return t('Create admin');
  if (/^\/admin\/users\/[^/]+\/edit$/.test(path)) return t('Edit admin');
  return undefined;
};

/** "Admin > Section" and, on a sub-page, "Admin > Section > Create admin". */
const crumbsFor = (pathname: string): Crumb[] => {
  const section = items.find((i) => !i.end && pathname.startsWith(i.to));
  if (!section) return [{ label: t('Admin'), to: '/admin' }, { label: labelFor(pathname) }];
  const sub = subPageLabel(pathname);
  return sub
    ? [{ label: t('Admin'), to: '/admin' }, { label: t(section.label), to: section.to }, { label: sub }]
    : [{ label: t('Admin'), to: '/admin' }, { label: t(section.label) }];
};

/** Admin panel frame. The menu only lists what the signed-in staff member may open. */
export function AdminLayout() {
  const location = useLocation();
  const user = useAppSelector((s) => s.auth.user);
  const permissions = user?.permissions ?? [];
  const crumbs = crumbsFor(location.pathname);
  usePageTitle(`${crumbs[crumbs.length - 1]!.label} · ${t('Admin')}`);

  const sections: NavSection[] = [
    { heading: t('Administration'), items: items.filter((i) => i.anyOf.some((p) => permissions.includes(p))) },
  ];

  return (
    <AppShell
      brandName={t('Samaj Admin')}
      brandTagline={t('Portal management')}
      navLabel={t('Admin')}
      navSections={sections}
      sidebarFooter={<SidebarAccount />}
      breadcrumb={<Breadcrumbs crumbs={crumbs} />}
      headerActions={<HeaderActions />}
      overlays={<Toaster />}
    />
  );
}
