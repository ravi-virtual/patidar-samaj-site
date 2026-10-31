import type { NextFunction, Request, Response } from 'express';
import { ErrorCodes, ResponseCodes, Roles } from '../config/constants';
import { sendError } from '../utils/apiResponse';

/**
 * Gate for every route that manages admin accounts: the Super Admin only. This is an explicit role
 * check on top of the permission check, so even an admin whose stored permission list was tampered
 * with can never act on other accounts. Runs after hasToken and isAuthenticated.
 */
const isSuperAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (req.user && req.user.role === Roles.SUPER_ADMIN) return next();
  return sendError(res, {
    statusCode: ResponseCodes.FORBIDDEN,
    message: 'Only the Super Admin can do this',
    code: ErrorCodes.FORBIDDEN,
  });
};

export default isSuperAdmin;
