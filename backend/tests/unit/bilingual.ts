import { describe, it, expect } from 'vitest';
import express, { type RequestHandler } from 'express';
import request from 'supertest';
import { language } from '../../src/middlewares/language';
import { parseLanguage, translateMessage } from '../../src/i18n/translate';
import { guField, localizeFields, searchFieldsFor } from '../../src/utils/localize';
import { toAdminEvent, toPublicEvent } from '../../src/utils/eventView';
import { toAdminAnnouncement, toPublicAnnouncement } from '../../src/utils/announcementView';
import { ContentResources, translatedFieldsOf } from '../../src/config/contentResources';
import { blockView, pick, publicBlockView } from '../../src/controllers/ContentController';
import { toPublicSettings } from '../../src/controllers/SettingsController';
import { createAnnouncementRules } from '../../src/validators/announcementValidator';
import { createEventRules, cancelEventRules } from '../../src/validators/eventValidator';
import { blockBodyRules, createItemRules, updateItemRules } from '../../src/validators/contentValidator';
import { updateSettingsRules } from '../../src/validators/settingsValidator';
import { ApiResponse, sendError } from '../../src/utils/apiResponse';
import { ResponseCodes } from '../../src/config/constants';

// No database in this file: everything runs on plain objects and throwaway express apps.

describe('localize helpers', () => {
  it('names the Gujarati twin of a field', () => {
    expect(guField('title')).toBe('titleGu');
  });

  it('keeps English for en and drops every *Gu key', () => {
    const out = localizeFields({ title: 'Hello', titleGu: 'નમસ્તે', body: 'Text' }, ['title', 'body'], 'en');
    expect(out).toEqual({ title: 'Hello', body: 'Text' });
  });

  it('swaps in the Gujarati text for gu and drops the twins', () => {
    const out = localizeFields({ title: 'Hello', titleGu: 'નમસ્તે', body: 'Text', bodyGu: 'લખાણ' }, ['title', 'body'], 'gu');
    expect(out).toEqual({ title: 'નમસ્તે', body: 'લખાણ' });
  });

  it('falls back to English when the Gujarati text is empty, blank, null or missing', () => {
    const out = localizeFields({ a: 'A', aGu: '', b: 'B', bGu: '   ', c: 'C', cGu: null, d: 'D' }, ['a', 'b', 'c', 'd'], 'gu');
    expect(out).toEqual({ a: 'A', b: 'B', c: 'C', d: 'D' });
  });

  it('leaves unlisted fields alone and does not change its input', () => {
    const input = { title: 'Hello', titleGu: 'નમસ્તે', category: 'Notice' };
    const out = localizeFields(input, ['title'], 'gu');
    expect(out.category).toBe('Notice');
    expect(input.titleGu).toBe('નમસ્તે');
  });

  it('searches the Gujarati twins as well only for gu', () => {
    expect(searchFieldsFor(['title', 'body'], 'en')).toEqual(['title', 'body']);
    expect(searchFieldsFor(['title', 'body'], 'gu')).toEqual(['title', 'body', 'titleGu', 'bodyGu']);
  });
});

describe('parseLanguage and translateMessage', () => {
  it('reads the first language of Accept-Language and defaults to English', () => {
    expect(parseLanguage('gu')).toBe('gu');
    expect(parseLanguage('GU-IN,en;q=0.8')).toBe('gu');
    expect(parseLanguage('en-US,gu;q=0.5')).toBe('en');
    expect(parseLanguage('hi')).toBe('en');
    expect(parseLanguage('')).toBe('en');
    expect(parseLanguage(undefined)).toBe('en');
  });

  it('translates known messages and patterns for gu and leaves English alone', () => {
    expect(translateMessage('Event not found', 'gu')).toBe('કાર્યક્રમ મળ્યો નથી');
    expect(translateMessage('Event not found', 'en')).toBe('Event not found');
    expect(translateMessage('title must be 3–150 characters', 'gu')).toBe('title 3–150 અક્ષરોનું હોવું જોઈએ');
    expect(translateMessage('A message nobody translated', 'gu')).toBe('A message nobody translated');
  });
});

