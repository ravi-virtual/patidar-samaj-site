import { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useRoutes } from 'react-router-dom';
import { Provider } from 'react-redux';
import { createStore } from '../../src/store';
import { settingsReplaced } from '../../src/store/slices/siteSlice';
import * as siteApi from '../../src/api/siteApi';
import * as adminApi from '../../src/api/adminApi';
import type { AdminSettings } from '../../src/api/adminApi';
import type { HomeData, PublicSettings, PublicTabKey, PublicTabs } from '../../src/api/types';
import { Toggle } from '../../src/components/ui/Toggle';
import { TabGate } from '../../src/components/layout/TabGate';
import { SearchPalette } from '../../src/components/overlays/SearchPalette';
import { routes } from '../../src/routes';
import AdminSettingsPage from '../../src/pages/admin/AdminSettingsPage';
import HomePage from '../../src/pages/HomePage';
import { makeEvent, renderWithApp } from '../helpers';
import { isTabOn, PUBLIC_TABS } from '../../src/lib/publicTabs';

vi.mock('../../src/api/siteApi', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/api/siteApi')>();
  return { mediaUrl: real.mediaUrl, getHomeApi: vi.fn(), searchApi: vi.fn(), getSettingsApi: vi.fn() };
});
vi.mock('../../src/api/adminApi', () => ({ getAdminSettingsApi: vi.fn(), updateAdminSettingsApi: vi.fn() }));

const site = vi.mocked(siteApi);
const admin = vi.mocked(adminApi);

const allOn = (): PublicTabs => ({ about: true, committee: true, faq: true, links: true, directory: true, events: true, news: true, contact: true });
const tabsWith = (off: PublicTabKey[]): PublicTabs => ({ ...allOn(), ...Object.fromEntries(off.map((t) => [t, false])) });

const makeSettings = (off: PublicTabKey[] = []): PublicSettings => ({
  name: 'Uttar Gujarat Kadva Patidar Samaj',
  shortName: 'Kadva Patidar Samaj',
  invocation: 'Jay Umiya Maa',
  tagline: 'One family',
  logoUrl: null,
  contact: { email: '', phone: '', address: '', officeHours: '' },
  socialLinks: [],
  footerNote: '',
  publicTabs: tabsWith(off),
  themeDefault: 'system',
});

const storeWith = (off: PublicTabKey[] = []) => {
  const store = createStore();
  store.dispatch(settingsReplaced(makeSettings(off)));
  return store;
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('isTabOn', () => {
  it('counts missing settings and missing keys as on, and only false as off', () => {
    expect(isTabOn(null, 'events')).toBe(true);
    expect(isTabOn({ publicTabs: {} as PublicTabs }, 'events')).toBe(true);
    expect(isTabOn({ publicTabs: tabsWith(['events']) }, 'events')).toBe(false);
    expect(isTabOn({ publicTabs: tabsWith(['events']) }, 'news')).toBe(true);
  });

  it('lists the nine public tabs', () => {
    expect(PUBLIC_TABS.map((t) => t.key)).toEqual(['about', 'committee', 'faq', 'links', 'directory', 'events', 'news', 'contact']);
  });
});

describe('Toggle', () => {
  function Harness({ initial = false, disabled = false }: { initial?: boolean; disabled?: boolean }) {
    const [on, setOn] = useState(initial);
    return <Toggle label="Feature on the home page" description="Shown first." checked={on} disabled={disabled} onChange={(e) => setOn(e.target.checked)} />;
  }

  it('is a switch with its label and description', () => {
    render(<Harness />);
    const sw = screen.getByRole('switch', { name: 'Feature on the home page' });
    expect(sw).not.toBeChecked();
    expect(sw).toHaveAccessibleDescription('Shown first.');
  });

  it('toggles on click, and on the label', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const sw = screen.getByRole('switch');
    await user.click(sw);
    expect(sw).toBeChecked();
    await user.click(screen.getByText('Feature on the home page'));
    expect(sw).not.toBeChecked();
  });

  it('toggles with Space and with Enter, without submitting a surrounding form', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Harness />
      </form>,
    );
    const sw = screen.getByRole('switch');
    sw.focus();
    await user.keyboard(' ');
    expect(sw).toBeChecked();
    await user.keyboard('{Enter}');
    expect(sw).not.toBeChecked();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does nothing when disabled', async () => {
    const user = userEvent.setup();
    render(<Harness initial disabled />);
    const sw = screen.getByRole('switch');
    expect(sw).toBeDisabled();
    await user.click(sw);
    expect(sw).toBeChecked();
  });

  it('can be used without a visible label when given aria-label', () => {
    render(<Toggle aria-label="Pinned" defaultChecked />);
    expect(screen.getByRole('switch', { name: 'Pinned' })).toBeChecked();
  });
});

