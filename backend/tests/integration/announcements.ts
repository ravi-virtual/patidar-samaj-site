import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Announcement from '../../src/models/Announcement';
import AuditLog from '../../src/models/AuditLog';
import { Roles } from '../../src/config/constants';
import {
  DAY,
  anon,
  connectTestDb,
  disconnectTestDb,
  makeAnnouncement,
  resetDb,
  signInAs,
  READ_ONLY_ADMIN_PERMISSIONS,
  DRAFT_ADMIN_PERMISSIONS,
  OPS_ADMIN_PERMISSIONS,
} from '../helpers';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(resetDb);

const titles = (res: { body: { data: { announcements: { title: string }[] } } }) =>
  res.body.data.announcements.map((a) => a.title);

describe('public announcements', () => {
  it('shows only published announcements that are due', async () => {
    await makeAnnouncement({ title: 'Live Now' });
    await makeAnnouncement({ title: 'Still Draft', status: 'draft' });
    await makeAnnouncement({ title: 'Scheduled Later', publishAt: new Date(Date.now() + DAY) });
    await makeAnnouncement({ title: 'In Archive', status: 'archived' });
    const res = await anon().get('/api/announcements');
    expect(res.status).toBe(200);
    expect(titles(res)).toEqual(['Live Now']);
  });

  it('shows a scheduled announcement once its time has passed', async () => {
    const item = await makeAnnouncement({ title: 'Due Soon', publishAt: new Date(Date.now() + DAY) });
    expect(titles(await anon().get('/api/announcements'))).toEqual([]);
    await Announcement.updateOne({ _id: item._id }, { $set: { publishAt: new Date(Date.now() - 1000) } });
    expect(titles(await anon().get('/api/announcements'))).toEqual(['Due Soon']);
  });

  it('puts pinned announcements first, in their chosen order, then newest first', async () => {
    await makeAnnouncement({ title: 'Old', publishAt: new Date(Date.now() - 5 * DAY) });
    await makeAnnouncement({ title: 'New', publishAt: new Date(Date.now() - 1 * DAY) });
    await makeAnnouncement({ title: 'Pinned B', pinned: true, order: 2 });
    await makeAnnouncement({ title: 'Pinned A', pinned: true, order: 1 });
    expect(titles(await anon().get('/api/announcements'))).toEqual(['Pinned A', 'Pinned B', 'New', 'Old']);
  });

  it('filters by category, searches text and pages with a total count', async () => {
    await makeAnnouncement({ title: 'Scholarship results', category: 'Education', body: 'Thirty-eight students' });
    await makeAnnouncement({ title: 'Blood camp', category: 'Seva' });
    await makeAnnouncement({ title: 'Renewals', category: 'Notice', body: 'Renew from your profile' });
    expect(titles(await anon().get('/api/announcements?category=Education'))).toEqual(['Scholarship results']);
    expect(titles(await anon().get('/api/announcements?search=thirty'))).toEqual(['Scholarship results']);
    expect(titles(await anon().get('/api/announcements?search=PROFILE'))).toEqual(['Renewals']);
    const page = await anon().get('/api/announcements?limit=2&page=2');
    expect(page.body.data.announcements).toHaveLength(1);
    expect(page.body.data.totalCount).toBe(3);
    expect((await anon().get('/api/announcements?category=Nope')).status).toBe(400);
    expect((await anon().get('/api/announcements?limit=1000')).status).toBe(400);
  });

  it('serves the archive separately', async () => {
    await makeAnnouncement({ title: 'Current' });
    await makeAnnouncement({ title: 'Last Year', status: 'archived' });
    expect(titles(await anon().get('/api/announcements?archived=true'))).toEqual(['Last Year']);
    expect(titles(await anon().get('/api/announcements'))).toEqual(['Current']);
  });

  it('lists a summary (or an excerpt) and keeps the full text for the detail view', async () => {
    const long = 'word '.repeat(100);
    const a = await makeAnnouncement({ title: 'With Summary', summary: 'Short summary', body: long });
    const b = await makeAnnouncement({ title: 'No Summary', body: long });
    const list = await anon().get('/api/announcements');
    const byTitle = Object.fromEntries(list.body.data.announcements.map((x: { title: string }) => [x.title, x]));
    expect(byTitle['With Summary'].summary).toBe('Short summary');
    expect(byTitle['No Summary'].summary.length).toBeLessThan(long.length);
    expect(byTitle['No Summary'].summary).toMatch(/…$/);
    expect(byTitle['With Summary']).not.toHaveProperty('body');

    const detail = await anon().get(`/api/announcements/${a._id}`);
    expect(detail.body.data.announcement.body).toBe(long.trim());
    expect((await anon().get(`/api/announcements/${b._id}`)).status).toBe(200);
  });

  it('returns 404 for drafts, scheduled and deleted items, and 400 for bad ids', async () => {
    const draft = await makeAnnouncement({ status: 'draft' });
    const later = await makeAnnouncement({ publishAt: new Date(Date.now() + DAY) });
    const gone = await makeAnnouncement();
    await Announcement.updateOne({ _id: gone._id }, { $set: { isDeleted: true } });
    for (const item of [draft, later, gone]) expect((await anon().get(`/api/announcements/${item._id}`)).status).toBe(404);
    expect((await anon().get('/api/announcements/nope')).status).toBe(400);
  });

  it('does not expose authorship, status or internal fields', async () => {
    await makeAnnouncement();
    const a = (await anon().get('/api/announcements')).body.data.announcements[0];
    for (const key of ['createdBy', 'updatedBy', 'status', 'isDeleted', 'order', '_id']) expect(a).not.toHaveProperty(key);
  });
});

