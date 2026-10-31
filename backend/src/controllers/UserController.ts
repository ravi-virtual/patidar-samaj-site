import type { NextFunction, Request, Response } from 'express';
import { matchedData } from 'express-validator';
import User from '../models/User';
import PasswordResetToken from '../models/PasswordResetToken';
import { AccountStatus, ErrorCodes, ResponseCodes, Roles, config } from '../config/constants';
import { permissionsFor } from '../config/permissions';
import { ApiResponse, sendError } from '../utils/apiResponse';
import { writeAudit } from '../utils/audit';
import { escapeRegex } from '../utils/escapeRegex';
import { hashPassword } from '../utils/password';
import { revokeUserSessions } from '../utils/sessions';
import { sendMail } from '../utils/mailer';
import { toAdminUser } from '../utils/userView';

// Mostly Super-Admin-only; see routes/userRoutes.ts for the one admin-reachable action. The targets are always admin
// accounts: the Super Admin is never listed, edited, suspended, reset or deleted through this API.

const notFound = (res: Response) =>
  sendError(res, {
    statusCode: ResponseCodes.NOT_FOUND,
    message: 'User not found',
    code: ErrorCodes.NOT_FOUND,
  });

const forbidden = (res: Response, message: string) =>
  sendError(res, { statusCode: ResponseCodes.FORBIDDEN, message, code: ErrorCodes.FORBIDDEN });

const conflict = (res: Response, message: string) =>
  sendError(res, { statusCode: ResponseCodes.CONFLICT, message, code: ErrorCodes.DUPLICATE });

/** Loads the admin account named in the URL. Sends the error response and returns null if it cannot be managed. */
const loadAdmin = async (req: Request, res: Response) => {
  const user = await User.findOne({ _id: req.params.id, isDeleted: false });
  if (!user) {
    notFound(res);
    return null;
  }
  if (user.role !== Roles.ADMIN || user._id === req.user?.id) {
    forbidden(res, 'Only admin accounts can be managed here');
    return null;
  }
  return user;
};

/**
 * @name listUsers
 * @file UserController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Paginated, filterable list of admin accounts. The Super Admin is never listed.
 * @author Ravi Patel
 */
