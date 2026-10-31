import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import User from '../../src/models/User';
import Session from '../../src/models/Session';
import AuditLog from '../../src/models/AuditLog';
import PasswordResetToken from '../../src/models/PasswordResetToken';
import { AccountStatus, Roles } from '../../src/config/constants';
import { ALL_PERMISSIONS } from '../../src/config/permissions';
import {
  ALL_ADMIN_PERMISSIONS,
  ORIGIN,
  PASSWORD,
  ANON_ID,
  anon,
  connectTestDb,
  disconnectTestDb,
  makeUser,
  resetDb,
  signIn,
  signInAs,
  ADMIN_PERMISSIONS_WITHOUT_USER_RESET,
} from '../helpers';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(resetDb);

const UNKNOWN_ID = '11111111-1111-4111-8111-111111111111';

describe('who can reach the account endpoints', () => {
  it('returns 401 to a public visitor on every protected endpoint', async () => {
    const calls = [
      anon().get('/api/users'),
      anon().post('/api/users').set('Origin', ORIGIN),
      anon().patch(`/api/users/${UNKNOWN_ID}`).set('Origin', ORIGIN),
      anon().delete(`/api/users/${UNKNOWN_ID}`).set('Origin', ORIGIN),
      anon().post(`/api/users/${UNKNOWN_ID}/suspend`).set('Origin', ORIGIN),
      anon().post(`/api/users/${UNKNOWN_ID}/password-reset`).set('Origin', ORIGIN),
      anon().get(`/api/auth/${ANON_ID}`),
      anon().get('/api/auth/sessions'),
    ];
    for (const res of await Promise.all(calls)) expect(res.status).toBe(401);
  });

  it('has no role-change, approve, reject or roles-matrix endpoint any more', async () => {
    const { client } = await signInAs(Roles.SUPER_ADMIN);
    expect((await client.patch(`/api/users/${UNKNOWN_ID}/role`).send({ role: 'admin' })).status).toBe(404);
    expect((await client.post(`/api/users/${UNKNOWN_ID}/approve`)).status).toBe(404);
    expect((await client.post(`/api/users/${UNKNOWN_ID}/reject`).send({})).status).toBe(404);
    expect((await client.get('/api/admin/roles')).status).toBe(404);
  });

  it('returns 403 to an admin on the user list, whatever permissions they hold', async () => {
    for (const permissions of [[], ADMIN_PERMISSIONS_WITHOUT_USER_RESET]) {
      const { client } = await signInAs(Roles.ADMIN, { permissions });
      const res = await client.get('/api/users');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });

  it('lists admins only, with pagination and filters', async () => {
    await makeUser({ status: AccountStatus.SUSPENDED, name: 'Suspended Person' });
    await makeUser({ name: 'Active Person' });
    await makeUser({ name: 'Third Person' });
    const { client } = await signInAs(Roles.SUPER_ADMIN);

    const all = await client.get('/api/users?limit=2&page=1');
    expect(all.status).toBe(200);
    expect(all.body.data.users).toHaveLength(2);
    expect(all.body.data.totalCount).toBe(3);

    const suspended = await client.get('/api/users?status=suspended');
    expect(suspended.body.data.totalCount).toBe(1);
    expect(suspended.body.data.users[0].name).toBe('Suspended Person');

    expect((await client.get('/api/users?search=active%20per')).body.data.users).toHaveLength(1);
    expect((await client.get('/api/users?limit=5000')).status).toBe(400);
    expect((await client.get('/api/users?status=pending')).status).toBe(400);
  });

  it('never lists the Super Admin (not even the one asking), or deleted admins', async () => {
    const other = await makeUser({ role: Roles.SUPER_ADMIN, name: 'Hidden Boss' });
    const gone = await makeUser({ name: 'Gone Admin' });
    await User.updateOne({ _id: gone._id }, { $set: { isDeleted: true } });
    await makeUser({ name: 'Visible Admin' });
    const { client } = await signInAs(Roles.SUPER_ADMIN, { name: 'Me The Boss' });
    const res = await client.get('/api/users');
    const names = res.body.data.users.map((u: { name: string }) => u.name);
    expect(names).toEqual(['Visible Admin']);
    expect(res.body.data.totalCount).toBe(1);
    expect(JSON.stringify(res.body)).not.toContain(other.email);
    expect((await client.get('/api/users?search=boss')).body.data.totalCount).toBe(0);
  });

  it('treats search text literally, not as a regular expression', async () => {
    await makeUser({ name: 'Plain Name' });
    const { client } = await signInAs(Roles.SUPER_ADMIN);
    expect((await client.get('/api/users?search=.*')).body.data.totalCount).toBe(0);
  });

  it('shows each admin’s selected permissions but never hashes or lock state', async () => {
    await makeUser({ permissions: ['events.read', 'members.read'] });
    const { client } = await signInAs(Roles.SUPER_ADMIN);
    const res = await client.get('/api/users');
    expect(res.body.data.users[0].permissions.sort()).toEqual(['events.read', 'members.read']);
    expect(res.body.data.users[0]).not.toHaveProperty('phone');
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2|failedLoginCount|lockUntil/);
  });
});

