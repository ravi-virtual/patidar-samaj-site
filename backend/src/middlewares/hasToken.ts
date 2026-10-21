import type { NextFunction, Request, Response } from 'express';
import { sendError } from '../utils/apiResponse';
import { clearSessionCookie } from '../utils/sessions';
import { authenticate } from '../utils/sessionAuth';

/**
 * Verifies the session cookie, loads the user and seeds req.user (skill: hasToken → isAuthenticated).
 * Also enforces the per-session CSRF token on every state-changing method, so no protected
 * route can forget it.
 */
const hasToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authenticate(req, { enforceCsrf: true });
    if (!result.ok) {
      if (result.clearCookie) clearSessionCookie(res);
      return sendError(res, { statusCode: result.status, message: result.message, code: result.code });
    }
    req.user = result.user;
    req.authSession = result.session;
    return next();
  } catch (err) {
    return next(err);
  }
};

export default hasToken;
