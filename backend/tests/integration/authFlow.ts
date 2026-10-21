import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import User from '../../src/models/User';
import Session from '../../src/models/Session';
import AuditLog from '../../src/models/AuditLog';
import OrganizationSettings from '../../src/models/OrganizationSettings';
import { AccountStatus, Roles, config } from '../../src/config/constants';
import { hashToken } from '../../src/utils/tokens';
import {
  ORIGIN,
  PASSWORD,
  anon,
  connectTestDb,
  disconnectTestDb,
  makeUser,
  resetDb,
  signIn,
} from '../helpers';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(resetDb);

const register = (body: Record<string, unknown>) =>
  anon().post('/api/auth/register').set('Origin', ORIGIN).send(body);

const validRegistration = {
  name: 'Asha Patel',
  email: 'asha@example.test',
  phone: '+91 98250 00000',
  password: PASSWORD,
  confirmPassword: PASSWORD,
  acknowledge: true,
};

describe('registration', () => {
  it('creates a pending member and stores only a password hash', async () => {
    const res = await register(validRegistration);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.status).toBe('pending');

    const stored = await User.findOne({ email: 'asha@example.test' }).select('+passwordHash').lean();
    expect(stored?.role).toBe(Roles.MEMBER);
    expect(stored?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(JSON.stringify(res.body)).not.toContain(PASSWORD);
  });

  it('ignores role, status and permission fields sent by the client (mass assignment)', async () => {
    const res = await register({
      ...validRegistration,
      role: 'superadmin',
      status: 'active',
      extraPermissions: ['events.publish'],
      isDeleted: false,
    });
    expect(res.status).toBe(201);
    const stored = await User.findOne({ email: 'asha@example.test' }).lean();
    expect(stored?.role).toBe('member');
    expect(stored?.status).toBe('pending');
    expect(stored?.extraPermissions).toEqual([]);
  });

  it('rejects a duplicate email with 409', async () => {
    await register(validRegistration);
    const again = await register({ ...validRegistration, name: 'Someone Else' });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('DUPLICATE_ERROR');
    expect(await User.countDocuments({ email: 'asha@example.test' })).toBe(1);
  });

  it('treats emails case-insensitively when preventing duplicates', async () => {
    await register(validRegistration);
    const again = await register({ ...validRegistration, email: 'ASHA@Example.Test' });
    expect(again.status).toBe(409);
  });

  it.each([
    ['weak password', { password: 'short1', confirmPassword: 'short1' }, 'password'],
    ['no digit', { password: 'onlyletters-here', confirmPassword: 'onlyletters-here' }, 'password'],
    ['common password', { password: 'password123', confirmPassword: 'password123' }, 'password'],
    ['mismatched confirmation', { confirmPassword: 'Different-Pass-1' }, 'confirmPassword'],
    ['missing acknowledgement', { acknowledge: false }, 'acknowledge'],
    ['invalid email', { email: 'not-an-email' }, 'email'],
    ['markup in name', { name: '<script>alert(1)</script>' }, 'name'],
    ['invalid phone', { phone: 'call me' }, 'phone'],
  ])('rejects %s with a field-level 400', async (_label, patch, field) => {
    const res = await register({ ...validRegistration, ...patch });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d: { field: string }) => d.field)).toContain(field);
    expect(await User.countDocuments()).toBe(0);
  });

  it('rejects operator objects in fields (NoSQL injection)', async () => {
    const res = await register({ ...validRegistration, email: { $gt: '' } });
    expect(res.status).toBe(400);
    const login = await anon()
      .post('/api/auth/login')
      .set('Origin', ORIGIN)
      .send({ email: { $ne: null }, password: { $ne: null } });
    expect(login.status).toBe(400);
  });

  it('refuses registration while it is closed in organisation settings', async () => {
    await OrganizationSettings.create({ key: 'main', registrationOpen: false });
    const res = await register(validRegistration);
    expect(res.status).toBe(403);
    expect(await User.countDocuments()).toBe(0);
  });
});