describe('an admin can never manage any account, even with tampered data', () => {
  it('is refused on every account action, even holding every selectable permission', async () => {
    const victim = await makeUser({ name: 'Victim Admin' });
    const boss = await makeUser({ role: Roles.SUPER_ADMIN });
    const { user: admin, client } = await signInAs(Roles.ADMIN, { permissions: ADMIN_PERMISSIONS_WITHOUT_USER_RESET });
    const calls = await Promise.all([
      client.get('/api/users'),
      client.post('/api/users').send({ name: 'Bad Actor', email: 'bad@example.test', password: 'Bad-Actor-2026', permissions: [] }),
      client.patch(`/api/users/${victim._id}`).send({ name: 'Renamed', permissions: ['events.read'] }),
      client.post(`/api/users/${victim._id}/suspend`).send({}),
      client.post(`/api/users/${victim._id}/reactivate`),
      client.post(`/api/users/${victim._id}/revoke-sessions`),
      client.del(`/api/users/${victim._id}`),
      client.patch(`/api/users/${boss._id}`).send({ name: 'Pwned' }),
      client.del(`/api/users/${boss._id}`),
      client.patch(`/api/users/${admin._id}`).send({ permissions: ['events.read'] }),
    ]);
    for (const res of calls) expect(res.status).toBe(403);

    expect((await User.findById(victim._id).lean())).toMatchObject({ name: 'Victim Admin', isDeleted: false, status: 'active' });
    expect((await User.findById(boss._id).lean())?.name).not.toBe('Pwned');
    expect(await User.countDocuments({ email: 'bad@example.test' })).toBe(0);
  });

  it('still cannot manage accounts if their stored permission list is forged to include Super-Admin-only values', async () => {
    const victim = await makeUser();
    const forged = await makeUser();
    // Bypass the schema validation, as direct tampering with the database would.
    await User.collection.updateOne(
      { _id: forged._id as never },
      { $set: { permissions: ALL_PERMISSIONS.filter((p) => p !== 'users.reset_password') } },
    );
    const client = await signIn(forged.email);
    const me = await client.get(`/api/auth/${client.userId}`);
    expect(me.body.data.user.permissions).not.toContain('users.manage');
    expect(me.body.data.user.permissions).not.toContain('sessions.revoke');
    expect((await client.get('/api/users')).status).toBe(403);
    expect((await client.del(`/api/users/${victim._id}`)).status).toBe(403);
    expect((await client.post(`/api/users/${victim._id}/suspend`).send({})).status).toBe(403);
  });

  it('cannot become Super Admin by changing their own role field in a request', async () => {
    const { user, client } = await signInAs(Roles.ADMIN, { permissions: ALL_ADMIN_PERMISSIONS });
    const res = await client.patch(`/api/users/${user._id}`).send({ role: 'superadmin', name: 'Still Admin' });
    expect(res.status).toBe(403);
    expect((await User.findById(user._id).lean())?.role).toBe('admin');
  });
});

