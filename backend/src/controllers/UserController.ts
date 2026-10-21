import type { NextFunction, Request, Response } from 'express';
import { matchedData } from 'express-validator';
import User from '../models/User';
import PasswordResetToken from '../models/PasswordResetToken';
import { AccountStatus, MembershipStatus, ErrorCodes, ResponseCodes, Roles, config, type Role } from '../config/constants';
import { Permissions } from '../config/permissions';
import { ApiResponse, sendError } from '../utils/apiResponse';
import { writeAudit } from '../utils/audit';
import { escapeRegex } from '../utils/escapeRegex';
import { generateToken, hashToken } from '../utils/tokens';
import { revokeUserSessions } from '../utils/sessions';
import { sendMail } from '../utils/mailer';
import { toAdminUser } from '../utils/userView';
import { syncProfileForAccount } from '../utils/memberSync';

const SETUP_TOKEN_HOURS = 24;

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

const isStaffRole = (role: Role) => role !== Roles.MEMBER;

/** True if `userId` is the only remaining active Super Admin. */
const isLastActiveSuperAdmin = async (userId: string): Promise<boolean> => {
  const others = await User.countDocuments({
    _id: { $ne: userId },
    role: Roles.SUPER_ADMIN,
    status: AccountStatus.ACTIVE,
    isDeleted: false,
  });
  return others === 0;
};

/**
 * @name listUsers
 * @file UserController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Paginated, filterable list of accounts (members awaiting approval, staff, etc.).
 * Phone numbers are included only for holders of members.read.private.
 * @author Ravi Patel
 */
