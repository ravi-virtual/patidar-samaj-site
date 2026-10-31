import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type request from 'supertest';
import CommitteeMember from '../../src/models/CommitteeMember';
import CommitteeTerm from '../../src/models/CommitteeTerm';
import ContentBlock from '../../src/models/ContentBlock';
import Event from '../../src/models/Event';
import Faq from '../../src/models/Faq';
import ImportantLink from '../../src/models/ImportantLink';
import { Roles } from '../../src/config/constants';
import { DAY, anon, connectTestDb, disconnectTestDb, makeAnnouncement, makeEvent, resetDb, signInAs } from '../helpers';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(resetDb);

/** Asks for the Gujarati (or English) version of a public page, like the front end does. */
const inGu = (r: request.Test) => r.set('Accept-Language', 'gu');
const inEn = (r: request.Test) => r.set('Accept-Language', 'en');

/** No public response may ever carry a raw Gujarati twin such as "titleGu". */
const expectNoGuKeys = (res: { body: unknown }) => expect(JSON.stringify(res.body)).not.toMatch(/"[A-Za-z]+Gu"/);

const FUTURE = (days: number) => new Date(Date.now() + days * DAY).toISOString();

describe('events in both languages', () => {
  it('stores what the admin enters in both languages and shows the admin both', async () => {
    const { client } = await signInAs(Roles.SUPER_ADMIN);
    const created = await client.post('/api/admin/events').send({
      title: 'Garba Night',
      venue: 'Samaj Bhavan',
      description: 'An evening of dance',
      startsAt: FUTURE(5),
      titleGu: 'ગરબા નાઇટ',
      venueGu: 'સમાજ ભવન',
      descriptionGu: 'નૃત્યની સાંજ',
    });
    expect(created.status).toBe(201);
    expect(created.body.data.event).toMatchObject({
      title: 'Garba Night', titleGu: 'ગરબા નાઇટ', venue: 'Samaj Bhavan', venueGu: 'સમાજ ભવન', description: 'An evening of dance', descriptionGu: 'નૃત્યની સાંજ',
    });
    const id = created.body.data.event.id as string;
    expect((await Event.findById(id).lean())?.titleGu).toBe('ગરબા નાઇટ');

    // Staff always see both languages, whatever language the admin screen asks for.
    for (const lang of ['en', 'gu']) {
      const one = await client.get(`/api/admin/events/${id}`).set('Accept-Language', lang);
      expect(one.body.data.event).toMatchObject({ title: 'Garba Night', titleGu: 'ગરબા નાઇટ', venueGu: 'સમાજ ભવન' });
      const list = await client.get('/api/admin/events').set('Accept-Language', lang);
      expect(list.body.data.events[0]).toMatchObject({ title: 'Garba Night', titleGu: 'ગરબા નાઇટ' });
    }

    const edited = await client.patch(`/api/admin/events/${id}`).send({ titleGu: 'ગરબા રાત્રિ' });
    expect(edited.status).toBe(200);
    expect(edited.body.data.event).toMatchObject({ title: 'Garba Night', titleGu: 'ગરબા રાત્રિ', venueGu: 'સમાજ ભવન' });
    expect((await client.patch(`/api/admin/events/${id}`).send({ titleGu: '<b>x</b>' })).status).toBe(400);
    expect((await client.patch(`/api/admin/events/${id}`).send({ venueGu: 'ગ'.repeat(201) })).status).toBe(400);
  });

  it('serves the visitor their language, English by default, with no Gujarati keys', async () => {
    const { client } = await signInAs(Roles.SUPER_ADMIN);
    const id = (
      await client.post('/api/admin/events').send({
        title: 'Garba Night', venue: 'Samaj Bhavan', description: 'Dance', startsAt: FUTURE(5), titleGu: 'ગરબા નાઇટ', venueGu: 'સમાજ ભવન', descriptionGu: 'નૃત્ય',
      })
    ).body.data.event.id as string;
    await client.post(`/api/admin/events/${id}/publish`);

    const gu = await inGu(anon().get('/api/events'));
    expect(gu.status).toBe(200);
    expect(gu.headers['content-language']).toBe('gu');
    expect(gu.body.data.events[0]).toMatchObject({ id, title: 'ગરબા નાઇટ', venue: 'સમાજ ભવન', description: 'નૃત્ય', category: 'Other' });
    expectNoGuKeys(gu);

    const detail = await inGu(anon().get(`/api/events/${id}`));
    expect(detail.body.data.event).toMatchObject({ title: 'ગરબા નાઇટ', venue: 'સમાજ ભવન' });
    expectNoGuKeys(detail);

    for (const res of [await inEn(anon().get('/api/events')), await anon().get('/api/events'), await anon().get('/api/events').set('Accept-Language', 'hi')]) {
      expect(res.body.data.events[0]).toMatchObject({ title: 'Garba Night', venue: 'Samaj Bhavan', description: 'Dance' });
      expectNoGuKeys(res);
    }
    expect((await inEn(anon().get(`/api/events/${id}`))).body.data.event.title).toBe('Garba Night');
  });

  it('falls back to English for anything without Gujarati text', async () => {
    await makeEvent({ title: 'Only English', venue: 'Hall', description: 'Details' });
    await Event.create({ title: 'Half Done', venue: 'Hall', startsAt: new Date(Date.now() + DAY), status: 'published', titleGu: 'અડધું', venueGu: '' });
    const res = await inGu(anon().get('/api/events'));
    const byId = (title: string) => res.body.data.events.find((e: { title: string }) => e.title === title);
    expect(byId('Only English')).toMatchObject({ venue: 'Hall', description: 'Details' });
    expect(byId('અડધું')).toMatchObject({ venue: 'Hall' });
    expectNoGuKeys(res);
  });

  it('searches the Gujarati text only for Gujarati visitors', async () => {
    await makeEvent({ title: 'Garba Night', venue: 'Hall' });
    await Event.updateOne({}, { $set: { titleGu: 'ગરબા નાઇટ' } });
    expect((await inGu(anon().get('/api/events').query({ search: 'ગરબા' }))).body.data.totalCount).toBe(1);
    expect((await inGu(anon().get('/api/events').query({ search: 'garba' }))).body.data.totalCount).toBe(1);
    expect((await inEn(anon().get('/api/events').query({ search: 'ગરબા' }))).body.data.totalCount).toBe(0);
  });

  it('translates the cancellation reason of a cancelled event', async () => {
    const { client } = await signInAs(Roles.SUPER_ADMIN);
    const id = (await client.post('/api/admin/events').send({ title: 'Open Air Raas', venue: 'Ground', startsAt: FUTURE(3) })).body.data.event.id as string;
    await client.post(`/api/admin/events/${id}/publish`);
    const cancelled = await client.post(`/api/admin/events/${id}/cancel`).send({ reason: 'Heavy rain', reasonGu: 'ભારે વરસાદ' });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.event).toMatchObject({ cancellationReason: 'Heavy rain', cancellationReasonGu: 'ભારે વરસાદ' });
    expect((await inGu(anon().get(`/api/events/${id}`))).body.data.event.cancellationReason).toBe('ભારે વરસાદ');
    expect((await inEn(anon().get(`/api/events/${id}`))).body.data.event.cancellationReason).toBe('Heavy rain');
  });
});

