import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import User from '../../src/models/User';
import Session from '../../src/models/Session';
import AuditLog from '../../src/models/AuditLog';
import PasswordResetToken from '../../src/models/PasswordResetToken';
import { AccountStatus, Roles } from '../../src/config/constants';
import { Permissions, permissionsFor, ALL_PERMISSIONS } from '../../src/config/permissions';
import {
  ORIGIN,
  PASSWORD,
  anon,
  connectTestDb,
  disconnectTestDb,
  makeUser,
  resetDb,
  signIn,
  signInAs,
} from '../helpers';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(resetDb);

describe('permission model', () => {
  it('gives Super Admin everything and Viewer nothing that writes', () => {
    expect(permissionsFor({ role: Roles.SUPER_ADMIN })).toHaveLength(ALL_PERMISSIONS.length);
    const viewer = permissionsFor({ role: Roles.VIEWER });
    for (const p of viewer) expect(p).toMatch(/\.(read|view)$/);
  });

  it('does not let Editors publish unless it is granted individually', () => {
    expect(permissionsFor({ role: Roles.EDITOR })).not.toContain(Permissions.EVENTS_PUBLISH);
    expect(
      permissionsFor({ role: Roles.EDITOR, extraPermissions: [Permissions.EVENTS_PUBLISH] }),
    ).toContain(Permissions.EVENTS_PUBLISH);
  });

  it('ignores individual grants of permissions that are not grantable (no escalation via extras)', () => {
    const perms = permissionsFor({
      role: Roles.EDITOR,
      extraPermissions: [Permissions.ROLES_MANAGE, Permissions.USERS_MANAGE, 'made.up'],
    });
    expect(perms).not.toContain(Permissions.ROLES_MANAGE);
    expect(perms).not.toContain(Permissions.USERS_MANAGE);
  });

  it('keeps staff-management permissions away from Admin', () => {
    const admin = permissionsFor({ role: Roles.ADMIN });
    for (const p of [Permissions.USERS_MANAGE, Permissions.ROLES_MANAGE, Permissions.SESSIONS_REVOKE, Permissions.SETTINGS_SECURITY, Permissions.AUDIT_READ]) {
      expect(admin).not.toContain(p);
    }
  });
});

