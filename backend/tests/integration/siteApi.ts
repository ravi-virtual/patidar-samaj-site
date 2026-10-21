import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Announcement from '../../src/models/Announcement';
import AuditLog from '../../src/models/AuditLog';
import ContactMessage from '../../src/models/ContactMessage';
import ContentBlock from '../../src/models/ContentBlock';
import Event from '../../src/models/Event';
import Faq from '../../src/models/Faq';
import ImportantLink from '../../src/models/ImportantLink';
import MediaAsset from '../../src/models/MediaAsset';
import OrganizationSettings from '../../src/models/OrganizationSettings';
import { AccountStatus, Roles } from '../../src/config/constants';
import {
  DAY,
  ORIGIN,
  PASSWORD,
  anon,
  connectTestDb,
  disconnectTestDb,
  makeAnnouncement,
  makeEvent,
  makeProfile,
  makeUser,
  resetDb,
  signIn,
  signInAs,
} from '../helpers';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(resetDb);

describe('public home', () => {
  it('assembles published content and nothing else', async () => {
    await ContentBlock.create({ key: 'home.welcome', title: 'Welcome', body: 'Hello families.', status: 'published' });
    await ContentBlock.create({ key: 'home.stats', items: [{ value: '1,146', label: 'Families' }], status: 'published' });
    await ContentBlock.create({ key: 'about.mission', body: 'Not on home.', status: 'published' });
    await ContentBlock.create({ key: 'about.intro', body: 'Draft intro', status: 'draft' });
    await makeEvent({ title: 'Featured Raas', featured: true, startsAt: new Date(Date.now() + 3 * DAY) });
    await makeEvent({ title: 'Plain Event', startsAt: new Date(Date.now() + 5 * DAY) });
    await makeEvent({ title: 'Draft Event', status: 'draft' });
    await makeEvent({ title: 'Past Event', startsAt: new Date(Date.now() - DAY) });
    await makeAnnouncement({ title: 'Pinned News', pinned: true });
    await makeAnnouncement({ title: 'Draft News', status: 'draft' });
    await makeAnnouncement({ title: 'Later News', publishAt: new Date(Date.now() + DAY) });
    await ImportantLink.create({ label: 'Public form', url: 'https://example.org', status: 'published' });
    await ImportantLink.create({ label: 'Draft link', url: 'https://example.org', status: 'draft' });
    await makeProfile({ displayName: 'Highlight Public', highlighted: true, visibility: 'public' });
    await makeProfile({ displayName: 'Highlight Members', highlighted: true, visibility: 'members' });
    await makeProfile({ displayName: 'Not Highlighted', highlighted: false });

    const res = await anon().get('/api/public/home');
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(Object.keys(d.blocks).sort()).toEqual(['home.stats', 'home.welcome']);
    expect(d.featuredEvent.title).toBe('Featured Raas');
    expect(d.upcomingEvents.map((e: { title: string }) => e.title)).toEqual(['Featured Raas', 'Plain Event']);
    expect(d.announcements.map((a: { title: string }) => a.title)).toEqual(['Pinned News']);
    expect(d.links.map((l: { label: string }) => l.label)).toEqual(['Public form']);
    expect(d.memberHighlights.map((m: { name: string }) => m.name)).toEqual(['Highlight Public']);
    expect(d.settings.name).toBe('Uttar Gujarat Kadva Patidar Samaj');
  });

  it('shows members-level highlights only to signed-in members, and no private fields to anyone', async () => {
    await makeProfile({ displayName: 'Highlight Members', highlighted: true, visibility: 'members', phone: '+91 98250 12345', familySize: 5 });
    expect((await anon().get('/api/public/home')).body.data.memberHighlights).toHaveLength(0);
    const { client } = await signInAs(Roles.MEMBER);
    const res = await client.get('/api/public/home');
    expect(res.body.data.memberHighlights).toHaveLength(1);
    expect(JSON.stringify(res.body.data.memberHighlights)).not.toMatch(/98250|familySize|phone/);
    expect(JSON.stringify(res.body)).not.toContain('98250'); // the member's number appears nowhere
  });

  it('works on an empty site', async () => {
    const res = await anon().get('/api/public/home');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ blocks: {}, featuredEvent: null, upcomingEvents: [], announcements: [], memberHighlights: [], links: [] });
  });

  it('does not expose internal fields in any section', async () => {
    await makeEvent({ title: 'E' + 'vent title', featured: true });
    await makeAnnouncement();
    const dump = JSON.stringify((await anon().get('/api/public/home')).body);
    expect(dump).not.toMatch(/createdBy|updatedBy|isDeleted|registeredCount|passwordHash|ipHash/);
  });
});