describe('announcements in both languages', () => {
  it('stores both languages for the admin and serves the visitor their language', async () => {
    const { client } = await signInAs(Roles.SUPER_ADMIN);
    const created = await client.post('/api/admin/announcements').send({
      title: 'Diwali dinner', summary: 'Join us', body: 'Details of the dinner.', titleGu: 'દિવાળી સ્નેહભોજન', summaryGu: 'અમારી સાથે જોડાઓ', bodyGu: 'ભોજનની વિગતો.',
    });
    expect(created.status).toBe(201);
    expect(created.body.data.announcement).toMatchObject({ titleGu: 'દિવાળી સ્નેહભોજન', summaryGu: 'અમારી સાથે જોડાઓ', bodyGu: 'ભોજનની વિગતો.' });
    const id = created.body.data.announcement.id as string;
    await client.post(`/api/admin/announcements/${id}/publish`);

    const adminGu = await client.get(`/api/admin/announcements/${id}`).set('Accept-Language', 'gu');
    expect(adminGu.body.data.announcement).toMatchObject({ title: 'Diwali dinner', titleGu: 'દિવાળી સ્નેહભોજન' });

    const list = await inGu(anon().get('/api/announcements'));
    expect(list.body.data.announcements[0]).toMatchObject({ title: 'દિવાળી સ્નેહભોજન', summary: 'અમારી સાથે જોડાઓ' });
    expect(list.body.data.announcements[0]).not.toHaveProperty('body');
    expectNoGuKeys(list);

    const detail = await inGu(anon().get(`/api/announcements/${id}`));
    expect(detail.body.data.announcement).toMatchObject({ title: 'દિવાળી સ્નેહભોજન', body: 'ભોજનની વિગતો.' });
    expectNoGuKeys(detail);

    const en = await inEn(anon().get(`/api/announcements/${id}`));
    expect(en.body.data.announcement).toMatchObject({ title: 'Diwali dinner', summary: 'Join us', body: 'Details of the dinner.' });
    expectNoGuKeys(en);
    expect((await client.patch(`/api/admin/announcements/${id}`).send({ bodyGu: 'a > b' })).status).toBe(400);
  });

  it('falls back to English when the Gujarati text is empty', async () => {
    await makeAnnouncement({ title: 'Plain news', summary: 'English summary', body: 'English body' });
    const item = await makeAnnouncement({ title: 'Blank Gujarati', body: 'English body' });
    await item.updateOne({ $set: { titleGu: '', bodyGu: '' } });
    const res = await inGu(anon().get('/api/announcements'));
    const titles = res.body.data.announcements.map((a: { title: string }) => a.title).sort();
    expect(titles).toEqual(['Blank Gujarati', 'Plain news']);
    expect(res.body.data.announcements.find((a: { title: string }) => a.title === 'Plain news').summary).toBe('English summary');
    expectNoGuKeys(res);
  });

  it('searches the Gujarati text for Gujarati visitors', async () => {
    const item = await makeAnnouncement({ title: 'Scholarships', body: 'English body' });
    await item.updateOne({ $set: { titleGu: 'શિષ્યવૃત્તિ', bodyGu: 'ગુજરાતી લખાણ' } });
    expect((await inGu(anon().get('/api/announcements').query({ search: 'શિષ્ય' }))).body.data.totalCount).toBe(1);
    expect((await inGu(anon().get('/api/announcements').query({ search: 'ગુજરાતી' }))).body.data.announcements[0].title).toBe('શિષ્યવૃત્તિ');
    expect((await inEn(anon().get('/api/announcements').query({ search: 'શિષ્ય' }))).body.data.totalCount).toBe(0);
  });
});

