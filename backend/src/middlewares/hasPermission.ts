import type { NextFunction, Request, Response } from 'express';
import { ErrorCodes, ResponseCodes } from '../config/constants';
import type { Permission } from '../config/permissions';
import { sendError } from '../utils/apiResponse';

const forbidden = (res: Response) =>
  sendError(res, {
    statusCode: ResponseCodes.FORBIDDEN,
    message: 'You do not have permission to perform this action',
    code: ErrorCodes.FORBIDDEN,
  });

/** Requires ALL of the listed permissions. Runs after hasToken and isAuthenticated. */
const hasPermission =
  (...required: Permission[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return sendError(res, {
        statusCode: ResponseCodes.UNAUTHORIZED,
        message: 'Not authenticated',
        code: ErrorCodes.UNAUTHORIZED,
      });
    }
    const owned = req.user.permissions;
    return required.every((p) => owned.includes(p)) ? next() : forbidden(res);
  };

/** Requires AT LEAST ONE of the listed permissions. */
export const hasAnyPermission =
  (...options: Permission[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return sendError(res, {
        statusCode: ResponseCodes.UNAUTHORIZED,
        message: 'Not authenticated',
        code: ErrorCodes.UNAUTHORIZED,
      });
    }
    const owned = req.user.permissions;
    return options.some((p) => owned.includes(p)) ? next() : forbidden(res);
  };

export default hasPermission;