describe('organisation settings', () => {
  it('serves public settings with defaults when nothing has been configured', async () => {
    const res = await anon().get('/api/public/settings');
    expect(res.body.data.settings).toMatchObject({ registrationOpen: true, directoryPublic: true, themeDefault: 'system', logoUrl: null });
    expect(JSON.stringify(res.body)).not.toMatch(/_id|createdAt|key/);
  });

  it('is editable by Admin and Super Admin only', async () => {
    expect((await anon().get('/api/admin/settings')).status).toBe(401);
    for (const role of [Roles.MEMBER, Roles.VIEWER, Roles.EDITOR]) {
      const { client } = await signInAs(role);
      expect((await client.get('/api/admin/settings')).status, role).toBe(403);
      expect((await client.patch('/api/admin/settings').send({ name: 'Hijacked' })).status, role).toBe(403);
    }
    for (const role of [Roles.ADMIN, Roles.SUPER_ADMIN]) {
      const { client } = await signInAs(role);
      expect((await client.get('/api/admin/settings')).status).toBe(200);
    }
    expect((await anon().get('/api/public/settings')).body.data.settings.name).not.toBe('Hijacked');
  });

  it('updates details, contact info and social links, and the public site follows', async () => {
    const { client } = await signInAs(Roles.ADMIN);
    const res = await client.patch('/api/admin/settings').send({
      name: 'Uttar Gujarat Kadva Patidar Samaj',
      tagline: 'One family of Maa Umiya',
      footerNote: 'Run by volunteers.',
      contact: { email: 'office@example.org', phone: '+91 2767 000000', address: 'Unjha, Mehsana', officeHours: 'Mon–Sat 10:00–18:00' },
      socialLinks: [{ label: 'Facebook', url: 'https://facebook.com/example' }],
    });
    expect(res.status).toBe(200);
    const pub = (await anon().get('/api/public/settings')).body.data.settings;
    expect(pub).toMatchObject({ tagline: 'One family of Maa Umiya', contact: { email: 'office@example.org', officeHours: 'Mon–Sat 10:00–18:00' } });
    expect(pub.socialLinks).toEqual([{ label: 'Facebook', url: 'https://facebook.com/example' }]);

    // A partial update leaves the rest alone.
    await client.patch('/api/admin/settings').send({ contact: { phone: '+91 1' } });
    const after = (await anon().get('/api/public/settings')).body.data.settings;
    expect(after.contact).toMatchObject({ phone: '+91 1', email: 'office@example.org' });
  });

  it('validates input: markup, unsafe links, unknown theme, bad email', async () => {
    const { client } = await signInAs(Roles.ADMIN);
    for (const body of [
      { name: '<script>x</script>' },
      { contact: { email: 'not-an-email' } },
      { socialLinks: [{ label: 'Bad', url: 'javascript:alert(1)' }] },
      { socialLinks: [{ label: 'Bad', url: 'data:text/html,x' }] },
      { socialLinks: Array.from({ length: 9 }, () => ({ label: 'x', url: 'https://example.org' })) },
      { themeDefault: 'neon' },
      { registrationOpen: 'maybe' },
      { logoMediaId: 'not-an-id' },
    ]) {
      expect((await client.patch('/api/admin/settings').send(body)).status, JSON.stringify(body)).toBe(400);
    }
  });

  it('checks the logo is an existing image', async () => {
    const { client } = await signInAs(Roles.ADMIN);
    const doc = await MediaAsset.create({ storedName: 'a.pdf', originalName: 'a.pdf', mimeType: 'application/pdf', size: 1, kind: 'document' });
    const img = await MediaAsset.create({ storedName: 'a.png', originalName: 'a.png', mimeType: 'image/png', size: 1, kind: 'image' });
    expect((await client.patch('/api/admin/settings').send({ logoMediaId: doc._id })).status).toBe(400);
    expect((await client.patch('/api/admin/settings').send({ logoMediaId: '11111111-1111-4111-8111-111111111111' })).status).toBe(400);
    const ok = await client.patch('/api/admin/settings').send({ logoMediaId: img._id });
    expect(ok.status).toBe(200);
    expect((await anon().get('/api/public/settings')).body.data.settings.logoUrl).toBe(`/api/media/${img._id}`);
  });

  it('ignores fields it does not own', async () => {
    const { client } = await signInAs(Roles.ADMIN);
    await client.patch('/api/admin/settings').send({ key: 'other', _id: 'x', mongoUri: 'mongodb://evil', sessionSecret: 'x', tagline: 'Fine' });
    const docs = await OrganizationSettings.find().lean();
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ key: 'main', tagline: 'Fine' });
    expect(JSON.stringify(docs[0])).not.toMatch(/evil|sessionSecret/);
  });

  it('closing registration blocks new sign-ups, reopening restores them, and the change is audited', async () => {
    const { client } = await signInAs(Roles.ADMIN);
    const register = () =>
      anon().post('/api/auth/register').set('Origin', ORIGIN).send({
        name: 'Late Joiner', email: `late${Math.random().toString(36).slice(2)}@example.test`,
        password: PASSWORD, confirmPassword: PASSWORD, acknowledge: true,
      });

    await client.patch('/api/admin/settings').send({ registrationOpen: false });
    expect((await register()).status).toBe(403);
    expect((await anon().get('/api/public/settings')).body.data.settings.registrationOpen).toBe(false);
    await client.patch('/api/admin/settings').send({ registrationOpen: true });
    expect((await register()).status).toBe(201);

    const entries = await AuditLog.find({ action: 'settings.updated' }).sort({ createdAt: 1 }).lean();
    expect(entries[0]?.metadata).toMatchObject({ registrationOpen: { from: true, to: false } });
  });
});

