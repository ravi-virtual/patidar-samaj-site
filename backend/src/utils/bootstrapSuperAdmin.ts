import User from '../models/User';
import AuditLog from '../models/AuditLog';
import { AccountStatus, Roles } from '../config/constants';
import { hashPassword, validatePasswordStrength } from './password';

interface BootstrapInput {
  name: string;
  email: string;
  password: string;
}

export class BootstrapError extends Error {}

/**
 * Creates the very first Super Admin. Refuses to run if any Super Admin already exists, so it can
 * never be used later as a back door. Called only from `npm run bootstrap:superadmin`.
 */
export const createFirstSuperAdmin = async ({ name, email, password }: BootstrapInput) => {
  const normalizedEmail = email.trim().toLowerCase();
  const cleanName = name.trim();

  if (cleanName.length < 2 || cleanName.length > 100 || /[<>]/.test(cleanName)) {
    throw new BootstrapError('Name must be 2–100 characters and must not contain < or >.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254) {
    throw new BootstrapError('Enter a valid email address.');
  }
  const weak = validatePasswordStrength(password, normalizedEmail);
  if (weak) throw new BootstrapError(weak);

  const existing = await User.exists({ role: Roles.SUPER_ADMIN, isDeleted: false });
  if (existing) {
    throw new BootstrapError(
      'A Super Admin already exists. Further staff must be created from the admin panel.',
    );
  }
  if (await User.exists({ email: normalizedEmail })) {
    throw new BootstrapError('An account with that email already exists.');
  }

  const user = await User.create({
    name: cleanName,
    email: normalizedEmail,
    passwordHash: await hashPassword(password),
    passwordChangedAt: new Date(),
    role: Roles.SUPER_ADMIN,
    status: AccountStatus.ACTIVE,
    approvedAt: new Date(),
  });

  await AuditLog.create({
    action: 'bootstrap.super_admin_created',
    actorId: user._id,
    actorRole: Roles.SUPER_ADMIN,
    targetType: 'user',
    targetId: user._id,
    metadata: { via: 'cli' },
  });

  return { id: user._id, email: user.email };
};