describe('login', () => {
  it('signs in an active user, sets an HTTP-only SameSite cookie and returns permissions', async () => {
    const user = await makeUser({ role: Roles.EDITOR });
    const res = await anon().post('/api/auth/login').set('Origin', ORIGIN).send({ email: user.email, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('editor');
    expect(res.body.data.user.permissions).toContain('events.create');
    expect(res.body.data.user.permissions).not.toContain('users.manage');
    expect(res.body.data.csrfToken).toEqual(expect.any(String));

    const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.startsWith(`${config.session.cookieName}=`),
    )!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);
  });

  it('stores only a hash of the session token', async () => {
    const user = await makeUser();
    const client = await signIn(user.email);
    const raw = client.cookie.split('=')[1]!;
    const session = await Session.findOne({ userId: user._id }).lean();
    expect(session?.tokenHash).toBe(hashToken(raw));
    expect(session?.tokenHash).not.toBe(raw);
  });

  it('gives the same generic error for a wrong password and an unknown email', async () => {
    const user = await makeUser();
    const wrong = await anon().post('/api/auth/login').set('Origin', ORIGIN).send({ email: user.email, password: 'Wrong-Pass-123' });
    const unknown = await anon().post('/api/auth/login').set('Origin', ORIGIN).send({ email: 'nobody@example.test', password: 'Wrong-Pass-123' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body.message).toBe('Invalid email or password');
  });

  it.each([
    [AccountStatus.PENDING, /awaiting approval/i],
    [AccountStatus.REJECTED, /not approved/i],
    [AccountStatus.SUSPENDED, /suspended/i],
  ])('blocks %s accounts with a clear message — only after the password is right', async (status, message) => {
    const user = await makeUser({ status });
    const bad = await anon().post('/api/auth/login').set('Origin', ORIGIN).send({ email: user.email, password: 'Wrong-Pass-123' });
    expect(bad.status).toBe(401); // status is not revealed to someone who does not know the password
    expect(bad.body.message).toBe('Invalid email or password');

    const good = await anon().post('/api/auth/login').set('Origin', ORIGIN).send({ email: user.email, password: PASSWORD });
    expect(good.status).toBe(403);
    expect(good.body.error.code).toBe('ACCOUNT_NOT_ACTIVE');
    expect(good.body.message).toMatch(message);
    expect(good.headers['set-cookie']).toBeUndefined();
  });

  it('locks the account after repeated failures, even for the right password', async () => {
    const user = await makeUser();
    for (let i = 0; i < config.auth.maxFailedLogins; i += 1) {
      await anon().post('/api/auth/login').set('Origin', ORIGIN).send({ email: user.email, password: 'Wrong-Pass-123' });
    }
    const locked = await anon().post('/api/auth/login').set('Origin', ORIGIN).send({ email: user.email, password: PASSWORD });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('RATE_LIMITED');

    // Once the lock expires the user can sign in again and the counter is cleared.
    await User.updateOne({ _id: user._id }, { $set: { lockUntil: new Date(Date.now() - 1000) } });
    const ok = await anon().post('/api/auth/login').set('Origin', ORIGIN).send({ email: user.email, password: PASSWORD });
    expect(ok.status).toBe(200);
  });

  it('rotates the session: a pre-login cookie is dropped and a new token is issued', async () => {
    const user = await makeUser();
    const first = await signIn(user.email);
    const oldToken = first.cookie.split('=')[1]!;

    const again = await request(app)
      .post('/api/auth/login')
      .set('Origin', ORIGIN)
      .set('Cookie', first.cookie)
      .send({ email: user.email, password: PASSWORD });
    expect(again.status).toBe(200);
    const newCookie = (again.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    expect(newCookie.split('=')[1]).not.toBe(oldToken);
    expect(await Session.countDocuments({ tokenHash: hashToken(oldToken) })).toBe(0);
  });

  it('records failures in the audit log without storing the password or the email', async () => {
    const user = await makeUser();
    await anon().post('/api/auth/login').set('Origin', ORIGIN).send({ email: user.email, password: 'Wrong-Pass-123' });
    const entry = await AuditLog.findOne({ action: 'auth.login_failed' }).lean();
    expect(entry?.outcome).toBe('failure');
    const dump = JSON.stringify(entry);
    expect(dump).not.toContain('Wrong-Pass-123');
    expect(dump).not.toContain(user.email);
  });
});

describe('session lifecycle', () => {
  it('returns 401 without a cookie and the profile with one', async () => {
    expect((await anon().get('/api/auth/me')).status).toBe(401);
    const user = await makeUser();
    const client = await signIn(user.email);
    const me = await client.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(user.email);
    expect(me.body.data.csrfToken).toBe(client.csrf);
  });

  it('logout invalidates the session on the server, not just in the browser', async () => {
    const user = await makeUser();
    const client = await signIn(user.email);
    expect((await client.post('/api/auth/logout')).status).toBe(200);

    // Replaying the old cookie must fail.
    const replay = await request(app).get('/api/auth/me').set('Cookie', client.cookie);
    expect(replay.status).toBe(401);
    expect(await Session.countDocuments({ userId: user._id })).toBe(0);
  });

  it('expires sessions past their absolute lifetime', async () => {
    const user = await makeUser();
    const client = await signIn(user.email);
    await Session.updateMany({ userId: user._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await client.get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('expires idle sessions', async () => {
    const user = await makeUser();
    const client = await signIn(user.email);
    const stale = new Date(Date.now() - (config.session.idleMinutes + 5) * 60_000);
    await Session.updateMany({ userId: user._id }, { $set: { lastSeenAt: stale } });
    const res = await client.get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('signs a user out immediately when they are suspended (existing session dies)', async () => {
    const user = await makeUser();
    const client = await signIn(user.email);
    await User.updateOne({ _id: user._id }, { $set: { status: AccountStatus.SUSPENDED } });
    const res = await client.get('/api/auth/me');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_NOT_ACTIVE');
    expect(await Session.countDocuments({ userId: user._id })).toBe(0);
  });

  it('lists a user’s own sessions and lets them sign out another device', async () => {
    const user = await makeUser();
    const phone = await signIn(user.email);
    const laptop = await signIn(user.email);
    const list = await laptop.get('/api/auth/sessions');
    expect(list.body.data.totalCount).toBe(2);
    expect(list.body.data.sessions.filter((s: { current: boolean }) => s.current)).toHaveLength(1);

    const other = list.body.data.sessions.find((s: { current: boolean }) => !s.current);
    expect((await laptop.del(`/api/auth/sessions/${other.id}`)).status).toBe(200);
    expect((await phone.get('/api/auth/me')).status).toBe(401);
  });

  it('never lets a user revoke someone else’s session', async () => {
    const alice = await makeUser();
    const bob = await makeUser();
    const aliceClient = await signIn(alice.email);
    const bobClient = await signIn(bob.email);
    const bobSession = await Session.findOne({ userId: bob._id }).lean();
    const res = await aliceClient.del(`/api/auth/sessions/${bobSession!._id}`);
    expect(res.status).toBe(404);
    expect((await bobClient.get('/api/auth/me')).status).toBe(200);
  });
});

describe('CSRF protection', () => {
  it('rejects a state-changing request without the CSRF token', async () => {
    const user = await makeUser();
    const client = await signIn(user.email);
    const res = await client.agent.post('/api/auth/logout').set('Origin', ORIGIN);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_INVALID');
    expect((await client.get('/api/auth/me')).status).toBe(200); // still signed in
  });

  it('rejects a wrong CSRF token', async () => {
    const user = await makeUser();
    const client = await signIn(user.email);
    const res = await client.agent.post('/api/auth/logout').set('Origin', ORIGIN).set('X-CSRF-Token', 'x'.repeat(43));
    expect(res.status).toBe(403);
  });

  it('rejects a CSRF token from a different session', async () => {
    const a = await signIn((await makeUser()).email);
    const b = await signIn((await makeUser()).email);
    const res = await a.agent.post('/api/auth/logout').set('Origin', ORIGIN).set('X-CSRF-Token', b.csrf);
    expect(res.status).toBe(403);
  });

  it('blocks requests from another origin, including anonymous ones', async () => {
    const res = await anon().post('/api/auth/login').set('Origin', 'https://evil.example').send({ email: 'a@b.co', password: 'x' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_INVALID');
  });

  it('blocks a cookie-bearing mutation that carries no Origin or Referer', async () => {
    const user = await makeUser();
    const client = await signIn(user.email);
    const res = await request(app).post('/api/auth/logout').set('Cookie', client.cookie).set('X-CSRF-Token', client.csrf);
    expect(res.status).toBe(403);
  });
});

describe('theme preference', () => {
  it('defaults to system, persists per user and is restored on another device', async () => {
    const user = await makeUser();
    const laptop = await signIn(user.email);
    expect((await laptop.get('/api/auth/me')).body.data.user.themePreference).toBe('system');

    const saved = await laptop.patch('/api/auth/me/theme').send({ themePreference: 'dark' });
    expect(saved.status).toBe(200);

    const phone = await signIn(user.email); // a brand-new session on "another device"
    expect((await phone.get('/api/auth/me')).body.data.user.themePreference).toBe('dark');
  });

  it('keeps preferences separate for each user', async () => {
    const a = await signIn((await makeUser()).email);
    const b = await signIn((await makeUser()).email);
    await a.patch('/api/auth/me/theme').send({ themePreference: 'light' });
    expect((await b.get('/api/auth/me')).body.data.user.themePreference).toBe('system');
  });

  it('rejects unknown values and requires sign-in', async () => {
    const client = await signIn((await makeUser()).email);
    expect((await client.patch('/api/auth/me/theme').send({ themePreference: 'neon' })).status).toBe(400);
    const anonRes = await anon().patch('/api/auth/me/theme').set('Origin', ORIGIN).send({ themePreference: 'dark' });
    expect(anonRes.status).toBe(401);
  });
});

describe('password change and reset', () => {
  it('changes the password, signs out other devices and keeps the current one signed in', async () => {
    const user = await makeUser();
    const phone = await signIn(user.email);
    const laptop = await signIn(user.email);
    const res = await laptop.post('/api/auth/change-password').send({
      currentPassword: PASSWORD,
      newPassword: 'Brand-New-Pass-42',
      confirmPassword: 'Brand-New-Pass-42',
    });
    expect(res.status).toBe(200);
    expect((await phone.get('/api/auth/me')).status).toBe(401);
    expect((await laptop.get('/api/auth/me')).status).toBe(200);
    expect((await anon().post('/api/auth/login').set('Origin', ORIGIN).send({ email: user.email, password: PASSWORD })).status).toBe(401);
    expect((await signIn(user.email, 'Brand-New-Pass-42')).userId).toBe(user._id);
  });

  it('refuses a wrong current password', async () => {
    const user = await makeUser();
    const client = await signIn(user.email);
    const res = await client.post('/api/auth/change-password').send({
      currentPassword: 'Not-My-Password-1',
      newPassword: 'Brand-New-Pass-42',
      confirmPassword: 'Brand-New-Pass-42',
    });
    expect(res.status).toBe(400);
  });

  it('forgot-password answers identically for known and unknown emails', async () => {
    const user = await makeUser();
    const known = await anon().post('/api/auth/forgot-password').set('Origin', ORIGIN).send({ email: user.email });
    const unknown = await anon().post('/api/auth/forgot-password').set('Origin', ORIGIN).send({ email: 'ghost@example.test' });
    expect(known.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
  });

  it('rejects an invalid or expired reset token', async () => {
    const res = await anon().post('/api/auth/reset-password').set('Origin', ORIGIN).send({
      token: 'a'.repeat(43),
      password: 'Another-Pass-77',
      confirmPassword: 'Another-Pass-77',
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid or has expired/i);
  });
});
