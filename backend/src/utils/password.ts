import argon2 from 'argon2';
import { config } from '../config/constants';

const argonOptions = {
  type: argon2.argon2id,
  memoryCost: config.auth.argon.memoryCost,
  timeCost: config.auth.argon.timeCost,
  parallelism: config.auth.argon.parallelism,
} as const;

export const hashPassword = (plain: string): Promise<string> => argon2.hash(plain, argonOptions);

export const verifyPassword = async (hash: string, plain: string): Promise<boolean> => {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false; // malformed hash must not crash a login
  }
};

// A real hash used to equalise timing when the account does not exist, so response time does not
// reveal whether an email is registered.
let dummyHash: Promise<string> | undefined;
export const verifyAgainstDummy = async (plain: string): Promise<void> => {
  dummyHash ??= hashPassword('not-a-real-password-for-timing-only');
  await verifyPassword(await dummyHash, plain);
};

const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  '1234567890',
  '12345678910',
  'qwertyuiop',
  'iloveyou123',
  'welcome123',
  'admin12345',
  'letmein123',
  'changeme123',
  'patidar123',
  'samaj12345',
]);

/** Returns an error message, or null when the password is acceptable. */
export const validatePasswordStrength = (password: string, email?: string): string | null => {
  const { minPasswordLength, maxPasswordLength } = config.auth;
  if (password.length < minPasswordLength) {
    return `Password must be at least ${minPasswordLength} characters`;
  }
  if (password.length > maxPasswordLength) {
    return `Password must be at most ${maxPasswordLength} characters`;
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return 'That password is too common';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'Password must contain at least one letter and one number';
  }
  const local = email?.split('@')[0]?.toLowerCase();
  if (local && local.length >= 4 && password.toLowerCase().includes(local)) {
    return 'Password must not contain your email name';
  }
  return null;
};
