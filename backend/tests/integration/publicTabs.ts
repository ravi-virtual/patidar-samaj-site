import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import CommitteeMember from '../../src/models/CommitteeMember';
import CommitteeTerm from '../../src/models/CommitteeTerm';
import ContactMessage from '../../src/models/ContactMessage';
import ContentBlock from '../../src/models/ContentBlock';
import Faq from '../../src/models/Faq';
import HistoryMilestone from '../../src/models/HistoryMilestone';
import ImportantLink from '../../src/models/ImportantLink';
import OrganizationSettings from '../../src/models/OrganizationSettings';
import { PublicTabs, resolvePublicTabs, type PublicTab } from '../../src/config/publicTabs';
import { Roles } from '../../src/config/constants';
import { ORIGIN, anon, connectTestDb, disconnectTestDb, makeAnnouncement, makeEvent, makeProfile, resetDb, signInAs } from '../helpers';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(resetDb);

/** Switches the given tabs off directly in the database (the admin API is covered in siteApi.ts). */
const turnOff = (...tabs: PublicTab[]) =>
  OrganizationSettings.findOneAndUpdate(
    { key: 'main' },
    { $set: Object.fromEntries(tabs.map((t) => [`publicTabs.${t}`, false])) },
    { upsert: true },
  );

const contactBody = { name: 'Meera Patel', email: 'meera@example.test', message: 'I would like to know how to renew my membership.' };

describe('resolvePublicTabs', () => {
  it('treats missing, null and undefined keys as on, and only false as off', () => {
    expect(resolvePublicTabs(undefined)).toEqual(Object.fromEntries(PublicTabs.map((t) => [t, true])));
    expect(resolvePublicTabs({ events: false, news: null })).toMatchObject({ events: false, news: true, about: true });
    expect(resolvePublicTabs({ bogus: false })).not.toHaveProperty('bogus');
  });

  it('keeps working for a settings document saved before the tabs existed', async () => {
    await OrganizationSettings.collection.insertOne({ _id: 'old' as never, key: 'main', name: 'Old', themeDefault: 'dark' });
    const res = await anon().get('/api/public/settings');
    expect(res.body.data.settings.publicTabs).toEqual(Object.fromEntries(PublicTabs.map((t) => [t, true])));
    expect((await anon().get('/api/events')).status).toBe(200);
  });
});

