import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  BookOpen,
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
import { HeaderActions } from './HeaderActions';
import { SidebarAccount } from './SidebarAccount';
import { SiteFooter } from './SiteFooter';
import { SearchPalette } from '../overlays/SearchPalette';
import { Toaster } from '../overlays/Toaster';
import { useAppSelector } from '../../store/hooks';
import { workspaceSections } from './workspaceNav';
import { usePageTitle } from '../../lib/usePageTitle';

const publicSections: NavSection[] = [
  {
    heading: 'Community',
    items: [
      { to: '/', label: 'Home', icon: Home, end: true },
      { to: '/about', label: 'About', icon: Info },
      { to: '/history', label: 'History', icon: BookOpen },
      { to: '/committee', label: 'Committee', icon: Landmark },
      { to: '/members', label: 'Directory', icon: UsersRound },
      { to: '/events', label: 'Events', icon: CalendarDays },
      { to: '/news', label: 'News', icon: Megaphone },
    ],
  },
  {
    heading: 'Help',
    items: [
      { to: '/faq', label: 'FAQ', icon: CircleHelp },
      { to: '/links', label: 'Important links', icon: Link2 },
      { to: '/contact', label: 'Contact', icon: Mail },
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
  { prefix: '/login', label: 'Sign in' },
  { prefix: '/register', label: 'Create account' },
  { prefix: '/forgot-password', label: 'Reset password' },
  { prefix: '/reset-password', label: 'Reset password' },
  { prefix: '/app', label: 'My workspace' },
];

const breadcrumbFor = (pathname: string) => titles.find((t) => pathname.startsWith(t.prefix))?.label ?? 'Home';

export function PublicLayout() {
  const location = useLocation();
  const { user } = useAppSelector((s) => s.auth);
  const siteName = useAppSelector((s) => s.site.settings?.shortName) ?? 'Kadva Patidar Samaj';
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

  const sections = user ? [...publicSections, ...workspaceSections(user)] : publicSections;

  return (
    <AppShell
      brandName={siteName}
      brandTagline="Uttar Gujarat · Jay Umiya Maa"
      navLabel="Main"
      navSections={sections}
      onSearch={() => setSearchOpen(true)}
      sidebarFooter={<SidebarAccount />}
      breadcrumb={<span>{breadcrumbFor(location.pathname)}</span>}
      headerActions={<HeaderActions />}
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
