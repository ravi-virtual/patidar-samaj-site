import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as siteApi from '../../src/api/siteApi';
import { Route, Routes } from 'react-router-dom';
import EventsPage from '../../src/pages/EventsPage';
import EventDetailPage from '../../src/pages/EventDetailPage';
import NewsPage from '../../src/pages/NewsPage';
import DirectoryPage from '../../src/pages/DirectoryPage';
import FaqPage from '../../src/pages/FaqPage';
import LinksPage from '../../src/pages/LinksPage';
import CommitteePage from '../../src/pages/CommitteePage';
import ContactPage from '../../src/pages/ContactPage';
import { apiError, makeEvent, renderWithApp } from '../helpers';

vi.mock('../../src/api/authApi', () => ({ adminLoginApi: vi.fn() }));
vi.mock('../../src/api/siteApi', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/api/siteApi')>();
  return {
    mediaUrl: real.mediaUrl,
    listEventsApi: vi.fn(),
    getEventApi: vi.fn(),
    listAnnouncementsApi: vi.fn(),
    listMembersApi: vi.fn(),
    getMemberFiltersApi: vi.fn(),
    getFaqsApi: vi.fn(),
    getLinksApi: vi.fn(),
    getCommitteeApi: vi.fn(),
    submitContactApi: vi.fn(),
  };
});

const api = vi.mocked(siteApi);

beforeEach(() => {
  vi.resetAllMocks();
});

describe('EventsPage', () => {
  it('shows a loading skeleton, then the events', async () => {
    api.listEventsApi.mockResolvedValue({ events: [makeEvent()], totalCount: 1 });
    renderWithApp(<EventsPage />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /navratri garba night/i })).toBeInTheDocument();
    expect(screen.getByText('1 shown')).toBeInTheDocument();
    expect(api.listEventsApi).toHaveBeenCalledWith({ when: 'upcoming', category: undefined, search: undefined, page: 1, limit: 12 });
  });

  it('shows an actionable error and retries', async () => {
    api.listEventsApi.mockRejectedValueOnce(apiError(500, 'Events are down')).mockResolvedValueOnce({ events: [makeEvent()], totalCount: 1 });
    const user = userEvent.setup();
    renderWithApp(<EventsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Events are down');
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByRole('link', { name: /navratri garba night/i })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a plain empty state without a reset button when nothing is filtered', async () => {
    api.listEventsApi.mockResolvedValue({ events: [], totalCount: 0 });
    renderWithApp(<EventsPage />);
    expect(await screen.findByText('No upcoming events found')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reset filters/i })).not.toBeInTheDocument();
  });

  it('filters by category and offers a reset when the filter finds nothing', async () => {
    api.listEventsApi.mockImplementation(async (p) =>
      p.category === 'Sports' ? { events: [], totalCount: 0 } : { events: [makeEvent()], totalCount: 1 },
    );
    const user = userEvent.setup();
    renderWithApp(<EventsPage />);
    await screen.findByRole('link', { name: /navratri/i });

    await user.click(within(screen.getByRole('group', { name: 'Category' })).getByRole('button', { name: 'Sports' }));
    expect(await screen.findByText('Try a different search or category.')).toBeInTheDocument();
    expect(api.listEventsApi).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'Sports', page: 1 }));

    await user.click(screen.getByRole('button', { name: /reset filters/i }));
    expect(await screen.findByRole('link', { name: /navratri/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('searches after the user stops typing, with the trimmed term', async () => {
    api.listEventsApi.mockResolvedValue({ events: [makeEvent()], totalCount: 1 });
    const user = userEvent.setup();
    renderWithApp(<EventsPage />);
    await screen.findByRole('link', { name: /navratri/i });
    await user.type(screen.getByRole('searchbox', { name: /search events/i }), '  garba ');
    await waitFor(() => expect(api.listEventsApi).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'garba' })));
    // one request per settled term, not one per keystroke
    const searched = api.listEventsApi.mock.calls.filter(([p]) => p.search);
    expect(searched).toHaveLength(1);
  });

  it('switches between upcoming and past events', async () => {
    api.listEventsApi.mockResolvedValue({ events: [], totalCount: 0 });
    const user = userEvent.setup();
    renderWithApp(<EventsPage />);
    await screen.findByText('No upcoming events found');
    await user.click(screen.getByRole('radio', { name: 'Past' }));
    expect(await screen.findByText('No past events found')).toBeInTheDocument();
    expect(api.listEventsApi).toHaveBeenLastCalledWith(expect.objectContaining({ when: 'past' }));
  });
});

