import type { Request, Response } from 'express';
import Session from '../models/Session';
import { config } from '../config/constants';
import { generateToken, hashToken } from './tokens';

const cookieOptions = () => ({
  httpOnly: true, // not readable from JavaScript, so XSS cannot steal it
  secure: config.isProduction, // HTTPS only in production
  sameSite: 'lax' as const,
  path: '/',
});

/**
 * Creates a server-side session and sets the cookie. Always issues a fresh token, which is what
 * "session rotation" means: a pre-login cookie can never become an authenticated one.
 */
export const startSession = async (req: Request, res: Response, userId: string): Promise<string> => {
  const token = generateToken();
  const now = new Date();
  const ttlMs = config.session.ttlHours * 3_600_000;

  await Session.create({
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + ttlMs),
    lastSeenAt: now,
    userAgent: req.get('user-agent')?.slice(0, 200),
    ip: req.ip,
  });

  res.cookie(config.session.cookieName, token, { ...cookieOptions(), maxAge: ttlMs });
  return token;
};

export const clearSessionCookie = (res: Response): void => {
  res.clearCookie(config.session.cookieName, cookieOptions());
};

export const readSessionToken = (req: Request): string | undefined => {
  const value = (req.cookies as Record<string, unknown> | undefined)?.[config.session.cookieName];
  return typeof value === 'string' && value.length > 0 && value.length <= 128 ? value : undefined;
};

/** Ends every session for a user (role change, suspension, password change, admin revoke). */
export const revokeUserSessions = async (userId: string, exceptSessionId?: string): Promise<number> => {
  const filter: Record<string, unknown> = { userId };
  if (exceptSessionId) filter._id = { $ne: exceptSessionId };
  const result = await Session.deleteMany(filter);
  return result.deletedCount ?? 0;
};