describe('language middleware', () => {
  const app = () => {
    const a = express();
    a.use(express.json());
    a.use(language);
    a.get('/ok', (req, res) => {
      new ApiResponse(ResponseCodes.OK, 'Events fetched successfully', { lang: req.lang }).send(res);
    });
    a.get('/missing', (_req, res) => {
      sendError(res, { statusCode: ResponseCodes.NOT_FOUND, message: 'Event not found' });
    });
    a.post('/validate', ...(createAnnouncementRules as RequestHandler[]), (_req, res) => {
      res.json({ ok: true });
    });
    return a;
  };

  it('answers a Gujarati visitor in Gujarati and says so in Content-Language', async () => {
    const res = await request(app()).get('/ok').set('Accept-Language', 'gu');
    expect(res.status).toBe(200);
    expect(res.headers['content-language']).toBe('gu');
    expect(res.headers.vary).toMatch(/Accept-Language/i);
    expect(res.body.message).toBe('કાર્યક્રમો સફળતાપૂર્વક મેળવ્યા');
    expect(res.body.data.lang).toBe('gu');
  });

  it('translates error messages and each validation detail', async () => {
    const missing = await request(app()).get('/missing').set('Accept-Language', 'gu-IN');
    expect(missing.status).toBe(404);
    expect(missing.body.message).toBe('કાર્યક્રમ મળ્યો નથી');

    const res = await request(app()).post('/validate').set('Accept-Language', 'gu').send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('માહિતી માન્ય નથી');
    const details = res.body.error.details as { field: string; message: string }[];
    expect(details.length).toBeGreaterThan(0);
    expect(details.find((d) => d.field === 'title')?.message).toBe('title લખાણ સ્વરૂપે હોવું જોઈએ');
  });

  it('leaves English responses untouched', async () => {
    for (const header of [undefined, 'en', 'en-GB,en;q=0.9', 'fr']) {
      const r = request(app()).get('/ok');
      const res = await (header ? r.set('Accept-Language', header) : r);
      expect(res.headers['content-language']).toBe('en');
      expect(res.body.message).toBe('Events fetched successfully');
    }
    const res = await request(app()).post('/validate').send({});
    expect(res.body.message).toBe('Validation failed');
    expect(res.body.error.details.find((d: { field: string }) => d.field === 'title').message).toBe('title must be text');
  });
});

const NOW = new Date('2026-05-01T10:00:00Z');

