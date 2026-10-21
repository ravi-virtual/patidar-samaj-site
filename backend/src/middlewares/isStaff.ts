import type { NextFunction, Request, Response } from 'express';
import { ErrorCodes, ResponseCodes, StaffRoles } from '../config/constants';
import { sendError } from '../utils/apiResponse';

/**
 * Gate for every /api/admin route: staff roles only. Members hold some read permissions for the
 * member-facing site (directory, events), so a permission check alone must never be enough to
 * reach an admin endpoint. Runs after hasToken and isAuthenticated.
 */
const isStaff = (req: Request, res: Response, next: NextFunction) => {
  if (req.user && StaffRoles.includes(req.user.role)) return next();
  return sendError(res, {
    statusCode: ResponseCodes.FORBIDDEN,
    message: 'Staff access required',
    code: ErrorCodes.FORBIDDEN,
  });
};

export default isStaff;
