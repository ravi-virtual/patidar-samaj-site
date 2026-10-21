import type { NextFunction, Request, Response } from 'express';
import { config, ResponseCodes, ErrorCodes } from '../config/constants';
import { sendError } from '../utils/apiResponse';
import { readSessionToken } from '../utils/sessions';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const reject = (res: Response) =>
  sendError(res, {
    statusCode: ResponseCodes.FORBIDDEN,
    message: 'Cross-origin request blocked',
    code: ErrorCodes.CSRF_INVALID,
  });

/**
 * First CSRF layer, applied to every state-changing request (including anonymous ones such as
 * login). Browsers always send Origin on cross-site POST/PUT/PATCH/DELETE; if it names anything
 * but our front end the request is refused. Requests carrying a session cookie must prove where
 * they came from. The second layer (per-session token) lives in hasToken.
 */
export const originGuard = (req: Request, res: Response, next: NextFunction) => {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = req.get('origin');
  if (origin) return origin === config.clientOrigin ? next() : reject(res);

  const referer = req.get('referer');
  if (referer) {
    try {
      return new URL(referer).origin === config.clientOrigin ? next() : reject(res);
    } catch {
      return reject(res);
    }
  }

  // No Origin and no Referer: acceptable for non-browser clients, but never with a session cookie.
  return readSessionToken(req) ? reject(res) : next();
};
