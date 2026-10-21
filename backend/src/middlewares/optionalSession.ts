import type { NextFunction, Request, Response } from 'express';
import { authenticate } from '../utils/sessionAuth';

/**
 * For public GET routes that show more to signed-in users (directory, event details).
 * Never rejects: a missing, expired or invalid session simply means "visitor". Only for safe
 * methods — it does not check CSRF, so it must not guard anything that changes data.
 */
const optionalSession = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const result = await authenticate(req, { enforceCsrf: false });
    if (result.ok) {
      req.user = result.user;
      req.authSession = result.session;
    }
    return next();
  } catch (err) {
    return next(err);
  }
};

export default optionalSession;