describe('Super Admin manages admins', () => {
  it('creates an admin with the chosen password and exactly the selected permissions', async () => {
    const { client: sa } = await signInAs(Roles.SUPER_ADMIN);
    const res = await sa.post('/api/users').send({
      name: 'Nisha Shah',
      email: 'nisha@example.test',
      password: 'Welcome-Chosen-2026',
      permissions: ['events.read', 'events.publish'],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('admin');
    expect(res.body.data.user.permissions.sort()).toEqual(['events.publish', 'events.read']);
    expect(typeof res.body.data.email.delivered).toBe('boolean');
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|Welcome-Chosen-2026/);

    const stored = await User.findOne({ email: 'nisha@example.test' }).lean();
    expect(stored?.permissions.sort()).toEqual(['events.publish', 'events.read']);
    const audit = await AuditLog.findOne({ action: 'user.admin_created' }).lean();
    expect(audit?.metadata).toMatchObject({ permissions: ['events.read', 'events.publish'] });

    const nisha = await signIn('nisha@example.test', 'Welcome-Chosen-2026');
    const me = await nisha.get(`/api/auth/${nisha.userId}`);
    expect(me.body.data.user.permissions.sort()).toEqual(['events.publish', 'events.read']);
  });

  it('refuses to create an admin without a valid password', async () => {
    const { client: sa } = await signInAs(Roles.SUPER_ADMIN);
    expect((await sa.post('/api/users').send({ name: 'No Pass', email: 'nopass@example.test' })).status).toBe(400);
    expect((await sa.post('/api/users').send({ name: 'No Pass', email: 'nopass@example.test', password: 'weak' })).status).toBe(400);
    expect(await User.countDocuments({ email: 'nopass@example.test' })).toBe(0);
  });

  it('creates an admin with no permissions by default', async () => {
    const { client: sa } = await signInAs(Roles.SUPER_ADMIN);
    const res = await sa.post('/api/users').send({ name: 'Empty Admin', email: 'empty@example.test', password: 'Welcome-Blank-2026' });
    expect(res.status).toBe(201);
    expect(res.body.data.user.permissions).toEqual([]);
  });

  it('cannot create a Super Admin, use unselectable permissions or duplicate an email', async () => {
    const { client: sa } = await signInAs(Roles.SUPER_ADMIN);
    const base = { name: 'Sneaky', email: 'sneaky@example.test', password: 'Welcome-Base-2026' };
    expect((await sa.post('/api/users').send({ ...base, role: 'superadmin' })).status).toBe(400);
    expect((await sa.post('/api/users').send({ ...base, role: 'editor' })).status).toBe(400);
    for (const permissions of [['users.manage'], ['roles.manage'], ['sessions.revoke'], ['members.approve'], ['events.read', 'events.read'], 'events.read', [1]]) {
      expect((await sa.post('/api/users').send({ ...base, permissions })).status).toBe(400);
    }
    expect(await User.countDocuments({ email: base.email })).toBe(0);
    const existing = await makeUser({ email: 'taken@example.test' });
    expect((await sa.post('/api/users').send({ name: 'Dup', email: existing.email, password: 'Dup-Pass-2026' })).status).toBe(409);
  });

  it('edits an admin’s name and permissions, and the change applies on the very next request', async () => {
    const admin = await makeUser({ permissions: ['events.read'] });
    const adminClient = await signIn(admin.email);
    expect((await adminClient.get('/api/admin/members')).status).toBe(403);
    expect((await adminClient.get('/api/admin/events')).status).toBe(200);

    const { client: sa } = await signInAs(Roles.SUPER_ADMIN);
    const res = await sa.patch(`/api/users/${admin._id}`).send({ name: 'Renamed Admin', permissions: ['members.read'] });
    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ name: 'Renamed Admin', permissions: ['members.read'] });

    expect((await adminClient.get('/api/admin/members')).status).toBe(200);
    expect((await adminClient.get('/api/admin/events')).status).toBe(403);
    expect((await adminClient.get(`/api/auth/${adminClient.userId}`)).body.data.user.permissions).toEqual(['members.read']);

    const audit = await AuditLog.findOne({ action: 'user.admin_updated' }).lean();
    expect(audit?.targetId).toBe(admin._id);
    expect(audit?.metadata).toMatchObject({
      before: { name: admin.name, permissions: ['events.read'] },
      after: { name: 'Renamed Admin', permissions: ['members.read'] },
    });

    // Name only keeps the permissions; permissions can be cleared completely.
    expect((await sa.patch(`/api/users/${admin._id}`).send({ name: 'Second Name' })).body.data.user.permissions).toEqual(['members.read']);
    expect((await sa.patch(`/api/users/${admin._id}`).send({ permissions: [] })).body.data.user.permissions).toEqual([]);
  });

  it('refuses unselectable permissions, empty edits and bad ids when editing', async () => {
    const admin = await makeUser();
    const { client: sa } = await signInAs(Roles.SUPER_ADMIN);
    expect((await sa.patch(`/api/users/${admin._id}`).send({ permissions: ['users.manage'] })).status).toBe(400);
    expect((await sa.patch(`/api/users/${admin._id}`).send({})).status).toBe(400);
    expect((await sa.patch('/api/users/not-a-uuid').send({ name: 'Ok Name' })).status).toBe(400);
    expect((await sa.patch(`/api/users/${UNKNOWN_ID}`).send({ name: 'Ok Name' })).status).toBe(404);
    expect((await User.findById(admin._id).lean())?.permissions).toEqual([]);
  });

  it('cannot edit the Super Admin (nobody can, through this API)', async () => {
    const other = await makeUser({ role: Roles.SUPER_ADMIN, name: 'Other Boss' });
    const { user, client: sa } = await signInAs(Roles.SUPER_ADMIN);
    expect((await sa.patch(`/api/users/${other._id}`).send({ name: 'Changed' })).status).toBe(403);
    expect((await sa.patch(`/api/users/${user._id}`).send({ name: 'Changed' })).status).toBe(403);
    expect((await sa.post(`/api/users/${other._id}/suspend`).send({})).status).toBe(403);
    expect((await sa.del(`/api/users/${other._id}`)).status).toBe(403);
    expect((await sa.del(`/api/users/${user._id}`)).status).toBe(403);
    expect((await User.findById(other._id).lean())).toMatchObject({ name: 'Other Boss', isDeleted: false });
    expect((await User.findById(user._id).lean())?.isDeleted).toBe(false);
  });

  it('suspends an admin who is signed out at once, and can reactivate them', async () => {
    const admin = await makeUser({ permissions: ['events.read'] });
    const adminClient = await signIn(admin.email);
    const { client: sa } = await signInAs(Roles.SUPER_ADMIN);

    const res = await sa.post(`/api/users/${admin._id}/suspend`).send({ reason: 'Misuse' });
    expect(res.status).toBe(200);
    expect(res.body.data.user.status).toBe('suspended');
    expect(await Session.countDocuments({ userId: admin._id })).toBe(0);
    expect((await adminClient.get(`/api/auth/${adminClient.userId}`)).status).toBe(401);
    expect((await sa.post(`/api/users/${admin._id}/suspend`).send({})).status).toBe(409);

    const blocked = await anon().post('/api/auth/admin-login').set('Origin', ORIGIN).send({ email: admin.email, password: PASSWORD });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('ACCOUNT_NOT_ACTIVE');

    expect((await sa.post(`/api/users/${admin._id}/reactivate`)).status).toBe(200);
    expect((await sa.post(`/api/users/${admin._id}/reactivate`)).status).toBe(409);
    expect((await signIn(admin.email)).userId).toBe(admin._id);
  });

  it('sets a new password directly, signs the admin out and never returns the password', async () => {
    const admin = await makeUser();
    const adminClient = await signIn(admin.email);
    const { client: sa } = await signInAs(Roles.SUPER_ADMIN);

    const res = await sa.post(`/api/users/${admin._id}/password-reset`).send({ password: 'Fresh-Start-2026' });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('Fresh-Start-2026');
    expect((await adminClient.get(`/api/auth/${adminClient.userId}`)).status).toBe(401); // old sessions revoked
    expect((await signIn(admin.email, 'Fresh-Start-2026')).userId).toBe(admin._id);
    expect((await AuditLog.findOne({ action: 'user.password_reset' }).lean())?.targetId).toBe(admin._id);
  });

  it('rejects a weak password and refuses to reset an inactive admin', async () => {
    const admin = await makeUser();
    const { client: sa } = await signInAs(Roles.SUPER_ADMIN);
    expect((await sa.post(`/api/users/${admin._id}/password-reset`).send({ password: 'weak' })).status).toBe(400);
    expect((await sa.post(`/api/users/${admin._id}/password-reset`).send({})).status).toBe(400);

    await sa.post(`/api/users/${admin._id}/suspend`).send({});
    expect((await sa.post(`/api/users/${admin._id}/password-reset`).send({ password: 'Fresh-Start-2026' })).status).toBe(409);
  });

  it('lets an admin with users.reset_password reset another admin, but only one whose permissions they also hold', async () => {
    const { client } = await signInAs(Roles.ADMIN, { permissions: ['users.reset_password', 'events.read'] });
    const peer = await makeUser({ permissions: ['events.read'] });
    const stronger = await makeUser({ permissions: ['events.read', 'events.publish'] });
    const boss = await makeUser({ role: Roles.SUPER_ADMIN });

    expect((await client.post(`/api/users/${peer._id}/password-reset`).send({ password: 'Peer-Reset-2026' })).status).toBe(200);
    expect((await signIn(peer.email, 'Peer-Reset-2026')).userId).toBe(peer._id);
    expect((await client.post(`/api/users/${stronger._id}/password-reset`).send({ password: 'Peer-Reset-2026' })).status).toBe(403);
    expect((await client.post(`/api/users/${boss._id}/password-reset`).send({ password: 'Peer-Reset-2026' })).status).toBe(403);
    expect((await client.get('/api/users')).status).toBe(200);
    expect((await client.post('/api/users').send({ name: 'Nope', email: 'nope@example.test', password: 'Nope-Pass-2026' })).status).toBe(403);
  });

  it('can revoke all of an admin’s sessions', async () => {
    const admin = await makeUser();
    const phone = await signIn(admin.email);
    const laptop = await signIn(admin.email);
    const { client: sa } = await signInAs(Roles.SUPER_ADMIN);
    const res = await sa.post(`/api/users/${admin._id}/revoke-sessions`);
    expect(res.body.data.revoked).toBe(2);
    expect((await phone.get(`/api/auth/${phone.userId}`)).status).toBe(401);
    expect((await laptop.get(`/api/auth/${laptop.userId}`)).status).toBe(401);
  });

  it('returns 404 for unknown users and 400 for malformed ids', async () => {
    const { client: sa } = await signInAs(Roles.SUPER_ADMIN);
    expect((await sa.post(`/api/users/${UNKNOWN_ID}/suspend`).send({})).status).toBe(404);
    expect((await sa.post(`/api/users/${UNKNOWN_ID}/password-reset`).send({ password: 'Fresh-Start-2026' })).status).toBe(404);
    expect((await sa.del(`/api/users/${UNKNOWN_ID}`)).status).toBe(404);
    expect((await sa.post('/api/users/not-a-uuid/suspend').send({})).status).toBe(400);
    expect((await sa.del('/api/users/not-a-uuid')).status).toBe(400);
  });
});

