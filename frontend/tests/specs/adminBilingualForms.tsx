import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as adminApi from '../../src/api/adminApi';
import { EventFormDrawer } from '../../src/components/admin/EventFormDrawer';
import { AnnouncementFormDrawer } from '../../src/components/admin/AnnouncementFormDrawer';
import { ContentFormDrawer } from '../../src/components/admin/ContentFormDrawer';
import { BlockDrawer } from '../../src/components/admin/BlockDrawer';
import AdminSettingsPage from '../../src/pages/admin/AdminSettingsPage';
import { blocks, resources } from '../../src/components/admin/contentConfig';
import { apiError, renderWithApp } from '../helpers';

vi.mock('../../src/api/adminApi', () => ({
  createEventApi: vi.fn(),
  updateEventApi: vi.fn(),
  createAnnouncementApi: vi.fn(),
  updateAnnouncementApi: vi.fn(),
  saveContentApi: vi.fn(),
  listContentApi: vi.fn(),
  saveBlockApi: vi.fn(),
  listMediaApi: vi.fn(),
  getAdminSettingsApi: vi.fn(),
  updateAdminSettingsApi: vi.fn(),
}));

const admin = vi.mocked(adminApi);

beforeEach(() => {
  vi.resetAllMocks();
  admin.listMediaApi.mockResolvedValue({ media: [], totalCount: 0 });
});

const GU_HINT = 'Optional. Shown to visitors who choose Gujarati; English is used when empty.';

/** The Gujarati input of a pair: tagged lang="gu", optional, with the fall-back hint. */
const expectGujarati = (label: string) => {
  const input = screen.getByLabelText(label);
  expect(input).toHaveAttribute('lang', 'gu');
  expect(input).not.toBeRequired();
  expect(input).toHaveAccessibleDescription(GU_HINT);
  return input;
};