describe('announcement management permissions', () => {
  it('closes every admin endpoint to visitors and members', async () => {
    const item = await makeAnnouncement({ status: 'draft' });
    expect((await anon().get('/api/admin/announcements')).status).toBe(401);
    const { client: member } = await signInAs(Roles.ADMIN, { permissions: [] });
    for (const res of await Promise.all([
      member.get('/api/admin/announcements'),
      member.post('/api/admin/announcements').send({ title: 'Nope', body: 'x' }),
      member.patch(`/api/admin/announcements/${item._id}`).send({ title: 'Nope' }),
      member.post(`/api/admin/announcements/${item._id}/publish`),
      member.del(`/api/admin/announcements/${item._id}`),
    ])) {
      expect(res.status).toBe(403);
    }
  });

  it('gives Viewers read-only access', async () => {
    const item = await makeAnnouncement({ status: 'draft' });
    const { client } = await signInAs(Roles.ADMIN, { permissions: READ_ONLY_ADMIN_PERMISSIONS });
    expect((await client.get('/api/admin/announcements')).body.data.totalCount).toBe(1);
    expect((await client.get(`/api/admin/announcements/${item._id}`)).status).toBe(200);
    for (const res of await Promise.all([
      client.post('/api/admin/announcements').send({ title: 'Nope Nope', body: 'x' }),
      client.patch(`/api/admin/announcements/${item._id}`).send({ title: 'Nope Nope' }),
      client.post(`/api/admin/announcements/${item._id}/publish`),
      client.post(`/api/admin/announcements/${item._id}/pin`),
      client.del(`/api/admin/announcements/${item._id}`),
    ])) {
      expect(res.status).toBe(403);
    }
  });

  it('lets Editors write drafts but not publish, pin, feature, delete or edit live items', async () => {
    const draft = await makeAnnouncement({ status: 'draft', title: 'Editor Draft' });
    const live = await makeAnnouncement({ title: 'Live Item' });
    const { user, client } = await signInAs(Roles.ADMIN, { permissions: DRAFT_ADMIN_PERMISSIONS });

    const created = await client.post('/api/admin/announcements').send({ title: 'My Draft', body: 'Text', status: 'published', pinned: true, order: -5, createdBy: 'x' });
    expect(created.status).toBe(201);
    expect(created.body.data.announcement).toMatchObject({ status: 'draft', pinned: false, order: 0, createdBy: user._id });

    expect((await client.patch(`/api/admin/announcements/${draft._id}`).send({ title: 'Edited Draft' })).status).toBe(200);
    expect((await client.patch(`/api/admin/announcements/${live._id}`).send({ title: 'Hijacked' })).status).toBe(403);
    expect((await client.patch(`/api/admin/announcements/${draft._id}`).send({ featured: true })).status).toBe(403);
    for (const path of ['publish', 'pin', 'archive', 'unpublish']) {
      expect((await client.post(`/api/admin/announcements/${draft._id}/${path}`)).status).toBe(403);
    }
    expect((await client.del(`/api/admin/announcements/${draft._id}`)).status).toBe(403);
    expect((await client.patch('/api/admin/announcements/reorder').send({ ids: [draft._id] })).status).toBe(403);
    expect((await Announcement.findById(live._id).lean())?.title).toBe('Live Item');
    expect((await anon().get('/api/announcements')).body.data.totalCount).toBe(1); // only the live one
  });

  it('lets an Editor with the publish permission granted do everything except delete', async () => {
    const draft = await makeAnnouncement({ status: 'draft' });
    const { client } = await signInAs(Roles.ADMIN, { permissions: [...DRAFT_ADMIN_PERMISSIONS, ...['announcements.publish']] });
    expect((await client.post(`/api/admin/announcements/${draft._id}/publish`)).status).toBe(200);
    expect((await client.post(`/api/admin/announcements/${draft._id}/pin`)).status).toBe(200);
    expect((await client.del(`/api/admin/announcements/${draft._id}`)).status).toBe(403);
  });
});

