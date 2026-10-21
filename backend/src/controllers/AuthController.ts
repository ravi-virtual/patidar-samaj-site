import type { NextFunction, Request, Response } from 'express';
import { matchedData } from 'express-validator';
import User from '../models/User';
import Session from '../models/Session';
import PasswordResetToken from '../models/PasswordResetToken';
import OrganizationSettings from '../models/OrganizationSettings';
import { AccountStatus, ErrorCodes, ResponseCodes, Roles, config } from '../config/constants';
import { ApiResponse, sendError } from '../utils/apiResponse';
import { hashPassword, verifyAgainstDummy, verifyPassword } from '../utils/password';
import { csrfTokenFor, generateToken, hashToken } from '../utils/tokens';
import {
  clearSessionCookie,
  readSessionToken,
  revokeUserSessions,
  startSession,
} from '../utils/sessions';
import { writeAudit } from '../utils/audit';
import { sendMail } from '../utils/mailer';
import { toSessionUser } from '../utils/userView';
import { syncProfileForAccount } from '../utils/memberSync';
import { MembershipStatus } from '../config/constants';

const GENERIC_LOGIN_ERROR = 'Invalid email or password';

const INACTIVE_MESSAGES: Record<string, string> = {
  [AccountStatus.PENDING]: 'Your registration is awaiting approval by the Samaj office.',
  [AccountStatus.REJECTED]: 'Your registration was not approved. Please contact the Samaj office.',
  [AccountStatus.SUSPENDED]: 'This account has been suspended. Please contact the Samaj office.',
};

/**
 * @name register
 * @file AuthController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Public member registration. Always creates a member in "pending" status; the role
 * is never read from the request. An administrator must approve the account before it can sign in.
 * @author Ravi Patel
 */
export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await OrganizationSettings.findOne({ key: 'main' }).lean();
    if (settings && settings.registrationOpen === false) {
      return sendError(res, {
        statusCode: ResponseCodes.FORBIDDEN,
        message: 'Registration is currently closed. Please contact the Samaj office.',
        code: ErrorCodes.FORBIDDEN,
      });
    }

    const { name, email, phone, password } = matchedData<{
      name: string;
      email: string;
      phone?: string;
      password: string;
    }>(req, { locations: ['body'] });

    const existing = await User.findOne({ email }).select('_id').lean();
    if (existing) {
      await writeAudit(req, { action: 'auth.register_duplicate', outcome: 'failure', actorId: null });
      return sendError(res, {
        statusCode: ResponseCodes.CONFLICT,
        message: 'An account with this email already exists. Try signing in instead.',
        code: ErrorCodes.DUPLICATE,
      });
    }

    const user = await User.create({
      name,
      email,
      phone: phone || undefined,
      passwordHash: await hashPassword(password),
      role: Roles.MEMBER, // fixed: public registration can never choose a role
      status: AccountStatus.PENDING,
      membershipAcknowledgedAt: new Date(),
    });

    // The directory entry starts pending and hidden from the directory until approval.
    try {
      await syncProfileForAccount(user, MembershipStatus.PENDING);
    } catch (err) {
      await User.deleteOne({ _id: user._id }); // no half-created accounts
      throw err;
    }

    await writeAudit(req, {
      action: 'auth.register',
      actorId: user._id,
      actorRole: user.role,
      targetType: 'user',
      targetId: user._id,
    });

    return new ApiResponse(
      ResponseCodes.CREATED,
      'Registration received. The Samaj office will review it and you will be able to sign in once it is approved.',
      { user: { id: user._id, name: user.name, status: user.status } },
    ).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name login
 * @file AuthController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Signs a user in with email and password. Errors are generic so they never reveal
 * whether an email is registered. Failed attempts lock the account temporarily. A new session is
 * issued on every successful login (rotation).
 * @author Ravi Patel
 */