describe('Event form', () => {
  const open = (event: adminApi.AdminEvent | null = null) =>
    renderWithApp(<EventFormDrawer open event={event} onClose={vi.fn()} onSaved={vi.fn()} />);

  it('puts a Gujarati input under each English one: title, venue and description', () => {
    open();
    for (const field of ['Title', 'Venue', 'Description']) {
      const en = screen.getByLabelText(new RegExp(`^${field} \\(English\\)`));
      const gu = expectGujarati(`${field} (Gujarati)`);
      expect(en).not.toHaveAttribute('lang');
      // English first, Gujarati directly after it in reading order
      expect(en.compareDocumentPosition(gu) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(screen.getByLabelText(/^Title \(English\)/)).toBeRequired();
    expect(screen.getByLabelText(/^Venue \(English\)/)).toBeRequired();
  });

  it('sends the Gujarati text with the English text', async () => {
    admin.createEventApi.mockResolvedValue({} as adminApi.AdminEvent);
    const user = userEvent.setup();
    open();
    await user.type(screen.getByLabelText(/^Title \(English\)/), 'Navratri Garba Night');
    await user.type(screen.getByLabelText('Title (Gujarati)'), 'નવરાત્રી ગરબા નાઇટ');
    await user.type(screen.getByLabelText(/^Venue \(English\)/), 'Samaj Bhavan');
    await user.type(screen.getByLabelText('Venue (Gujarati)'), 'સમાજ ભવન');
    await user.type(screen.getByLabelText('Description (English)'), 'An evening of garba.');
    await user.type(screen.getByLabelText('Description (Gujarati)'), 'ગરબાની એક સાંજ.');
    fireEvent.change(screen.getByLabelText(/^Starts/), { target: { value: '2030-10-01T19:00' } });
    await user.click(screen.getByRole('button', { name: 'Create draft' }));

    await waitFor(() => expect(admin.createEventApi).toHaveBeenCalledTimes(1));
    expect(admin.createEventApi.mock.calls[0]![0]).toMatchObject({
      title: 'Navratri Garba Night',
      titleGu: 'નવરાત્રી ગરબા નાઇટ',
      venue: 'Samaj Bhavan',
      venueGu: 'સમાજ ભવન',
      description: 'An evening of garba.',
      descriptionGu: 'ગરબાની એક સાંજ.',
    });
  });

  it('is saved with empty Gujarati fields when only English is filled in', async () => {
    admin.createEventApi.mockResolvedValue({} as adminApi.AdminEvent);
    const user = userEvent.setup();
    open();
    await user.type(screen.getByLabelText(/^Title \(English\)/), 'Health camp');
    await user.type(screen.getByLabelText(/^Venue \(English\)/), 'Samaj Bhavan');
    fireEvent.change(screen.getByLabelText(/^Starts/), { target: { value: '2030-10-01T19:00' } });
    await user.click(screen.getByRole('button', { name: 'Create draft' }));
    await waitFor(() => expect(admin.createEventApi).toHaveBeenCalled());
    expect(admin.createEventApi.mock.calls[0]![0]).toMatchObject({ titleGu: '', venueGu: '', descriptionGu: '' });
  });

  it('fills the Gujarati inputs from the saved event when editing and saves changes to them', async () => {
    admin.updateEventApi.mockResolvedValue({} as adminApi.AdminEvent);
    const user = userEvent.setup();
    open({
      id: 'e1',
      title: 'Garba',
      titleGu: 'ગરબા',
      category: 'Festival',
      description: null,
      descriptionGu: 'વર્ણન',
      startsAt: '2030-10-01T13:00:00.000Z',
      endsAt: null,
      venue: 'Samaj Bhavan',
      venueGu: 'સમાજ ભવન',
      status: 'draft',
      featured: false,
      imageMediaId: null,
      cancellationReason: null,
      publishedAt: null,
      updatedAt: '2030-01-01T00:00:00.000Z',
    });
    const title = await screen.findByLabelText('Title (Gujarati)');
    await waitFor(() => expect(title).toHaveValue('ગરબા'));
    expect(screen.getByLabelText('Venue (Gujarati)')).toHaveValue('સમાજ ભવન');
    expect(screen.getByLabelText('Description (Gujarati)')).toHaveValue('વર્ણન');
    await user.clear(title);
    await user.type(title, 'નવરાત્રી');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(admin.updateEventApi).toHaveBeenCalledTimes(1));
    expect(admin.updateEventApi.mock.calls[0]![0]).toBe('e1');
    expect(admin.updateEventApi.mock.calls[0]![1]).toMatchObject({ title: 'Garba', titleGu: 'નવરાત્રી', venueGu: 'સમાજ ભવન' });
  });

  it('shows a server error for a Gujarati field under that field', async () => {
    admin.createEventApi.mockRejectedValue(apiError(400, 'Check the form', 'VALIDATION_ERROR', [{ field: 'titleGu', message: 'Contains invalid characters' }]));
    const user = userEvent.setup();
    open();
    await user.type(screen.getByLabelText(/^Title \(English\)/), 'Garba');
    await user.type(screen.getByLabelText(/^Venue \(English\)/), 'Samaj Bhavan');
    fireEvent.change(screen.getByLabelText(/^Starts/), { target: { value: '2030-10-01T19:00' } });
    await user.click(screen.getByRole('button', { name: 'Create draft' }));
    const gu = screen.getByLabelText('Title (Gujarati)');
    await waitFor(() => expect(gu).toHaveAccessibleDescription('Contains invalid characters'));
    expect(gu).toBeInvalid();
  });
});

describe('Announcement form', () => {
  it('has Gujarati title, summary and text, and sends them', async () => {
    admin.createAnnouncementApi.mockResolvedValue({} as adminApi.AdminAnnouncement);
    const user = userEvent.setup();
    renderWithApp(<AnnouncementFormDrawer open item={null} onClose={vi.fn()} onSaved={vi.fn()} />);
    for (const field of ['Title', 'Summary', 'Announcement']) expectGujarati(`${field} (Gujarati)`);
    await user.type(screen.getByLabelText(/^Title \(English\)/), 'Office closed');
    await user.type(screen.getByLabelText('Title (Gujarati)'), 'કચેરી બંધ');
    await user.type(screen.getByLabelText('Summary (Gujarati)'), 'ટૂંકમાં');
    await user.type(screen.getByLabelText(/^Announcement \(English\)/), 'The office is closed on Sunday.');
    await user.type(screen.getByLabelText('Announcement (Gujarati)'), 'રવિવારે કચેરી બંધ રહેશે.');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(admin.createAnnouncementApi).toHaveBeenCalledTimes(1));
    expect(admin.createAnnouncementApi.mock.calls[0]![0]).toMatchObject({
      title: 'Office closed',
      titleGu: 'કચેરી બંધ',
      summary: '',
      summaryGu: 'ટૂંકમાં',
      body: 'The office is closed on Sunday.',
      bodyGu: 'રવિવારે કચેરી બંધ રહેશે.',
    });
  });
});