describe('announcement lifecycle (Admin)', () => {
  it('runs create → publish → pin → archive → unpublish with the public site following each step', async () => {
    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    const created = await client.post('/api/admin/announcements').send({ title: 'Diwali Dinner', body: 'Register by 1 November.', category: 'Event', summary: 'Register now' });
    const id = created.body.data.announcement.id as string;
    expect(titles(await anon().get('/api/announcements'))).toEqual([]);

    expect((await client.post(`/api/admin/announcements/${id}/publish`)).status).toBe(200);
    expect(titles(await anon().get('/api/announcements'))).toEqual(['Diwali Dinner']);
    expect((await client.post(`/api/admin/announcements/${id}/publish`)).status).toBe(409); // already published

    await makeAnnouncement({ title: 'Newer Item' });
    expect((await client.post(`/api/admin/announcements/${id}/pin`)).status).toBe(200);
    const pinnedList = (await anon().get('/api/announcements')).body.data.announcements;
    expect(pinnedList[0]).toMatchObject({ title: 'Diwali Dinner', pinned: true });
    expect((await client.post(`/api/admin/announcements/${id}/unpin`)).status).toBe(200);
    const unpinned = (await anon().get('/api/announcements')).body.data.announcements;
    expect(unpinned.find((a: { title: string }) => a.title === 'Diwali Dinner').pinned).toBe(false);

    expect((await client.post(`/api/admin/announcements/${id}/archive`)).status).toBe(200);
    expect(titles(await anon().get('/api/announcements'))).not.toContain('Diwali Dinner');
    expect(titles(await anon().get('/api/announcements?archived=true'))).toEqual(['Diwali Dinner']);

    expect((await client.post(`/api/admin/announcements/${id}/unpublish`)).status).toBe(200);
    expect((await anon().get(`/api/announcements/${id}`)).status).toBe(404);

    const actions = (await AuditLog.find({ targetId: id }).lean()).map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['announcement.created', 'announcement.published', 'announcement.pinned', 'announcement.archived', 'announcement.unpublished']));
  });

  it('only pins published announcements and clears the pin on archive', async () => {
    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    const draft = await makeAnnouncement({ status: 'draft' });
    expect((await client.post(`/api/admin/announcements/${draft._id}/pin`)).status).toBe(409);
    const live = await makeAnnouncement({ pinned: true });
    await client.post(`/api/admin/announcements/${live._id}/archive`);
    expect((await Announcement.findById(live._id).lean())?.pinned).toBe(false);
  });

  it('schedules publication for the future', async () => {
    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    const draft = await makeAnnouncement({ status: 'draft', publishAt: undefined });
    const when = new Date(Date.now() + 2 * DAY).toISOString();
    const res = await client.post(`/api/admin/announcements/${draft._id}/publish`).send({ publishAt: when });
    expect(res.status).toBe(200);
    expect(res.body.data.announcement.scheduled).toBe(true);
    expect(titles(await anon().get('/api/announcements'))).toEqual([]);
    expect((await anon().get(`/api/announcements/${draft._id}`)).status).toBe(404);
    expect((await client.post(`/api/admin/announcements/${draft._id}/publish`).send({ publishAt: when })).status).toBe(409); // already published
  });

  it('rejects an invalid schedule date', async () => {
    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    const draft = await makeAnnouncement({ status: 'draft', publishAt: undefined });
    expect((await client.post(`/api/admin/announcements/${draft._id}/publish`).send({ publishAt: 'next tuesday' })).status).toBe(400);
  });

  it('saves a new display order and ignores unknown ids', async () => {
    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    const a = await makeAnnouncement({ title: 'First', pinned: true });
    const b = await makeAnnouncement({ title: 'Second', pinned: true });
    const c = await makeAnnouncement({ title: 'Third', pinned: true });
    const res = await client.patch('/api/admin/announcements/reorder').send({ ids: [c._id, a._id, b._id, '11111111-1111-4111-8111-111111111111'] });
    expect(res.status).toBe(200);
    expect(titles(await anon().get('/api/announcements'))).toEqual(['Third', 'First', 'Second']);
    expect((await client.patch('/api/admin/announcements/reorder').send({ ids: ['not-an-id'] })).status).toBe(400);
    expect((await client.patch('/api/admin/announcements/reorder').send({ ids: [] })).status).toBe(400);
  });

  it('soft-deletes and then hides the announcement everywhere', async () => {
    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    const item = await makeAnnouncement({ pinned: true });
    expect((await client.del(`/api/admin/announcements/${item._id}`)).status).toBe(200);
    expect((await Announcement.findById(item._id).lean())?.isDeleted).toBe(true);
    expect((await anon().get(`/api/announcements/${item._id}`)).status).toBe(404);
    expect((await client.get(`/api/admin/announcements/${item._id}`)).status).toBe(404);
    expect((await client.get('/api/admin/announcements')).body.data.totalCount).toBe(0);
  });

  it('filters the staff list by status, category and search', async () => {
    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    await makeAnnouncement({ title: 'Draft Notice', status: 'draft' });
    await makeAnnouncement({ title: 'Live Seva', category: 'Seva' });
    await makeAnnouncement({ title: 'Archived Thing', status: 'archived' });
    expect((await client.get('/api/admin/announcements')).body.data.totalCount).toBe(3);
    expect((await client.get('/api/admin/announcements?status=draft')).body.data.announcements[0].title).toBe('Draft Notice');
    expect((await client.get('/api/admin/announcements?category=Seva')).body.data.totalCount).toBe(1);
    expect((await client.get('/api/admin/announcements?search=archived')).body.data.totalCount).toBe(1);
  });

  it('validates content: plain text only, lengths and categories', async () => {
    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    const bad = [
      { title: 'ab', body: 'text' },
      { title: 'Good title', body: '' },
      { title: 'Good title' },
      { title: '<b>Bold</b>', body: 'text' },
      { title: 'Good title', body: '<script>alert(1)</script>' },
      { title: 'Good title', body: 'text', category: 'Gossip' },
      { title: 'Good title', body: 'x'.repeat(8001) },
      { title: 'Good title', body: 'text', publishAt: 'whenever' },
      { title: { $ne: 1 }, body: 'text' },
    ];
    for (const body of bad) expect((await client.post('/api/admin/announcements').send(body)).status).toBe(400);
    expect(await Announcement.countDocuments()).toBe(0);
  });
});