export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email: rawEmail, password } = matchedData<{ email: string; password: string }>(req, {
      locations: ['body'],
    });
    const email = rawEmail.trim().toLowerCase();
    const emailFingerprint = hashToken(email).slice(0, 16); // lets us correlate attempts without storing the address

    const user = await User.findOne({ email, isDeleted: false }).select('+passwordHash');
    const invalid = async (reason: string) => {
      await writeAudit(req, {
        action: 'auth.login_failed',
        outcome: 'failure',
        actorId: user?._id ?? null,
        metadata: { reason, emailFingerprint },
      });
      return sendError(res, {
        statusCode: ResponseCodes.UNAUTHORIZED,
        message: GENERIC_LOGIN_ERROR,
        code: ErrorCodes.UNAUTHORIZED,
      });
    };

    if (!user || !user.passwordHash) {
      await verifyAgainstDummy(password); // same cost as a real check
      return invalid('unknown_or_no_password');
    }

    if (user.lockUntil && user.lockUntil.getTime() > Date.now()) {
      await verifyAgainstDummy(password);
      await writeAudit(req, {
        action: 'auth.login_locked',
        outcome: 'failure',
        actorId: user._id,
        metadata: { emailFingerprint },
      });
      return sendError(res, {
        statusCode: ResponseCodes.TOO_MANY_REQUESTS,
        message: 'Too many failed sign-in attempts. Please try again in a few minutes.',
        code: ErrorCodes.RATE_LIMITED,
      });
    }

    const passwordOk = await verifyPassword(user.passwordHash, password);
    if (!passwordOk) {
      const failures = (user.failedLoginCount ?? 0) + 1;
      if (failures >= config.auth.maxFailedLogins) {
        user.failedLoginCount = 0;
        user.lockUntil = new Date(Date.now() + config.auth.lockMinutes * 60_000);
      } else {
        user.failedLoginCount = failures;
      }
      await user.save();
      return invalid('bad_password');
    }

    // Password is correct: only now is it safe to say anything about the account's state.
    if (user.status !== AccountStatus.ACTIVE) {
      await writeAudit(req, {
        action: 'auth.login_blocked',
        outcome: 'failure',
        actorId: user._id,
        metadata: { status: user.status },
      });
      return sendError(res, {
        statusCode: ResponseCodes.FORBIDDEN,
        message: INACTIVE_MESSAGES[user.status] ?? 'This account is not active.',
        code: ErrorCodes.ACCOUNT_NOT_ACTIVE,
      });
    }

    // Rotation: drop any session cookie presented with the login request, then issue a new one.
    const previous = readSessionToken(req);
    if (previous) await Session.deleteOne({ tokenHash: hashToken(previous) });

    user.failedLoginCount = 0;
    user.lockUntil = undefined;
    user.lastLoginAt = new Date();
    await user.save();

    const token = await startSession(req, res, user._id);
    await writeAudit(req, {
      action: 'auth.login',
      actorId: user._id,
      actorRole: user.role,
    });

    return new ApiResponse(ResponseCodes.OK, 'Signed in successfully', {
      user: toSessionUser(user),
      csrfToken: csrfTokenFor(token),
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name logout
 * @file AuthController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Ends the current session on the server and clears the cookie.
 * @author Ravi Patel
 */
export const logout = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.authSession) await Session.deleteOne({ _id: req.authSession.id });
    clearSessionCookie(res);
    await writeAudit(req, { action: 'auth.logout' });
    return new ApiResponse(ResponseCodes.OK, 'Signed out').send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name getMe
 * @file AuthController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Returns the signed-in user, their effective permissions and the CSRF token for
 * this session. The front end calls it on load to restore the signed-in state.
 * @author Ravi Patel
 */
export const getMe = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await User.findOne({ _id: req.user?.id, isDeleted: false }).lean();
    if (!user || !req.authSession) {
      return sendError(res, {
        statusCode: ResponseCodes.UNAUTHORIZED,
        message: 'Not authenticated',
        code: ErrorCodes.UNAUTHORIZED,
      });
    }
    return new ApiResponse(ResponseCodes.OK, 'Profile fetched successfully', {
      user: toSessionUser(user),
      csrfToken: req.authSession.csrfToken,
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name updateTheme
 * @file AuthController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Saves the user's theme preference (system, light or dark) on their account so it
 * is restored on every device and login.
 * @author Ravi Patel
 */
export const updateTheme = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { themePreference } = matchedData<{ themePreference: 'system' | 'light' | 'dark' }>(req, {
      locations: ['body'],
    });
    await User.updateOne({ _id: req.user?.id }, { $set: { themePreference } });
    return new ApiResponse(ResponseCodes.OK, 'Theme preference saved', { themePreference }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name changePassword
 * @file AuthController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Changes the signed-in user's password. Other sessions are revoked and the current
 * one is rotated.
 * @author Ravi Patel
 */
export const changePassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { currentPassword, newPassword } = matchedData<{
      currentPassword: string;
      newPassword: string;
    }>(req, { locations: ['body'] });

    const user = await User.findOne({ _id: req.user?.id, isDeleted: false }).select('+passwordHash');
    if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, currentPassword))) {
      await writeAudit(req, { action: 'auth.password_change_failed', outcome: 'failure' });
      return sendError(res, {
        statusCode: ResponseCodes.BAD_REQUEST,
        message: 'Current password is incorrect',
        code: ErrorCodes.VALIDATION_ERROR,
        details: [{ field: 'currentPassword', message: 'Current password is incorrect' }],
      });
    }

    user.passwordHash = await hashPassword(newPassword);
    user.passwordChangedAt = new Date();
    await user.save();

    await revokeUserSessions(user._id);
    const token = await startSession(req, res, user._id);
    await writeAudit(req, { action: 'auth.password_changed' });

    return new ApiResponse(ResponseCodes.OK, 'Password changed. Other devices have been signed out.', {
      csrfToken: csrfTokenFor(token),
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name forgotPassword
 * @file AuthController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Starts a password reset. The response is always the same, so it cannot be used to
 * discover which emails are registered. If no mail driver is configured nothing is sent and the
 * message tells the user to contact the office — we never claim an email was delivered.
 * @author Ravi Patel
 */
export const forgotPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = matchedData<{ email: string }>(req, { locations: ['body'] });
    const user = await User.findOne({ email, isDeleted: false }).lean();

    if (user && user.status !== AccountStatus.SUSPENDED) {
      await PasswordResetToken.deleteMany({ userId: user._id, usedAt: null });
      const token = generateToken();
      await PasswordResetToken.create({
        userId: user._id,
        tokenHash: hashToken(token),
        purpose: 'reset',
        expiresAt: new Date(Date.now() + config.auth.resetTokenMinutes * 60_000),
      });
      await sendMail({
        to: user.email,
        subject: 'Reset your Samaj portal password',
        text: `Use this link within ${config.auth.resetTokenMinutes} minutes:\n${config.clientOrigin}/reset-password?token=${token}\n\nIf you did not ask for this, ignore this message.`,
      });
      await writeAudit(req, { action: 'auth.password_reset_requested', actorId: user._id });
    }

    return new ApiResponse(
      ResponseCodes.OK,
      'If an account exists for that email and email delivery is available, reset instructions have been sent. If nothing arrives, please contact the Samaj office.',
    ).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name resetPassword
 * @file AuthController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Completes a password reset or first-time setup with a single-use, short-lived token.
 * All existing sessions for the account are revoked.
 * @author Ravi Patel
 */
export const resetPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, password } = matchedData<{ token: string; password: string }>(req, {
      locations: ['body'],
    });

    // Atomic claim: the token can be consumed exactly once even under concurrent requests.
    const claimed = await PasswordResetToken.findOneAndUpdate(
      { tokenHash: hashToken(token), usedAt: null, expiresAt: { $gt: new Date() } },
      { $set: { usedAt: new Date() } },
    ).lean();

    const invalid = () =>
      sendError(res, {
        statusCode: ResponseCodes.BAD_REQUEST,
        message: 'This reset link is invalid or has expired. Please request a new one.',
        code: ErrorCodes.VALIDATION_ERROR,
      });

    if (!claimed) return invalid();

    const user = await User.findOne({ _id: claimed.userId, isDeleted: false });
    if (!user || user.status === AccountStatus.SUSPENDED) return invalid();

    user.passwordHash = await hashPassword(password);
    user.passwordChangedAt = new Date();
    user.failedLoginCount = 0;
    user.lockUntil = undefined;
    await user.save();
    await revokeUserSessions(user._id);

    await writeAudit(req, {
      action: 'auth.password_reset_completed',
      actorId: user._id,
      actorRole: user.role,
    });
    return new ApiResponse(ResponseCodes.OK, 'Password updated. You can now sign in.').send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name listSessions
 * @file AuthController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Lists the signed-in user's own active sessions so they can sign out other devices.
 * @author Ravi Patel
 */
export const listSessions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessions = await Session.find({ userId: req.user?.id, expiresAt: { $gt: new Date() } })
      .sort({ lastSeenAt: -1 })
      .lean();
    return new ApiResponse(ResponseCodes.OK, 'Sessions fetched successfully', {
      sessions: sessions.map((s) => ({
        id: s._id,
        userAgent: s.userAgent ?? null,
        lastSeenAt: s.lastSeenAt,
        createdAt: s.createdAt,
        current: s._id === req.authSession?.id,
      })),
      totalCount: sessions.length,
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name revokeSession
 * @file AuthController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Signs out one of the user's own sessions. A user can never revoke someone else's.
 * @author Ravi Patel
 */
export const revokeSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await Session.deleteOne({ _id: req.params.id, userId: req.user?.id });
    if (result.deletedCount === 0) {
      return sendError(res, {
        statusCode: ResponseCodes.NOT_FOUND,
        message: 'Session not found',
        code: ErrorCodes.NOT_FOUND,
      });
    }
    return new ApiResponse(ResponseCodes.OK, 'Session signed out').send(res);
  } catch (err) {
    return next(err);
  }
};
