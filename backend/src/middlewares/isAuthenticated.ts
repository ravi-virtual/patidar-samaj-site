import type { NextFunction, Request, Response } from 'express';
import { ErrorCodes, ResponseCodes } from '../config/constants';
import { sendError } from '../utils/apiResponse';

/** Guards any route that needs a signed-in, active user. Runs after hasToken. */
const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.user && req.user.isAuthenticated === true) return next();
  return sendError(res, {
    statusCode: ResponseCodes.UNAUTHORIZED,
    message: 'Not authenticated',
    code: ErrorCodes.UNAUTHORIZED,
  });
};

export default isAuthenticated;
