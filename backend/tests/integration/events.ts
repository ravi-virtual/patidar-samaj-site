import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import AuditLog from '../../src/models/AuditLog';
import Event from '../../src/models/Event';
import EventRegistration from '../../src/models/EventRegistration';
import { Roles } from '../../src/config/constants';
import { registrationState } from '../../src/utils/eventView';
import {
  DAY,
  ORIGIN,
  anon,
  connectTestDb,
  disconnectTestDb,
  makeEvent,
  makeUser,
  resetDb,
  signIn,
  signInAs,
} from '../helpers';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(resetDb);

const members = async (n: number) => {
  const clients = [];
  for (let i = 0; i < n; i += 1) clients.push(await signIn((await makeUser()).email));
  return clients;
};

describe('registrationState (pure rules)', () => {
  const base = { status: 'published', startsAt: new Date(Date.now() + DAY), capacity: 0, registeredCount: 0 } as never;
  it('reports each situation', () => {
    expect(registrationState(base)).toBe('open');
    expect(registrationState({ ...(base as object), status: 'cancelled' } as never)).toBe('cancelled');
    expect(registrationState({ ...(base as object), status: 'draft' } as never)).toBe('unavailable');
    expect(registrationState({ ...(base as object), startsAt: new Date(Date.now() - 1000) } as never)).toBe('past');
    expect(registrationState({ ...(base as object), registrationOpensAt: new Date(Date.now() + 1000) } as never)).toBe('not_yet_open');
    expect(registrationState({ ...(base as object), registrationClosesAt: new Date(Date.now() - 1000) } as never)).toBe('closed');
    expect(registrationState({ ...(base as object), capacity: 5, registeredCount: 5 } as never)).toBe('full');
    expect(registrationState({ ...(base as object), capacity: 5, registeredCount: 4 } as never)).toBe('open');
  });
});

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
    expect(cancelled.registrationState).toBe('cancelled');
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

  it('shows remaining capacity but no internal counters or authorship', async () => {
    await makeEvent({ title: 'Limited', capacity: 10, registeredCount: 4 });
    const e = (await anon().get('/api/events')).body.data.events[0];
    expect(e.spotsLeft).toBe(6);
    expect(e.registrationState).toBe('open');
    for (const key of ['registeredCount', 'createdBy', 'updatedBy', 'isDeleted', '_id']) expect(e).not.toHaveProperty(key);
    expect(e).not.toHaveProperty('myRegistration'); // visitors get no personal data
  });

  it('returns spotsLeft null for unlimited events and "full" when nothing is left', async () => {
    await makeEvent({ title: 'Unlimited', capacity: 0 });
    await makeEvent({ title: 'Full', capacity: 2, registeredCount: 2 });
    const events = (await anon().get('/api/events?sort=x')).body.data.events;
    const byTitle = Object.fromEntries(events.map((e: { title: string }) => [e.title, e]));
    expect(byTitle.Unlimited.spotsLeft).toBeNull();
    expect(byTitle.Full.spotsLeft).toBe(0);
    expect(byTitle.Full.registrationState).toBe('full');
  });

  it('hides drafts from the detail endpoint too', async () => {
    const draft = await makeEvent({ status: 'draft' });
    const live = await makeEvent();
    expect((await anon().get(`/api/events/${draft._id}`)).status).toBe(404);
    expect((await anon().get(`/api/events/${live._id}`)).status).toBe(200);
    expect((await anon().get('/api/events/not-a-uuid')).status).toBe(400);
  });

  it('adds the signed-in member’s own registration to listings', async () => {
    const event = await makeEvent();
    const [client] = await members(1);
    await client!.post(`/api/events/${event._id}/rsvp`).send({ attendees: 2 });
    const list = await client!.get('/api/events');
    expect(list.body.data.events[0].myRegistration).toEqual({ attendees: 2 });
    const detail = await client!.get(`/api/events/${event._id}`);
    expect(detail.body.data.event.myRegistration).toEqual({ attendees: 2 });
  });
});