describe('dashboard', () => {
  const seed = async () => {
    await makeProfile({ membershipStatus: 'active' });
    await makeProfile({ membershipStatus: 'active' });
    await makeProfile({ membershipStatus: 'inactive' });
    await makeUser({ role: Roles.MEMBER, status: AccountStatus.PENDING });
    await makeUser({ role: Roles.MEMBER, status: AccountStatus.PENDING });
    await makeEvent({ registeredCount: 7 });
    await makeEvent({ registeredCount: 3 });
    await makeEvent({ status: 'draft', registeredCount: 50 });
    await makeEvent({ startsAt: new Date(Date.now() - DAY), registeredCount: 99 });
    await makeAnnouncement();
    await makeAnnouncement({ status: 'draft' });
    await ContactMessage.create({ name: 'A B', email: 'a@b.co', message: 'A message long enough.', status: 'new' });
    await ContactMessage.create({ name: 'C D', email: 'c@d.co', message: 'Another message long enough.', status: 'resolved' });
  };

  it('requires staff', async () => {
    expect((await anon().get('/api/admin/dashboard')).status).toBe(401);
    const { client } = await signInAs(Roles.MEMBER);
    expect((await client.get('/api/admin/dashboard')).status).toBe(403);
  });

  it('calculates every metric correctly for a Super Admin', async () => {
    await seed();
    const { client } = await signInAs(Roles.SUPER_ADMIN);
    const s = (await client.get('/api/admin/dashboard')).body.data.stats;
    expect(s).toMatchObject({
      totalMembers: 2,
      pendingRegistrations: 2,
      upcomingEvents: 2,
      eventRsvps: 10,
      publishedAnnouncements: 1,
      unreadContactMessages: 1,
    });
    expect(Array.isArray(s.recentActivity)).toBe(true);
  });

  it('gives a Viewer only what their permissions allow: no contact counts, no activity', async () => {
    await seed();
    const { client } = await signInAs(Roles.VIEWER);
    const s = (await client.get('/api/admin/dashboard')).body.data.stats;
    expect(s).toMatchObject({ totalMembers: 2, upcomingEvents: 2, publishedAnnouncements: 1 });
    expect(s).not.toHaveProperty('unreadContactMessages');
    expect(s).not.toHaveProperty('recentActivity');
  });

  it('gives an Editor event and announcement figures but no member or contact data', async () => {
    await seed();
    const { client } = await signInAs(Roles.EDITOR);
    const s = (await client.get('/api/admin/dashboard')).body.data.stats;
    expect(s).toHaveProperty('upcomingEvents');
    expect(s).toHaveProperty('publishedAnnouncements');
    for (const key of ['totalMembers', 'pendingRegistrations', 'unreadContactMessages', 'recentActivity']) {
      expect(s).not.toHaveProperty(key);
    }
  });

  it('gives Admin contact counts but not the activity feed', async () => {
    await seed();
    const { client } = await signInAs(Roles.ADMIN);
    const s = (await client.get('/api/admin/dashboard')).body.data.stats;
    expect(s.unreadContactMessages).toBe(1);
    expect(s).not.toHaveProperty('recentActivity');
  });

  it('shows recent activity with who and what, but no addresses or request details', async () => {
    const { user, client } = await signInAs(Roles.SUPER_ADMIN);
    await client.post('/api/admin/announcements').send({ title: 'Activity Test', body: 'Body text' });
    const activity = (await client.get('/api/admin/dashboard')).body.data.stats.recentActivity;
    expect(activity[0]).toMatchObject({ action: 'announcement.created', actor: user.name });
    expect(JSON.stringify(activity)).not.toMatch(/127\.0\.0\.1|::1|userAgent|"ip"/);
    expect(activity.map((a: { action: string }) => a.action)).not.toContain('auth.login_failed');
  });
});