describe('deleting an admin (soft delete)', () => {
  it('marks the account deleted, signs it out everywhere and removes it from the list', async () => {
    const admin = await makeUser({ name: 'Leaving Admin', permissions: ['events.read'] });
    const phone = await signIn(admin.email);
    const laptop = await signIn(admin.email);
    const { client: sa } = await signInAs(Roles.SUPER_ADMIN);
    await PasswordResetToken.create({ userId: admin._id, tokenHash: 'x'.repeat(64), purpose: 'reset', expiresAt: new Date(Date.now() + 60_000) });

    const res = await sa.del(`/api/users/${admin._id}`);
    expect(res.status).toBe(200);

    const stored = await User.findById(admin._id).lean();
    expect(stored?.isDeleted).toBe(true); // soft delete: the record stays
    expect(await Session.countDocuments({ userId: admin._id })).toBe(0);
    expect(await PasswordResetToken.countDocuments({ userId: admin._id, usedAt: null })).toBe(0);
    expect((await phone.get(`/api/auth/${phone.userId}`)).status).toBe(401);
    expect((await laptop.get(`/api/auth/${laptop.userId}`)).status).toBe(401);

    const list = await sa.get('/api/users');
    expect(list.body.data.totalCount).toBe(0);
    const login = await anon().post('/api/auth/admin-login').set('Origin', ORIGIN).send({ email: admin.email, password: PASSWORD });
    expect(login.status).toBe(401);

    // Already deleted: not found, and further actions are refused.
    expect((await sa.del(`/api/users/${admin._id}`)).status).toBe(404);
    expect((await sa.patch(`/api/users/${admin._id}`).send({ name: 'Zombie' })).status).toBe(404);
  });

  it('keeps the email reserved, because the unique email index also covers deleted accounts', async () => {
    const admin = await makeUser({ email: 'reserved@example.test' });
    const { client: sa } = await signInAs(Roles.SUPER_ADMIN);
    await sa.del(`/api/users/${admin._id}`);
    expect((await User.findById(admin._id).lean())?.email).toBe('reserved@example.test');
    const again = await sa.post('/api/users').send({ name: 'New Person', email: 'reserved@example.test', password: 'New-Person-2026' });
    expect(again.status).toBe(409);
  });

  it('is written to the audit log', async () => {
    const admin = await makeUser();
    const { user: sa, client } = await signInAs(Roles.SUPER_ADMIN);
    await client.del(`/api/users/${admin._id}`);
    const entry = await AuditLog.findOne({ action: 'user.deleted' }).lean();
    expect(entry).toMatchObject({ actorId: sa._id, targetType: 'user', targetId: admin._id });
  });
});

