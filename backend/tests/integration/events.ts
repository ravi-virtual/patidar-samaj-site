import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import AuditLog from '../../src/models/AuditLog';
import Event from '../../src/models/Event';
import { Roles } from '../../src/config/constants';
import {
  DAY,
  anon,
  connectTestDb,
  disconnectTestDb,
  makeEvent,
  resetDb,
  signInAs,
  READ_ONLY_ADMIN_PERMISSIONS,
  DRAFT_ADMIN_PERMISSIONS,
  OPS_ADMIN_PERMISSIONS,
} from '../helpers';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(resetDb);

describe('public event listing', () => {
  it('shows published and cancelled events, never drafts or archived ones', async () => {
    await makeEvent({ title: 'Live One' });
    await makeEvent({ title: 'Cancelled One', status: 'cancelled' });
    await makeEvent({ title: 'Draft One', status: 'draft' });
    await makeEvent({ title: 'Archived One', status: 'archived' });
    const res = await anon().get('/api/events');
    expect(res.status).toBe(200);
    const titles = res.body.data.events.map((e: { title: string }) => e.title).sort();
    expect(titles).toEqual(['Cancelled One', 'Live One']);
    const cancelled = res.body.data.events.find((e: { title: string }) => e.title === 'Cancelled One');
    expect(cancelled.status).toBe('cancelled');
  });

  it('separates upcoming from past and sorts sensibly', async () => {
    await makeEvent({ title: 'Soon', startsAt: new Date(Date.now() + 2 * DAY) });
    await makeEvent({ title: 'Later', startsAt: new Date(Date.now() + 9 * DAY) });
    await makeEvent({ title: 'Old', startsAt: new Date(Date.now() - 3 * DAY) });
    const up = await anon().get('/api/events');
    expect(up.body.data.events.map((e: { title: string }) => e.title)).toEqual(['Soon', 'Later']);
    const past = await anon().get('/api/events?when=past');
    expect(past.body.data.events.map((e: { title: string }) => e.title)).toEqual(['Old']);
  });

  it('filters by category and searches title, description and venue', async () => {
    await makeEvent({ title: 'Diwali Dinner', category: 'Festival', venue: 'Main Hall' });
    await makeEvent({ title: 'Blood Camp', category: 'Seva', description: 'With the district blood bank' });
    expect((await anon().get('/api/events?category=Seva')).body.data.totalCount).toBe(1);
    expect((await anon().get('/api/events?search=diwali')).body.data.events[0].title).toBe('Diwali Dinner');
    expect((await anon().get('/api/events?search=bank')).body.data.events[0].title).toBe('Blood Camp');
    expect((await anon().get('/api/events?search=main%20hall')).body.data.totalCount).toBe(1);
    expect((await anon().get('/api/events?category=Nope')).status).toBe(400);
    expect((await anon().get('/api/events?when=sometime')).status).toBe(400);
  });

  it('pages and reports the total count only', async () => {
    for (let i = 0; i < 5; i += 1) await makeEvent({ startsAt: new Date(Date.now() + (i + 1) * DAY) });
    const res = await anon().get('/api/events?limit=2&page=3');
    expect(res.body.data.events).toHaveLength(1);
    expect(res.body.data.totalCount).toBe(5);
    expect(Object.keys(res.body.data).sort()).toEqual(['events', 'totalCount']);
  });

  it('shows timing and details only, with no registration data, internal fields or authorship', async () => {
    await makeEvent({ title: 'Plain Event', venue: 'Samaj Bhavan', description: 'Details here' });
    const e = (await anon().get('/api/events')).body.data.events[0];
    expect(Object.keys(e).sort()).toEqual(
      [
        'cancellationReason',
        'category',
        'description',
        'endsAt',
        'featured',
        'id',
        'imageMediaId',
        'startsAt',
        'status',
        'title',
        'venue',
      ].sort(),
    );
  });

  it('hides drafts from the detail endpoint too', async () => {
    const draft = await makeEvent({ status: 'draft' });
    const live = await makeEvent();
    expect((await anon().get(`/api/events/${draft._id}`)).status).toBe(404);
    expect((await anon().get(`/api/events/${live._id}`)).status).toBe(200);
    expect((await anon().get('/api/events/not-a-uuid')).status).toBe(400);
  });
});

describe('registration is gone', () => {
  it('has no public register or cancel endpoints', async () => {
    const event = await makeEvent();
    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    expect((await client.post(`/api/events/${event._id}/register`).send({})).status).toBe(404);
    expect((await client.del(`/api/events/${event._id}/register`)).status).toBe(404);
  });

  it('has no admin registration endpoints', async () => {
    const event = await makeEvent();
    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    expect((await client.get(`/api/admin/events/${event._id}/registrations`)).status).toBe(404);
    expect((await client.get(`/api/admin/events/${event._id}/registrations/export`)).status).toBe(404);
  });
});