describe('Content form (FAQs, links, history, committee)', () => {
  const def = (key: string) => resources.find((r) => r.key === key)!;
  const row = (over: Partial<adminApi.ContentRow>): adminApi.ContentRow => ({ id: 'r1', status: 'draft', order: 1, updatedAt: '2030-01-01T00:00:00.000Z', ...over });

  it('shows a Gujarati input beside each translatable FAQ field and sends it', async () => {
    admin.saveContentApi.mockResolvedValue(row({}));
    const user = userEvent.setup();
    renderWithApp(<ContentFormDrawer def={def('faqs')} open row={null} onClose={vi.fn()} onSaved={vi.fn()} />);
    expectGujarati('Question (Gujarati)');
    expectGujarati('Answer (Gujarati)');
    await user.type(screen.getByLabelText(/^Question \(English\)/), 'How do I join?');
    await user.type(screen.getByLabelText('Question (Gujarati)'), 'હું કેવી રીતે જોડાઉં?');
    await user.type(screen.getByLabelText(/^Answer \(English\)/), 'Ask at the office.');
    await user.type(screen.getByLabelText('Answer (Gujarati)'), 'કચેરીમાં પૂછો.');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(admin.saveContentApi).toHaveBeenCalledTimes(1));
    expect(admin.saveContentApi).toHaveBeenCalledWith('faqs', null, {
      question: 'How do I join?',
      questionGu: 'હું કેવી રીતે જોડાઉં?',
      answer: 'Ask at the office.',
      answerGu: 'કચેરીમાં પૂછો.',
    });
  });

  it('does not ask for the Gujarati text and applies the same maximum length to it', async () => {
    const user = userEvent.setup();
    renderWithApp(<ContentFormDrawer def={def('faqs')} open row={null} onClose={vi.fn()} onSaved={vi.fn()} />);
    await user.type(screen.getByLabelText(/^Question \(English\)/), 'How do I join?');
    await user.type(screen.getByLabelText(/^Answer \(English\)/), 'Ask at the office.');
    fireEvent.change(screen.getByLabelText('Question (Gujarati)'), { target: { value: 'ક'.repeat(201) } });
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText('Question must be at most 200 characters')).toBeInTheDocument();
    expect(admin.saveContentApi).not.toHaveBeenCalled();
  });

  it('prefills the Gujarati text when editing and keeps non-translated fields single', async () => {
    admin.listContentApi.mockResolvedValue({ items: [row({ id: 't1', label: '2025–2027' })], totalCount: 1 });
    renderWithApp(
      <ContentFormDrawer def={def('committee-members')} open row={row({ termId: 't1', name: 'Asha Patel', nameGu: 'આશા પટેલ', position: 'President', positionGu: 'પ્રમુખ', bio: null, bioGu: null })} onClose={vi.fn()} onSaved={vi.fn()} />,
    );
    await waitFor(() => expect(screen.getByLabelText('Name (Gujarati)')).toHaveValue('આશા પટેલ'));
    expect(screen.getByLabelText('Position (Gujarati)')).toHaveValue('પ્રમુખ');
    expect(screen.getByLabelText('Short bio (Gujarati)')).toHaveValue('');
    expect(screen.queryByLabelText('Term (Gujarati)')).not.toBeInTheDocument();
  });

  it('covers every translatable field of links and history', () => {
    const { unmount } = renderWithApp(<ContentFormDrawer def={def('links')} open row={null} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByLabelText('Title (Gujarati)')).toBeInTheDocument();
    expect(screen.getByLabelText('Description (Gujarati)')).toBeInTheDocument();
    expect(screen.queryByLabelText('Web address (Gujarati)')).not.toBeInTheDocument();
    unmount();
    renderWithApp(<ContentFormDrawer def={def('milestones')} open row={null} onClose={vi.fn()} onSaved={vi.fn()} />);
    for (const label of ['Year or era', 'Title', 'Text', 'Source']) expect(screen.getByLabelText(`${label} (Gujarati)`)).toBeInTheDocument();
  });
});