describe('bilingual event and announcement views', () => {
  const event = (over: Record<string, unknown> = {}) =>
    ({
      _id: 'e1',
      title: 'Garba Night',
      titleGu: 'ગરબા નાઇટ',
      category: 'Festival',
      description: 'Dance',
      descriptionGu: 'નૃત્ય',
      venue: 'Hall',
      venueGu: 'હોલ',
      status: 'published',
      startsAt: NOW,
      featured: false,
      createdAt: NOW,
      updatedAt: NOW,
      ...over,
    }) as never;

  it('localizes the public event and never leaks a *Gu key', () => {
    const gu = toPublicEvent(event(), 'gu');
    expect(gu).toMatchObject({ title: 'ગરબા નાઇટ', description: 'નૃત્ય', venue: 'હોલ', category: 'Festival' });
    const en = toPublicEvent(event(), 'en');
    expect(en).toMatchObject({ title: 'Garba Night', description: 'Dance', venue: 'Hall' });
    expect(toPublicEvent(event())).toEqual(en);
    for (const view of [gu, en]) expect(Object.keys(view).filter((k) => k.endsWith('Gu'))).toEqual([]);
  });

  it('falls back to English field by field', () => {
    const view = toPublicEvent(event({ titleGu: '', venueGu: undefined }), 'gu');
    expect(view).toMatchObject({ title: 'Garba Night', venue: 'Hall', description: 'નૃત્ય' });
  });

  it('shows the Gujarati cancellation reason only on cancelled events', () => {
    const base = { cancellationReason: 'Rain', cancellationReasonGu: 'વરસાદ' };
    expect(toPublicEvent(event(base), 'gu').cancellationReason).toBeNull();
    expect(toPublicEvent(event({ ...base, status: 'cancelled' }), 'gu').cancellationReason).toBe('વરસાદ');
    expect(toPublicEvent(event({ ...base, status: 'cancelled' }), 'en').cancellationReason).toBe('Rain');
  });

  it('gives staff both languages, never localized', () => {
    const admin = toAdminEvent(event());
    expect(admin).toMatchObject({ title: 'Garba Night', titleGu: 'ગરબા નાઇટ', description: 'Dance', descriptionGu: 'નૃત્ય', venue: 'Hall', venueGu: 'હોલ' });
    expect(admin).toHaveProperty('cancellationReasonGu', null);
  });

  const announcement = (over: Record<string, unknown> = {}) =>
    ({
      _id: 'a1',
      title: 'Diwali',
      titleGu: 'દિવાળી',
      summary: 'Join us',
      summaryGu: 'અમારી સાથે જોડાઓ',
      body: 'Body text',
      bodyGu: 'મુખ્ય લખાણ',
      category: 'Notice',
      status: 'published',
      pinned: false,
      featured: false,
      order: 0,
      createdAt: NOW,
      updatedAt: NOW,
      ...over,
    }) as never;

  it('localizes the public announcement, with and without the body', () => {
    expect(toPublicAnnouncement(announcement(), false, 'gu')).toMatchObject({ title: 'દિવાળી', summary: 'અમારી સાથે જોડાઓ' });
    expect(toPublicAnnouncement(announcement(), false, 'gu')).not.toHaveProperty('body');
    expect(toPublicAnnouncement(announcement(), true, 'gu')).toMatchObject({ body: 'મુખ્ય લખાણ' });
    const en = toPublicAnnouncement(announcement(), true, 'en');
    expect(en).toMatchObject({ title: 'Diwali', summary: 'Join us', body: 'Body text' });
    expect(Object.keys(toPublicAnnouncement(announcement(), true, 'gu')).filter((k) => k.endsWith('Gu'))).toEqual([]);
  });

  it('builds the Gujarati summary from the Gujarati body when no summary was written', () => {
    const view = toPublicAnnouncement(announcement({ summary: undefined, summaryGu: undefined }), false, 'gu');
    expect(view.summary).toBe('મુખ્ય લખાણ');
    expect(toPublicAnnouncement(announcement({ summary: undefined, summaryGu: undefined, bodyGu: undefined }), false, 'gu').summary).toBe('Body text');
  });

  it('gives staff the Gujarati twins', () => {
    expect(toAdminAnnouncement(announcement())).toMatchObject({ titleGu: 'દિવાળી', summaryGu: 'અમારી સાથે જોડાઓ', bodyGu: 'મુખ્ય લખાણ' });
    expect(toAdminAnnouncement(announcement({ titleGu: undefined }))).toHaveProperty('titleGu', null);
  });
});

