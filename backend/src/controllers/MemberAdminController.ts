import type { NextFunction, Request, Response } from 'express';
import { matchedData } from 'express-validator';
import MemberProfile from '../models/MemberProfile';
import User from '../models/User';
import {
  AccountStatus,
  ErrorCodes,
  MemberVisibility,
  MembershipStatus,
  ResponseCodes,
  type MemberVisibilityValue,
  type MembershipStatusValue,
} from '../config/constants';
import { Permissions } from '../config/permissions';
import { ApiResponse, sendError } from '../utils/apiResponse';
import { escapeRegex } from '../utils/escapeRegex';
import { pageParams } from '../utils/pagination';
import { toStaffMember } from '../utils/memberView';
import { writeAudit } from '../utils/audit';
import { revokeUserSessions } from '../utils/sessions';
import { sendCsv, toCsv } from '../utils/csv';

const canSeePrivate = (req: Request) =>
  req.user?.permissions.includes(Permissions.MEMBERS_READ_PRIVATE) ?? false;

const notFound = (res: Response) =>
  sendError(res, { statusCode: ResponseCodes.NOT_FOUND, message: 'Member not found', code: ErrorCodes.NOT_FOUND });

interface ListQuery {
  page?: number;
  limit?: number;
  search?: string;
  membershipStatus?: string;
  visibility?: string;
  hasAccount?: boolean;
  village?: string;
}

const buildFilter = (q: ListQuery) => {
  const filter: Record<string, unknown> = { isDeleted: false };
  if (q.membershipStatus) filter.membershipStatus = q.membershipStatus;
  if (q.visibility) filter.visibility = q.visibility;
  if (q.village) filter.village = new RegExp(`^${escapeRegex(q.village)}$`, 'i');
  if (q.hasAccount === true) filter.userId = { $type: 'string' };
  if (q.hasAccount === false) filter.userId = null;
  if (q.search) {
    const rx = new RegExp(escapeRegex(q.search), 'i');
    filter.$or = [{ displayName: rx }, { village: rx }, { city: rx }];
  }
  return filter;
};

/** Loads the sign-in accounts for a page of profiles in one query. */
const accountsFor = async (userIds: (string | null | undefined)[]) => {
  const ids = userIds.filter((id): id is string => Boolean(id));
  const users = ids.length ? await User.find({ _id: { $in: ids } }).select('status phone').lean() : [];
  return new Map(users.map((u) => [u._id, u]));
};

/**
 * @name listMembers
 * @file MemberAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Staff member list with search and filters. Phone, family size and kul are included
 * only for holders of members.read.private.
 * @author Ravi Patel
 */