describe('managed content in both languages', () => {
  it('keeps the FAQ, link and milestone Gujarati text for the admin and serves it localized', async () => {
    const { client } = await signInAs(Roles.SUPER_ADMIN);
    const faq = await client.post('/api/admin/content/faqs').send({ question: 'Who can join?', answer: 'Any family.', questionGu: 'કોણ જોડાઈ શકે?', answerGu: 'કોઈપણ પરિવાર.' });
    expect(faq.status).toBe(201);
    expect(faq.body.data.item).toMatchObject({ question: 'Who can join?', questionGu: 'કોણ જોડાઈ શકે?', answerGu: 'કોઈપણ પરિવાર.' });
    const link = await client.post('/api/admin/content/links').send({ label: 'Membership form', url: 'https://example.org/f', labelGu: 'સભ્યપદ ફોર્મ', descriptionGu: 'અરજી ફોર્મ' });
    expect(link.body.data.item).toMatchObject({ labelGu: 'સભ્યપદ ફોર્મ', descriptionGu: 'અરજી ફોર્મ' });
    const milestone = await client.post('/api/admin/content/milestones').send({
      periodLabel: '1990s', title: 'Directory', text: 'First directory.', periodLabelGu: '૧૯૯૦', titleGu: 'ડિરેક્ટરી', textGu: 'પ્રથમ ડિરેક્ટરી.', sourceRefGu: 'સંદર્ભ-1',
    });
    expect(milestone.body.data.item).toMatchObject({ periodLabelGu: '૧૯૯૦', titleGu: 'ડિરેક્ટરી', textGu: 'પ્રથમ ડિરેક્ટરી.', sourceRefGu: 'સંદર્ભ-1' });
    for (const [resource, created] of [['faqs', faq], ['links', link], ['milestones', milestone]] as const) {
      const id = created.body.data.item.id as string;
      await client.post(`/api/admin/content/${resource}/${id}/publish`);
      const admin = await client.get(`/api/admin/content/${resource}/${id}`).set('Accept-Language', 'gu');
      expect(admin.body.data.item).toMatchObject(created.body.data.item);
    }

    const faqsGu = await inGu(anon().get('/api/content/faqs'));
    expect(faqsGu.body.data.items[0]).toMatchObject({ question: 'કોણ જોડાઈ શકે?', answer: 'કોઈપણ પરિવાર.' });
    expectNoGuKeys(faqsGu);
    const linksGu = await inGu(anon().get('/api/content/links'));
    expect(linksGu.body.data.items[0]).toMatchObject({ label: 'સભ્યપદ ફોર્મ', description: 'અરજી ફોર્મ', url: 'https://example.org/f' });
    expectNoGuKeys(linksGu);
    const milestonesGu = await inGu(anon().get('/api/content/milestones'));
    expect(milestonesGu.body.data.items[0]).toMatchObject({ periodLabel: '૧૯૯૦', title: 'ડિરેક્ટરી', text: 'પ્રથમ ડિરેક્ટરી.', sourceRef: 'સંદર્ભ-1' });
    expectNoGuKeys(milestonesGu);

    expect((await inEn(anon().get('/api/content/faqs'))).body.data.items[0]).toMatchObject({ question: 'Who can join?', answer: 'Any family.' });
    expect((await anon().get('/api/content/links')).body.data.items[0].label).toBe('Membership form');
  });

  it('falls back to English per field and rejects bad Gujarati text', async () => {
    const { client } = await signInAs(Roles.SUPER_ADMIN);
    await Faq.create({ question: 'English only?', answer: 'Yes.', status: 'published' });
    await Faq.create({ question: 'Half translated?', answer: 'Yes.', questionGu: 'અડધું અનુવાદિત?', answerGu: '', status: 'published', order: 1 });
    const res = await inGu(anon().get('/api/content/faqs'));
    expect(res.body.data.items.map((i: { question: string; answer: string }) => [i.question, i.answer])).toEqual([
      ['English only?', 'Yes.'],
      ['અડધું અનુવાદિત?', 'Yes.'],
    ]);
    expectNoGuKeys(res);

    expect((await client.post('/api/admin/content/faqs').send({ question: 'Who can join?', answer: 'All', answerGu: '<b>x</b>' })).status).toBe(400);
    expect((await client.post('/api/admin/content/faqs').send({ question: 'Who can join?', answer: 'All', questionGu: 'ગ'.repeat(201) })).status).toBe(400);
  });

  it('searches the staff list in either language', async () => {
    const { client } = await signInAs(Roles.SUPER_ADMIN);
    await Faq.create({ question: 'Who can join?', answer: 'Any family.', questionGu: 'કોણ જોડાઈ શકે?', status: 'draft' });
    expect((await client.get('/api/admin/content/faqs').query({ search: 'જોડાઈ' })).body.data.totalCount).toBe(1);
    expect((await client.get('/api/admin/content/faqs').query({ search: 'who can' })).body.data.totalCount).toBe(1);
  });

  it('localizes the committee page and its members', async () => {
    const { client } = await signInAs(Roles.SUPER_ADMIN);
    const term = await CommitteeTerm.create({ label: '2025–2027', startYear: 2025, endYear: 2027, isCurrent: true, status: 'published' });
    const created = await client.post('/api/admin/content/committee-members').send({
      termId: term._id, name: 'Ashok Patel', position: 'President', bio: 'Long-time volunteer.', nameGu: 'અશોક પટેલ', positionGu: 'પ્રમુખ', bioGu: 'લાંબા સમયના સ્વયંસેવક.',
    });
    expect(created.status).toBe(201);
    expect(created.body.data.item).toMatchObject({ nameGu: 'અશોક પટેલ', positionGu: 'પ્રમુખ', bioGu: 'લાંબા સમયના સ્વયંસેવક.' });
    await client.post(`/api/admin/content/committee-members/${created.body.data.item.id}/publish`);

    const gu = await inGu(anon().get('/api/content/committee'));
    expect(gu.body.data.members[0]).toMatchObject({ name: 'અશોક પટેલ', position: 'પ્રમુખ', bio: 'લાંબા સમયના સ્વયંસેવક.' });
    expect(gu.body.data.term.label).toBe('2025–2027');
    expectNoGuKeys(gu);
    expect((await inEn(anon().get('/api/content/committee'))).body.data.members[0]).toMatchObject({ name: 'Ashok Patel', position: 'President' });

    const list = await inGu(anon().get('/api/content/committee-members'));
    expect(list.body.data.items[0].name).toBe('અશોક પટેલ');
    expectNoGuKeys(list);
    expect((await CommitteeMember.countDocuments({ nameGu: 'અશોક પટેલ' }))).toBe(1);
  });

  it('stores block and item Gujarati text and localizes every item', async () => {
    const { client } = await signInAs(Roles.SUPER_ADMIN);
    const saved = await client.put('/api/admin/content/blocks/about.values').send({
      title: 'Our values',
      titleGu: 'અમારાં મૂલ્યો',
      body: 'What we stand for.',
      bodyGu: 'અમે શેના માટે ઊભા છીએ.',
      items: [
        { title: 'Seva', titleGu: 'સેવા', text: 'Service.', textGu: 'સેવા ભાવ.', label: 'Value', labelGu: 'મૂલ્ય', value: '1' },
        { title: 'Sanskar', text: 'Only English.' },
      ],
    });
    expect(saved.status).toBe(200);
    expect(saved.body.data.block).toMatchObject({ titleGu: 'અમારાં મૂલ્યો', bodyGu: 'અમે શેના માટે ઊભા છીએ.' });
    expect(saved.body.data.block.items[0]).toMatchObject({ titleGu: 'સેવા', textGu: 'સેવા ભાવ.', labelGu: 'મૂલ્ય' });
    await client.post('/api/admin/content/blocks/about.values/publish');

    const admin = await client.get('/api/admin/content/blocks').set('Accept-Language', 'gu');
    const block = admin.body.data.blocks.find((b: { key: string }) => b.key === 'about.values');
    expect(block).toMatchObject({ title: 'Our values', titleGu: 'અમારાં મૂલ્યો' });
    expect(block.items[0]).toMatchObject({ title: 'Seva', titleGu: 'સેવા', labelGu: 'મૂલ્ય' });

    const all = await inGu(anon().get('/api/content/blocks'));
    const pub = all.body.data.blocks['about.values'];
    expect(pub).toMatchObject({ title: 'અમારાં મૂલ્યો', body: 'અમે શેના માટે ઊભા છીએ.' });
    expect(pub.items[0]).toMatchObject({ title: 'સેવા', text: 'સેવા ભાવ.', label: 'મૂલ્ય', value: '1' });
    expect(pub.items[1]).toMatchObject({ title: 'Sanskar', text: 'Only English.' });
    expectNoGuKeys(all);

    const one = await inGu(anon().get('/api/content/blocks/about.values'));
    expect(one.body.data.block.items[0].title).toBe('સેવા');
    expectNoGuKeys(one);
    const en = await inEn(anon().get('/api/content/blocks/about.values'));
    expect(en.body.data.block).toMatchObject({ title: 'Our values', body: 'What we stand for.' });
    expect(en.body.data.block.items[0]).toMatchObject({ title: 'Seva', text: 'Service.', label: 'Value' });
    expectNoGuKeys(en);

    expect((await ContentBlock.findOne({ key: 'about.values' }).lean())?.items[0]?.titleGu).toBe('સેવા');
    expect((await client.put('/api/admin/content/blocks/about.values').send({ items: [{ textGu: '<b>x</b>' }] })).status).toBe(400);
  });
});

