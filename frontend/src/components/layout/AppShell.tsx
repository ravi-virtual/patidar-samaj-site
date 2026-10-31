import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Menu, Search, X, type LucideIcon } from 'lucide-react';
import { ThemeToggle } from '../ui/ThemeToggle';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export interface NavSection {
  /** Small heading above the group. Omit for the first group. */
  heading?: string;
  items: NavItem[];
}

interface AppShellProps {
  brandName: string;
  brandTagline: string;
  navLabel: string;
  navSections: NavSection[];
  sidebarFooter?: ReactNode;
  headerActions?: ReactNode;
  breadcrumb?: ReactNode;
  /** When given, a search button appears in the sidebar and header. */
  onSearch?: () => void;
  /** Rendered below the page content (site footer). */
  footer?: ReactNode;
  /** Extra elements mounted once (dialogs, toasts). */
  overlays?: ReactNode;
}

type SidebarProps = Pick<AppShellProps, 'brandName' | 'brandTagline' | 'navLabel' | 'navSections' | 'sidebarFooter' | 'onSearch'>;

function SidebarContent({ brandName, brandTagline, navLabel, navSections, sidebarFooter, onSearch }: SidebarProps) {
  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      <div className="flex items-center gap-3 px-1">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground"
        >
          PS
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text">{brandName}</p>
          <p className="truncate text-xs text-text-muted">{brandTagline}</p>
        </div>
      </div>

      {onSearch && (
        <button
          type="button"
          onClick={onSearch}
          className="flex h-10 w-full items-center gap-2.5 rounded-md border border-border-strong bg-surface px-3 text-sm text-text-subtle hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-[var(--focus-ring)]"
        >
          <Search aria-hidden="true" className="h-4 w-4" />
          Search
          <kbd className="ml-auto rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-text-subtle">Ctrl K</kbd>
        </button>
      )}

      <nav aria-label={navLabel} className="flex-1 space-y-4">
        {navSections.map((section, i) => (
          <div key={section.heading ?? i}>
            {section.heading && (
              <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-text-subtle">
                {section.heading}
              </p>
            )}
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
              {section.items.map(({ to, label, icon: Icon, end }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-surface-muted text-text'
                          : 'text-text-muted hover:bg-surface-muted hover:text-text'
                      }`
                    }
                  >
                    <Icon aria-hidden="true" className="h-4 w-4" />
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {sidebarFooter}
    </div>
  );
}

/**
 * Responsive application frame shared by the public site and the admin
 * panel: fixed sidebar on large screens, a drawer that slides in from the right on small ones,
 * skip link and landmarks.
 */
export function AppShell({ headerActions, breadcrumb, footer, overlays, onSearch, ...sidebar }: AppShellProps) {
  // The drawer remembers the path it was opened on and counts as open only while the route is
  // unchanged, so navigating anywhere closes it without an effect.
  const location = useLocation();
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const drawerOpen = openedOn === location.pathname;
  const setDrawerOpen = (open: boolean) => setOpenedOn(open ? location.pathname : null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  // Escape closes the drawer; focus moves in on open and returns to the menu button on close.
  useEffect(() => {
    if (!drawerOpen) return;
    closeButton.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenedOn(null);
        menuButton.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  // A new page starts at the top instead of keeping the previous page's scroll position.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col bg-bg text-text">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Skip to main content
      </a>

      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-border bg-surface lg:block">
        <SidebarContent {...sidebar} onSearch={onSearch} />
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button
            type="button"
            aria-label="Close menu"
            tabIndex={-1}
            className="absolute inset-0 bg-[var(--overlay)]"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute inset-y-0 right-0 h-full w-72 max-w-[85vw] bg-surface shadow-pop">
            <button
              ref={closeButton}
              type="button"
              aria-label="Close menu"
              className="absolute right-3 top-3 z-10 rounded-md p-1.5 text-text-muted hover:bg-surface-muted"
              onClick={() => {
                setDrawerOpen(false);
                menuButton.current?.focus();
              }}
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
            <SidebarContent {...sidebar} onSearch={onSearch} />
          </div>
        </div>
      )}

      <div className="flex min-h-screen flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur sm:px-6">
          <div className="min-w-0 flex-1 truncate text-sm text-text-muted">{breadcrumb}</div>
          {onSearch && (
            <button
              type="button"
              onClick={onSearch}
              aria-label="Search"
              className="flex h-10 w-10 items-center justify-center rounded-md border border-border-strong bg-surface text-text-muted hover:bg-surface-muted hover:text-text"
            >
              <Search aria-hidden="true" className="h-4 w-4" />
            </button>
          )}
          <ThemeToggle />
          {headerActions}
          <button
            ref={menuButton}
            type="button"
            aria-label="Open menu"
            aria-expanded={drawerOpen}
            className="rounded-md p-1.5 text-text-secondary hover:bg-surface-muted lg:hidden"
            onClick={() => setDrawerOpen(true)}
          >
            <Menu aria-hidden="true" className="h-5 w-5" />
          </button>
        </header>

        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 outline-none sm:px-6">
          <Outlet />
        </main>
        {footer}
      </div>
      {overlays}
    </div>
  );
}