export const listUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, status, search } = matchedData<{
      page?: number;
      limit?: number;
      status?: string;
      search?: string;
    }>(req, { locations: ['query'] });

    const filter: Record<string, unknown> = { isDeleted: false, role: Roles.ADMIN };
    if (status) filter.status = status;
    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i');
      filter.$or = [{ name: rx }, { email: rx }];
    }

    const [users, totalCount] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    return new ApiResponse(ResponseCodes.OK, 'Users fetched successfully', {
      users: users.map(toAdminUser),
      totalCount,
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name getAdmin
 * @file UserController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Fetches one admin account, for the edit page.
 * @author Ravi Patel
 */
export const getAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await loadAdmin(req, res);
    if (!user) return;
    return new ApiResponse(ResponseCodes.OK, 'User fetched successfully', { user: toAdminUser(user.toObject()) }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name createAdmin
 * @file UserController.ts
 * @param {Request} req
 * @param {Response} res
 * @description The Super Admin creates an admin with a password they choose and exactly the
 * permissions they selected, then the new admin is emailed their sign-in details and asked to
 * change the password after the first sign-in. The role is always "admin"; there is no endpoint
 * that creates a Super Admin.
 * @author Ravi Patel
 */
export const createAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, password, permissions = [] } = matchedData<{
      name: string;
      email: string;
      password: string;
      permissions?: string[];
    }>(req, { locations: ['body'] });

    // Deleted accounts keep their email reserved (the unique index covers them too).
    if (await User.exists({ email })) return conflict(res, 'An account with this email already exists.');

    const user = await User.create({
      name,
      email,
      role: Roles.ADMIN,
      permissions,
      status: AccountStatus.ACTIVE,
      passwordHash: await hashPassword(password),
      passwordChangedAt: new Date(),
    });

    const mail = await sendMail({
      to: email,
      subject: 'Your Samaj portal admin account',
      text:
        `Hello ${name},

An admin account has been created for you on the Samaj portal.

` +
        `Sign in: ${config.clientOrigin}/admin/login
Email: ${email}
Password: ${password}

` +
        'For your security, please change your password after you sign in.',
    });

    await writeAudit(req, {
      action: 'user.admin_created',
      targetType: 'user',
      targetId: user._id,
      metadata: { permissions, emailDelivered: mail.delivered },
    });

    return new ApiResponse(ResponseCodes.CREATED, 'Admin account created', {
      user: toAdminUser(user.toObject()),
      email: { delivered: mail.delivered },
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name updateAdmin
 * @file UserController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Edits an admin's name and/or permission list. Permissions are computed on every
 * request, so a change applies at once without signing the admin out.
 * @author Ravi Patel
 */
export const updateAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, permissions } = matchedData<{ name?: string; permissions?: string[] }>(req, {
      locations: ['body'],
    });
    const user = await loadAdmin(req, res);
    if (!user) return;

    const before = { name: user.name, permissions: permissionsFor(user) };
    if (name !== undefined) user.name = name;
    if (permissions !== undefined) user.permissions = permissions;
    await user.save();

    await writeAudit(req, {
      action: 'user.admin_updated',
      targetType: 'user',
      targetId: user._id,
      metadata: { before, after: { name: user.name, permissions: permissionsFor(user) } },
    });
    return new ApiResponse(ResponseCodes.OK, 'Admin updated', { user: toAdminUser(user.toObject()) }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name suspendUser
 * @file UserController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Marks an admin inactive and signs them out everywhere.
 * @author Ravi Patel
 */
export const suspendUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = matchedData<{ reason?: string }>(req, { locations: ['body'] });
    const user = await loadAdmin(req, res);
    if (!user) return;
    if (user.status === AccountStatus.SUSPENDED) return conflict(res, 'Account is already inactive');

    user.status = AccountStatus.SUSPENDED;
    user.suspendedAt = new Date();
    user.suspendedBy = req.user?.id;
    user.suspensionReason = reason;
    await user.save();
    const revoked = await revokeUserSessions(user._id);

    await writeAudit(req, {
      action: 'user.suspended',
      targetType: 'user',
      targetId: user._id,
      metadata: { sessionsRevoked: revoked },
    });
    return new ApiResponse(ResponseCodes.OK, 'Account marked inactive', { user: toAdminUser(user.toObject()) }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name reactivateUser
 * @file UserController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Restores an inactive admin to active.
 * @author Ravi Patel
 */
export const reactivateUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await loadAdmin(req, res);
    if (!user) return;
    if (user.status !== AccountStatus.SUSPENDED) return conflict(res, 'Account is not inactive');

    user.status = AccountStatus.ACTIVE;
    user.suspendedAt = undefined;
    user.suspendedBy = undefined;
    user.suspensionReason = undefined;
    await user.save();

    await writeAudit(req, { action: 'user.reactivated', targetType: 'user', targetId: user._id });
    return new ApiResponse(ResponseCodes.OK, 'Account marked active', { user: toAdminUser(user.toObject()) }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name revokeUserSessionsAction
 * @file UserController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Signs an admin out of every device.
 * @author Ravi Patel
 */
export const revokeUserSessionsAction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await loadAdmin(req, res);
    if (!user) return;
    const revoked = await revokeUserSessions(user._id);
    await writeAudit(req, {
      action: 'user.sessions_revoked',
      targetType: 'user',
      targetId: user._id,
      metadata: { count: revoked },
    });
    return new ApiResponse(ResponseCodes.OK, 'Sessions revoked', { revoked }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name resetAdminPassword
 * @file UserController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Sets a new password for an admin directly and emails it to them, so nobody has to
 * pass a link around. Allowed for the Super Admin and for admins holding `users.reset_password`.
 * To stop privilege escalation, a non-Super-Admin may only reset an admin whose permissions are all
 * ones they hold themselves. The target is signed out everywhere and any lockout is cleared.
 * @author Ravi Patel
 */
export const resetAdminPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { password } = matchedData<{ password: string }>(req, { locations: ['body'] });
    const user = await loadAdmin(req, res);
    if (!user) return;

    if (req.user?.role !== Roles.SUPER_ADMIN) {
      const own = req.user?.permissions ?? [];
      if (!permissionsFor(user).every((p) => own.includes(p))) {
        return forbidden(res, 'You cannot reset the password of an admin who has permissions you do not have');
      }
    }
    if (user.status === AccountStatus.SUSPENDED) return conflict(res, 'Make the account active first');

    user.passwordHash = await hashPassword(password);
    user.passwordChangedAt = new Date();
    user.failedLoginCount = 0;
    user.lockUntil = undefined;
    await user.save();
    await PasswordResetToken.deleteMany({ userId: user._id, usedAt: null });
    const revoked = await revokeUserSessions(user._id);

    const mail = await sendMail({
      to: user.email,
      subject: 'Your Samaj portal password was reset',
      text:
        `Hello ${user.name},

Your password was reset by an administrator.

` +
        `Sign in: ${config.clientOrigin}/admin/login
Email: ${user.email}
New password: ${password}

` +
        'For your security, please change your password after you sign in.',
    });

    await writeAudit(req, {
      action: 'user.password_reset',
      targetType: 'user',
      targetId: user._id,
      metadata: { sessionsRevoked: revoked, emailDelivered: mail.delivered },
    });
    return new ApiResponse(ResponseCodes.OK, 'Password reset', { email: { delivered: mail.delivered } }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name deleteAdmin
 * @file UserController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Soft-deletes an admin: the account is marked deleted, signed out everywhere and any
 * unused setup or reset links are removed. The email stays reserved, because the unique index on
 * the email covers deleted accounts; it cannot be used for a new account. Nobody can delete
 * themselves or the Super Admin.
 * @author Ravi Patel
 */
export const deleteAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await loadAdmin(req, res);
    if (!user) return;

    user.isDeleted = true;
    await user.save();
    const revoked = await revokeUserSessions(user._id);
    await PasswordResetToken.deleteMany({ userId: user._id, usedAt: null });

    await writeAudit(req, {
      action: 'user.deleted',
      targetType: 'user',
      targetId: user._id,
      metadata: { sessionsRevoked: revoked },
    });
    return new ApiResponse(ResponseCodes.OK, 'Admin deleted').send(res);
  } catch (err) {
    return next(err);
  }
};
