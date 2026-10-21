import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import User from '../../src/models/User';
import AuditLog from '../../src/models/AuditLog';
import { BootstrapError, createFirstSuperAdmin } from '../../src/utils/bootstrapSuperAdmin';
import { connectTestDb, disconnectTestDb, makeUser, resetDb } from '../helpers';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(resetDb);

const input = { name: 'First Admin', email: 'first@example.test', password: 'Strong-Start-2026' };

describe('first Super Admin bootstrap', () => {
  it('creates an active Super Admin with a hashed password and an audit entry', async () => {
    const created = await createFirstSuperAdmin(input);
    const stored = await User.findById(created.id).select('+passwordHash').lean();
    expect(stored?.role).toBe('superadmin');
    expect(stored?.status).toBe('active');
    expect(stored?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(stored?.passwordHash).not.toContain(input.password);
    expect(await AuditLog.countDocuments({ action: 'bootstrap.super_admin_created' })).toBe(1);
  });

  it('refuses to run once any Super Admin exists, so it cannot become a back door', async () => {
    await createFirstSuperAdmin(input);
    await expect(
      createFirstSuperAdmin({ ...input, email: 'second@example.test' }),
    ).rejects.toThrow(/already exists/i);
    expect(await User.countDocuments({ role: 'superadmin' })).toBe(1);
  });

  it('also refuses when a Super Admin was created by other means', async () => {
    await makeUser({ role: 'superadmin' });
    await expect(createFirstSuperAdmin(input)).rejects.toBeInstanceOf(BootstrapError);
  });

  it.each([
    ['weak password', { password: 'short' }],
    ['password containing the email name', { password: 'first-admin-2026' }],
    ['invalid email', { email: 'nope' }],
    ['markup in the name', { name: '<b>x</b>' }],
  ])('rejects %s', async (_label, patch) => {
    await expect(createFirstSuperAdmin({ ...input, ...patch })).rejects.toBeInstanceOf(BootstrapError);
    expect(await User.countDocuments()).toBe(0);
  });

  it('rejects an email that is already registered', async () => {
    await makeUser({ email: input.email });
    await expect(createFirstSuperAdmin(input)).rejects.toThrow(/already exists/i);
  });
});