describe('audit log viewer', () => {
  it('is for Super Admin only', async () => {
    expect((await anon().get('/api/admin/audit')).status).toBe(401);
    for (const role of [Roles.MEMBER, Roles.VIEWER, Roles.EDITOR, Roles.ADMIN]) {
      const { client } = await signInAs(role);
      expect((await client.get('/api/admin/audit')).status, role).toBe(403);
    }
    const { client } = await signInAs(Roles.SUPER_ADMIN);
    expect((await client.get('/api/admin/audit')).status).toBe(200);
  });

  it('lists newest first with actor details, and filters by action, outcome, actor and date', async () => {
    const { user, client } = await signInAs(Roles.SUPER_ADMIN);
    await client.post('/api/admin/announcements').send({ title: 'Audit One', body: 'text' });
    await anon().post('/api/auth/login').set('Origin', ORIGIN).send({ email: user.email, password: 'wrong-Password-1' });

    const all = await client.get('/api/admin/audit');
    expect(all.body.data.totalCount).toBeGreaterThanOrEqual(3);
    const first = all.body.data.entries[0];
    expect(first).toHaveProperty('createdAt');
    expect(JSON.stringify(all.body)).not.toMatch(/passwordHash|argon2|csrf|"token"/);

    const created = await client.get('/api/admin/audit?action=announcement.created');
    expect(created.body.data.entries[0]).toMatchObject({ action: 'announcement.created', actor: { id: user._id, name: user.name } });
    expect((await client.get('/api/admin/audit?action=announcement.*')).body.data.totalCount).toBe(1);
    expect((await client.get('/api/admin/audit?action=auth.*')).body.data.totalCount).toBeGreaterThanOrEqual(2);
    expect((await client.get('/api/admin/audit?outcome=failure')).body.data.entries.every((e: { outcome: string }) => e.outcome === 'failure')).toBe(true);
    expect((await client.get(`/api/admin/audit?actorId=${user._id}&action=announcement.created`)).body.data.totalCount).toBe(1);
    const future = new Date(Date.now() + DAY).toISOString();
    expect((await client.get(`/api/admin/audit?from=${future}`)).body.data.totalCount).toBe(0);
  });

  it('validates filters and pages results', async () => {
    const { client } = await signInAs(Roles.SUPER_ADMIN);
    expect((await client.get('/api/admin/audit?outcome=maybe')).status).toBe(400);
    expect((await client.get('/api/admin/audit?actorId=nope')).status).toBe(400);
    expect((await client.get('/api/admin/audit?from=yesterday')).status).toBe(400);
    expect((await client.get('/api/admin/audit?action=a%20b%24')).status).toBe(400);
    expect((await client.get('/api/admin/audit?limit=1000')).status).toBe(400);
    for (let i = 0; i < 4; i += 1) await client.post('/api/admin/announcements').send({ title: `Page test ${i}`, body: 'text' });
    const page = await client.get('/api/admin/audit?limit=2&page=2');
    expect(page.body.data.entries).toHaveLength(2);
  });

  it('cannot be altered through the API', async () => {
    const { client } = await signInAs(Roles.SUPER_ADMIN);
    const entry = await AuditLog.findOne().lean();
    for (const res of await Promise.all([
      client.del(`/api/admin/audit/${entry!._id}`),
      client.patch(`/api/admin/audit/${entry!._id}`).send({ action: 'x' }),
      client.post('/api/admin/audit').send({ action: 'forged' }),
    ])) {
      expect(res.status).toBe(404);
    }
    expect(await AuditLog.countDocuments({ action: 'forged' })).toBe(0);
  });
});

