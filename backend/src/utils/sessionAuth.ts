import type { Request } from 'express';
import Session from '../models/Session';
import User from '../models/User';
import { AccountStatus, ErrorCodes, ResponseCodes, config, type ErrorCode } from '../config/constants';
import { permissionsFor } from '../config/permissions';
import { readSessionToken } from './sessions';
import { csrfTokenFor, hashToken, safeEqual } from './tokens';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const TOUCH_INTERVAL_MS = 60_000;

export interface AuthFailure {
  ok: false;
  status: number;
  message: string;
  code: ErrorCode;
  /** True when the browser's cookie is useless and should be cleared. */
  clearCookie: boolean;
}

export interface AuthSuccess {
  ok: true;
  user: Express.AuthUser;
  session: Express.AuthSession;
}

const fail = (
  status: number,
  message: string,
  code: ErrorCode,
  clearCookie = false,
): AuthFailure => ({ ok: false, status, message, code, clearCookie });

/**
 * Resolves the session cookie to a signed-in user. Shared by hasToken (required) and
 * optionalSession (public routes that personalise when someone is signed in).
 * When `enforceCsrf` is true, state-changing methods must carry the per-session CSRF token.
 */
export const authenticate = async (
  req: Request,
  { enforceCsrf }: { enforceCsrf: boolean },
): Promise<AuthSuccess | AuthFailure> => {
  const raw = readSessionToken(req);
  if (!raw) return fail(ResponseCodes.UNAUTHORIZED, 'Not authenticated', ErrorCodes.UNAUTHORIZED);

  const session = await Session.findOne({ tokenHash: hashToken(raw) }).lean();
  if (!session) {
    return fail(ResponseCodes.UNAUTHORIZED, 'Session is not valid. Please sign in again.', ErrorCodes.INVALID_SESSION, true);
  }

  const now = Date.now();
  const idleLimit = config.session.idleMinutes * 60_000;
  if (session.expiresAt.getTime() <= now || now - session.lastSeenAt.getTime() > idleLimit) {
    await Session.deleteOne({ _id: session._id });
    return fail(ResponseCodes.UNAUTHORIZED, 'Your session has expired. Please sign in again.', ErrorCodes.SESSION_EXPIRED, true);
  }

  const user = await User.findOne({ _id: session.userId, isDeleted: false }).lean();
  if (!user) {
    await Session.deleteOne({ _id: session._id });
    return fail(ResponseCodes.UNAUTHORIZED, 'Session is not valid. Please sign in again.', ErrorCodes.INVALID_SESSION, true);
  }

  if (user.status !== AccountStatus.ACTIVE) {
    // Suspension revokes sessions already; this is the backstop for any race or manual change.
    await Session.deleteMany({ userId: user._id });
    return fail(ResponseCodes.FORBIDDEN, 'This account is not active.', ErrorCodes.ACCOUNT_NOT_ACTIVE, true);
  }

  const csrfToken = csrfTokenFor(raw);
  if (enforceCsrf && !SAFE_METHODS.has(req.method)) {
    const sent = req.get('x-csrf-token');
    if (!sent || !safeEqual(sent, csrfToken)) {
      return fail(ResponseCodes.FORBIDDEN, 'Missing or invalid CSRF token', ErrorCodes.CSRF_INVALID);
    }
  }

  if (now - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await Session.updateOne({ _id: session._id }, { $set: { lastSeenAt: new Date(now) } });
  }

  const permissions = [...(user.permissions ?? [])];
  return {
    ok: true,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      // Computed fresh on every request, so a permission change takes effect immediately.
      permissions: permissionsFor({ role: user.role, permissions }),
      themePreference: user.themePreference ?? 'system',
      isAuthenticated: true,
    },
    session: { id: session._id, csrfToken },
  };
};