describe('who can reach the account endpoints', () => {
  it('returns 401 to a public visitor on every protected endpoint', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const calls = [
      anon().get('/api/users'),
      anon().post('/api/users').set('Origin', ORIGIN),
      anon().post(`/api/users/${id}/approve`).set('Origin', ORIGIN),
      anon().patch(`/api/users/${id}/role`).set('Origin', ORIGIN),
      anon().post(`/api/users/${id}/suspend`).set('Origin', ORIGIN),
      anon().post(`/api/users/${id}/password-reset`).set('Origin', ORIGIN),
      anon().get('/api/auth/me'),
      anon().get('/api/auth/sessions'),
    ];
    for (const res of await Promise.all(calls)) expect(res.status).toBe(401);
  });

  it.each([Roles.MEMBER, Roles.VIEWER, Roles.EDITOR])('returns 403 to a %s on the user list', async (role) => {
    const { client } = await signInAs(role);
    const res = await client.get('/api/users');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('lets Admin and Super Admin list users, with pagination and filters', async () => {
    await makeUser({ role: Roles.MEMBER, status: AccountStatus.PENDING, name: 'Pending Person' });
    await makeUser({ role: Roles.MEMBER, name: 'Active Person' });
    const { client: admin } = await signInAs(Roles.ADMIN);

    const all = await admin.get('/api/users?limit=2&page=1');
    expect(all.status).toBe(200);
    expect(all.body.data.users).toHaveLength(2);
    expect(all.body.data.totalCount).toBe(3);

    const pending = await admin.get('/api/users?role=member&status=pending');
    expect(pending.body.data.totalCount).toBe(1);
    expect(pending.body.data.users[0].name).toBe('Pending Person');

    const search = await admin.get('/api/users?search=active%20per');
    expect(search.body.data.users).toHaveLength(1);

    expect((await admin.get('/api/users?limit=5000')).status).toBe(400);
    expect((await admin.get('/api/users?role=hacker')).status).toBe(400);
  });

  it('treats search text literally, not as a regular expression', async () => {
    await makeUser({ name: 'Plain Name' });
    const { client } = await signInAs(Roles.ADMIN);
    const res = await client.get('/api/users?search=.*');
    expect(res.body.data.totalCount).toBe(0);
  });

  it('hides phone numbers from Admin in account lists but never leaks hashes or lock state', async () => {
    await makeUser({ role: Roles.MEMBER, phone: '+91 98250 11111' });
    const { client: admin } = await signInAs(Roles.ADMIN);
    const asAdmin = await admin.get('/api/users');
    const dump = JSON.stringify(asAdmin.body);
    expect(dump).not.toContain('98250 11111');
    expect(dump).not.toMatch(/passwordHash|argon2|failedLoginCount|lockUntil/);

    const { client: sa } = await signInAs(Roles.SUPER_ADMIN);
    const asSuper = await sa.get('/api/users');
    expect(JSON.stringify(asSuper.body)).toContain('98250 11111');
  });
});

describe('Viewer is read-only through direct API calls', () => {
  it('cannot approve, reject, suspend, change roles, create staff or reset passwords', async () => {
    const target = await makeUser({ role: Roles.MEMBER, status: AccountStatus.PENDING });
    const { client: viewer } = await signInAs(Roles.VIEWER);
    const calls = await Promise.all([
      viewer.post(`/api/users/${target._id}/approve`),
      viewer.post(`/api/users/${target._id}/reject`).send({}),
      viewer.post(`/api/users/${target._id}/suspend`).send({}),
      viewer.patch(`/api/users/${target._id}/role`).send({ role: 'admin' }),
      viewer.post('/api/users').send({ name: 'X Y', email: 'x@y.test', role: 'admin' }),
      viewer.post(`/api/users/${target._id}/password-reset`),
      viewer.post(`/api/users/${target._id}/revoke-sessions`),
    ]);
    for (const res of calls) expect(res.status).toBe(403);
    expect((await User.findById(target._id).lean())?.status).toBe('pending');
  });
});

describe('Editor cannot manage staff or escalate privileges', () => {
  it('is refused on role changes, staff creation and session revocation', async () => {
    const victim = await makeUser({ role: Roles.VIEWER });
    const { user: editor, client } = await signInAs(Roles.EDITOR);
    const res1 = await client.patch(`/api/users/${victim._id}/role`).send({ role: 'admin' });
    const res2 = await client.patch(`/api/users/${editor._id}/role`).send({ role: 'superadmin' });
    const res3 = await client.post('/api/users').send({ name: 'Bad Actor', email: 'bad@example.test', role: 'admin' });
    const res4 = await client.post(`/api/users/${victim._id}/revoke-sessions`);
    for (const res of [res1, res2, res3, res4]) expect(res.status).toBe(403);
    expect((await User.findById(editor._id).lean())?.role).toBe('editor');
  });
});

describe('Admin boundaries', () => {
  it('can approve and reject member registrations', async () => {
    const a = await makeUser({ status: AccountStatus.PENDING });
    const b = await makeUser({ status: AccountStatus.PENDING });
    const { user: admin, client } = await signInAs(Roles.ADMIN);

    const ok = await client.post(`/api/users/${a._id}/approve`);
    expect(ok.status).toBe(200);
    expect(ok.body.data.user.status).toBe('active');
    const stored = await User.findById(a._id).lean();
    expect(stored?.approvedBy).toBe(admin._id);

    const no = await client.post(`/api/users/${b._id}/reject`).send({ reason: 'Not a known family' });
    expect(no.status).toBe(200);
    expect((await User.findById(b._id).lean())?.status).toBe('rejected');

    // Not pending any more.
    expect((await client.post(`/api/users/${a._id}/approve`)).status).toBe(409);

    // The approved member can now sign in; the rejected one cannot.
    expect((await signIn(a.email)).userId).toBe(a._id);
    const blocked = await anon().post('/api/auth/login').set('Origin', ORIGIN).send({ email: b.email, password: PASSWORD });
    expect(blocked.status).toBe(403);
  });

  it('cannot approve a staff account (only member registrations)', async () => {
    const staff = await makeUser({ role: Roles.EDITOR, status: AccountStatus.PENDING });
    const { client } = await signInAs(Roles.ADMIN);
    expect((await client.post(`/api/users/${staff._id}/approve`)).status).toBe(403);
  });

  it('can suspend a member and the member is signed out at once', async () => {
    const member = await makeUser();
    const memberClient = await signIn(member.email);
    const { client: admin } = await signInAs(Roles.ADMIN);

    const res = await admin.post(`/api/users/${member._id}/suspend`).send({ reason: 'Misuse' });
    expect(res.status).toBe(200);
    expect(await Session.countDocuments({ userId: member._id })).toBe(0);
    expect((await memberClient.get('/api/auth/me')).status).toBe(401);

    const back = await admin.post(`/api/users/${member._id}/reactivate`);
    expect(back.status).toBe(200);
    expect((await signIn(member.email)).userId).toBe(member._id);
  });

  it('cannot suspend, reset or promote staff accounts', async () => {
    const staff = await makeUser({ role: Roles.EDITOR });
    const sa = await makeUser({ role: Roles.SUPER_ADMIN });
    const { user: admin, client } = await signInAs(Roles.ADMIN);

    expect((await client.post(`/api/users/${staff._id}/suspend`).send({})).status).toBe(403);
    expect((await client.post(`/api/users/${staff._id}/password-reset`)).status).toBe(403);
    expect((await client.post(`/api/users/${sa._id}/password-reset`)).status).toBe(403);
    expect((await client.patch(`/api/users/${admin._id}/role`).send({ role: 'superadmin' })).status).toBe(403);
    expect((await client.post('/api/users').send({ name: 'New Admin', email: 'na@example.test', role: 'admin' })).status).toBe(403);
    expect((await User.findById(admin._id).lean())?.role).toBe('admin');
  });

  it('cannot suspend themselves', async () => {
    const { user, client } = await signInAs(Roles.ADMIN, {});
    const res = await client.post(`/api/users/${user._id}/suspend`).send({});
    expect(res.status).toBe(403);
  });

  it('can issue a one-time reset link for a member, and it works exactly once', async () => {
    const member = await makeUser();
    const memberClient = await signIn(member.email);
    const { client: admin } = await signInAs(Roles.ADMIN);

    const issued = await admin.post(`/api/users/${member._id}/password-reset`);
    expect(issued.status).toBe(200);
    const token = new URL(issued.body.data.reset.url).searchParams.get('token')!;

    const reset = await anon().post('/api/auth/reset-password').set('Origin', ORIGIN).send({
      token,
      password: 'Fresh-Start-2026',
      confirmPassword: 'Fresh-Start-2026',
    });
    expect(reset.status).toBe(200);
    expect((await memberClient.get('/api/auth/me')).status).toBe(401); // old sessions revoked
    expect((await signIn(member.email, 'Fresh-Start-2026')).userId).toBe(member._id);

    const reuse = await anon().post('/api/auth/reset-password').set('Origin', ORIGIN).send({
      token,
      password: 'Second-Attempt-77',
      confirmPassword: 'Second-Attempt-77',
    });
    expect(reuse.status).toBe(400);
  });

  it('rejects a reset token after it expires', async () => {
    const member = await makeUser();
    const { client: admin } = await signInAs(Roles.ADMIN);
    const issued = await admin.post(`/api/users/${member._id}/password-reset`);
    const token = new URL(issued.body.data.reset.url).searchParams.get('token')!;
    await PasswordResetToken.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await anon().post('/api/auth/reset-password').set('Origin', ORIGIN).send({
      token,
      password: 'Fresh-Start-2026',
      confirmPassword: 'Fresh-Start-2026',
    });
    expect(res.status).toBe(400);
  });
});

describe('Super Admin staff and role management', () => {
  it('creates staff with a one-time setup link instead of choosing their password', async () => {
    const { client: sa } = await signInAs(Roles.SUPER_ADMIN);
    const res = await sa.post('/api/users').send({ name: 'Nisha Shah', email: 'nisha@example.test', role: 'editor' });
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('editor');
    expect(res.body.data.setup.url).toContain('/reset-password?token=');
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);

    // The new account cannot sign in until the setup link is used.
    const early = await anon().post('/api/auth/login').set('Origin', ORIGIN).send({ email: 'nisha@example.test', password: PASSWORD });
    expect(early.status).toBe(401);

    const token = new URL(res.body.data.setup.url).searchParams.get('token')!;
    const setup = await anon().post('/api/auth/reset-password').set('Origin', ORIGIN).send({
      token,
      password: 'Nisha-Chooses-This-9',
      confirmPassword: 'Nisha-Chooses-This-9',
    });
    expect(setup.status).toBe(200);
    expect((await signIn('nisha@example.test', 'Nisha-Chooses-This-9')).userId).toBeTruthy();
  });

  it('cannot create a Super Admin or duplicate an email through staff creation', async () => {
    const { client: sa } = await signInAs(Roles.SUPER_ADMIN);
    const asSuper = await sa.post('/api/users').send({ name: 'Sneaky', email: 'sneaky@example.test', role: 'superadmin' });
    expect(asSuper.status).toBe(400);
    const existing = await makeUser({ email: 'taken@example.test' });
    const dup = await sa.post('/api/users').send({ name: 'Dup', email: existing.email, role: 'viewer' });
    expect(dup.status).toBe(409);
  });

  it('changes a role and the change applies server-side at once', async () => {
    const editor = await makeUser({ role: Roles.EDITOR });
    const editorClient = await signIn(editor.email);
    expect((await editorClient.get('/api/users')).status).toBe(403);

    const { client: sa } = await signInAs(Roles.SUPER_ADMIN);
    const res = await sa.patch(`/api/users/${editor._id}/role`).send({ role: 'admin' });
    expect(res.status).toBe(200);

    // Old session is gone, so no stale privileges survive; the next sign-in has the new ones.
    expect((await editorClient.get('/api/users')).status).toBe(401);
    const fresh = await signIn(editor.email);
    expect((await fresh.get('/api/users')).status).toBe(200);

    const demote = await sa.patch(`/api/users/${editor._id}/role`).send({ role: 'viewer' });
    expect(demote.status).toBe(200);
    expect((await fresh.get('/api/users')).status).toBe(401);
  });

  it('grants and revokes an individual permission', async () => {
    const editor = await makeUser({ role: Roles.EDITOR });
    const { client: sa } = await signInAs(Roles.SUPER_ADMIN);
    await sa.patch(`/api/users/${editor._id}/role`).send({ role: 'editor', extraPermissions: ['events.publish'] });
    const withGrant = await signIn(editor.email);
    const me = await withGrant.get('/api/auth/me');
    expect(me.body.data.user.permissions).toContain('events.publish');

    await sa.patch(`/api/users/${editor._id}/role`).send({ role: 'editor', extraPermissions: [] });
    const without = await signIn(editor.email);
    expect((await without.get('/api/auth/me')).body.data.user.permissions).not.toContain('events.publish');
  });

  it('refuses to grant permissions that are not individually grantable', async () => {
    const editor = await makeUser({ role: Roles.EDITOR });
    const { client: sa } = await signInAs(Roles.SUPER_ADMIN);
    const res = await sa.patch(`/api/users/${editor._id}/role`).send({ role: 'editor', extraPermissions: ['users.manage'] });
    expect(res.status).toBe(400);
  });

  it('refuses self role changes and self suspension (protects the last Super Admin)', async () => {
    const { user, client: sa } = await signInAs(Roles.SUPER_ADMIN);
    expect((await sa.patch(`/api/users/${user._id}/role`).send({ role: 'viewer' })).status).toBe(403);
    expect((await sa.post(`/api/users/${user._id}/suspend`).send({})).status).toBe(403);
    expect((await User.findById(user._id).lean())?.role).toBe('superadmin');
  });

  it('can revoke all of a user’s sessions', async () => {
    const member = await makeUser();
    const phone = await signIn(member.email);
    const laptop = await signIn(member.email);
    const { client: sa } = await signInAs(Roles.SUPER_ADMIN);
    const res = await sa.post(`/api/users/${member._id}/revoke-sessions`);
    expect(res.body.data.revoked).toBe(2);
    expect((await phone.get('/api/auth/me')).status).toBe(401);
    expect((await laptop.get('/api/auth/me')).status).toBe(401);
  });

  it('returns 404 for unknown users and 400 for malformed ids', async () => {
    const { client: sa } = await signInAs(Roles.SUPER_ADMIN);
    expect((await sa.post('/api/users/11111111-1111-4111-8111-111111111111/approve')).status).toBe(404);
    expect((await sa.post('/api/users/not-a-uuid/approve')).status).toBe(400);
  });
});

describe('audit trail for sensitive actions', () => {
  it('records approvals, role changes and suspensions with actor and target, but no secrets', async () => {
    const pending = await makeUser({ status: AccountStatus.PENDING });
    const editor = await makeUser({ role: Roles.EDITOR });
    const { user: sa, client } = await signInAs(Roles.SUPER_ADMIN);

    await client.post(`/api/users/${pending._id}/approve`);
    await client.patch(`/api/users/${editor._id}/role`).send({ role: 'admin' });
    await client.post(`/api/users/${editor._id}/suspend`).send({ reason: 'test' });

    const actions = (await AuditLog.find({ actorId: sa._id }).lean()).map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['member.approved', 'user.role_changed', 'user.suspended', 'auth.login']));

    const roleEntry = await AuditLog.findOne({ action: 'user.role_changed' }).lean();
    expect(roleEntry?.targetId).toBe(editor._id);
    expect(roleEntry?.metadata).toMatchObject({ before: { role: 'editor' }, after: { role: 'admin' } });

    const everything = JSON.stringify(await AuditLog.find().lean());
    expect(everything).not.toContain(PASSWORD);
    expect(everything).not.toMatch(/argon2|csrf/i);
  });
});