describe('RSVP rules', () => {
  it('requires sign-in and the CSRF token', async () => {
    const event = await makeEvent();
    expect((await anon().post(`/api/events/${event._id}/rsvp`).set('Origin', ORIGIN).send({})).status).toBe(401);
    const [client] = await members(1);
    const noCsrf = await client!.agent.post(`/api/events/${event._id}/rsvp`).set('Origin', ORIGIN).send({});
    expect(noCsrf.status).toBe(403);
  });

  it('registers, counts places and prevents duplicates', async () => {
    const event = await makeEvent({ capacity: 10 });
    const [client] = await members(1);
    const ok = await client!.post(`/api/events/${event._id}/rsvp`).send({ attendees: 3 });
    expect(ok.status).toBe(201);
    expect(ok.body.data.event.spotsLeft).toBe(7);
    expect(ok.body.data.event.myRegistration).toEqual({ attendees: 3 });

    const again = await client!.post(`/api/events/${event._id}/rsvp`).send({ attendees: 1 });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_REGISTERED');
    expect((await Event.findById(event._id).lean())?.registeredCount).toBe(3);
    expect(await EventRegistration.countDocuments({ eventId: event._id })).toBe(1);
  });

  it('defaults to one attendee and validates the number', async () => {
    const event = await makeEvent();
    const [a, b, c] = await members(3);
    expect((await a!.post(`/api/events/${event._id}/rsvp`).send({})).status).toBe(201);
    expect((await Event.findById(event._id).lean())?.registeredCount).toBe(1);
    expect((await b!.post(`/api/events/${event._id}/rsvp`).send({ attendees: 0 })).status).toBe(400);
    expect((await c!.post(`/api/events/${event._id}/rsvp`).send({ attendees: 11 })).status).toBe(400);
    expect((await c!.post(`/api/events/${event._id}/rsvp`).send({ attendees: 'many' })).status).toBe(400);
  });

  it('refuses when there are not enough places, leaving the count untouched', async () => {
    const event = await makeEvent({ capacity: 4, registeredCount: 2 });
    const [client] = await members(1);
    const tooMany = await client!.post(`/api/events/${event._id}/rsvp`).send({ attendees: 3 });
    expect(tooMany.status).toBe(409);
    expect(tooMany.body.error.code).toBe('EVENT_FULL');
    expect((await Event.findById(event._id).lean())?.registeredCount).toBe(2);
    expect(await EventRegistration.countDocuments()).toBe(0);
    expect((await client!.post(`/api/events/${event._id}/rsvp`).send({ attendees: 2 })).status).toBe(201);
  });

  it('allows unlimited events to take any number of registrations', async () => {
    const event = await makeEvent({ capacity: 0 });
    const clients = await members(3);
    for (const c of clients) expect((await c.post(`/api/events/${event._id}/rsvp`).send({ attendees: 10 })).status).toBe(201);
    expect((await Event.findById(event._id).lean())?.registeredCount).toBe(30);
  });

  it.each([
    ['a cancelled event', { status: 'cancelled' as const }],
    ['a draft', { status: 'draft' as const }],
    ['an event that has started', { startsAt: new Date(Date.now() - 1000) }],
    ['one whose registration has closed', { registrationClosesAt: new Date(Date.now() - 1000) }],
    ['one whose registration has not opened', { registrationOpensAt: new Date(Date.now() + DAY) }],
  ])('refuses registration for %s', async (_label, over) => {
    const event = await makeEvent(over);
    const [client] = await members(1);
    const res = await client!.post(`/api/events/${event._id}/rsvp`).send({});
    expect([404, 409]).toContain(res.status);
    expect(await EventRegistration.countDocuments()).toBe(0);
    expect((await Event.findById(event._id).lean())?.registeredCount).toBe(0);
  });

  it('cancels, frees the places and lets the member register again', async () => {
    const event = await makeEvent({ capacity: 5 });
    const [client] = await members(1);
    await client!.post(`/api/events/${event._id}/rsvp`).send({ attendees: 4 });
    const cancel = await client!.del(`/api/events/${event._id}/rsvp`);
    expect(cancel.status).toBe(200);
    expect(cancel.body.data.event.spotsLeft).toBe(5);
    expect((await Event.findById(event._id).lean())?.registeredCount).toBe(0);

    const again = await client!.post(`/api/events/${event._id}/rsvp`).send({ attendees: 2 });
    expect(again.status).toBe(201);
    expect(again.body.data.event.spotsLeft).toBe(3);
    expect(await EventRegistration.countDocuments({ eventId: event._id })).toBe(1); // revived, not duplicated
  });

  it('cannot cancel what was never booked, or after the event has started', async () => {
    const event = await makeEvent();
    const [client] = await members(1);
    expect((await client!.del(`/api/events/${event._id}/rsvp`)).status).toBe(404);
    const started = await makeEvent({ startsAt: new Date(Date.now() - 1000) });
    expect((await client!.del(`/api/events/${started._id}/rsvp`)).status).toBe(409);
  });

  it('lists only the member’s own registrations', async () => {
    const a = await makeEvent({ title: 'Event Alpha' });
    const b = await makeEvent({ title: 'Event Beta' });
    const [alice, bob] = await members(2);
    await alice!.post(`/api/events/${a._id}/rsvp`).send({});
    await bob!.post(`/api/events/${b._id}/rsvp`).send({});
    const mine = await alice!.get('/api/members/me/registrations');
    expect(mine.body.data.totalCount).toBe(1);
    expect(mine.body.data.registrations[0].event.title).toBe('Event Alpha');
    expect(JSON.stringify(mine.body)).not.toContain('Event Beta');
    expect((await anon().get('/api/members/me/registrations')).status).toBe(401);
  });
});

