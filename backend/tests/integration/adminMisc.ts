import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import User from '../../src/models/User';
import AuditLog from '../../src/models/AuditLog';
import { Roles } from '../../src/config/constants';
import {
  OPS_ADMIN_PERMISSIONS,
  ORIGIN,
  PASSWORD,
  anon,
  connectTestDb,
  disconnectTestDb,
  makeAnnouncement,
  makeEvent,
  makeUser,
  resetDb,
  signIn,
  signInAs,
} from '../helpers';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(resetDb);

const login = (email: string, password = PASSWORD) =>
  anon().post('/api/auth/admin-login').set('Origin', ORIGIN).send({ email, password });

describe('suspension lifecycle', () => {
  it('blocks sign-in while suspended and restores it on reactivation', async () => {
    const admin = await makeUser();
    const { client: sa } = await signInAs(Roles.SUPER_ADMIN);
    const adminClient = await signIn(admin.email);

    expect((await sa.post(`/api/users/${admin._id}/suspend`).send({ reason: 'Policy' })).status).toBe(200);
    expect((await adminClient.get(`/api/auth/${adminClient.userId}`)).status).toBe(401);
    expect((await login(admin.email)).status).not.toBe(200);

    expect((await sa.post(`/api/users/${admin._id}/reactivate`)).status).toBe(200);
    expect((await login(admin.email)).status).toBe(200);
    const after = await User.findById(admin._id).lean();
    expect(after?.status).toBe('active');
    expect(after?.suspendedAt ?? null).toBeNull();
  });

  it('answers 409 for a repeated suspend or a reactivation of an active account', async () => {
    const admin = await makeUser();
    const { client: sa } = await signInAs(Roles.SUPER_ADMIN);
    expect((await sa.post(`/api/users/${admin._id}/reactivate`)).status).toBe(409);
    expect((await sa.post(`/api/users/${admin._id}/suspend`).send({})).status).toBe(200);
    expect((await sa.post(`/api/users/${admin._id}/suspend`).send({})).status).toBe(409);
  });

  it('refuses a reason longer than 500 characters', async () => {
    const admin = await makeUser();
    const { client: sa } = await signInAs(Roles.SUPER_ADMIN);
    expect((await sa.post(`/api/users/${admin._id}/suspend`).send({ reason: 'x'.repeat(501) })).status).toBe(400);
    expect((await User.findById(admin._id).lean())?.status).toBe('active');
  });
});

describe('session revocation endpoint', () => {
  it('answers 404 for a missing user, and revokes zero for an admin who is signed out', async () => {
    const quiet = await makeUser();
    const { client: sa } = await signInAs(Roles.SUPER_ADMIN);
    expect((await sa.post('/api/users/11111111-1111-4111-8111-111111111111/revoke-sessions')).status).toBe(404);
    const res = await sa.post(`/api/users/${quiet._id}/revoke-sessions`);
    expect(res.status).toBe(200);
    expect(res.body.data.revoked).toBe(0);
  });

  it('records the number of sessions revoked in the audit log', async () => {
    const admin = await makeUser();
    await signIn(admin.email);
    const { client: sa } = await signInAs(Roles.SUPER_ADMIN);
    await sa.post(`/api/users/${admin._id}/revoke-sessions`);
    const entry = await AuditLog.findOne({ action: 'user.sessions_revoked' }).lean();
    expect(entry).toMatchObject({ targetId: admin._id, metadata: { count: 1 } });
  });
});

describe('the Super Admin can only be created by the bootstrap command', () => {
  it('cannot be created, promoted to or assigned through any endpoint', async () => {
    const admin = await makeUser({ permissions: ['events.read'] });
    const { client: sa } = await signInAs(Roles.SUPER_ADMIN);
    expect((await sa.post('/api/users').send({ name: 'Sneaky', email: 'sneaky@example.test', role: 'superadmin' })).status).toBe(400);
    expect((await sa.patch(`/api/users/${admin._id}`).send({ role: 'superadmin', name: 'Still Admin' })).status).toBe(200);
    const stored = await User.findById(admin._id).lean();
    expect(stored?.role).toBe(Roles.ADMIN); // the role field in the body is never read
    expect(await User.countDocuments({ role: Roles.SUPER_ADMIN })).toBe(1); // only the signed-in one
  });
});