describe('organisation settings in both languages', () => {
  it('lets the admin save both languages and localizes only the public view', async () => {
    const { client } = await signInAs(Roles.SUPER_ADMIN);
    const res = await client.patch('/api/admin/settings').send({
      name: 'Uttar Gujarat Kadva Patidar Samaj',
      nameGu: 'ઉત્તર ગુજરાત કડવા પાટીદાર સમાજ',
      tagline: 'One family',
      taglineGu: 'એક પરિવાર',
      invocationGu: 'જય ઉમિયા માતા',
      footerNote: 'Run by volunteers.',
      footerNoteGu: 'સ્વયંસેવકો દ્વારા સંચાલિત.',
      contact: { address: 'Unjha', addressGu: 'ઊંઝા', officeHoursGu: 'સોમ–શનિ' },
    });
    expect(res.status).toBe(200);
    expect(res.body.data.settings).toMatchObject({
      nameGu: 'ઉત્તર ગુજરાત કડવા પાટીદાર સમાજ', taglineGu: 'એક પરિવાર', invocationGu: 'જય ઉમિયા માતા', footerNoteGu: 'સ્વયંસેવકો દ્વારા સંચાલિત.', shortNameGu: '',
      contact: { address: 'Unjha', addressGu: 'ઊંઝા', officeHoursGu: 'સોમ–શનિ' },
    });

    const adminGu = await client.get('/api/admin/settings').set('Accept-Language', 'gu');
    expect(adminGu.body.data.settings).toMatchObject({ name: 'Uttar Gujarat Kadva Patidar Samaj', nameGu: 'ઉત્તર ગુજરાત કડવા પાટીદાર સમાજ' });

    const gu = await inGu(anon().get('/api/public/settings'));
    expect(gu.body.data.settings).toMatchObject({
      name: 'ઉત્તર ગુજરાત કડવા પાટીદાર સમાજ', tagline: 'એક પરિવાર', invocation: 'જય ઉમિયા માતા', footerNote: 'સ્વયંસેવકો દ્વારા સંચાલિત.',
      contact: { address: 'ઊંઝા', officeHours: 'સોમ–શનિ' },
    });
    // No Gujarati short name was entered, so the English one stays.
    expect(gu.body.data.settings.shortName).toBe('Kadva Patidar Samaj');
    expectNoGuKeys(gu);

    const en = await inEn(anon().get('/api/public/settings'));
    expect(en.body.data.settings).toMatchObject({ name: 'Uttar Gujarat Kadva Patidar Samaj', tagline: 'One family', contact: { address: 'Unjha' } });
    expectNoGuKeys(en);

    expect((await client.patch('/api/admin/settings').send({ nameGu: '<b>x</b>' })).status).toBe(400);
    expect((await client.patch('/api/admin/settings').send({ contact: { addressGu: 'ગ'.repeat(401) } })).status).toBe(400);
  });
});

