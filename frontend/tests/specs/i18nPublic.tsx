import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import * as siteApi from '../../src/api/siteApi';
import { setLanguage } from '../../src/i18n';
import EventsPage from '../../src/pages/EventsPage';
import DirectoryPage from '../../src/pages/DirectoryPage';
import ContactPage from '../../src/pages/ContactPage';
import NotFoundPage from '../../src/pages/NotFoundPage';
import { makeEvent, renderWithApp } from '../helpers';

vi.mock('../../src/api/authApi', () => ({ adminLoginApi: vi.fn() }));
vi.mock('../../src/api/siteApi', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/api/siteApi')>();
  return {
    mediaUrl: real.mediaUrl,
    listEventsApi: vi.fn(),
    listMembersApi: vi.fn(),
    getMemberFiltersApi: vi.fn(),
    submitContactApi: vi.fn(),
  };
});

const api = vi.mocked(siteApi);

beforeEach(() => {
  vi.resetAllMocks();
  setLanguage('gu');
});

afterEach(() => {
  setLanguage('en');
});

describe('public pages in Gujarati', () => {
  it('translates the events page chrome, filters, categories and cancelled badge', async () => {
    api.listEventsApi.mockResolvedValue({
      events: [makeEvent(), makeEvent({ id: 'e2', title: 'Sports Day', status: 'cancelled' })],
      totalCount: 2,
    });
    renderWithApp(<EventsPage />);
    expect(await screen.findByRole('link', { name: /Navratri Garba Night/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'કાર્યક્રમો' })).toBeInTheDocument();
    expect(screen.getByText('2 બતાવ્યા')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'આગામી' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'કાર્યક્રમો શોધો' })).toHaveAttribute('placeholder', 'કાર્યક્રમો શોધો…');
    const categories = screen.getByRole('group', { name: 'શ્રેણી' });
    expect(within(categories).getByRole('button', { name: 'રમતગમત' })).toBeInTheDocument();
    expect(screen.getAllByText('તહેવાર', { selector: 'span' })).toHaveLength(2);
    expect(screen.getByText('રદ')).toBeInTheDocument();
    // server data is left alone
    expect(screen.getAllByText('Samaj Bhavan', { selector: 'p' })).toHaveLength(2);
  });

  it('translates the directory description with its count and the table headers', async () => {
    const entry = { id: 'm1', name: 'Asha Patel', village: 'Unjha', city: 'Mehsana', country: 'India', occupation: 'Teacher', bio: null, joinedYear: 2015, highlighted: false };
    api.getMemberFiltersApi.mockResolvedValue({ villages: ['Unjha'], cities: [] });
    api.listMembersApi.mockResolvedValue({ members: [entry, { ...entry, id: 'm2', name: 'Ravi Shah' }], totalCount: 2 });
    renderWithApp(<DirectoryPage />);
    expect(await screen.findByRole('link', { name: /Asha Patel/ })).toBeInTheDocument();
    expect(screen.getByText(/2 પરિવારો નોંધાયેલા છે/)).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'વ્યવસાય' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'બધાં ગામ' })).toBeInTheDocument();
  });

  it('translates the contact form labels, topics and the submit button', () => {
    renderWithApp(<ContactPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'સમાજ ઓફિસનો સંપર્ક કરો' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^નામ/)).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'સભ્યપદ' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'સંદેશ મોકલો' })).toBeInTheDocument();
  });

  it('translates the not-found page', () => {
    renderWithApp(<NotFoundPage />);
    expect(screen.getByText('પૃષ્ઠ મળ્યું નથી')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'હોમ પર પાછા જાઓ' })).toBeInTheDocument();
  });

  it('shows English again after switching back', () => {
    setLanguage('en');
    renderWithApp(<NotFoundPage />);
    expect(screen.getByText('Page not found')).toBeInTheDocument();
  });
});