describe('EventDetailPage', () => {
  it('shows date, time and venue only, with no registration box or sign-in prompt', async () => {
    api.getEventApi.mockResolvedValue(makeEvent({ description: 'Raas under the full moon.' }));
    api.listEventsApi.mockResolvedValue({ events: [], totalCount: 0 });
    renderWithApp(
      <Routes>
        <Route path="/events/:id" element={<EventDetailPage />} />
      </Routes>,
      { path: '/events/e1' },
    );
    expect(await screen.findByRole('heading', { name: 'Navratri Garba Night' })).toBeInTheDocument();
    expect(screen.getByText('Samaj Bhavan')).toBeInTheDocument();
    expect(screen.getByText('Raas under the full moon.')).toBeInTheDocument();
    expect(screen.queryByText(/register|sign in|places|going|left/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('NewsPage', () => {
  const item = (over = {}) => ({
    id: 'a1',
    title: 'Scholarship forms open',
    summary: 'Apply before the end of the month.',
    category: 'Education',
    pinned: false,
    featured: false,
    archived: false,
    publishedAt: '2030-01-10T05:00:00.000Z',
    ...over,
  });

  it('lists announcements with category, pinned and archived badges', async () => {
    api.listAnnouncementsApi.mockResolvedValue({
      announcements: [item({ pinned: true }), item({ id: 'a2', title: 'Old notice', archived: true })],
      totalCount: 2,
    });
    renderWithApp(<NewsPage />);
    expect(await screen.findByRole('link', { name: 'Scholarship forms open' })).toHaveAttribute('href', '/news/a1');
    expect(screen.getByText('Pinned')).toBeInTheDocument();
    expect(screen.getByText('Archived')).toBeInTheDocument();
    expect(screen.getAllByText('10 Jan 2030')).toHaveLength(2);
  });

  it('shows the empty and error states', async () => {
    api.listAnnouncementsApi.mockResolvedValueOnce({ announcements: [], totalCount: 0 });
    const first = renderWithApp(<NewsPage />);
    expect(await screen.findByText('No announcements found')).toBeInTheDocument();
    first.unmount();

    api.listAnnouncementsApi.mockRejectedValueOnce(apiError(500, 'News unavailable'));
    renderWithApp(<NewsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('News unavailable');
  });

  it('filters by category through pressed-state buttons', async () => {
    api.listAnnouncementsApi.mockResolvedValue({ announcements: [item()], totalCount: 1 });
    const user = userEvent.setup();
    renderWithApp(<NewsPage />);
    await screen.findByRole('link', { name: 'Scholarship forms open' });
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Seva' }));
    expect(screen.getByRole('button', { name: 'Seva' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(api.listAnnouncementsApi).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'Seva', page: 1 })));
  });
});

describe('DirectoryPage', () => {
  const entry = { id: 'm1', name: 'Asha Patel', village: 'Unjha', city: 'Mehsana', country: 'India', occupation: 'Teacher', bio: null, joinedYear: 2015, highlighted: false };

  it('lists families and village filters, and never asks for contact details', async () => {
    api.getMemberFiltersApi.mockResolvedValue({ villages: ['Unjha', 'Visnagar'], cities: [] });
    api.listMembersApi.mockResolvedValue({ members: [entry, { ...entry, id: 'm2', name: 'Ravi Shah', village: null, city: null, country: null, occupation: null, joinedYear: null }], totalCount: 2 });
    renderWithApp(<DirectoryPage />);
    expect(await screen.findByRole('link', { name: /Asha Patel/ })).toHaveAttribute('href', '/members/m1');
    expect(screen.getByText('Mehsana, India')).toBeInTheDocument();
    expect(screen.getByText(/2 families listed/)).toBeInTheDocument();
    // missing optional fields render a dash, not "null"
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(4);
    expect(screen.queryByText(/null|undefined/)).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Visnagar' })).toBeInTheDocument();
  });

  it('filters by village', async () => {
    api.getMemberFiltersApi.mockResolvedValue({ villages: ['Unjha', 'Visnagar'], cities: [] });
    api.listMembersApi.mockResolvedValue({ members: [entry], totalCount: 1 });
    const user = userEvent.setup();
    renderWithApp(<DirectoryPage />);
    await user.click(await screen.findByRole('button', { name: 'Visnagar' }));
    await waitFor(() => expect(api.listMembersApi).toHaveBeenLastCalledWith(expect.objectContaining({ village: 'Visnagar' })));
    expect(screen.getByRole('button', { name: 'Visnagar' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows an empty state that names the search term and clears it', async () => {
    api.getMemberFiltersApi.mockResolvedValue({ villages: [], cities: [] });
    api.listMembersApi.mockImplementation(async (p) => (p.search ? { members: [], totalCount: 0 } : { members: [entry], totalCount: 1 }));
    const user = userEvent.setup();
    renderWithApp(<DirectoryPage />);
    await screen.findByRole('link', { name: /Asha Patel/ });
    await user.type(screen.getByRole('searchbox'), 'zzz');
    expect(await screen.findByText('Nothing matches “zzz”.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /clear filters/i }));
    expect(await screen.findByRole('link', { name: /Asha Patel/ })).toBeInTheDocument();
  });

  it('shows a generic error with retry for other failures', async () => {
    api.getMemberFiltersApi.mockResolvedValue({ villages: [], cities: [] });
    api.listMembersApi.mockRejectedValue(apiError(500, 'Directory broke'));
    renderWithApp(<DirectoryPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Directory broke');
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});

describe('FaqPage', () => {
  it('renders questions as expandable details with plain-text answers', async () => {
    api.getFaqsApi.mockResolvedValue([{ id: 'f1', question: 'How do I join?', answer: 'Register <b>online</b>.' }]);
    renderWithApp(<FaqPage />);
    expect(await screen.findByText('How do I join?')).toBeInTheDocument();
    // answers are text, never markup
    expect(screen.getByText('Register <b>online</b>.')).toBeInTheDocument();
    expect(document.querySelector('details b')).toBeNull();
  });

  it('shows empty and error states', async () => {
    api.getFaqsApi.mockResolvedValueOnce([]);
    const first = renderWithApp(<FaqPage />);
    expect(await screen.findByText('No questions yet')).toBeInTheDocument();
    first.unmount();
    api.getFaqsApi.mockRejectedValueOnce(apiError(500, 'FAQ failed'));
    renderWithApp(<FaqPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('FAQ failed');
  });
});

describe('LinksPage', () => {
  const link = (over = {}) => ({ id: 'l1', label: 'Scholarship form', description: 'Yearly form', url: 'https://example.test/form', fileMediaId: null, category: 'Forms', ...over });

  it('groups links by category; external links are safe, files download from the media route', async () => {
    api.getLinksApi.mockResolvedValue([
      link(),
      link({ id: 'l2', label: 'Rules PDF', url: null, fileMediaId: 'abc123', category: 'Documents' }),
    ]);
    renderWithApp(<LinksPage />);
    expect(await screen.findByRole('heading', { name: 'Forms' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Documents' })).toBeInTheDocument();

    const external = screen.getByRole('link', { name: /Scholarship form/ });
    expect(external).toHaveAttribute('href', 'https://example.test/form');
    expect(external).toHaveAttribute('target', '_blank');
    expect(external).toHaveAttribute('rel', 'noopener noreferrer');

    const file = screen.getByRole('link', { name: /Rules PDF/ });
    expect(file).toHaveAttribute('href', '/api/media/abc123');
    expect(file).toHaveAttribute('download');
    expect(file).not.toHaveAttribute('target');
  });

  it('shows empty and error states', async () => {
    api.getLinksApi.mockResolvedValueOnce([]);
    const first = renderWithApp(<LinksPage />);
    expect(await screen.findByText('No links yet')).toBeInTheDocument();
    first.unmount();
    api.getLinksApi.mockRejectedValueOnce(apiError(500, 'Links failed'));
    renderWithApp(<LinksPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Links failed');
  });
});

describe('CommitteePage', () => {
  const t1 = { id: 't1', label: '2024-26', startYear: 2024, endYear: 2026, isCurrent: true };
  const t0 = { id: 't0', label: '2022-24', startYear: 2022, endYear: 2024, isCurrent: false };
  const person = { id: 'c1', termId: 't1', name: 'Mahesh Patel', position: 'President', bio: 'Serving since 2010', imageMediaId: null };

  it('shows the current term with members, and switches term on click', async () => {
    api.getCommitteeApi.mockImplementation(async (termId) =>
      termId === 't0'
        ? { terms: [t1, t0], term: t0, members: [{ ...person, id: 'c0', termId: 't0', name: 'Old President' }] }
        : { terms: [t1, t0], term: t1, members: [person] },
    );
    const user = userEvent.setup();
    renderWithApp(<CommitteePage />);
    expect(await screen.findByRole('heading', { name: 'Mahesh Patel' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Committee 2024-26' })).toBeInTheDocument();
    expect(screen.getByText('President')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /2024-26 · current/ })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: '2022-24' }));
    expect(await screen.findByRole('heading', { name: 'Old President' })).toBeInTheDocument();
    expect(api.getCommitteeApi).toHaveBeenLastCalledWith('t0');
  });

  it('hides the term switcher when there is one term', async () => {
    api.getCommitteeApi.mockResolvedValue({ terms: [t1], term: t1, members: [person] });
    renderWithApp(<CommitteePage />);
    await screen.findByRole('heading', { name: 'Mahesh Patel' });
    expect(screen.queryByRole('group', { name: 'Committee term' })).not.toBeInTheDocument();
  });

  it('explains when no committee is published, or a term has no members', async () => {
    api.getCommitteeApi.mockResolvedValueOnce({ terms: [], term: null, members: [] });
    const first = renderWithApp(<CommitteePage />);
    expect(await screen.findByText('Committee not published yet')).toBeInTheDocument();
    first.unmount();
    api.getCommitteeApi.mockResolvedValueOnce({ terms: [t1], term: t1, members: [] });
    renderWithApp(<CommitteePage />);
    expect(await screen.findByText('No members listed for this term')).toBeInTheDocument();
  });

  it('shows an error with retry', async () => {
    api.getCommitteeApi.mockRejectedValue(apiError(500, 'Committee failed'));
    renderWithApp(<CommitteePage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Committee failed');
  });
});

describe('ContactPage', () => {
  const fill = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(screen.getByLabelText(/^name/i), 'Asha Patel');
    await user.type(screen.getByLabelText(/^email/i), 'asha@example.test');
    await user.type(screen.getByLabelText(/^message/i), 'I would like to book the Bhavan.');
  };

  it('validates before sending', async () => {
    const user = userEvent.setup();
    renderWithApp(<ContactPage />);
    await user.click(screen.getByRole('button', { name: /send message/i }));
    expect(await screen.findByText('Name must be at least 2 characters')).toBeInTheDocument();
    expect(screen.getByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Please write at least 10 characters')).toBeInTheDocument();
    expect(api.submitContactApi).not.toHaveBeenCalled();
  });

  it('rejects angle brackets in the message', async () => {
    const user = userEvent.setup();
    renderWithApp(<ContactPage />);
    await fill(user);
    await user.type(screen.getByLabelText(/^message/i), ' <script>');
    await user.click(screen.getByRole('button', { name: /send message/i }));
    expect(await screen.findByText('Message must not contain < or >')).toBeInTheDocument();
    expect(api.submitContactApi).not.toHaveBeenCalled();
  });

  it('sends the form with an empty honeypot, then confirms and can start over', async () => {
    api.submitContactApi.mockResolvedValue('Thanks, we will reply soon.');
    const user = userEvent.setup();
    renderWithApp(<ContactPage />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: /send message/i }));
    expect(await screen.findByRole('heading', { name: 'Message received' })).toBeInTheDocument();
    expect(screen.getByText('Thanks, we will reply soon.')).toBeInTheDocument();
    expect(api.submitContactApi).toHaveBeenCalledWith({
      name: 'Asha Patel',
      email: 'asha@example.test',
      topic: 'General enquiry',
      message: 'I would like to book the Bhavan.',
      website: '',
    });

    await user.click(screen.getByRole('button', { name: /send another message/i }));
    expect(screen.getByLabelText(/^message/i)).toHaveValue('');
  });

  it('starts with empty name and email (there is no sign-in to prefill from)', async () => {
    renderWithApp(<ContactPage />);
    expect(screen.getByLabelText(/^name/i)).toHaveValue('');
    expect(screen.getByLabelText(/^email/i)).toHaveValue('');
  });

  it('puts server field errors next to the field and keeps what was typed', async () => {
    api.submitContactApi.mockRejectedValue(apiError(422, 'Invalid', 'VALIDATION_ERROR', [{ field: 'email', message: 'This email domain is not accepted' }]));
    const user = userEvent.setup();
    renderWithApp(<ContactPage />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: /send message/i }));
    expect(await screen.findByText('This email domain is not accepted')).toBeInTheDocument();
    expect(screen.getByLabelText(/^email/i)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/^message/i)).toHaveValue('I would like to book the Bhavan.');
  });

  it('shows a form-level alert when the failure is not about a field', async () => {
    api.submitContactApi.mockRejectedValue(apiError(429, 'Too many messages. Try again later.', 'RATE_LIMITED'));
    const user = userEvent.setup();
    renderWithApp(<ContactPage />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: /send message/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many messages. Try again later.');
  });

  it('keeps the honeypot out of the accessibility tree', () => {
    renderWithApp(<ContactPage />);
    const honeypot = document.querySelector('input[name="website"]')!;
    expect(honeypot.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(honeypot).toHaveAttribute('tabindex', '-1');
  });
});