describe('Page text block form', () => {
  it('saves Gujarati heading, text and item text', async () => {
    admin.saveBlockApi.mockResolvedValue({ key: 'about.values', status: 'draft' });
    const user = userEvent.setup();
    const def = blocks.find((b) => b.key === 'about.values')!;
    renderWithApp(
      <BlockDrawer
        def={def}
        block={{ key: 'about.values', status: 'draft', items: [{ title: 'Unity', text: 'Together.', value: null, label: null, imageMediaId: null, titleGu: 'એકતા', textGu: null }] }}
        allBlocks={[]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    const titleGu = await screen.findByLabelText('Title (Gujarati)');
    expectGujarati('Title (Gujarati)');
    expectGujarati('Text (Gujarati)');
    await waitFor(() => expect(titleGu).toHaveValue('એકતા'));
    await user.type(screen.getByLabelText('Text (Gujarati)'), 'સાથે મળીને.');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(admin.saveBlockApi).toHaveBeenCalledTimes(1));
    expect(admin.saveBlockApi).toHaveBeenCalledWith('about.values', {
      items: [{ title: 'Unity', titleGu: 'એકતા', text: 'Together.', textGu: 'સાથે મળીને.' }],
    });
  });

  it('has a Gujarati heading and text for a block with a heading', async () => {
    admin.saveBlockApi.mockResolvedValue({ key: 'about.intro', status: 'draft' });
    const user = userEvent.setup();
    const def = blocks.find((b) => b.key === 'about.intro')!;
    renderWithApp(<BlockDrawer def={def} block={undefined} allBlocks={[]} onClose={vi.fn()} onSaved={vi.fn()} />);
    await user.type(screen.getByLabelText('Heading (English)'), 'Welcome');
    await user.type(screen.getByLabelText('Heading (Gujarati)'), 'સ્વાગત');
    await user.type(screen.getByLabelText('Text (English)'), 'Hello.');
    await user.type(screen.getByLabelText('Text (Gujarati)'), 'નમસ્તે.');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(admin.saveBlockApi).toHaveBeenCalledTimes(1));
    expect(admin.saveBlockApi).toHaveBeenCalledWith('about.intro', { title: 'Welcome', titleGu: 'સ્વાગત', body: 'Hello.', bodyGu: 'નમસ્તે.' });
  });
});

describe('Settings form', () => {
  const settings: adminApi.AdminSettings = {
    name: 'Patidar Samaj',
    nameGu: 'પાટીદાર સમાજ',
    shortName: 'Samaj',
    invocation: '',
    tagline: 'Together',
    footerNote: '',
    contact: { email: 'office@example.test', phone: '', address: 'Main road', addressGu: 'મુખ્ય રસ્તો', officeHours: '' },
    socialLinks: [],
    publicTabs: { about: true, committee: true, faq: true, links: true, directory: true, events: true, news: true, contact: true },
    themeDefault: 'system',
  };

  it('has a Gujarati input for every translated organisation detail and sends them', async () => {
    admin.getAdminSettingsApi.mockResolvedValue(settings);
    admin.updateAdminSettingsApi.mockResolvedValue(settings);
    const user = userEvent.setup();
    renderWithApp(<AdminSettingsPage />);
    const name = await screen.findByLabelText('Full name (Gujarati)');
    expect(name).toHaveValue('પાટીદાર સમાજ');
    for (const label of ['Short name', 'Invocation', 'Tagline', 'Office hours', 'Address', 'Footer note']) expectGujarati(`${label} (Gujarati)`);
    expect(screen.getByLabelText('Address (Gujarati)')).toHaveValue('મુખ્ય રસ્તો');
    expect(screen.queryByLabelText('Email (Gujarati)')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Tagline (Gujarati)'), 'સાથે મળીને');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(admin.updateAdminSettingsApi).toHaveBeenCalledTimes(1));
    const body = admin.updateAdminSettingsApi.mock.calls[0]![0];
    expect(body).toMatchObject({ name: 'Patidar Samaj', nameGu: 'પાટીદાર સમાજ', taglineGu: 'સાથે મળીને', shortNameGu: '' });
    expect(body.contact).toMatchObject({ address: 'Main road', addressGu: 'મુખ્ય રસ્તો', officeHoursGu: '' });
  });

  it('still lists the public tabs with their English names', async () => {
    admin.getAdminSettingsApi.mockResolvedValue(settings);
    renderWithApp(<AdminSettingsPage />);
    const card = (await screen.findByText('Public site tabs')).closest('div')!;
    expect(within(card.parentElement!).getByText('Members directory')).toBeInTheDocument();
  });
});
