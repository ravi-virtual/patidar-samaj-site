import type { NextFunction, Request, Response } from 'express';
import { matchedData } from 'express-validator';
import MemberProfile from '../models/MemberProfile';
import {
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
import { effectiveVisibility, toStaffMember } from '../utils/memberView';
import { writeAudit } from '../utils/audit';
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
  village?: string;
}

const buildFilter = (q: ListQuery) => {
  const filter: Record<string, unknown> = { isDeleted: false };
  if (q.membershipStatus) filter.membershipStatus = q.membershipStatus;
  // Anything that is not "public" counts as office-only, including a legacy "members" value.
  if (q.visibility === MemberVisibility.PUBLIC) filter.visibility = MemberVisibility.PUBLIC;
  if (q.visibility === MemberVisibility.HIDDEN) filter.visibility = { $ne: MemberVisibility.PUBLIC };
  if (q.village) filter.village = new RegExp(`^${escapeRegex(q.village)}$`, 'i');
  if (q.search) {
    const rx = new RegExp(escapeRegex(q.search), 'i');
    filter.$or = [{ displayName: rx }, { village: rx }, { city: rx }];
  }
  return filter;
};

/**
 * @name listMembers
 * @file MemberAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Staff list of directory entries with search and filters. Phone, family size and kul
 * are included only for holders of members.read.private.
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
    const includePrivate = canSeePrivate(req);

    return new ApiResponse(ResponseCodes.OK, 'Members fetched successfully', {
      members: profiles.map((p) => toStaffMember(p, { includePrivate })),
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
 * @description The office adds a directory entry. Entries are plain records without accounts.
 * Private details can be recorded only by staff allowed to handle private data.
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
      membershipStatus: data.membershipStatus ?? MembershipStatus.ACTIVE,
      visibility: data.visibility ?? MemberVisibility.HIDDEN,
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
 * @description Staff edit a directory entry. Private fields need the private permission.
 * @author Ravi Patel
 */
export const updateMember = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = matchedData<{
      displayName?: string;
      phone?: string;
      familySize?: number;
      kul?: string;
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

    const { phone, ...profileData } = data;
    profile.set(profileData);
    if (phone !== undefined) profile.phone = phone || undefined;
    await profile.save();

    await writeAudit(req, {
      action: 'member.updated',
      targetType: 'member',
      targetId: profile._id,
      metadata: { fields: Object.keys(data) },
    });

    return new ApiResponse(ResponseCodes.OK, 'Member updated', {
      member: toStaffMember(profile.toObject(), { includePrivate: canSeePrivate(req) }),
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
 * @description Irreversibly removes personal details from a directory entry. Entries are never
 * hard-deleted by default; this keeps history (audit entries) without keeping the person.
 * @author Ravi Patel
 */
export const anonymizeMember = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = await MemberProfile.findOne({ _id: req.params.id, isDeleted: false });
    if (!profile) return notFound(res);

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
 * @description CSV export of directory entries matching the current filters. Requires members.export;
 * private columns are added only for holders of the private permission. Every export is audited.
 * @author Ravi Patel
 */
export const exportMembers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = matchedData<ListQuery>(req, { locations: ['query'] });
    const filter = buildFilter(q);
    const profiles = await MemberProfile.find(filter).sort({ displayName: 1 }).limit(10_000).lean();
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
        effectiveVisibility(p),
      ];
      return includePrivate ? [...base, p.phone, p.familySize, p.kul] : base;
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