describe('home and search in both languages', () => {
  it('localizes every section of the home page', async () => {
    await ContentBlock.create({ key: 'home.welcome', title: 'Welcome', titleGu: 'સ્વાગત', body: 'Hello families.', bodyGu: 'નમસ્તે પરિવારો.', status: 'published' });
    await ContentBlock.create({ key: 'home.stats', items: [{ value: '1,146', label: 'Families', labelGu: 'પરિવારો' }], status: 'published' });
    await Event.create({ title: 'Raas', titleGu: 'રાસ', venue: 'Ground', venueGu: 'મેદાન', startsAt: new Date(Date.now() + 2 * DAY), status: 'published', featured: true });
    await makeEvent({ title: 'Plain event', startsAt: new Date(Date.now() + 4 * DAY) });
    const news = await makeAnnouncement({ title: 'News', summary: 'Short' });
    await news.updateOne({ $set: { titleGu: 'સમાચાર', summaryGu: 'ટૂંકમાં' } });
    await ImportantLink.create({ label: 'Form', labelGu: 'ફોર્મ', url: 'https://example.org', status: 'published' });
    await anon().get('/api/public/settings'); // creates the settings document
    const { client } = await signInAs(Roles.SUPER_ADMIN);
    await client.patch('/api/admin/settings').send({ nameGu: 'સમાજ' });

    const gu = await inGu(anon().get('/api/public/home'));
    expect(gu.status).toBe(200);
    const d = gu.body.data;
    expect(d.settings.name).toBe('સમાજ');
    expect(d.blocks['home.welcome']).toMatchObject({ title: 'સ્વાગત', body: 'નમસ્તે પરિવારો.' });
    expect(d.blocks['home.stats'].items[0]).toMatchObject({ value: '1,146', label: 'પરિવારો' });
    expect(d.featuredEvent).toMatchObject({ title: 'રાસ', venue: 'મેદાન' });
    expect(d.upcomingEvents.map((e: { title: string }) => e.title)).toEqual(['રાસ', 'Plain event']);
    expect(d.announcements[0]).toMatchObject({ title: 'સમાચાર', summary: 'ટૂંકમાં' });
    expect(d.links[0]).toMatchObject({ label: 'ફોર્મ' });
    expectNoGuKeys(gu);

    const en = await inEn(anon().get('/api/public/home'));
    expect(en.body.data.featuredEvent.title).toBe('Raas');
    expect(en.body.data.blocks['home.welcome'].title).toBe('Welcome');
    expect(en.body.data.announcements[0].title).toBe('News');
    expect(en.body.data.links[0].label).toBe('Form');
    expectNoGuKeys(en);
  });

  it('searches the Gujarati text for Gujarati visitors and returns localized results', async () => {
    await Event.create({ title: 'Garba Night', titleGu: 'ગરબા નાઇટ', venue: 'Hall', venueGu: 'હોલ', startsAt: new Date(Date.now() + DAY), status: 'published' });
    const news = await makeAnnouncement({ title: 'Scholarships', body: 'English body' });
    await news.updateOne({ $set: { titleGu: 'શિષ્યવૃત્તિ', bodyGu: 'ગુજરાતી લખાણ' } });
    await Faq.create({ question: 'Who can join?', answer: 'Any family.', questionGu: 'કોણ જોડાઈ શકે?', answerGu: 'કોઈપણ પરિવાર.', status: 'published' });
    await ImportantLink.create({ label: 'Membership form', labelGu: 'સભ્યપદ ફોર્મ', descriptionGu: 'અરજી', url: 'https://example.org', status: 'published' });

    const events = await inGu(anon().get('/api/search').query({ q: 'ગરબા' }));
    expect(events.status).toBe(200);
    expect(events.body.data.results.events[0]).toMatchObject({ title: 'ગરબા નાઇટ', snippet: 'હોલ' });
    expectNoGuKeys(events);
    expect((await inGu(anon().get('/api/search').query({ q: 'શિષ્ય' }))).body.data.results.announcements[0].title).toBe('શિષ્યવૃત્તિ');
    const faqs = await inGu(anon().get('/api/search').query({ q: 'જોડાઈ' }));
    expect(faqs.body.data.results.faqs[0]).toMatchObject({ title: 'કોણ જોડાઈ શકે?', snippet: 'કોઈપણ પરિવાર.' });
    expect((await inGu(anon().get('/api/search').query({ q: 'સભ્યપદ' }))).body.data.results.links[0].title).toBe('સભ્યપદ ફોર્મ');

    // English visitors search the English text only, and get English results.
    expect((await inEn(anon().get('/api/search').query({ q: 'ગરબા' }))).body.data.totalCount).toBe(0);
    const en = await inEn(anon().get('/api/search').query({ q: 'garba' }));
    expect(en.body.data.results.events[0]).toMatchObject({ title: 'Garba Night', snippet: 'Hall' });
    // A Gujarati visitor can still search by the English words.
    expect((await inGu(anon().get('/api/search').query({ q: 'garba' }))).body.data.results.events[0].title).toBe('ગરબા નાઇટ');
  });
});