describe('global search', () => {
  it('finds published content across types and respects visibility', async () => {
    await makeEvent({ title: 'Diwali Dinner', venue: 'Main Hall' });
    await makeEvent({ title: 'Diwali Draft', status: 'draft' });
    await makeAnnouncement({ title: 'Diwali registrations open' });
    await makeAnnouncement({ title: 'Diwali secret draft', status: 'draft' });
    await makeAnnouncement({ title: 'Diwali later', publishAt: new Date(Date.now() + DAY) });
    await Faq.create({ question: 'Is Diwali dinner free?', answer: 'Children under five eat free.', status: 'published' });
    await Faq.create({ question: 'Diwali hidden?', answer: 'x', status: 'draft' });
    await ImportantLink.create({ label: 'Diwali booking form', url: 'https://example.org', status: 'published' });
    await makeProfile({ displayName: 'Diwali Patel', visibility: 'public' });
    await makeProfile({ displayName: 'Diwali Members', visibility: 'members' });
    await makeProfile({ displayName: 'Diwali Hidden', visibility: 'hidden' });

    const res = await anon().get('/api/search?q=diwali');
    expect(res.status).toBe(200);
    const r = res.body.data.results;
    expect(r.events.map((e: { title: string }) => e.title)).toEqual(['Diwali Dinner']);
    expect(r.announcements.map((a: { title: string }) => a.title)).toEqual(['Diwali registrations open']);
    expect(r.faqs).toHaveLength(1);
    expect(r.links).toHaveLength(1);
    expect(r.members.map((m: { title: string }) => m.title)).toEqual(['Diwali Patel']);

    const { client } = await signInAs(Roles.MEMBER);
    const signedIn = (await client.get('/api/search?q=diwali')).body.data.results;
    expect(signedIn.members.map((m: { title: string }) => m.title).sort()).toEqual(['Diwali Members', 'Diwali Patel']);
  });

  it('never returns private fields for members', async () => {
    await makeProfile({ displayName: 'Searchable Person', phone: '+91 98250 55555', familySize: 9, visibility: 'public' });
    const dump = JSON.stringify((await anon().get('/api/search?q=searchable')).body);
    expect(dump).not.toMatch(/98250|familySize|phone/);
  });

  it('honours the organisation switch for the public directory', async () => {
    await makeProfile({ displayName: 'Directory Person', visibility: 'public' });
    await OrganizationSettings.create({ key: 'main', directoryPublic: false });
    expect((await anon().get('/api/search?q=directory')).body.data.results.members).toHaveLength(0);
    const { client } = await signInAs(Roles.MEMBER);
    expect((await client.get('/api/search?q=directory')).body.data.results.members).toHaveLength(1);
  });

  it('matches text literally and validates the query', async () => {
    await makeEvent({ title: 'Plain title' });
    expect((await anon().get('/api/search?q=.*')).body.data.totalCount).toBe(0);
    expect((await anon().get('/api/search?q=a')).status).toBe(400);
    expect((await anon().get('/api/search')).status).toBe(400);
    expect((await anon().get(`/api/search?q=${'x'.repeat(101)}`)).status).toBe(400);
  });

  it('caps each group at five results', async () => {
    for (let i = 0; i < 8; i += 1) await makeAnnouncement({ title: `Repeated notice ${i}` });
    expect((await anon().get('/api/search?q=repeated')).body.data.results.announcements).toHaveLength(5);
  });

  it('leaves deleted records out', async () => {
    const e = await makeEvent({ title: 'Deleted Thing' });
    await Event.updateOne({ _id: e._id }, { $set: { isDeleted: true } });
    const a = await makeAnnouncement({ title: 'Deleted Thing Too' });
    await Announcement.updateOne({ _id: a._id }, { $set: { isDeleted: true } });
    expect((await anon().get('/api/search?q=deleted')).body.data.totalCount).toBe(0);
  });
});

describe('sessions across features', () => {
  it('a suspended staff account loses dashboard access at once', async () => {
    const staff = await makeUser({ role: Roles.ADMIN });
    const client = await signIn(staff.email);
    expect((await client.get('/api/admin/dashboard')).status).toBe(200);
    const { client: sa } = await signInAs(Roles.SUPER_ADMIN);
    await sa.post(`/api/users/${staff._id}/suspend`).send({});
    expect((await client.get('/api/admin/dashboard')).status).toBe(401);
  });
});