describe('audit trail for sensitive actions', () => {
  it('records creation, edits, suspension and deletion with actor and target, but no secrets', async () => {
    const { user: sa, client } = await signInAs(Roles.SUPER_ADMIN);
    const created = await client.post('/api/users').send({ name: 'Audit Subject', email: 'audit@example.test', password: 'Welcome-Trail-2026', permissions: ['events.read'] });
    const id = created.body.data.user.id as string;
    await client.patch(`/api/users/${id}`).send({ permissions: ['members.read'] });
    await client.post(`/api/users/${id}/suspend`).send({ reason: 'test' });
    await client.del(`/api/users/${id}`);

    const actions = (await AuditLog.find({ actorId: sa._id }).lean()).map((e) => e.action);
    expect(actions).toEqual(
      expect.arrayContaining(['user.admin_created', 'user.admin_updated', 'user.suspended', 'user.deleted', 'auth.admin_login']),
    );
    for (const e of await AuditLog.find({ action: { $in: ['user.admin_updated', 'user.suspended', 'user.deleted'] } }).lean()) {
      expect(e.targetId).toBe(id);
    }

    const everything = JSON.stringify(await AuditLog.find().lean());
    expect(everything).not.toContain(PASSWORD);
    expect(everything).not.toMatch(/argon2|csrf/i);
  });
});
