import type { NextFunction, Request, Response } from 'express';
import { matchedData } from 'express-validator';
import MemberProfile from '../models/MemberProfile';
import { ErrorCodes, MemberVisibility, MembershipStatus, ResponseCodes } from '../config/constants';
import { ApiResponse, sendError } from '../utils/apiResponse';
import { escapeRegex } from '../utils/escapeRegex';
import { pageParams } from '../utils/pagination';
import { toDirectoryEntry } from '../utils/memberView';

/**
 * The public directory shows only entries marked "public" that are active and not anonymised.
 * Everyone gets the same view (there is no member sign-in). "hidden" entries, and any legacy
 * value other than "public", are for the office only. The whole directory is switched off with
 * the "Members directory" public tab (routes use requireTab('directory')).
 */
const visibleFilter = () =>
  ({
    isDeleted: false,
    membershipStatus: MembershipStatus.ACTIVE,
    visibility: MemberVisibility.PUBLIC,
    anonymizedAt: { $exists: false },
  }) as Record<string, unknown>;

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

    const filter = visibleFilter();

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
    const filter = visibleFilter();
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
    const profile = await MemberProfile.findOne({ ...visibleFilter(), _id: req.params.id }).lean();
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