export const listMembers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = matchedData<ListQuery>(req, { locations: ['query'] });
    const filter = buildFilter(q);
    const { limit, skip } = pageParams(q, 20);

    const [profiles, totalCount] = await Promise.all([
      MemberProfile.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      MemberProfile.countDocuments(filter),
    ]);
    const accounts = await accountsFor(profiles.map((p) => p.userId));
    const includePrivate = canSeePrivate(req);

    return new ApiResponse(ResponseCodes.OK, 'Members fetched successfully', {
      members: profiles.map((p) => {
        const account = p.userId ? accounts.get(p.userId) : undefined;
        return toStaffMember(p, {
          includePrivate,
          accountPhone: account?.phone,
          accountStatus: account?.status,
        });
      }),
      totalCount,
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name createMember
 * @file MemberAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @description The office adds a directory entry for someone who has no sign-in account. Their
 * private details can be recorded only by staff allowed to handle private data.
 * @author Ravi Patel
 */
export const createMember = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = matchedData<{
      displayName: string;
      village?: string;
      city?: string;
      country?: string;
      occupation?: string;
      bio?: string;
      kul?: string;
      familySize?: number;
      phone?: string;
      joinedYear?: number;
      highlighted?: boolean;
      membershipStatus?: MembershipStatusValue;
      visibility?: MemberVisibilityValue;
    }>(req, { locations: ['body'], includeOptionals: false });
    if (!canSeePrivate(req) && (data.phone || data.familySize || data.kul)) {
      return sendError(res, {
        statusCode: ResponseCodes.FORBIDDEN,
        message: 'Only staff authorized for private member data can record phone, family size or kul',
        code: ErrorCodes.FORBIDDEN,
      });
    }

    const profile = await MemberProfile.create({
      ...data,
      userId: null, // account links are made by registration, never by this endpoint
      membershipStatus: data.membershipStatus ?? MembershipStatus.ACTIVE,
      visibility: data.visibility ?? MemberVisibility.MEMBERS,
    });

    await writeAudit(req, { action: 'member.created', targetType: 'member', targetId: profile._id });
    return new ApiResponse(ResponseCodes.CREATED, 'Member added', {
      member: toStaffMember(profile.toObject(), { includePrivate: canSeePrivate(req) }),
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name updateMember
 * @file MemberAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Staff edit a directory entry. Private fields need the private permission. For
 * entries that belong to an account the status is changed through account actions (approve,
 * suspend), not here, and a name change is applied to the account too.
 * @author Ravi Patel
 */
export const updateMember = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = matchedData<{
      displayName?: string;
      phone?: string;
      familySize?: number;
      kul?: string;
      membershipStatus?: string;
      [key: string]: unknown;
    }>(req, { locations: ['body'], includeOptionals: false });

    const profile = await MemberProfile.findOne({ _id: req.params.id, isDeleted: false });
    if (!profile) return notFound(res);

    const touchesPrivate = data.phone !== undefined || data.familySize !== undefined || data.kul !== undefined;
    if (touchesPrivate && !canSeePrivate(req)) {
      return sendError(res, {
        statusCode: ResponseCodes.FORBIDDEN,
        message: 'Only staff authorized for private member data can change phone, family size or kul',
        code: ErrorCodes.FORBIDDEN,
      });
    }
    if (profile.userId && data.membershipStatus !== undefined) {
      return sendError(res, {
        statusCode: ResponseCodes.CONFLICT,
        message: 'This member has an account. Use approve, reject, suspend or reactivate instead.',
        code: ErrorCodes.DUPLICATE,
      });
    }

    const { phone, ...profileData } = data;
    profile.set(profileData);
    if (phone !== undefined && !profile.userId) profile.phone = phone || undefined;
    await profile.save();

    if (profile.userId) {
      const accountUpdate: Record<string, unknown> = {};
      if (data.displayName) accountUpdate.name = data.displayName;
      if (phone !== undefined) accountUpdate.phone = phone || undefined;
      if (Object.keys(accountUpdate).length) await User.updateOne({ _id: profile.userId }, { $set: accountUpdate });
    }

    await writeAudit(req, {
      action: 'member.updated',
      targetType: 'member',
      targetId: profile._id,
      metadata: { fields: Object.keys(data) },
    });

    const account = profile.userId ? await User.findById(profile.userId).select('status phone').lean() : null;
    return new ApiResponse(ResponseCodes.OK, 'Member updated', {
      member: toStaffMember(profile.toObject(), {
        includePrivate: canSeePrivate(req),
        accountPhone: account?.phone,
        accountStatus: account?.status,
      }),
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name anonymizeMember
 * @file MemberAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Irreversibly removes personal details from a member and signs them out. Member
 * records are never hard-deleted by default; this keeps history (RSVP counts, audit entries)
 * without keeping the person.
 * @author Ravi Patel
 */
export const anonymizeMember = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = await MemberProfile.findOne({ _id: req.params.id, isDeleted: false });
    if (!profile) return notFound(res);

    if (profile.userId) {
      const user = await User.findOne({ _id: profile.userId });
      if (user) {
        if (user.role !== 'member') {
          return sendError(res, {
            statusCode: ResponseCodes.CONFLICT,
            message: 'Staff accounts cannot be anonymised here. Demote the account first.',
            code: ErrorCodes.DUPLICATE,
          });
        }
        user.name = 'Former member';
        user.email = `removed+${user._id}@invalid.local`;
        user.phone = undefined;
        user.passwordHash = null;
        user.status = AccountStatus.SUSPENDED;
        user.isDeleted = true;
        await user.save();
        await revokeUserSessions(user._id);
      }
    }

    profile.set({
      displayName: 'Former member',
      village: undefined,
      city: undefined,
      occupation: undefined,
      bio: undefined,
      familySize: undefined,
      kul: undefined,
      phone: undefined,
      visibility: MemberVisibility.HIDDEN,
      membershipStatus: MembershipStatus.INACTIVE,
      highlighted: false,
      anonymizedAt: new Date(),
    });
    await profile.save();

    await writeAudit(req, { action: 'member.anonymized', targetType: 'member', targetId: profile._id });
    return new ApiResponse(ResponseCodes.OK, 'Member anonymised').send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name exportMembers
 * @file MemberAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @description CSV export of members matching the current filters. Requires members.export; private
 * columns are added only for holders of the private permission. Every export is audited.
 * @author Ravi Patel
 */
export const exportMembers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = matchedData<ListQuery>(req, { locations: ['query'] });
    const filter = buildFilter(q);
    const profiles = await MemberProfile.find(filter).sort({ displayName: 1 }).limit(10_000).lean();
    const accounts = await accountsFor(profiles.map((p) => p.userId));
    const includePrivate = canSeePrivate(req);

    const headers = ['Name', 'Village', 'City', 'Country', 'Occupation', 'Joined', 'Membership', 'Visibility'];
    if (includePrivate) headers.push('Phone', 'Family size', 'Kul');
    const rows = profiles.map((p) => {
      const base = [
        p.displayName,
        p.village,
        p.city,
        p.country,
        p.occupation,
        p.joinedYear,
        p.membershipStatus,
        p.visibility,
      ];
      return includePrivate
        ? [...base, (p.userId ? accounts.get(p.userId)?.phone : undefined) ?? p.phone, p.familySize, p.kul]
        : base;
    });

    await writeAudit(req, {
      action: 'members.exported',
      metadata: { count: rows.length, includedPrivate: includePrivate, filters: Object.keys(q) },
    });
    return sendCsv(res, `members-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(headers, rows));
  } catch (err) {
    return next(err);
  }
};