describe('AdminSettingsPage', () => {
  const adminSettings = (off: PublicTabKey[] = []): AdminSettings => ({ ...makeSettings(off), logoUrl: null });

  it('shows a switch per public tab in a Public site tabs card, and no registration or directory-visibility options', async () => {
    admin.getAdminSettingsApi.mockResolvedValue(adminSettings(['news']));
    renderWithApp(<AdminSettingsPage />);
    await screen.findByText('Public site tabs');
    expect(screen.getByText('Turn a tab off to hide it from the public website.')).toBeInTheDocument();

    expect(screen.getAllByRole('switch')).toHaveLength(8);
    for (const { label } of PUBLIC_TABS) expect(screen.getByRole('switch', { name: label })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'News' })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'Events' })).toBeChecked();

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByText(/registration/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/directory is visible/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Default colour theme')).toBeInTheDocument();
  });

  it('saves the switched tabs and refreshes the public settings in the store', async () => {
    const user = userEvent.setup();
    admin.getAdminSettingsApi.mockResolvedValue(adminSettings());
    admin.updateAdminSettingsApi.mockImplementation(async (body) => ({ ...adminSettings(), ...body, publicTabs: { ...allOn(), ...body.publicTabs } }) as AdminSettings);
    const { store } = renderWithApp(<AdminSettingsPage />);
    await screen.findByText('Public site tabs');

    const save = screen.getByRole('button', { name: /save settings/i });
    expect(save).toBeDisabled();
    await user.click(screen.getByRole('switch', { name: 'Events' }));
    await user.click(screen.getByRole('switch', { name: 'Members directory' }));
    expect(save).toBeEnabled();
    await user.click(save);

    await waitFor(() => expect(admin.updateAdminSettingsApi).toHaveBeenCalled());
    const body = admin.updateAdminSettingsApi.mock.calls[0]![0];
    expect(body.publicTabs).toEqual({ ...allOn(), events: false, directory: false });
    expect(body).not.toHaveProperty('registrationOpen');
    expect(body).not.toHaveProperty('directoryPublic');
    await waitFor(() => expect(store.getState().site.settings?.publicTabs).toMatchObject({ events: false, directory: false, news: true }));
  });

  it('discards unsaved toggles', async () => {
    const user = userEvent.setup();
    admin.getAdminSettingsApi.mockResolvedValue(adminSettings());
    renderWithApp(<AdminSettingsPage />);
    await screen.findByText('Public site tabs');
    await user.click(screen.getByRole('switch', { name: 'FAQ' }));
    expect(screen.getByRole('switch', { name: 'FAQ' })).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: /discard changes/i }));
    expect(screen.getByRole('switch', { name: 'FAQ' })).toBeChecked();
  });
});