describe('bilingual content views', () => {
  it('lists each translated field once, with its twin, in the content registry', () => {
    expect(translatedFieldsOf(ContentResources.faqs!.publicFields)).toEqual(['question', 'answer']);
    expect(translatedFieldsOf(ContentResources.links!.publicFields)).toEqual(['label', 'description']);
    expect(translatedFieldsOf(ContentResources.milestones!.publicFields)).toEqual(['periodLabel', 'title', 'text', 'sourceRef']);
    expect(translatedFieldsOf(ContentResources['committee-members']!.publicFields)).toEqual(['name', 'position', 'bio']);
    expect(translatedFieldsOf(ContentResources['committee-terms']!.publicFields)).toEqual([]);
    for (const resource of Object.values(ContentResources)) {
      for (const f of translatedFieldsOf(resource.writableFields)) expect(resource.writableFields).toContain(guField(f));
    }
  });

  it('picks public fields in the visitor language and drops the twins', () => {
    const doc = { _id: 'f1', question: 'Who?', questionGu: 'કોણ?', answer: 'Us', answerGu: '', status: 'published' };
    const fields = ContentResources.faqs!.publicFields;
    expect(pick(doc, fields, 'gu')).toEqual({ id: 'f1', question: 'કોણ?', answer: 'Us' });
    expect(pick(doc, fields, 'en')).toEqual({ id: 'f1', question: 'Who?', answer: 'Us' });
    expect(pick(doc, fields)).toEqual({ id: 'f1', question: 'Who?', answer: 'Us' });
  });

  const block = {
    _id: 'b1',
    key: 'about.values' as const,
    title: 'Values',
    titleGu: 'મૂલ્યો',
    body: 'Body',
    bodyGu: undefined,
    items: [
      { title: 'Seva', titleGu: 'સેવા', text: 'Service', textGu: 'સેવા ભાવ', label: 'L', labelGu: 'લ', value: '5' },
      { title: 'Plain', text: 'Only English' },
    ],
  };

  it('localizes block text and every item, and keeps the English shape', () => {
    const gu = publicBlockView(block, 'gu');
    expect(gu).toMatchObject({ title: 'મૂલ્યો', body: 'Body' });
    expect(gu.items[0]).toMatchObject({ title: 'સેવા', text: 'સેવા ભાવ', label: 'લ', value: '5' });
    expect(gu.items[1]).toMatchObject({ title: 'Plain', text: 'Only English', label: null });
    const en = publicBlockView(block, 'en');
    expect(en.items[0]).toMatchObject({ title: 'Seva', text: 'Service', label: 'L' });
    for (const view of [gu, en]) {
      expect(JSON.stringify(view)).not.toMatch(/titleGu|bodyGu|textGu|labelGu/);
    }
  });

  it('gives staff the Gujarati twins of the block and of each item', () => {
    const admin = blockView(block);
    expect(admin).toMatchObject({ titleGu: 'મૂલ્યો', bodyGu: null });
    expect(admin.items[0]).toMatchObject({ titleGu: 'સેવા', textGu: 'સેવા ભાવ', labelGu: 'લ' });
    expect(admin.items[1]).toMatchObject({ titleGu: null, textGu: null, labelGu: null });
  });
});

