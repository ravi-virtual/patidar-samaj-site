import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  CalendarDays,
  CircleHelp,
  Home,
  Info,
  Landmark,
  Link2,
  Mail,
  Megaphone,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { AppShell, type NavSection } from './AppShell';
import { SiteFooter } from './SiteFooter';
import { SearchPalette } from '../overlays/SearchPalette';
import { Toaster } from '../overlays/Toaster';
import { useAppSelector } from '../../store/hooks';
import { usePageTitle } from '../../lib/usePageTitle';
import { isTabOn } from '../../lib/publicTabs';
import type { PublicTabKey } from '../../api/types';
import { Breadcrumbs, type Crumb } from '../ui/Breadcrumbs';
import { t } from '../../i18n';

type PublicNavItem = NavSection['items'][number] & { tab?: PublicTabKey };

// Items with a `tab` disappear from the menu while an administrator has that tab switched off.
const publicSections: (Omit<NavSection, 'items'> & { items: PublicNavItem[] })[] = [
  {
    heading: 'Community',
    items: [
      { to: '/', label: 'Home', icon: Home, end: true },
      { to: '/about', label: 'About', icon: Info, tab: 'about' },
      { to: '/committee', label: 'Committee', icon: Landmark, tab: 'committee' },
      { to: '/members', label: 'Directory', icon: UsersRound, tab: 'directory' },
      { to: '/events', label: 'Events', icon: CalendarDays, tab: 'events' },
      { to: '/news', label: 'News', icon: Megaphone, tab: 'news' },
    ],
  },
  {
    heading: 'Help',
    items: [
      { to: '/faq', label: 'FAQ', icon: CircleHelp, tab: 'faq' },
      { to: '/links', label: 'Important links', icon: Link2, tab: 'links' },
      { to: '/contact', label: 'Contact', icon: Mail, tab: 'contact' },
    ],
  },
];

const titles: { prefix: string; label: string; icon?: LucideIcon }[] = [
  { prefix: '/about', label: 'About' },
  { prefix: '/history', label: 'History' },
  { prefix: '/committee', label: 'Committee' },
  { prefix: '/members', label: 'Directory', icon: Users },
  { prefix: '/events', label: 'Events' },
  { prefix: '/news', label: 'News' },
  { prefix: '/faq', label: 'FAQ' },
  { prefix: '/links', label: 'Important links' },
  { prefix: '/contact', label: 'Contact' },
  { prefix: '/forgot-password', label: 'Reset password' },
  { prefix: '/reset-password', label: 'Reset password' },
];

const breadcrumbFor = (pathname: string) => t(titles.find((x) => pathname.startsWith(x.prefix))?.label ?? 'Home');

/** "Home > Events" and, on a detail page, "Home > Events > Details". */
const crumbsFor = (pathname: string): Crumb[] => {
  const title = titles.find((x) => pathname.startsWith(x.prefix));
  if (!title) return [{ label: t('Home') }];
  const isDetail = pathname.replace(/\/+$/, '') !== title.prefix;
  return isDetail
    ? [{ label: t('Home'), to: '/' }, { label: t(title.label), to: title.prefix }, { label: t('Details') }]
    : [{ label: t('Home'), to: '/' }, { label: t(title.label) }];
};

export function PublicLayout() {
  const location = useLocation();
  const siteName = useAppSelector((s) => s.site.settings?.shortName) ?? t('Kadva Patidar Samaj');
  const [searchOpen, setSearchOpen] = useState(false);
  usePageTitle(breadcrumbFor(location.pathname), siteName);

  // Ctrl/⌘ + K opens search from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const settings = useAppSelector((s) => s.site.settings);
  const visibleSections = publicSections
    .map((section) => ({
      ...section,
      heading: section.heading ? t(section.heading) : undefined,
      items: section.items
        .filter((item) => !item.tab || isTabOn(settings, item.tab))
        .map((item) => ({ ...item, label: t(item.label) })),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <AppShell
      brandName={siteName}
      brandTagline={t('Uttar Gujarat · Jay Umiya Maa')}
      navLabel={t('Main')}
      navSections={visibleSections}
      onSearch={() => setSearchOpen(true)}
      breadcrumb={<Breadcrumbs crumbs={crumbsFor(location.pathname)} />}
      footer={<SiteFooter />}
      overlays={
        <>
          <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
          <Toaster />
        </>
      }
    />
  );
}