describe('TabGate', () => {
  const renderGate = (store = createStore(), tab: PublicTabKey = 'events') =>
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/x']}>
          <Routes>
            <Route path="/x" element={<TabGate tab={tab}>Secret page</TabGate>} />
            <Route path="/nested" element={<TabGate tab={tab} />}>
              <Route index element={<p>Nested page</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </Provider>,
    );

  it('shows the loading state, not Not found, until the settings have arrived', async () => {
    const store = createStore();
    renderGate(store);
    expect(screen.queryByRole('heading', { name: /page not found/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Secret page')).not.toBeInTheDocument();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows the page when the tab is on', () => {
    renderGate(storeWith());
    expect(screen.getByText('Secret page')).toBeInTheDocument();
  });

  it('shows the Not found page when the tab is off', () => {
    renderGate(storeWith(['events']));
    expect(screen.getByRole('heading', { name: /page not found/i })).toBeInTheDocument();
    expect(screen.queryByText('Secret page')).not.toBeInTheDocument();
  });

  it('only blocks its own tab', () => {
    renderGate(storeWith(['news']));
    expect(screen.getByText('Secret page')).toBeInTheDocument();
  });

  it('renders nested routes when used as a layout route', () => {
    const store = storeWith();
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/nested']}>
          <Routes>
            <Route path="/nested" element={<TabGate tab="events" />}>
              <Route index element={<p>Nested page</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </Provider>,
    );
    expect(screen.getByText('Nested page')).toBeInTheDocument();
  });
});

describe('public routes and navigation', () => {
  function TestApp() {
    return useRoutes(routes);
  }
  const renderAt = (path: string, store = createStore()) =>
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={[path]}>
          <TestApp />
        </MemoryRouter>
      </Provider>,
    );

  const navNames = () => within(screen.getAllByRole('navigation', { name: 'Main' })[0]!).getAllByRole('link').map((a) => a.textContent);

  it('lists every public tab in the menu while all are on', () => {
    renderAt('/no-such-page', storeWith());
    expect(navNames()).toEqual(expect.arrayContaining(['About', 'Committee', 'Directory', 'Events', 'News', 'FAQ', 'Important links', 'Contact']));
  });

  it('removes a switched-off tab from the menu and keeps the rest', () => {
    renderAt('/no-such-page', storeWith(['events', 'directory', 'faq']));
    const names = navNames();
    expect(names).not.toContain('Events');
    expect(names).not.toContain('Directory');
    expect(names).not.toContain('FAQ');
    expect(names).toEqual(expect.arrayContaining(['Home', 'About', 'News', 'Contact']));
  });

  it('drops a menu heading whose items are all switched off', () => {
    renderAt('/no-such-page', storeWith(['faq', 'links', 'contact']));
    expect(screen.queryByText('Help')).not.toBeInTheDocument();
  });

  it.each([
    ['/about', 'about'],
    ['/committee', 'committee'],
    ['/faq', 'faq'],
    ['/links', 'links'],
    ['/members', 'directory'],
    ['/members/abc', 'directory'],
    ['/events', 'events'],
    ['/events/abc', 'events'],
    ['/news', 'news'],
    ['/news/abc', 'news'],
    ['/contact', 'contact'],
  ] as [string, PublicTabKey][])('%s shows Not found when the %s tab is off', (path, tab) => {
    renderAt(path, storeWith([tab]));
    expect(screen.getByRole('heading', { name: /page not found/i })).toBeInTheDocument();
  });
});

describe('SearchPalette', () => {
  const hit = (title: string) => [{ id: title, title, snippet: null }];
  const results = () => ({
    results: { events: hit('Garba event'), announcements: hit('Garba news'), faqs: hit('Garba faq'), links: hit('Garba link'), members: hit('Garba member') },
    totalCount: 6,
  });

  const search = async (store: ReturnType<typeof createStore>) => {
    site.searchApi.mockResolvedValue(results());
    const user = userEvent.setup();
    renderWithApp(<SearchPalette open onClose={() => undefined} />, { store });
    await user.type(screen.getByRole('searchbox'), 'garba');
    await screen.findByText('Garba event', undefined, { timeout: 2000 }).catch(() => undefined);
  };

  it('shows every group while all tabs are on', async () => {
    await search(storeWith());
    for (const t of ['Garba event', 'Garba news', 'Garba faq', 'Garba link', 'Garba member']) expect(await screen.findByText(t)).toBeInTheDocument();
  });

  it('hides the results of switched-off tabs', async () => {
    await search(storeWith(['events', 'news', 'directory']));
    expect(await screen.findByText('Garba faq')).toBeInTheDocument();
    expect(screen.queryByText('Garba event')).not.toBeInTheDocument();
    expect(screen.queryByText('Garba news')).not.toBeInTheDocument();
    expect(screen.queryByText('Garba member')).not.toBeInTheDocument();
  });
});

describe('HomePage sections', () => {
  const home = (): HomeData => ({
    settings: makeSettings(),
    blocks: {},
    featuredEvent: makeEvent({ id: 'f1', title: 'Featured Garba' }),
    upcomingEvents: [makeEvent({ id: 'f1', title: 'Featured Garba' }), makeEvent({ id: 'e2', title: 'Second Event' })],
    announcements: [{ id: 'a1', title: 'Big announcement', category: 'Notice', pinned: false, publishedAt: '2030-01-01T00:00:00.000Z' } as HomeData['announcements'][number]],
    memberHighlights: [{ id: 'm1', name: 'Asha Patel', city: 'Unjha', country: 'India' } as HomeData['memberHighlights'][number]],
    links: [{ id: 'l1', label: 'Membership form', category: 'Forms' } as HomeData['links'][number]],
  });

  it('shows every section while all tabs are on', async () => {
    site.getHomeApi.mockResolvedValue(home());
    renderWithApp(<HomePage />, { store: storeWith() });
    expect(await screen.findByRole('heading', { name: 'Upcoming' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Next event' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Recent announcements' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Member highlights' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Important links' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /find a family/i })).toBeInTheDocument();
  });

  it('hides the sections and quick links of switched-off tabs', async () => {
    site.getHomeApi.mockResolvedValue(home());
    renderWithApp(<HomePage />, { store: storeWith(['events', 'news', 'directory', 'links', 'contact']) });
    expect(await screen.findByRole('heading', { name: 'Quick actions' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Upcoming' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Next event' })).not.toBeInTheDocument();
    expect(screen.queryByText(/no upcoming events yet/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Recent announcements' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Member highlights' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Important links' })).not.toBeInTheDocument();
    for (const name of [/find a family/i, /upcoming events/i, /book patidar samaj bhavan/i, /explore directory/i]) {
      expect(screen.queryByRole('link', { name })).not.toBeInTheDocument();
    }
  });
});