export const listUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, role, status, search } = matchedData<{
      page?: number;
      limit?: number;
      role?: Role;
      status?: string;
      search?: string;
    }>(req, { locations: ['query'] });

    const filter: Record<string, unknown> = { isDeleted: false };
    if (role) filter.role = role;
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

    const includePhone = req.user?.permissions.includes(Permissions.MEMBERS_READ_PRIVATE) ?? false;
    return new ApiResponse(ResponseCodes.OK, 'Users fetched successfully', {
      users: users.map((u) => toAdminUser(u, includePhone)),
      totalCount,
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name createStaff
 * @file UserController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Super Admin creates a staff account. No password is chosen here: a one-time setup
 * link is returned once so the new staff member sets their own. There is no public endpoint for
 * this.
 * @author Ravi Patel
 */
export const createStaff = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, role } = matchedData<{ name: string; email: string; role: Role }>(req, {
      locations: ['body'],
    });

    if (await User.exists({ email })) return conflict(res, 'An account with this email already exists.');

    const user = await User.create({
      name,
      email,
      role,
      status: AccountStatus.ACTIVE,
      passwordHash: null,
      approvedAt: new Date(),
      approvedBy: req.user?.id,
    });

    const token = generateToken();
    const expiresAt = new Date(Date.now() + SETUP_TOKEN_HOURS * 3_600_000);
    await PasswordResetToken.create({
      userId: user._id,
      tokenHash: hashToken(token),
      purpose: 'setup',
      issuedBy: req.user?.id,
      expiresAt,
    });

    const setupUrl = `${config.clientOrigin}/reset-password?token=${token}`;
    const mail = await sendMail({
      to: email,
      subject: 'Your Samaj portal staff account',
      text: `An account was created for you. Set your password within ${SETUP_TOKEN_HOURS} hours:\n${setupUrl}`,
    });

    await writeAudit(req, {
      action: 'user.staff_created',
      targetType: 'user',
      targetId: user._id,
      metadata: { role },
    });

    return new ApiResponse(ResponseCodes.CREATED, 'Staff account created', {
      user: toAdminUser(user.toObject(), false),
      // Shown once. If email delivery is not configured the administrator hands this link over.
      setup: { url: setupUrl, expiresAt, emailDelivered: mail.delivered },
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name approveUser
 * @file UserController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Approves a pending member registration so the member can sign in.
 * @author Ravi Patel
 */
export const approveUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await User.findOne({ _id: req.params.id, isDeleted: false });
    if (!user) return notFound(res);
    if (user.role !== Roles.MEMBER) return forbidden(res, 'Only member registrations can be approved here');
    if (user.status !== AccountStatus.PENDING) return conflict(res, 'This registration is not pending');

    user.status = AccountStatus.ACTIVE;
    user.approvedAt = new Date();
    user.approvedBy = req.user?.id;
    user.rejectedAt = undefined;
    user.rejectionReason = undefined;
    await user.save();
    await syncProfileForAccount(user, MembershipStatus.ACTIVE);

    await writeAudit(req, { action: 'member.approved', targetType: 'user', targetId: user._id });
    return new ApiResponse(ResponseCodes.OK, 'Member approved', {
      user: toAdminUser(user.toObject(), false),
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name rejectUser
 * @file UserController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Rejects a pending member registration, with an optional reason kept for the office.
 * @author Ravi Patel
 */
export const rejectUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = matchedData<{ reason?: string }>(req, { locations: ['body'] });
    const user = await User.findOne({ _id: req.params.id, isDeleted: false });
    if (!user) return notFound(res);
    if (user.role !== Roles.MEMBER) return forbidden(res, 'Only member registrations can be rejected here');
    if (user.status !== AccountStatus.PENDING) return conflict(res, 'This registration is not pending');

    user.status = AccountStatus.REJECTED;
    user.rejectedAt = new Date();
    user.rejectionReason = reason;
    await user.save();
    await syncProfileForAccount(user, MembershipStatus.INACTIVE);

    await writeAudit(req, { action: 'member.rejected', targetType: 'user', targetId: user._id });
    return new ApiResponse(ResponseCodes.OK, 'Registration rejected', {
      user: toAdminUser(user.toObject(), false),
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name suspendUser
 * @file UserController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Suspends an account and signs it out everywhere. Members need members.suspend;
 * staff accounts need users.manage. Nobody can suspend themselves, and the last active Super
 * Admin is protected.
 * @author Ravi Patel
 */
export const suspendUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = matchedData<{ reason?: string }>(req, { locations: ['body'] });
    const user = await User.findOne({ _id: req.params.id, isDeleted: false });
    if (!user) return notFound(res);

    const needed = isStaffRole(user.role) ? Permissions.USERS_MANAGE : Permissions.MEMBERS_SUSPEND;
    if (!req.user?.permissions.includes(needed)) return forbidden(res, 'You cannot suspend this account');
    if (user._id === req.user.id) return forbidden(res, 'You cannot suspend your own account');
    if (user.role === Roles.SUPER_ADMIN && (await isLastActiveSuperAdmin(user._id))) {
      return conflict(res, 'The last active Super Admin cannot be suspended');
    }
    if (user.status === AccountStatus.SUSPENDED) return conflict(res, 'Account is already suspended');

    user.status = AccountStatus.SUSPENDED;
    user.suspendedAt = new Date();
    user.suspendedBy = req.user.id;
    user.suspensionReason = reason;
    await user.save();
    const revoked = await revokeUserSessions(user._id);
    await syncProfileForAccount(user, MembershipStatus.INACTIVE, user.role === Roles.MEMBER);

    await writeAudit(req, {
      action: 'user.suspended',
      targetType: 'user',
      targetId: user._id,
      metadata: { sessionsRevoked: revoked },
    });
    return new ApiResponse(ResponseCodes.OK, 'Account suspended', {
      user: toAdminUser(user.toObject(), false),
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name reactivateUser
 * @file UserController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Restores a suspended account to active.
 * @author Ravi Patel
 */
export const reactivateUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await User.findOne({ _id: req.params.id, isDeleted: false });
    if (!user) return notFound(res);

    const needed = isStaffRole(user.role) ? Permissions.USERS_MANAGE : Permissions.MEMBERS_SUSPEND;
    if (!req.user?.permissions.includes(needed)) return forbidden(res, 'You cannot reactivate this account');
    if (user.status !== AccountStatus.SUSPENDED) return conflict(res, 'Account is not suspended');

    user.status = AccountStatus.ACTIVE;
    user.suspendedAt = undefined;
    user.suspendedBy = undefined;
    user.suspensionReason = undefined;
    await user.save();
    await syncProfileForAccount(user, MembershipStatus.ACTIVE, user.role === Roles.MEMBER);

    await writeAudit(req, { action: 'user.reactivated', targetType: 'user', targetId: user._id });
    return new ApiResponse(ResponseCodes.OK, 'Account reactivated', {
      user: toAdminUser(user.toObject(), false),
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name changeRole
 * @file UserController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Super Admin changes a user's role and individually granted permissions. The target's
 * sessions are revoked so the change applies immediately. Self changes and demotion of the last
 * active Super Admin are refused.
 * @author Ravi Patel
 */
export const changeRole = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { role, extraPermissions = [] } = matchedData<{
      role: Role;
      extraPermissions?: string[];
    }>(req, { locations: ['body'] });

    const user = await User.findOne({ _id: req.params.id, isDeleted: false });
    if (!user) return notFound(res);
    if (user._id === req.user?.id) {
      return forbidden(res, 'You cannot change your own role. Ask another Super Admin.');
    }
    if (user.status !== AccountStatus.ACTIVE) return conflict(res, 'Only active accounts can change role');
    if (user.role === Roles.SUPER_ADMIN && role !== Roles.SUPER_ADMIN && (await isLastActiveSuperAdmin(user._id))) {
      return conflict(res, 'The last active Super Admin cannot be demoted');
    }

    const before = { role: user.role, extraPermissions: [...(user.extraPermissions ?? [])] };
    user.role = role;
    user.extraPermissions = role === Roles.SUPER_ADMIN ? [] : (extraPermissions as never);
    await user.save();
    const revoked = await revokeUserSessions(user._id);

    await writeAudit(req, {
      action: 'user.role_changed',
      targetType: 'user',
      targetId: user._id,
      metadata: { before, after: { role, extraPermissions: user.extraPermissions }, sessionsRevoked: revoked },
    });
    return new ApiResponse(ResponseCodes.OK, 'Role updated', {
      user: toAdminUser(user.toObject(), false),
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name revokeUserSessionsAction
 * @file UserController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Super Admin signs a user out of every device.
 * @author Ravi Patel
 */
export const revokeUserSessionsAction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await User.findOne({ _id: req.params.id, isDeleted: false }).select('_id').lean();
    if (!user) return notFound(res);
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
 * @name issuePasswordReset
 * @file UserController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Issues a one-time password reset link for a user who cannot use email recovery.
 * The link is returned once to the administrator, who hands it over securely. Resetting a staff
 * account requires users.manage; resetting a Super Admin requires being a Super Admin.
 * @author Ravi Patel
 */
export const issuePasswordReset = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await User.findOne({ _id: req.params.id, isDeleted: false });
    if (!user) return notFound(res);

    if (isStaffRole(user.role) && !req.user?.permissions.includes(Permissions.USERS_MANAGE)) {
      return forbidden(res, 'You cannot reset a staff account');
    }
    if (user.role === Roles.SUPER_ADMIN && req.user?.role !== Roles.SUPER_ADMIN) {
      return forbidden(res, 'Only a Super Admin can reset a Super Admin');
    }
    if (user.status === AccountStatus.SUSPENDED) return conflict(res, 'Reactivate the account first');

    await PasswordResetToken.deleteMany({ userId: user._id, usedAt: null });
    const token = generateToken();
    const expiresAt = new Date(Date.now() + config.auth.resetTokenMinutes * 60_000);
    await PasswordResetToken.create({
      userId: user._id,
      tokenHash: hashToken(token),
      purpose: 'reset',
      issuedBy: req.user?.id,
      expiresAt,
    });

    await writeAudit(req, { action: 'user.password_reset_issued', targetType: 'user', targetId: user._id });
    return new ApiResponse(ResponseCodes.OK, 'Reset link created', {
      reset: { url: `${config.clientOrigin}/reset-password?token=${token}`, expiresAt },
    }).send(res);
  } catch (err) {
    return next(err);
  }
};