describe('bilingual public settings', () => {
  const settings = {
    name: 'Samaj',
    nameGu: 'સમાજ',
    shortName: 'S',
    shortNameGu: '',
    invocation: 'Jai Umiya',
    invocationGu: 'જય ઉમિયા',
    tagline: 'Together',
    taglineGu: 'સાથે',
    footerNote: 'Footer',
    footerNoteGu: 'ફૂટર',
    contact: { email: 'a@example.org', phone: '1', address: 'Unjha', addressGu: 'ઊંઝા', officeHours: '9-5', officeHoursGu: '' },
    socialLinks: [],
    publicTabs: {},
  } as never;

  it('localizes the organisation texts and the nested contact texts', () => {
    const gu = toPublicSettings(settings, 'gu');
    expect(gu).toMatchObject({ name: 'સમાજ', shortName: 'S', invocation: 'જય ઉમિયા', tagline: 'સાથે', footerNote: 'ફૂટર' });
    expect(gu.contact).toMatchObject({ address: 'ઊંઝા', officeHours: '9-5', email: 'a@example.org', phone: '1' });
    const en = toPublicSettings(settings);
    expect(en).toMatchObject({ name: 'Samaj', tagline: 'Together', contact: { address: 'Unjha' } });
    for (const view of [gu, en]) expect(JSON.stringify(view)).not.toMatch(/[a-zA-Z]Gu"/);
  });
});

describe('Gujarati fields in validators', () => {
  const probe = (rules: unknown[], pattern = '/t') => {
    const app = express();
    app.use(express.json());
    app.all(pattern, ...(rules as RequestHandler[]), (req, res) => {
      res.json({ ok: true, body: req.body });
    });
    return request(app);
  };
  const failing = (res: request.Response) => (res.body.error?.details ?? []).map((d: { field?: string }) => d.field);

  it('accepts optional Gujarati event fields and trims them', async () => {
    const res = await probe(createEventRules).post('/t').send({
      title: 'Garba Night', venue: 'Hall', startsAt: new Date(Date.now() + 86_400_000).toISOString(),
      titleGu: '  ગરબા નાઇટ ', descriptionGu: 'નૃત્ય', venueGu: 'હોલ', cancellationReasonGu: '',
    });
    expect(res.status).toBe(200);
    expect(res.body.body.titleGu).toBe('ગરબા નાઇટ');
  });

  it('keeps the English fields required and the Gujarati ones optional', async () => {
    const res = await probe(createEventRules).post('/t').send({ titleGu: 'ગરબા નાઇટ' });
    expect(res.status).toBe(400);
    expect(failing(res)).toEqual(expect.arrayContaining(['title', 'venue', 'startsAt']));
    expect(failing(res)).not.toContain('titleGu');
  });

  it('applies the same length and markup rules to the Gujarati twin', async () => {
    const event = { title: 'Garba Night', venue: 'Hall', startsAt: new Date(Date.now() + 86_400_000).toISOString() };
    const create = probe(createEventRules);
    expect(failing(await create.post('/t').send({ ...event, titleGu: 'ગ'.repeat(151) }))).toEqual(['titleGu']);
    expect(failing(await create.post('/t').send({ ...event, descriptionGu: '<b>નૃત્ય</b>' }))).toEqual(['descriptionGu']);
    expect(failing(await create.post('/t').send({ ...event, venueGu: 123 }))).toEqual(['venueGu']);
    expect((await create.post('/t').send({ ...event, titleGu: 'ગ'.repeat(150) })).status).toBe(200);
  });

  it('checks announcement Gujarati fields', async () => {
    const create = probe(createAnnouncementRules);
    const ok = { title: 'Diwali', body: 'Body' };
    expect((await create.post('/t').send({ ...ok, titleGu: 'દિવાળી', summaryGu: 'ટૂંકમાં', bodyGu: 'લખાણ' })).status).toBe(200);
    expect(failing(await create.post('/t').send({ ...ok, summaryGu: 'x'.repeat(301) }))).toEqual(['summaryGu']);
    expect(failing(await create.post('/t').send({ ...ok, bodyGu: 'a < b' }))).toEqual(['bodyGu']);
  });

  it('accepts a Gujarati cancellation reason', async () => {
    const cancel = probe(cancelEventRules, '/t/:id');
    const id = '11111111-1111-4111-8111-111111111111';
    expect((await cancel.post(`/t/${id}`).send({ reason: 'Rain', reasonGu: 'વરસાદ' })).status).toBe(200);
    expect((await cancel.post(`/t/${id}`).send({ reasonGu: 'x'.repeat(501) })).status).toBe(400);
  });

  it('checks the Gujarati fields of every content type', async () => {
    const create = probe(createItemRules, '/t/:resource');
    const update = probe(updateItemRules, '/t/:resource/:id');
    const id = '11111111-1111-4111-8111-111111111111';
    expect((await create.post('/t/faqs').send({ question: 'Who can join?', answer: 'All', questionGu: 'કોણ જોડાઈ શકે?', answerGu: 'બધા' })).status).toBe(200);
    expect(failing(await create.post('/t/faqs').send({ question: 'Who can join?', answer: 'All', answerGu: '<i>x</i>' }))).toEqual(['answerGu']);
    expect((await create.post('/t/links').send({ label: 'Form', url: 'https://example.org/f', labelGu: 'ફોર્મ', descriptionGu: 'વિગત' })).status).toBe(200);
    expect(failing(await create.post('/t/links').send({ label: 'Form', url: 'https://example.org/f', descriptionGu: 'x'.repeat(201) }))).toEqual(['descriptionGu']);
    expect((await create.post('/t/milestones').send({
      periodLabel: '1990s', title: 'Founded', text: 'Text', periodLabelGu: '૧૯૯૦', titleGu: 'સ્થાપના', textGu: 'લખાણ', sourceRefGu: 'સંદર્ભ',
    })).status).toBe(200);
    expect(failing(await create.post('/t/milestones').send({ periodLabel: '1990s', title: 'Founded', text: 'Text', periodLabelGu: 'x'.repeat(41) }))).toEqual(['periodLabelGu']);
    const member = { termId: id, name: 'Ravi Patel', position: 'President' };
    expect((await create.post('/t/committee-members').send({ ...member, nameGu: 'રવિ પટેલ', positionGu: 'પ્રમુખ', bioGu: 'પરિચય' })).status).toBe(200);
    expect(failing(await create.post('/t/committee-members').send({ ...member, positionGu: 'x'.repeat(81) }))).toEqual(['positionGu']);
    // Partial updates may carry just the Gujarati text.
    expect((await update.patch(`/t/faqs/${id}`).send({ questionGu: 'કોણ?' })).status).toBe(200);
    expect(failing(await update.patch(`/t/faqs/${id}`).send({ questionGu: '<b>x</b>' }))).toEqual(['questionGu']);
  });

  it('checks the Gujarati fields of content blocks and their items', async () => {
    const block = probe(blockBodyRules, '/t/:key');
    const ok = { titleGu: 'શીર્ષક', bodyGu: 'લખાણ', items: [{ title: 'One', titleGu: 'એક', textGu: 'પ્રથમ', labelGu: 'લેબલ' }] };
    const res = await block.put('/t/about.mission').send(ok);
    expect(res.status).toBe(200);
    expect(res.body.body.items[0]).toMatchObject({ titleGu: 'એક', textGu: 'પ્રથમ', labelGu: 'લેબલ' });
    expect(failing(await block.put('/t/about.mission').send({ bodyGu: '<b>x</b>' }))).toEqual(['bodyGu']);
    expect((await block.put('/t/about.mission').send({ titleGu: 'x'.repeat(151) })).status).toBe(400);
    expect((await block.put('/t/about.mission').send({ items: [{ titleGu: 'x'.repeat(121) }] })).status).toBe(400);
    expect((await block.put('/t/about.mission').send({ items: [{ textGu: 'x'.repeat(601) }] })).status).toBe(400);
    expect((await block.put('/t/about.mission').send({ items: [{ labelGu: '<b>' }] })).status).toBe(400);
  });

  it('checks the Gujarati organisation texts', async () => {
    const update = probe(updateSettingsRules);
    const res = await update.patch('/t').send({
      nameGu: 'સમાજ', shortNameGu: 'સ', invocationGu: 'જય ઉમિયા', taglineGu: 'સાથે', footerNoteGu: 'ફૂટર',
      contact: { addressGu: 'ઊંઝા', officeHoursGu: 'સવારે ૧૦ થી સાંજે ૬' },
    });
    expect(res.status).toBe(200);
    expect(res.body.body.contact).toEqual({ addressGu: 'ઊંઝા', officeHoursGu: 'સવારે ૧૦ થી સાંજે ૬' });
    expect((await update.patch('/t').send({ nameGu: 'x'.repeat(151) })).status).toBe(400);
    expect((await update.patch('/t').send({ taglineGu: '<b>x</b>' })).status).toBe(400);
    expect((await update.patch('/t').send({ contact: { addressGu: 'x'.repeat(401) } })).status).toBe(400);
    expect((await update.patch('/t').send({ contact: { officeHoursGu: 'x'.repeat(201) } })).status).toBe(400);
  });
});
