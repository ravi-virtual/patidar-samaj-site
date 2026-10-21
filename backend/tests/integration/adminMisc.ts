import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import User from '../../src/models/User';
import AuditLog from '../../src/models/AuditLog';
import MemberProfile from '../../src/models/MemberProfile';
import { AccountStatus, Roles } from '../../src/config/constants';
import { ALL_PERMISSIONS, GRANTABLE_PERMISSIONS, RolePermissions } from '../../src/config/permissions';
import {
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
  anon().post('/api/auth/login').set('Origin', ORIGIN).send({ email, password });

describe('GET /api/admin/roles', () => {
  it('requires sign-in and then the roles.manage permission (Super Admin only)', async () => {
    expect((await anon().get('/api/admin/roles')).status).toBe(401);
    for (const role of [Roles.MEMBER, Roles.VIEWER, Roles.EDITOR, Roles.ADMIN]) {
      const { client } = await signInAs(role);
      expect((await client.get('/api/admin/roles')).status, role).toBe(403);
    }
    const { client } = await signInAs(Roles.SUPER_ADMIN);
    expect((await client.get('/api/admin/roles')).status).toBe(200);
  });

  it('returns exactly the matrix the server enforces', async () => {
    const { client } = await signInAs(Roles.SUPER_ADMIN);
    const { roles, permissions, grantable } = (await client.get('/api/admin/roles')).body.data;
    expect(permissions).toEqual(ALL_PERMISSIONS);
    expect(grantable).toEqual([...GRANTABLE_PERMISSIONS]);
    expect(roles.map((r: { role: string }) => r.role).sort()).toEqual(Object.values(Roles).sort());
    for (const r of roles as { role: keyof typeof RolePermissions; permissions: string[] }[]) {
      expect(r.permissions).toEqual([...RolePermissions[r.role]]);
    }
  });

  it('is read-only', async () => {
    const { client } = await signInAs(Roles.SUPER_ADMIN);
    for (const res of [await client.post('/api/admin/roles').send({}), await client.patch('/api/admin/roles').send({}), await client.del('/api/admin/roles')]) {
      expect(res.status).toBe(404);
    }
  });
});

describe('concurrent registration with the same email', () => {
  it('creates one account and answers the others with a clean conflict', async () => {
    const body = {
      name: 'Asha Patel',
      email: 'asha@example.test',
      password: 'Correct-Horse-9',
      confirmPassword: 'Correct-Horse-9',
      acknowledge: true,
    };
    const results = await Promise.all(Array.from({ length: 10 }, () => anon().post('/api/auth/register').set('Origin', ORIGIN).send(body)));
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    for (const s of statuses.filter((x) => x !== 201)) expect(s).toBe(409);
    expect(await User.countDocuments({ email: body.email })).toBe(1);
    expect(await MemberProfile.countDocuments({})).toBe(1);
    for (const r of results) expect(JSON.stringify(r.body)).not.toMatch(/E11000|mongo|stack/i);
  });
});

describe('concurrent approval of one registration', () => {
  it('ends with one active member and one directory entry, whatever the interleaving', async () => {
    const pending = await makeUser({ status: AccountStatus.PENDING });
    const { client: admin } = await signInAs(Roles.ADMIN);
    const results = await Promise.all(Array.from({ length: 6 }, () => admin.post(`/api/users/${pending._id}/approve`)));
    expect(results.some((r) => r.status === 200)).toBe(true);
    for (const r of results) expect([200, 409]).toContain(r.status);
    expect((await User.findById(pending._id).lean())?.status).toBe('active');
    expect(await MemberProfile.countDocuments({ userId: pending._id })).toBe(1);
    expect((await login(pending.email)).status).toBe(200);
  });
});

describe('suspension lifecycle', () => {
  it('blocks sign-in while suspended and restores it on reactivation', async () => {
    const member = await makeUser();
    const { client: admin } = await signInAs(Roles.ADMIN);
    const memberClient = await signIn(member.email);

    expect((await admin.post(`/api/users/${member._id}/suspend`).send({ reason: 'Policy' })).status).toBe(200);
    expect((await memberClient.get('/api/auth/me')).status).toBe(401);
    expect((await login(member.email)).status).toBeGreaterThanOrEqual(401);
    expect((await login(member.email)).status).not.toBe(200);

    expect((await admin.post(`/api/users/${member._id}/reactivate`)).status).toBe(200);
    expect((await login(member.email)).status).toBe(200);
    const after = await User.findById(member._id).lean();
    expect(after?.status).toBe('active');
    expect(after?.suspendedAt ?? null).toBeNull();
  });

  it('answers 409 for a repeated suspend or a reactivation of an active account', async () => {
    const member = await makeUser();
    const { client: admin } = await signInAs(Roles.ADMIN);
    expect((await admin.post(`/api/users/${member._id}/reactivate`)).status).toBe(409);
    expect((await admin.post(`/api/users/${member._id}/suspend`).send({})).status).toBe(200);
    expect((await admin.post(`/api/users/${member._id}/suspend`).send({})).status).toBe(409);
  });

  it('lets a Super Admin suspend and reactivate staff, but not an Admin', async () => {
    const editor = await makeUser({ role: Roles.EDITOR });
    const { client: admin } = await signInAs(Roles.ADMIN);
    expect((await admin.post(`/api/users/${editor._id}/suspend`).send({})).status).toBe(403);
    const { client: sa } = await signInAs(Roles.SUPER_ADMIN);
    expect((await sa.post(`/api/users/${editor._id}/suspend`).send({})).status).toBe(200);
    expect((await admin.post(`/api/users/${editor._id}/reactivate`)).status).toBe(403);
    expect((await sa.post(`/api/users/${editor._id}/reactivate`)).status).toBe(200);
  });

  it('refuses a reason longer than 500 characters', async () => {
    const member = await makeUser();
    const { client: admin } = await signInAs(Roles.ADMIN);
    expect((await admin.post(`/api/users/${member._id}/suspend`).send({ reason: 'x'.repeat(501) })).status).toBe(400);
    expect((await User.findById(member._id).lean())?.status).toBe('active');
  });

  it('will not issue a reset link for a suspended account', async () => {
    const member = await makeUser({ status: AccountStatus.SUSPENDED });
    const { client: admin } = await signInAs(Roles.ADMIN);
    expect((await admin.post(`/api/users/${member._id}/password-reset`)).status).toBe(409);
  });
});

describe('registration review edge cases', () => {
  it('refuses to approve or reject an account that is not pending', async () => {
    const active = await makeUser();
    const { client: admin } = await signInAs(Roles.ADMIN);
    expect((await admin.post(`/api/users/${active._id}/approve`)).status).toBe(409);
    expect((await admin.post(`/api/users/${active._id}/reject`).send({})).status).toBe(409);
  });

  it('keeps a rejected registration out, and records the reason for the office only', async () => {
    const pending = await makeUser({ status: AccountStatus.PENDING });
    const { client: admin } = await signInAs(Roles.ADMIN);
    expect((await admin.post(`/api/users/${pending._id}/reject`).send({ reason: 'Not a member of the community' })).status).toBe(200);
    expect((await login(pending.email)).status).not.toBe(200);
    expect((await User.findById(pending._id).lean())?.rejectionReason).toBe('Not a member of the community');
    expect(JSON.stringify((await admin.get('/api/users')).body)).not.toContain('Not a member of the community');
  });
});

describe('role changes', () => {
  it('can promote to Super Admin, which drops individual grants', async () => {
    const editor = await makeUser({ role: Roles.EDITOR, extraPermissions: ['events.publish'] });
    const { client: sa } = await signInAs(Roles.SUPER_ADMIN);
    const res = await sa.patch(`/api/users/${editor._id}/role`).send({ role: 'superadmin', extraPermissions: ['content.publish'] });
    expect(res.status).toBe(200);
    expect((await User.findById(editor._id).lean())?.extraPermissions).toEqual([]);
  });

  it('refuses to change the role of a suspended or pending account', async () => {
    const suspended = await makeUser({ role: Roles.EDITOR, status: AccountStatus.SUSPENDED });
    const pending = await makeUser({ status: AccountStatus.PENDING });
    const { client: sa } = await signInAs(Roles.SUPER_ADMIN);
    expect((await sa.patch(`/api/users/${suspended._id}/role`).send({ role: 'viewer' })).status).toBe(409);
    expect((await sa.patch(`/api/users/${pending._id}/role`).send({ role: 'viewer' })).status).toBe(409);
  });

  it('replaces (not adds to) individual grants on every change', async () => {
    const editor = await makeUser({ role: Roles.EDITOR, extraPermissions: ['events.publish', 'content.publish'] });
    const { client: sa } = await signInAs(Roles.SUPER_ADMIN);
    await sa.patch(`/api/users/${editor._id}/role`).send({ role: 'editor', extraPermissions: ['members.export'] });
    expect((await User.findById(editor._id).lean())?.extraPermissions).toEqual(['members.export']);
    await sa.patch(`/api/users/${editor._id}/role`).send({ role: 'editor' });
    expect((await User.findById(editor._id).lean())?.extraPermissions).toEqual([]);
  });

  it('lets a demoted Super Admin go on only with the new, lower permissions', async () => {
    const other = await makeUser({ role: Roles.SUPER_ADMIN });
    const otherClient = await signIn(other.email);
    const { client: sa } = await signInAs(Roles.SUPER_ADMIN);
    expect((await sa.patch(`/api/users/${other._id}/role`).send({ role: 'viewer' })).status).toBe(200);
    expect((await otherClient.get('/api/admin/roles')).status).toBe(401); // old session ended
    const fresh = await signIn(other.email);
    expect((await fresh.get('/api/admin/roles')).status).toBe(403);
    expect((await fresh.get('/api/admin/dashboard')).status).toBe(200);
  });
});

describe('session revocation endpoint', () => {
  it('answers 404 for a missing user, and revokes zero for a user who is signed out', async () => {
    const quiet = await makeUser();
    const { client: sa } = await signInAs(Roles.SUPER_ADMIN);
    expect((await sa.post('/api/users/11111111-1111-4111-8111-111111111111/revoke-sessions')).status).toBe(404);
    const res = await sa.post(`/api/users/${quiet._id}/revoke-sessions`);
    expect(res.status).toBe(200);
    expect(res.body.data.revoked).toBe(0);
  });

  it('records the number of sessions revoked in the audit log', async () => {
    const member = await makeUser();
    await signIn(member.email);
    const { client: sa } = await signInAs(Roles.SUPER_ADMIN);
    await sa.post(`/api/users/${member._id}/revoke-sessions`);
    const entry = await AuditLog.findOne({ action: 'user.sessions_revoked' }).lean();
    expect(entry).toMatchObject({ targetId: member._id, metadata: { count: 1 } });
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
    expect(activity.every((a) => a.actor === user.name || a.actor === 'System' || a.actor === 'Former member')).toBe(true);
  });

  it('labels system events and removed actors without exposing ids', async () => {
    const { client } = await signInAs(Roles.SUPER_ADMIN);
    await AuditLog.create({ action: 'system.cleanup', outcome: 'success', createdAt: new Date(Date.now() + 5000) });
    await AuditLog.create({ action: 'ghost.action', actorId: '99999999-9999-4999-8999-999999999999', outcome: 'success', createdAt: new Date(Date.now() + 6000) });
    const activity = (await client.get('/api/admin/dashboard')).body.data.stats.recentActivity as { action: string; actor: string }[];
    expect(activity.find((a) => a.action === 'system.cleanup')?.actor).toBe('System');
    expect(activity.find((a) => a.action === 'ghost.action')?.actor).toBe('Former member');
    expect(JSON.stringify(activity)).not.toContain('99999999-9999');
  });

  it('counts only upcoming published events and currently visible announcements', async () => {
    await makeEvent({ registeredCount: 4 });
    await makeEvent({ status: 'cancelled', registeredCount: 100 });
    await makeAnnouncement({ publishAt: new Date(Date.now() + 86_400_000) }); // scheduled
    await makeAnnouncement({ status: 'archived' });
    await makeAnnouncement();
    const { client } = await signInAs(Roles.SUPER_ADMIN);
    const s = (await client.get('/api/admin/dashboard')).body.data.stats;
    expect(s).toMatchObject({ upcomingEvents: 1, eventRsvps: 4, publishedAnnouncements: 1 });
  });

  it('reports zero counts on an empty database and names the caller’s role', async () => {
    const { client } = await signInAs(Roles.SUPER_ADMIN);
    const res = await client.get('/api/admin/dashboard');
    expect(res.body.data.role).toBe('superadmin');
    expect(res.body.data.stats).toMatchObject({ totalMembers: 0, pendingRegistrations: 0, upcomingEvents: 0, eventRsvps: 0, publishedAnnouncements: 0, unreadContactMessages: 0 });
  });
});

describe('updates enforce the same limits as creation', () => {
  it('refuses a too-short or empty title or an empty venue on an existing event', async () => {
    const event = await makeEvent();
    const { client } = await signInAs(Roles.ADMIN);
    expect((await client.patch(`/api/admin/events/${event._id}`).send({ title: 'ab' })).status).toBe(400);
    expect((await client.patch(`/api/admin/events/${event._id}`).send({ title: '' })).status).toBe(400);
    expect((await client.patch(`/api/admin/events/${event._id}`).send({ venue: '' })).status).toBe(400);
  });

  // KNOWN BUG: eventValidator uses min length 0 on update, and the Event model has no minlength
  // for venue, so a one-character venue (rejected on create) is accepted on update. When fixed,
  // vitest reports this as a failure of an expected-fail test; change it to a normal `it`.
  it.fails('refuses a one-character venue on an existing event, as creation does', async () => {
    const event = await makeEvent();
    const { client } = await signInAs(Roles.ADMIN);
    expect((await client.patch(`/api/admin/events/${event._id}`).send({ venue: 'x' })).status).toBe(400);
  });

  it('refuses a too-short title on an existing announcement', async () => {
    const a = await makeAnnouncement();
    const { client } = await signInAs(Roles.ADMIN);
    expect((await client.patch(`/api/admin/announcements/${a._id}`).send({ title: 'ab' })).status).toBe(400);
    expect((await client.patch(`/api/admin/announcements/${a._id}`).send({ body: '' })).status).toBe(400);
  });
});
