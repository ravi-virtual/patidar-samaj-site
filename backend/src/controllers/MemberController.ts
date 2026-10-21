import type { NextFunction, Request, Response } from 'express';
import { matchedData } from 'express-validator';
import MemberProfile from '../models/MemberProfile';
import User from '../models/User';
import { ErrorCodes, MemberVisibility, MembershipStatus, ResponseCodes } from '../config/constants';
import { ApiResponse, sendError } from '../utils/apiResponse';
import { escapeRegex } from '../utils/escapeRegex';
import { pageParams } from '../utils/pagination';
import { getSettings } from '../utils/settings';
import { toDirectoryEntry, toOwnerProfile } from '../utils/memberView';
import { writeAudit } from '../utils/audit';

/**
 * Which directory entries the current visitor may see. Anonymous visitors get only entries whose
 * owner chose "public" (and only if the organisation allows a public directory); signed-in members
 * also get "members" entries. "hidden" entries are staff-only. Suspended, rejected, pending and
 * anonymised entries never appear.
 */
const visibleFilter = async (req: Request) => {
  const settings = await getSettings();
  const levels: string[] = [MemberVisibility.PUBLIC];
  if (req.user) levels.push(MemberVisibility.MEMBERS);
  return {
    allowed: Boolean(req.user) || settings?.directoryPublic !== false,
    filter: {
      isDeleted: false,
      membershipStatus: MembershipStatus.ACTIVE,
      visibility: { $in: levels },
      anonymizedAt: { $exists: false },
    } as Record<string, unknown>,
  };
};

const exactCi = (value: string) => new RegExp(`^${escapeRegex(value)}$`, 'i');

/**
 * @name listDirectory
 * @file MemberController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Searchable, filterable, paginated member directory. Responses contain only the
 * public-field allowlist: never phone, email or family details.
 * @author Ravi Patel
 */
export const listDirectory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = matchedData<{
      page?: number;
      limit?: number;
      search?: string;
      village?: string;
      city?: string;
      country?: string;
      sort?: string;
    }>(req, { locations: ['query'] });

    const { allowed, filter } = await visibleFilter(req);
    if (!allowed) {
      return sendError(res, {
        statusCode: ResponseCodes.UNAUTHORIZED,
        message: 'Please sign in to view the member directory.',
        code: ErrorCodes.UNAUTHORIZED,
      });
    }

    if (q.search) {
      const rx = new RegExp(escapeRegex(q.search), 'i');
      filter.$or = [{ displayName: rx }, { village: rx }, { city: rx }];
    }
    if (q.village) filter.village = exactCi(q.village);
    if (q.city) filter.city = exactCi(q.city);
    if (q.country) filter.country = exactCi(q.country);

    const sorts: Record<string, Record<string, 1 | -1>> = {
      name: { displayName: 1 },
      '-name': { displayName: -1 },
      village: { village: 1, displayName: 1 },
      city: { city: 1, displayName: 1 },
    };
    const { limit, skip } = pageParams(q, 20);

    const [profiles, totalCount] = await Promise.all([
      MemberProfile.find(filter).sort(sorts[q.sort ?? 'name']).skip(skip).limit(limit).lean(),
      MemberProfile.countDocuments(filter),
    ]);

    return new ApiResponse(ResponseCodes.OK, 'Members fetched successfully', {
      members: profiles.map(toDirectoryEntry),
      totalCount,
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name listDirectoryFilters
 * @file MemberController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Distinct villages and cities among the entries the visitor may see, for filter menus.
 * @author Ravi Patel
 */
export const listDirectoryFilters = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { allowed, filter } = await visibleFilter(req);
    if (!allowed) {
      return sendError(res, {
        statusCode: ResponseCodes.UNAUTHORIZED,
        message: 'Please sign in to view the member directory.',
        code: ErrorCodes.UNAUTHORIZED,
      });
    }
    const [villages, cities] = await Promise.all([
      MemberProfile.distinct('village', filter),
      MemberProfile.distinct('city', filter),
    ]);
    const clean = (list: unknown[]) =>
      (list.filter((v): v is string => typeof v === 'string' && v.length > 0) as string[]).sort((a, b) =>
        a.localeCompare(b),
      );
    return new ApiResponse(ResponseCodes.OK, 'Filters fetched successfully', {
      villages: clean(villages),
      cities: clean(cities),
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name getMember
 * @file MemberController.ts
 * @param {Request} req
 * @param {Response} res
 * @description One directory entry. Entries the visitor may not see return 404, so their
 * existence is not revealed.
 * @author Ravi Patel
 */
export const getMember = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { allowed, filter } = await visibleFilter(req);
    const profile = allowed ? await MemberProfile.findOne({ ...filter, _id: req.params.id }).lean() : null;
    if (!profile) {
      return sendError(res, {
        statusCode: ResponseCodes.NOT_FOUND,
        message: 'Member not found',
        code: ErrorCodes.NOT_FOUND,
      });
    }
    return new ApiResponse(ResponseCodes.OK, 'Member fetched successfully', {
      member: toDirectoryEntry(profile),
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name getMyProfile
 * @file MemberController.ts
 * @param {Request} req
 * @param {Response} res
 * @description The signed-in user's own profile, including private details only they (and
 * staff with the private permission) can see.
 * @author Ravi Patel
 */
export const getMyProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [profile, user] = await Promise.all([
      MemberProfile.findOne({ userId: req.user?.id, isDeleted: false }).lean(),
      User.findOne({ _id: req.user?.id, isDeleted: false }).select('phone').lean(),
    ]);
    return new ApiResponse(ResponseCodes.OK, 'Profile fetched successfully', {
      profile: profile ? toOwnerProfile(profile, user?.phone) : null,
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name updateMyProfile
 * @file MemberController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Members edit only their own details and directory visibility. Name, email, status
 * and roles can only be changed by the office. Only the listed fields are read from the request.
 * @author Ravi Patel
 */
export const updateMyProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = matchedData<{
      village?: string;
      city?: string;
      country?: string;
      occupation?: string;
      kul?: string;
      bio?: string;
      familySize?: number;
      phone?: string;
      visibility?: (typeof MemberVisibility)[keyof typeof MemberVisibility];
    }>(req, { locations: ['body'], includeOptionals: false });

    const profile = await MemberProfile.findOne({ userId: req.user?.id, isDeleted: false });
    if (!profile) {
      return sendError(res, {
        statusCode: ResponseCodes.NOT_FOUND,
        message: 'No profile found for this account',
        code: ErrorCodes.NOT_FOUND,
      });
    }

    const { phone, ...profileData } = data;
    profile.set(profileData);
    await profile.save();
    if (phone !== undefined) {
      await User.updateOne({ _id: req.user?.id }, { $set: { phone: phone || undefined } });
    }

    if (data.visibility) {
      await writeAudit(req, {
        action: 'member.visibility_changed',
        targetType: 'member',
        targetId: profile._id,
        metadata: { visibility: data.visibility },
      });
    }

    const user = await User.findOne({ _id: req.user?.id }).select('phone').lean();
    return new ApiResponse(ResponseCodes.OK, 'Profile updated', {
      profile: toOwnerProfile(profile.toObject(), user?.phone),
    }).send(res);
  } catch (err) {
    return next(err);
  }
};
