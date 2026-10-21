import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from '../config/constants';

/** 256-bit random token, URL-safe. This is what the browser or an administrator holds. */
export const generateToken = (): string => randomBytes(32).toString('base64url');

/** Only this hash is stored server-side. */
export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

/**
 * CSRF token bound to the session: HMAC of the raw session token with the server secret.
 * Stateless (nothing extra to store) and it rotates whenever the session rotates.
 */
export const csrfTokenFor = (rawSessionToken: string): string =>
  createHmac('sha256', config.session.secret).update(`csrf:${rawSessionToken}`).digest('base64url');

export const safeEqual = (a: string, b: string): boolean => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
};