describe('staff event management', () => {
  const payload = (over: Record<string, unknown> = {}) => ({
    title: 'Sharad Purnima Raas',
    category: 'Festival',
    description: 'Raas-garba under the full moon.',
    venue: 'Samaj Bhavan lawns',
    startsAt: new Date(Date.now() + 10 * DAY).toISOString(),
    ...over,
  });

  it('keeps every admin event endpoint closed to visitors, members and unauthorised staff', async () => {
    const event = await makeEvent();
    expect((await anon().get('/api/admin/events')).status).toBe(401);
    const { client: member } = await signInAs(Roles.ADMIN, { permissions: [] });
    for (const res of await Promise.all([
      member.get('/api/admin/events'),
      member.post('/api/admin/events').send(payload()),
      member.patch(`/api/admin/events/${event._id}`).send({ title: 'Hacked' }),
      member.post(`/api/admin/events/${event._id}/publish`),
      member.del(`/api/admin/events/${event._id}`),
    ])) {
      expect(res.status).toBe(403);
    }
  });

  it('lets a Viewer read but not change anything', async () => {
    const event = await makeEvent({ status: 'draft' });
    const { client } = await signInAs(Roles.ADMIN, { permissions: READ_ONLY_ADMIN_PERMISSIONS });
    expect((await client.get('/api/admin/events')).body.data.totalCount).toBe(1);
    expect((await client.post('/api/admin/events').send(payload())).status).toBe(403);
    expect((await client.patch(`/api/admin/events/${event._id}`).send({ title: 'Nope Nope' })).status).toBe(403);
    expect((await client.post(`/api/admin/events/${event._id}/publish`)).status).toBe(403);
  });

  it('creates events as drafts and ignores status and authorship from the request', async () => {
    const { user, client } = await signInAs(Roles.ADMIN, { permissions: DRAFT_ADMIN_PERMISSIONS });
    const res = await client.post('/api/admin/events').send(
      payload({ status: 'published', createdBy: 'someone', isDeleted: true }),
    );
    expect(res.status).toBe(201);
    expect(res.body.data.event.status).toBe('draft');
    const stored = await Event.findById(res.body.data.event.id).lean();
    expect(stored).toMatchObject({ status: 'draft', createdBy: user._id, isDeleted: false });
    expect((await anon().get('/api/events')).body.data.totalCount).toBe(0);
  });

  it('validates the event fields and the schedule', async () => {
    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    const bad = [
      payload({ title: 'x' }),
      payload({ venue: '' }),
      payload({ startsAt: 'tomorrow-ish' }),
      payload({ category: 'Rave' }),
      payload({ title: '<script>alert(1)</script>' }),
      payload({ endsAt: new Date(Date.now() + 9 * DAY).toISOString() }), // ends before it starts
    ];
    for (const body of bad) expect((await client.post('/api/admin/events').send(body)).status).toBe(400);
    expect(await Event.countDocuments()).toBe(0);
  });

  it('runs the full lifecycle: draft → published → visible → cancelled → archived', async () => {
    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    const created = await client.post('/api/admin/events').send(payload());
    const id = created.body.data.event.id as string;

    expect((await client.post(`/api/admin/events/${id}/publish`)).status).toBe(200);
    expect((await anon().get('/api/events')).body.data.events[0].title).toBe('Sharad Purnima Raas');
    expect((await client.post(`/api/admin/events/${id}/publish`)).status).toBe(409); // already published

    const cancelled = await client.post(`/api/admin/events/${id}/cancel`).send({ reason: 'Rain forecast' });
    expect(cancelled.status).toBe(200);
    const publicView = (await anon().get(`/api/events/${id}`)).body.data.event;
    expect(publicView).toMatchObject({ status: 'cancelled', cancellationReason: 'Rain forecast' });

    expect((await client.post(`/api/admin/events/${id}/archive`)).status).toBe(200);
    expect((await anon().get(`/api/events/${id}`)).status).toBe(404);

    const actions = (await AuditLog.find({ targetId: id }).lean()).map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['event.created', 'event.published', 'event.cancelled', 'event.archived']));
  });

  it('unpublishes a published event back to a draft', async () => {
    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    const event = await makeEvent();
    expect((await client.post(`/api/admin/events/${event._id}/unpublish`)).status).toBe(200);
    expect((await anon().get(`/api/events/${event._id}`)).status).toBe(404);
  });

  it('soft-deletes an event', async () => {
    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    const event = await makeEvent({ status: 'draft' });
    expect((await client.del(`/api/admin/events/${event._id}`)).status).toBe(200);
    expect((await Event.findById(event._id).lean())?.isDeleted).toBe(true);
    expect((await client.get(`/api/admin/events/${event._id}`)).status).toBe(404);
  });

  it('checks the merged schedule on partial updates', async () => {
    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    const event = await makeEvent({ startsAt: new Date(Date.now() + 5 * DAY), endsAt: new Date(Date.now() + 6 * DAY) });
    // Moving the start after the existing end would leave the event ending before it starts.
    const res = await client.patch(`/api/admin/events/${event._id}`).send({ startsAt: new Date(Date.now() + 8 * DAY).toISOString() });
    expect(res.status).toBe(400);
  });

  it('applies the draft-only rule to Editors, and lets a granted publisher edit live events', async () => {
    const draft = await makeEvent({ status: 'draft' });
    const live = await makeEvent();
    const { client: editor } = await signInAs(Roles.ADMIN, { permissions: DRAFT_ADMIN_PERMISSIONS });
    expect((await editor.patch(`/api/admin/events/${draft._id}`).send({ title: 'Edited Draft' })).status).toBe(200);
    expect((await editor.patch(`/api/admin/events/${live._id}`).send({ title: 'Edited Live' })).status).toBe(403);
    expect((await editor.post(`/api/admin/events/${draft._id}/publish`)).status).toBe(403);
    expect((await editor.patch(`/api/admin/events/${draft._id}`).send({ featured: true })).status).toBe(403);
    expect((await Event.findById(live._id).lean())?.title).not.toBe('Edited Live');

    const { client: granted } = await signInAs(Roles.ADMIN, { permissions: [...DRAFT_ADMIN_PERMISSIONS, ...['events.publish']] });
    expect((await granted.patch(`/api/admin/events/${live._id}`).send({ title: 'Edited Live' })).status).toBe(200);
    expect((await granted.post(`/api/admin/events/${draft._id}/publish`)).status).toBe(200);
  });
});