describe('gated public endpoints', () => {
  it('serve everything while all tabs are on', async () => {
    const event = await makeEvent();
    const note = await makeAnnouncement();
    const member = await makeProfile();
    for (const url of [
      '/api/events', `/api/events/${event._id}`, '/api/announcements', `/api/announcements/${note._id}`,
      '/api/members', '/api/members/filters', `/api/members/${member._id}`,
      '/api/content/faqs', '/api/content/links', '/api/content/milestones', '/api/content/committee',
      '/api/content/committee-terms', '/api/content/committee-members', '/api/content/blocks',
    ]) {
      expect((await anon().get(url)).status, url).toBe(200);
    }
  });

  it('answer 404 with the normal not-found error for events and only events', async () => {
    const event = await makeEvent();
    await makeAnnouncement();
    await turnOff('events');
    for (const url of ['/api/events', `/api/events/${event._id}`]) {
      const res = await anon().get(url);
      expect(res.status, url).toBe(404);
      expect(res.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
    }
    expect((await anon().get('/api/announcements')).status).toBe(200);
  });

  it('answer 404 for news', async () => {
    const note = await makeAnnouncement();
    await turnOff('news');
    expect((await anon().get('/api/announcements')).status).toBe(404);
    expect((await anon().get(`/api/announcements/${note._id}`)).status).toBe(404);
    expect((await anon().get('/api/events')).status).toBe(200);
  });

  it('answer 404 for the members directory, for visitors and signed-in users alike', async () => {
    const member = await makeProfile();
    await turnOff('directory');
    const { client } = await signInAs(Roles.ADMIN);
    for (const who of [anon(), client]) {
      for (const url of ['/api/members', '/api/members/filters', `/api/members/${member._id}`]) {
        expect((await who.get(url)).status, url).toBe(404);
      }
    }
  });

  it('answer 404 for faq, links, history and committee lists, each on its own tab', async () => {
    await Faq.create({ question: 'What is the fee?', answer: 'There is no fee.', status: 'published' });
    await ImportantLink.create({ label: 'Form', url: 'https://example.org', category: 'Forms', status: 'published' });
    await HistoryMilestone.create({ periodLabel: '1950', title: 'Founded', text: 'Started.', status: 'published' });
    const term = await CommitteeTerm.create({ label: '2025-2027', startYear: 2025, endYear: 2027, isCurrent: true, status: 'published' });
    await CommitteeMember.create({ termId: term._id, name: 'Ashok Patel', position: 'President', status: 'published' });

    const cases: [PublicTab, string[]][] = [
      ['faq', ['/api/content/faqs']],
      ['links', ['/api/content/links']],
      ['history', ['/api/content/milestones']],
      ['committee', ['/api/content/committee', '/api/content/committee-terms', '/api/content/committee-members']],
    ];
    for (const [tab, urls] of cases) {
      await OrganizationSettings.deleteMany({});
      await turnOff(tab);
      for (const url of urls) expect((await anon().get(url)).status, `${tab}: ${url}`).toBe(404);
      for (const [other, otherUrls] of cases) {
        if (other !== tab) for (const url of otherUrls) expect((await anon().get(url)).status, `${tab} off, ${url}`).toBe(200);
      }
    }
  });

  it('keep serving text blocks (about and history copy is hidden by the website only)', async () => {
    await ContentBlock.create({ key: 'about.intro', title: 'About us', body: 'Text.', status: 'published' });
    await turnOff('about', 'history');
    const res = await anon().get('/api/content/blocks');
    expect(res.status).toBe(200);
    expect(res.body.data.blocks['about.intro']).toBeDefined();
  });

  it('refuse the contact form when the contact tab is off, and store nothing', async () => {
    await turnOff('contact');
    const res = await anon().post('/api/contact').set('Origin', ORIGIN).send(contactBody);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(await ContactMessage.countDocuments()).toBe(0);
    await OrganizationSettings.deleteMany({});
    expect((await anon().post('/api/contact').set('Origin', ORIGIN).send(contactBody)).status).toBe(201);
  });

  it('never affect admin endpoints: staff can still manage hidden tabs', async () => {
    await makeEvent();
    await makeAnnouncement();
    await makeProfile();
    await Faq.create({ question: 'What is the fee?', answer: 'There is no fee.', status: 'published' });
    await ContactMessage.create({ name: 'A B', email: 'a@b.co', message: 'A message long enough.' });
    await turnOff(...PublicTabs);
    const { client } = await signInAs(Roles.SUPER_ADMIN);
    for (const url of ['/api/admin/events', '/api/admin/announcements', '/api/admin/members', '/api/admin/content/faqs', '/api/admin/contacts', '/api/admin/settings']) {
      expect((await client.get(url)).status, url).toBe(200);
    }
  });
});

describe('home and search while tabs are off', () => {
  const seed = async () => {
    await makeEvent({ title: 'Garba Night', featured: true });
    await makeAnnouncement({ title: 'Garba notice' });
    await makeProfile({ displayName: 'Garba Patel', highlighted: true });
    await Faq.create({ question: 'Garba entry fee?', answer: 'Free.', status: 'published' });
    await ImportantLink.create({ label: 'Garba pass', url: 'https://example.org', category: 'Forms', status: 'published' });
    await HistoryMilestone.create({ periodLabel: '1950', title: 'Garba begins', text: 'Started.', status: 'published' });
  };

  it('home carries every section while all tabs are on', async () => {
    await seed();
    const home = (await anon().get('/api/public/home')).body.data;
    expect(home.featuredEvent).not.toBeNull();
    expect(home.upcomingEvents).toHaveLength(1);
    expect(home.announcements).toHaveLength(1);
    expect(home.memberHighlights).toHaveLength(1);
    expect(home.links).toHaveLength(1);
  });

  it('home omits the data of each switched-off tab', async () => {
    await seed();
    await turnOff('events', 'news', 'directory', 'links');
    const home = (await anon().get('/api/public/home')).body.data;
    expect(home.featuredEvent).toBeNull();
    expect(home.upcomingEvents).toEqual([]);
    expect(home.announcements).toEqual([]);
    expect(home.memberHighlights).toEqual([]);
    expect(home.links).toEqual([]);
    expect(home.settings.publicTabs).toMatchObject({ events: false, news: false, directory: false, links: false, about: true });
  });

  it('home leaves out the about block when about is off but keeps welcome and statistics', async () => {
    await ContentBlock.create({ key: 'about.intro', title: 'About', body: 'x', status: 'published' });
    await ContentBlock.create({ key: 'home.welcome', title: 'Welcome', body: 'x', status: 'published' });
    await turnOff('about');
    const blocks = (await anon().get('/api/public/home')).body.data.blocks;
    expect(Object.keys(blocks)).toEqual(['home.welcome']);
  });

  it('search leaves out results from each switched-off tab', async () => {
    await seed();
    const all = (await anon().get('/api/search?q=garba')).body.data.results;
    for (const group of ['events', 'announcements', 'members', 'faqs', 'links', 'history']) expect(all[group], group).toHaveLength(1);

    const groups: [PublicTab, string][] = [
      ['events', 'events'], ['news', 'announcements'], ['directory', 'members'], ['faq', 'faqs'], ['links', 'links'], ['history', 'history'],
    ];
    for (const [tab, group] of groups) {
      await OrganizationSettings.deleteMany({});
      await turnOff(tab);
      const results = (await anon().get('/api/search?q=garba')).body.data.results;
      expect(results[group], `${tab} off`).toHaveLength(0);
      for (const [, other] of groups) if (other !== group) expect(results[other], `${tab} off, ${other}`).toHaveLength(1);
    }
  });
});