describe('concurrent registrations never overbook', () => {
  it('20 members racing for 5 places: exactly 5 succeed', async () => {
    const event = await makeEvent({ capacity: 5 });
    const clients = await members(20);
    const results = await Promise.all(clients.map((c) => c.post(`/api/events/${event._id}/rsvp`).send({ attendees: 1 })));

    const ok = results.filter((r) => r.status === 201).length;
    const full = results.filter((r) => r.status === 409 && r.body.error.code === 'EVENT_FULL').length;
    expect(ok).toBe(5);
    expect(full).toBe(15);
    expect((await Event.findById(event._id).lean())?.registeredCount).toBe(5);
    expect(await EventRegistration.countDocuments({ eventId: event._id, status: 'confirmed' })).toBe(5);
  });

  it('groups of 3 racing for 10 places: never more than 10 taken', async () => {
    const event = await makeEvent({ capacity: 10 });
    const clients = await members(8);
    const results = await Promise.all(clients.map((c) => c.post(`/api/events/${event._id}/rsvp`).send({ attendees: 3 })));
    const ok = results.filter((r) => r.status === 201).length;
    expect(ok).toBe(3); // 3 × 3 = 9 ≤ 10; a fourth group would make 12
    const taken = (await Event.findById(event._id).lean())!.registeredCount;
    expect(taken).toBe(9);
    const confirmed = await EventRegistration.find({ eventId: event._id, status: 'confirmed' }).lean();
    expect(confirmed.reduce((sum, r) => sum + r.attendees, 0)).toBe(taken);
  });

  it('one member sending the same RSVP 8 times at once registers exactly once', async () => {
    const event = await makeEvent({ capacity: 20 });
    const [client] = await members(1);
    const results = await Promise.all(Array.from({ length: 8 }, () => client!.post(`/api/events/${event._id}/rsvp`).send({ attendees: 2 })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(7);
    expect((await Event.findById(event._id).lean())?.registeredCount).toBe(2); // no leaked reservations
    expect(await EventRegistration.countDocuments({ eventId: event._id })).toBe(1);
  });

  it('double-clicking Cancel frees the places only once', async () => {
    const event = await makeEvent({ capacity: 10 });
    const [client, other] = await members(2);
    await client!.post(`/api/events/${event._id}/rsvp`).send({ attendees: 3 });
    await other!.post(`/api/events/${event._id}/rsvp`).send({ attendees: 2 });
    const results = await Promise.all(Array.from({ length: 5 }, () => client!.del(`/api/events/${event._id}/rsvp`)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect((await Event.findById(event._id).lean())?.registeredCount).toBe(2);
  });

  it('a freed place can be taken again, and the count stays exact after many cycles', async () => {
    const event = await makeEvent({ capacity: 3 });
    const clients = await members(6);
    for (let round = 0; round < 3; round += 1) {
      await Promise.all(clients.map((c) => c.post(`/api/events/${event._id}/rsvp`).send({})));
      expect((await Event.findById(event._id).lean())?.registeredCount).toBe(3);
      await Promise.all(clients.map((c) => c.del(`/api/events/${event._id}/rsvp`)));
      expect((await Event.findById(event._id).lean())?.registeredCount).toBe(0);
    }
  });
});

describe('staff event management', () => {
  const payload = (over: Record<string, unknown> = {}) => ({
    title: 'Sharad Purnima Raas',
    category: 'Festival',
    description: 'Raas-garba under the full moon.',
    venue: 'Samaj Bhavan lawns',
    startsAt: new Date(Date.now() + 10 * DAY).toISOString(),
    capacity: 100,
    ...over,
  });

  it('keeps every admin event endpoint closed to visitors, members and unauthorised staff', async () => {
    const event = await makeEvent();
    expect((await anon().get('/api/admin/events')).status).toBe(401);
    const { client: member } = await signInAs(Roles.MEMBER);
    for (const res of await Promise.all([
      member.get('/api/admin/events'),
      member.post('/api/admin/events').send(payload()),
      member.patch(`/api/admin/events/${event._id}`).send({ title: 'Hacked' }),
      member.post(`/api/admin/events/${event._id}/publish`),
      member.del(`/api/admin/events/${event._id}`),
      member.get(`/api/admin/events/${event._id}/registrations`),
    ])) {
      expect(res.status).toBe(403);
    }
  });

  it('lets a Viewer read but not change anything', async () => {
    const event = await makeEvent({ status: 'draft' });
    const { client } = await signInAs(Roles.VIEWER);
    expect((await client.get('/api/admin/events')).body.data.totalCount).toBe(1);
    expect((await client.post('/api/admin/events').send(payload())).status).toBe(403);
    expect((await client.patch(`/api/admin/events/${event._id}`).send({ title: 'Nope Nope' })).status).toBe(403);
    expect((await client.post(`/api/admin/events/${event._id}/publish`)).status).toBe(403);
    expect((await client.get(`/api/admin/events/${event._id}/registrations`)).status).toBe(403);
  });

  it('creates events as drafts and ignores status, counters and authorship from the request', async () => {
    const { user, client } = await signInAs(Roles.EDITOR);
    const res = await client.post('/api/admin/events').send(
      payload({ status: 'published', registeredCount: 99, createdBy: 'someone', isDeleted: true }),
    );
    expect(res.status).toBe(201);
    expect(res.body.data.event.status).toBe('draft');
    const stored = await Event.findById(res.body.data.event.id).lean();
    expect(stored).toMatchObject({ status: 'draft', registeredCount: 0, createdBy: user._id, isDeleted: false });
    expect((await anon().get('/api/events')).body.data.totalCount).toBe(0);
  });

  it('validates the event fields and the schedule', async () => {
    const { client } = await signInAs(Roles.ADMIN);
    const bad = [
      payload({ title: 'x' }),
      payload({ venue: '' }),
      payload({ startsAt: 'tomorrow-ish' }),
      payload({ capacity: -1 }),
      payload({ category: 'Rave' }),
      payload({ title: '<script>alert(1)</script>' }),
      payload({ endsAt: new Date(Date.now() + 9 * DAY).toISOString() }), // ends before it starts
      payload({ registrationClosesAt: new Date(Date.now() + 11 * DAY).toISOString() }), // closes after start
      payload({
        registrationOpensAt: new Date(Date.now() + 5 * DAY).toISOString(),
        registrationClosesAt: new Date(Date.now() + 4 * DAY).toISOString(),
      }),
    ];
    for (const body of bad) expect((await client.post('/api/admin/events').send(body)).status).toBe(400);
    expect(await Event.countDocuments()).toBe(0);
  });

  it('runs the full lifecycle: draft → published → visible → cancelled → archived', async () => {
    const { client } = await signInAs(Roles.ADMIN);
    const created = await client.post('/api/admin/events').send(payload());
    const id = created.body.data.event.id as string;

    expect((await client.post(`/api/admin/events/${id}/publish`)).status).toBe(200);
    expect((await anon().get('/api/events')).body.data.events[0].title).toBe('Sharad Purnima Raas');
    expect((await client.post(`/api/admin/events/${id}/publish`)).status).toBe(409); // already published

    const cancelled = await client.post(`/api/admin/events/${id}/cancel`).send({ reason: 'Rain forecast' });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.message).toMatch(/not been emailed/i); // never claims attendees were told
    const publicView = (await anon().get(`/api/events/${id}`)).body.data.event;
    expect(publicView).toMatchObject({ status: 'cancelled', cancellationReason: 'Rain forecast' });

    expect((await client.post(`/api/admin/events/${id}/archive`)).status).toBe(200);
    expect((await anon().get(`/api/events/${id}`)).status).toBe(404);

    const actions = (await AuditLog.find({ targetId: id }).lean()).map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['event.created', 'event.published', 'event.cancelled', 'event.archived']));
  });

  it('unpublishes an event with no registrations, but not one that has some', async () => {
    const { client } = await signInAs(Roles.ADMIN);
    const quiet = await makeEvent();
    expect((await client.post(`/api/admin/events/${quiet._id}/unpublish`)).status).toBe(200);
    expect((await anon().get(`/api/events/${quiet._id}`)).status).toBe(404);

    const busy = await makeEvent({ capacity: 10 });
    const [member] = await members(1);
    await member!.post(`/api/events/${busy._id}/rsvp`).send({});
    const res = await client.post(`/api/admin/events/${busy._id}/unpublish`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('HAS_DEPENDENCIES');
  });

  it('refuses to delete an event that has registrations, and soft-deletes one that has none', async () => {
    const { client } = await signInAs(Roles.ADMIN);
    const busy = await makeEvent();
    const [member] = await members(1);
    await member!.post(`/api/events/${busy._id}/rsvp`).send({});
    expect((await client.del(`/api/admin/events/${busy._id}`)).status).toBe(409);
    expect((await Event.findById(busy._id).lean())?.isDeleted).toBe(false);

    // Even after the member cancels, history exists, so deletion stays blocked.
    await member!.del(`/api/events/${busy._id}/rsvp`);
    expect((await client.del(`/api/admin/events/${busy._id}`)).status).toBe(409);

    const empty = await makeEvent({ status: 'draft' });
    expect((await client.del(`/api/admin/events/${empty._id}`)).status).toBe(200);
    expect((await Event.findById(empty._id).lean())?.isDeleted).toBe(true);
    expect((await client.get(`/api/admin/events/${empty._id}`)).status).toBe(404);
  });

  it('does not let capacity drop below the places already taken', async () => {
    const { client } = await signInAs(Roles.ADMIN);
    const event = await makeEvent({ capacity: 10 });
    const [member] = await members(1);
    await member!.post(`/api/events/${event._id}/rsvp`).send({ attendees: 6 });
    expect((await client.patch(`/api/admin/events/${event._id}`).send({ capacity: 5 })).status).toBe(409);
    expect((await client.patch(`/api/admin/events/${event._id}`).send({ capacity: 6 })).status).toBe(200);
    expect((await client.patch(`/api/admin/events/${event._id}`).send({ capacity: 0 })).status).toBe(200); // unlimited
  });

  it('checks the merged schedule on partial updates', async () => {
    const { client } = await signInAs(Roles.ADMIN);
    const event = await makeEvent({ registrationClosesAt: new Date(Date.now() + 5 * DAY) });
    // Moving the start before the existing closing date would leave registration open past the start.
    const res = await client.patch(`/api/admin/events/${event._id}`).send({ startsAt: new Date(Date.now() + 2 * DAY).toISOString() });
    expect(res.status).toBe(400);
  });

  it('applies the draft-only rule to Editors, and lets a granted publisher edit live events', async () => {
    const draft = await makeEvent({ status: 'draft' });
    const live = await makeEvent();
    const { client: editor } = await signInAs(Roles.EDITOR);
    expect((await editor.patch(`/api/admin/events/${draft._id}`).send({ title: 'Edited Draft' })).status).toBe(200);
    expect((await editor.patch(`/api/admin/events/${live._id}`).send({ title: 'Edited Live' })).status).toBe(403);
    expect((await editor.post(`/api/admin/events/${draft._id}/publish`)).status).toBe(403);
    expect((await editor.patch(`/api/admin/events/${draft._id}`).send({ featured: true })).status).toBe(403);
    expect((await Event.findById(live._id).lean())?.title).not.toBe('Edited Live');

    const { client: granted } = await signInAs(Roles.EDITOR, { extraPermissions: ['events.publish'] });
    expect((await granted.patch(`/api/admin/events/${live._id}`).send({ title: 'Edited Live' })).status).toBe(200);
    expect((await granted.post(`/api/admin/events/${draft._id}/publish`)).status).toBe(200);
  });

  it('lists registrations with names and emails, supports search and filters', async () => {
    const event = await makeEvent({ capacity: 20 });
    const u1 = await makeUser({ name: 'Anil Patel', email: 'anil@example.test' });
    const u2 = await makeUser({ name: 'Bhavna Shah', email: 'bhavna@example.test' });
    const c1 = await signIn(u1.email);
    const c2 = await signIn(u2.email);
    await c1.post(`/api/events/${event._id}/rsvp`).send({ attendees: 3 });
    await c2.post(`/api/events/${event._id}/rsvp`).send({});
    await c2.del(`/api/events/${event._id}/rsvp`);

    const { client } = await signInAs(Roles.ADMIN);
    const all = await client.get(`/api/admin/events/${event._id}/registrations`);
    expect(all.body.data.totalCount).toBe(2);
    const anil = all.body.data.registrations.find((r: { name: string }) => r.name === 'Anil Patel');
    expect(anil).toMatchObject({ email: 'anil@example.test', attendees: 3, status: 'confirmed' });
    expect(JSON.stringify(all.body)).not.toMatch(/passwordHash|phone/);

    expect((await client.get(`/api/admin/events/${event._id}/registrations?status=confirmed`)).body.data.totalCount).toBe(1);
    expect((await client.get(`/api/admin/events/${event._id}/registrations?search=bhavna`)).body.data.registrations[0].name).toBe('Bhavna Shah');
  });

  it('lets an Admin cancel a registration and frees the places', async () => {
    const event = await makeEvent({ capacity: 5 });
    const [member] = await members(1);
    await member!.post(`/api/events/${event._id}/rsvp`).send({ attendees: 4 });
    const reg = await EventRegistration.findOne({ eventId: event._id }).lean();

    const { client } = await signInAs(Roles.ADMIN);
    expect((await client.del(`/api/admin/events/${event._id}/registrations/${reg!._id}`)).status).toBe(200);
    expect((await Event.findById(event._id).lean())?.registeredCount).toBe(0);
    expect((await EventRegistration.findById(reg!._id).lean())?.status).toBe('cancelled');
    expect((await client.del(`/api/admin/events/${event._id}/registrations/${reg!._id}`)).status).toBe(404); // not twice
  });

  it('exports registrations to authorised staff only, safely, and audits it', async () => {
    const event = await makeEvent({ title: 'Export Test' });
    const evil = await makeUser({ name: '=cmd|calc', email: 'evil@example.test' });
    await (await signIn(evil.email)).post(`/api/events/${event._id}/rsvp`).send({});

    for (const role of [Roles.VIEWER, Roles.EDITOR]) {
      const { client } = await signInAs(role);
      expect((await client.get(`/api/admin/events/${event._id}/registrations/export`)).status).toBe(403);
    }
    const { client } = await signInAs(Roles.ADMIN);
    const res = await client.get(`/api/admin/events/${event._id}/registrations/export`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text).toContain("'=cmd|calc"); // formula neutralised
    expect(res.text).toContain('evil@example.test');
    expect(await AuditLog.countDocuments({ action: 'event.registrations_exported' })).toBe(1);
  });
});
