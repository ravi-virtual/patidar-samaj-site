import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import User from '../../src/models/User';
import Session from '../../src/models/Session';
import AuditLog from '../../src/models/AuditLog';
import PasswordResetToken from '../../src/models/PasswordResetToken';
import { AccountStatus, Roles } from '../../src/config/constants';
import { hashToken, generateToken } from '../../src/utils/tokens';
import { verifyPassword } from '../../src/utils/password';
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

const PARALLEL = 12;

const reset = (token: string, password: string) =>
  anon().post('/api/auth/reset-password').set('Origin', ORIGIN).send({ token, password, confirmPassword: password });

/** A live, valid reset token for a user, created the way the controllers do (only the hash is stored). */
const issueToken = async (userId: string, over: Partial<{ expiresAt: Date; purpose: 'reset' | 'setup' }> = {}) => {
  const token = generateToken();
  await PasswordResetToken.create({
    userId,
    tokenHash: hashToken(token),
    purpose: over.purpose ?? 'reset',
    expiresAt: over.expiresAt ?? new Date(Date.now() + 3_600_000),
  });
  return token;
};

describe('concurrent reuse of a password-reset link', () => {
  it('lets exactly one of many parallel requests succeed, and that request’s password wins', async () => {
    const user = await makeUser();
    const token = await issueToken(user._id);
    const passwords = Array.from({ length: PARALLEL }, (_, i) => `Parallel-Attempt-${i + 10}`);

    const results = await Promise.all(passwords.map((p) => reset(token, p)));

    const winners = results.map((r, i) => ({ r, i })).filter(({ r }) => r.status === 200);
    expect(winners).toHaveLength(1);
    for (const r of results.filter((x) => x.status !== 200)) {
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/invalid or has expired/i);
    }

    // Only the winner's password works; every other attempted password was never stored.
    const winnerPassword = passwords[winners[0]!.i]!;
    const stored = await User.findById(user._id).select('+passwordHash').lean();
    expect(await verifyPassword(stored!.passwordHash!, winnerPassword)).toBe(true);
    for (const p of passwords.filter((x) => x !== winnerPassword)) {
      expect(await verifyPassword(stored!.passwordHash!, p)).toBe(false);
    }
    expect((await signIn(user.email, winnerPassword)).userId).toBe(user._id);

    // One completion in the audit trail and a single consumed token.
    expect(await AuditLog.countDocuments({ action: 'auth.password_reset_completed' })).toBe(1);
    const tokens = await PasswordResetToken.find({ userId: user._id }).lean();
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.usedAt).toBeTruthy();
  });

  it('also allows a single winner when every request uses the same password', async () => {
    const user = await makeUser();
    const token = await issueToken(user._id);
    const results = await Promise.all(Array.from({ length: PARALLEL }, () => reset(token, 'Identical-Choice-77')));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 400)).toHaveLength(PARALLEL - 1);
    expect(await AuditLog.countDocuments({ action: 'auth.password_reset_completed' })).toBe(1);
  });

  it('revokes the sessions once, and nobody can sign in with the old password afterwards', async () => {
    const user = await makeUser();
    const phone = await signIn(user.email);
    const laptop = await signIn(user.email);
    const token = await issueToken(user._id);

    await Promise.all(Array.from({ length: PARALLEL }, (_, i) => reset(token, `Another-Choice-${i + 10}`)));

    expect((await phone.get(`/api/auth/${phone.userId}`)).status).toBe(401);
    expect((await laptop.get(`/api/auth/${laptop.userId}`)).status).toBe(401);
    expect(await Session.countDocuments({ userId: user._id })).toBe(0);
    const old = await anon().post('/api/auth/admin-login').set('Origin', ORIGIN).send({ email: user.email, password: PASSWORD });
    expect(old.status).toBe(401);
  });

  it('keeps two different links for two different people independent', async () => {
    const a = await makeUser();
    const b = await makeUser();
    const [ta, tb] = await Promise.all([issueToken(a._id), issueToken(b._id)]);
    const results = await Promise.all([
      ...Array.from({ length: 5 }, (_, i) => reset(ta, `Person-A-Choice-${i + 10}`)),
      ...Array.from({ length: 5 }, (_, i) => reset(tb, `Person-B-Choice-${i + 10}`)),
    ]);
    expect(results.slice(0, 5).filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.slice(5).filter((r) => r.status === 200)).toHaveLength(1);
  });
});

