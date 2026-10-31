import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import User from '../../src/models/User';
import Session from '../../src/models/Session';
import AuditLog from '../../src/models/AuditLog';
import { AccountStatus, Roles, config } from '../../src/config/constants';
import { hashToken } from '../../src/utils/tokens';
import {
  ORIGIN,
  PASSWORD,
  ANON_ID,
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

const post = (path: string, email: string, password = PASSWORD) =>
  anon().post(path).set('Origin', ORIGIN).send({ email, password });

describe('there is no member registration or sign-in', () => {
  it('has no register endpoint and no member login endpoint', async () => {
    const reg = await anon().post('/api/auth/register').set('Origin', ORIGIN).send({
      name: 'Asha Patel',
      email: 'asha@example.test',
      password: PASSWORD,
      confirmPassword: PASSWORD,
      acknowledge: true,
    });
    expect(reg.status).toBe(404);
    expect(await User.countDocuments()).toBe(0);
    const user = await makeUser();
    const login = await post('/api/auth/login', user.email);
    expect(login.status).toBe(404);
    expect(login.headers['set-cookie']).toBeUndefined();
  });
});

describe('the single sign-in (/api/auth/admin-login)', () => {
  it.each([Roles.ADMIN, Roles.SUPER_ADMIN])('lets a %s in', async (role) => {
    const user = await makeUser({ role });
    expect((await post('/api/auth/admin-login', user.email)).status).toBe(200);
  });

  it('refuses a leftover account whose role no longer exists, with the generic error', async () => {
    const legacy = await makeUser();
    await User.collection.updateOne({ _id: legacy._id as never }, { $set: { role: 'member' } });
    const res = await post('/api/auth/admin-login', legacy.email);
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('gives wrong passwords and unknown emails the same answer', async () => {
    const staff = await makeUser({ role: Roles.ADMIN });
    const wrong = await post('/api/auth/admin-login', staff.email, 'Wrong-Pass-123');
    const unknown = await post('/api/auth/admin-login', 'nobody@example.test', 'Wrong-Pass-123');
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  it('rejects operator objects in fields (NoSQL injection)', async () => {
    const login = await anon()
      .post('/api/auth/admin-login')
      .set('Origin', ORIGIN)
      .send({ email: { $ne: null }, password: { $ne: null } });
    expect(login.status).toBe(400);
  });
});

describe('login', () => {
  it('signs in an active user, sets an HTTP-only SameSite cookie and returns permissions', async () => {
    const user = await makeUser({ role: Roles.ADMIN, permissions: ['events.create', 'events.read'] });
    const res = await anon().post('/api/auth/admin-login').set('Origin', ORIGIN).send({ email: user.email, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('admin');
    expect([...res.body.data.user.permissions].sort()).toEqual(['events.create', 'events.read']);
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
    const wrong = await anon().post('/api/auth/admin-login').set('Origin', ORIGIN).send({ email: user.email, password: 'Wrong-Pass-123' });
    const unknown = await anon().post('/api/auth/admin-login').set('Origin', ORIGIN).send({ email: 'nobody@example.test', password: 'Wrong-Pass-123' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body.message).toBe('Invalid email or password');
  });

  it('blocks inactive accounts with a clear message — only after the password is right', async () => {
    const message = /inactive/i;
    const user = await makeUser({ status: AccountStatus.SUSPENDED });
    const bad = await anon().post('/api/auth/admin-login').set('Origin', ORIGIN).send({ email: user.email, password: 'Wrong-Pass-123' });
    expect(bad.status).toBe(401); // status is not revealed to someone who does not know the password
    expect(bad.body.message).toBe('Invalid email or password');

    const good = await anon().post('/api/auth/admin-login').set('Origin', ORIGIN).send({ email: user.email, password: PASSWORD });
    expect(good.status).toBe(403);
    expect(good.body.error.code).toBe('ACCOUNT_NOT_ACTIVE');
    expect(good.body.message).toMatch(message);
    expect(good.headers['set-cookie']).toBeUndefined();
  });

  it('locks the account after repeated failures, even for the right password', async () => {
    const user = await makeUser();
    for (let i = 0; i < config.auth.maxFailedLogins; i += 1) {
      await anon().post('/api/auth/admin-login').set('Origin', ORIGIN).send({ email: user.email, password: 'Wrong-Pass-123' });
    }
    const locked = await anon().post('/api/auth/admin-login').set('Origin', ORIGIN).send({ email: user.email, password: PASSWORD });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('RATE_LIMITED');

    // Once the lock expires the user can sign in again and the counter is cleared.
    await User.updateOne({ _id: user._id }, { $set: { lockUntil: new Date(Date.now() - 1000) } });
    const ok = await anon().post('/api/auth/admin-login').set('Origin', ORIGIN).send({ email: user.email, password: PASSWORD });
    expect(ok.status).toBe(200);
  });

  it('rotates the session: a pre-login cookie is dropped and a new token is issued', async () => {
    const user = await makeUser();
    const first = await signIn(user.email);
    const oldToken = first.cookie.split('=')[1]!;

    const again = await request(app)
      .post('/api/auth/admin-login')
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
    await anon().post('/api/auth/admin-login').set('Origin', ORIGIN).send({ email: user.email, password: 'Wrong-Pass-123' });
    const entry = await AuditLog.findOne({ action: 'auth.login_failed' }).lean();
    expect(entry?.outcome).toBe('failure');
    const dump = JSON.stringify(entry);
    expect(dump).not.toContain('Wrong-Pass-123');
    expect(dump).not.toContain(user.email);
  });
});

describe('session lifecycle', () => {
  it('returns 401 without a cookie and the profile with one', async () => {
    expect((await anon().get(`/api/auth/${ANON_ID}`)).status).toBe(401);
    const user = await makeUser();
    const client = await signIn(user.email);
    const me = await client.get(`/api/auth/${client.userId}`);
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(user.email);
    expect(me.body.data.csrfToken).toBe(client.csrf);
  });

  it('refuses another user\'s id and a malformed id', async () => {
    const client = await signIn((await makeUser()).email);
    const other = await makeUser();
    expect((await client.get(`/api/auth/${other.id}`)).status).toBe(403);
    expect((await client.patch(`/api/auth/${other.id}/theme`).send({ themePreference: 'dark' })).status).toBe(403);
    expect((await User.findById(other._id).lean())?.themePreference).not.toBe('dark');
    expect((await client.get('/api/auth/me')).status).toBe(400);
  });

  it('logout invalidates the session on the server, not just in the browser', async () => {
    const user = await makeUser();
    const client = await signIn(user.email);
    expect((await client.post('/api/auth/logout')).status).toBe(200);

    // Replaying the old cookie must fail.
    const replay = await request(app).get(`/api/auth/${client.userId}`).set('Cookie', client.cookie);
    expect(replay.status).toBe(401);
    expect(await Session.countDocuments({ userId: user._id })).toBe(0);
  });

  it('expires sessions past their absolute lifetime', async () => {
    const user = await makeUser();
    const client = await signIn(user.email);
    await Session.updateMany({ userId: user._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await client.get(`/api/auth/${client.userId}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('expires idle sessions', async () => {
    const user = await makeUser();
    const client = await signIn(user.email);
    const stale = new Date(Date.now() - (config.session.idleMinutes + 5) * 60_000);
    await Session.updateMany({ userId: user._id }, { $set: { lastSeenAt: stale } });
    const res = await client.get(`/api/auth/${client.userId}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('signs a user out immediately when they are suspended (existing session dies)', async () => {
    const user = await makeUser();
    const client = await signIn(user.email);
    await User.updateOne({ _id: user._id }, { $set: { status: AccountStatus.SUSPENDED } });
    const res = await client.get(`/api/auth/${client.userId}`);
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
    expect((await phone.get(`/api/auth/${phone.userId}`)).status).toBe(401);
  });

  it('never lets a user revoke someone else’s session', async () => {
    const alice = await makeUser();
    const bob = await makeUser();
    const aliceClient = await signIn(alice.email);
    const bobClient = await signIn(bob.email);
    const bobSession = await Session.findOne({ userId: bob._id }).lean();
    const res = await aliceClient.del(`/api/auth/sessions/${bobSession!._id}`);
    expect(res.status).toBe(404);
    expect((await bobClient.get(`/api/auth/${bobClient.userId}`)).status).toBe(200);
  });
});

describe('CSRF protection', () => {
  it('rejects a state-changing request without the CSRF token', async () => {
    const user = await makeUser();
    const client = await signIn(user.email);
    const res = await client.agent.post('/api/auth/logout').set('Origin', ORIGIN);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_INVALID');
    expect((await client.get(`/api/auth/${client.userId}`)).status).toBe(200); // still signed in
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
    const res = await anon().post('/api/auth/admin-login').set('Origin', 'https://evil.example').send({ email: 'a@b.co', password: 'x' });
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
    expect((await laptop.get(`/api/auth/${laptop.userId}`)).body.data.user.themePreference).toBe('system');

    const saved = await laptop.patch(`/api/auth/${laptop.userId}/theme`).send({ themePreference: 'dark' });
    expect(saved.status).toBe(200);

    const phone = await signIn(user.email); // a brand-new session on "another device"
    expect((await phone.get(`/api/auth/${phone.userId}`)).body.data.user.themePreference).toBe('dark');
  });

  it('keeps preferences separate for each user', async () => {
    const a = await signIn((await makeUser()).email);
    const b = await signIn((await makeUser()).email);
    await a.patch(`/api/auth/${a.userId}/theme`).send({ themePreference: 'light' });
    expect((await b.get(`/api/auth/${b.userId}`)).body.data.user.themePreference).toBe('system');
  });

  it('rejects unknown values and requires sign-in', async () => {
    const client = await signIn((await makeUser()).email);
    expect((await client.patch(`/api/auth/${client.userId}/theme`).send({ themePreference: 'neon' })).status).toBe(400);
    const anonRes = await anon().patch(`/api/auth/${ANON_ID}/theme`).set('Origin', ORIGIN).send({ themePreference: 'dark' });
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
    expect((await phone.get(`/api/auth/${phone.userId}`)).status).toBe(401);
    expect((await laptop.get(`/api/auth/${laptop.userId}`)).status).toBe(200);
    expect((await anon().post('/api/auth/admin-login').set('Origin', ORIGIN).send({ email: user.email, password: PASSWORD })).status).toBe(401);
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
