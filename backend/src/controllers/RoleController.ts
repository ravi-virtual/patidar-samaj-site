import type { NextFunction, Request, Response } from 'express';
import { ResponseCodes, Roles } from '../config/constants';
import { ALL_PERMISSIONS, GRANTABLE_PERMISSIONS, RolePermissions } from '../config/permissions';
import { ApiResponse } from '../utils/apiResponse';

/**
 * @name listRoles
 * @file RoleController.ts
 * @param {Request} req
 * @param {Response} res
 * @param {NextFunction} next
 * @description The role-to-permission matrix as the server enforces it, plus the permissions that
 * can be granted to one person on top of their role. Read-only; the admin panel shows it so the
 * matrix on screen can never drift from the rules in config/permissions.ts.
 * @author Ravi Patel
 */
export const listRoles = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    return new ApiResponse(ResponseCodes.OK, 'Roles fetched successfully', {
      roles: Object.values(Roles).map((role) => ({ role, permissions: [...(RolePermissions[role] ?? [])] })),
      permissions: [...ALL_PERMISSIONS],
      grantable: [...GRANTABLE_PERMISSIONS],
    }).send(res);
  } catch (err) {
    return next(err);
  }
};