describe('reset link lifecycle', () => {
  it('stores only a hash of the token', async () => {
    const user = await makeUser();
    const token = await issueToken(user._id);
    const [stored] = await PasswordResetToken.find({ userId: user._id }).lean();
    expect(stored!.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(stored)).not.toContain(token);
  });

  it('refuses an expired link without consuming it for anyone else', async () => {
    const user = await makeUser();
    const token = await issueToken(user._id, { expiresAt: new Date(Date.now() - 1000) });
    const res = await reset(token, 'Too-Late-Choice-1');
    expect(res.status).toBe(400);
    expect((await PasswordResetToken.findOne({ userId: user._id }).lean())!.usedAt ?? null).toBeNull();
    expect(await AuditLog.countDocuments({ action: 'auth.password_reset_completed' })).toBe(0);
  });

  it('refuses a weak password and leaves the link usable', async () => {
    const user = await makeUser();
    const token = await issueToken(user._id);
    const weak = await reset(token, 'weak');
    expect(weak.status).toBe(400);
    expect((await PasswordResetToken.findOne({ userId: user._id }).lean())!.usedAt ?? null).toBeNull();
    expect((await reset(token, 'Strong-Choice-2026')).status).toBe(200);
  });

  it('refuses mismatched confirmation, and a token of the wrong shape', async () => {
    const user = await makeUser();
    const token = await issueToken(user._id);
    const mismatch = await anon().post('/api/auth/reset-password').set('Origin', ORIGIN).send({
      token,
      password: 'Strong-Choice-2026',
      confirmPassword: 'Different-Choice-2026',
    });
    expect(mismatch.status).toBe(400);
    expect((await reset('short', 'Strong-Choice-2026')).status).toBe(400);
    expect((await reset('x'.repeat(200), 'Strong-Choice-2026')).status).toBe(400);
  });

  it('refuses a link for a suspended account (the link is spent either way)', async () => {
    const user = await makeUser({ status: AccountStatus.SUSPENDED });
    const token = await issueToken(user._id);
    const res = await reset(token, 'Strong-Choice-2026');
    expect(res.status).toBe(400);
    expect(await verifyPassword((await User.findById(user._id).select('+passwordHash').lean())!.passwordHash!, PASSWORD)).toBe(true);
  });

  it('refuses a link whose account has been removed', async () => {
    const user = await makeUser();
    const token = await issueToken(user._id);
    await User.updateOne({ _id: user._id }, { $set: { isDeleted: true } });
    expect((await reset(token, 'Strong-Choice-2026')).status).toBe(400);
  });

  it('clears the failed-login counter and lock when the password is reset', async () => {
    const user = await makeUser();
    await User.updateOne({ _id: user._id }, { $set: { failedLoginCount: 5, lockUntil: new Date(Date.now() + 600_000) } });
    const token = await issueToken(user._id);
    expect((await reset(token, 'Strong-Choice-2026')).status).toBe(200);
    const after = await User.findById(user._id).lean();
    expect(after!.failedLoginCount).toBe(0);
    expect(after!.lockUntil ?? null).toBeNull();
    expect((await signIn(user.email, 'Strong-Choice-2026')).userId).toBe(user._id);
  });

  it('lets a reset set a first password for an account created without one', async () => {
    const user = await makeUser({ password: null });
    const token = await issueToken(user._id, { purpose: 'setup' });
    expect((await reset(token, 'First-Password-2026')).status).toBe(200);
    expect((await signIn(user.email, 'First-Password-2026')).userId).toBe(user._id);
  });

  it('a direct reset by an administrator invalidates any outstanding link', async () => {
    const member = await makeUser();
    const { client: admin } = await signInAs(Roles.SUPER_ADMIN);
    const token = await issueToken(member._id);

    const res = await admin.post(`/api/users/${member._id}/password-reset`).send({ password: 'Direct-Reset-2026' });
    expect(res.status).toBe(200);

    expect((await reset(token, 'Admin-Link-Choice-2026')).status).toBe(400);
    expect(await PasswordResetToken.countDocuments({ userId: member._id, usedAt: null })).toBe(0);
  });

  it('does not issue a link through forgot-password to a suspended account', async () => {
    const user = await makeUser({ status: AccountStatus.SUSPENDED });
    const res = await anon().post('/api/auth/forgot-password').set('Origin', ORIGIN).send({ email: user.email });
    expect(res.status).toBe(200);
    expect(await PasswordResetToken.countDocuments({ userId: user._id })).toBe(0);
  });
});