describe('dashboard recent activity', () => {
  it('lists the ten newest entries, newest first, with named actors', async () => {
    const { user, client } = await signInAs(Roles.SUPER_ADMIN);
    for (let i = 0; i < 12; i += 1) {
      await AuditLog.create({ action: `test.action_${i}`, actorId: user._id, actorRole: 'superadmin', outcome: 'success', createdAt: new Date(Date.now() + 60_000 + i * 1000) });
    }
    const activity = (await client.get('/api/admin/dashboard')).body.data.stats.recentActivity as { action: string; actor: string }[];
    expect(activity).toHaveLength(10);
    expect(activity[0]!.action).toBe('test.action_11');
    expect(activity.every((a) => a.actor === user.name || a.actor === 'System' || a.actor === 'Former admin')).toBe(true);
  });

  it('labels system events and removed actors without exposing ids', async () => {
    const { client } = await signInAs(Roles.SUPER_ADMIN);
    await AuditLog.create({ action: 'system.cleanup', outcome: 'success', createdAt: new Date(Date.now() + 5000) });
    await AuditLog.create({ action: 'ghost.action', actorId: '99999999-9999-4999-8999-999999999999', outcome: 'success', createdAt: new Date(Date.now() + 6000) });
    const activity = (await client.get('/api/admin/dashboard')).body.data.stats.recentActivity as { action: string; actor: string }[];
    expect(activity.find((a) => a.action === 'system.cleanup')?.actor).toBe('System');
    expect(activity.find((a) => a.action === 'ghost.action')?.actor).toBe('Former admin');
    expect(JSON.stringify(activity)).not.toContain('99999999-9999');
  });

  it('counts only upcoming published events and currently visible announcements', async () => {
    await makeEvent();
    await makeEvent({ status: 'cancelled' });
    await makeAnnouncement({ publishAt: new Date(Date.now() + 86_400_000) }); // scheduled
    await makeAnnouncement({ status: 'archived' });
    await makeAnnouncement();
    const { client } = await signInAs(Roles.SUPER_ADMIN);
    const s = (await client.get('/api/admin/dashboard')).body.data.stats;
    expect(s).toMatchObject({ upcomingEvents: 1, publishedAnnouncements: 1 });
  });

  it('reports zero counts on an empty database and names the caller’s role', async () => {
    const { client } = await signInAs(Roles.SUPER_ADMIN);
    const res = await client.get('/api/admin/dashboard');
    expect(res.body.data.role).toBe('superadmin');
    expect(res.body.data.stats).toMatchObject({ totalMembers: 0, upcomingEvents: 0, publishedAnnouncements: 0, unreadContactMessages: 0 });
  });
});

describe('updates enforce the same limits as creation', () => {
  it('refuses a too-short or empty title or an empty venue on an existing event', async () => {
    const event = await makeEvent();
    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    expect((await client.patch(`/api/admin/events/${event._id}`).send({ title: 'ab' })).status).toBe(400);
    expect((await client.patch(`/api/admin/events/${event._id}`).send({ title: '' })).status).toBe(400);
    expect((await client.patch(`/api/admin/events/${event._id}`).send({ venue: '' })).status).toBe(400);
  });

  // KNOWN BUG: eventValidator uses min length 0 on update, and the Event model has no minlength
  // for venue, so a one-character venue (rejected on create) is accepted on update. When fixed,
  // vitest reports this as a failure of an expected-fail test; change it to a normal `it`.
  it.fails('refuses a one-character venue on an existing event, as creation does', async () => {
    const event = await makeEvent();
    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    expect((await client.patch(`/api/admin/events/${event._id}`).send({ venue: 'x' })).status).toBe(400);
  });

  it('refuses a too-short title on an existing announcement', async () => {
    const a = await makeAnnouncement();
    const { client } = await signInAs(Roles.ADMIN, { permissions: OPS_ADMIN_PERMISSIONS });
    expect((await client.patch(`/api/admin/announcements/${a._id}`).send({ title: 'ab' })).status).toBe(400);
    expect((await client.patch(`/api/admin/announcements/${a._id}`).send({ body: '' })).status).toBe(400);
  });
});
