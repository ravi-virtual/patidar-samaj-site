import type { NextFunction, Request, Response } from 'express';
import { matchedData } from 'express-validator';
import Announcement from '../models/Announcement';
import { ErrorCodes, PublishStatus, ResponseCodes } from '../config/constants';
import { ApiResponse, sendError } from '../utils/apiResponse';
import { escapeRegex } from '../utils/escapeRegex';
import { pageParams } from '../utils/pagination';
import { toPublicAnnouncement, visibleNowFilter } from '../utils/announcementView';
import { searchFieldsFor } from '../utils/localize';

const notFound = (res: Response) =>
  sendError(res, { statusCode: ResponseCodes.NOT_FOUND, message: 'Announcement not found', code: ErrorCodes.NOT_FOUND });

/**
 * @name listAnnouncements
 * @file AnnouncementController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Published announcements, pinned ones first. Scheduled items appear only once their
 * time has come. `archived=true` shows the archive instead.
 * @author Ravi Patel
 */
export const listAnnouncements = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = matchedData<{
      page?: number;
      limit?: number;
      category?: string;
      search?: string;
      archived?: boolean;
    }>(req, { locations: ['query'] });

    const filter: Record<string, unknown> = q.archived
      ? { isDeleted: false, status: PublishStatus.ARCHIVED }
      : visibleNowFilter();
    const and: Record<string, unknown>[] = [];
    if (q.category) filter.category = q.category;
    if (q.search) {
      const rx = new RegExp(escapeRegex(q.search), 'i');
      and.push({ $or: searchFieldsFor(['title', 'summary', 'body'], req.lang).map((f) => ({ [f]: rx })) });
    }
    if (and.length) filter.$and = and;

    const { limit, skip } = pageParams(q, 12);
    const [items, totalCount] = await Promise.all([
      Announcement.find(filter)
        .sort(q.archived ? { publishAt: -1, createdAt: -1 } : { pinned: -1, order: 1, publishAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Announcement.countDocuments(filter),
    ]);

    return new ApiResponse(ResponseCodes.OK, 'Announcements fetched successfully', {
      announcements: items.map((a) => toPublicAnnouncement(a, false, req.lang)),
      totalCount,
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name getAnnouncement
 * @file AnnouncementController.ts
 * @param {Request} req
 * @param {Response} res
 * @description One published or archived announcement with its full text. Drafts and not-yet-due
 * scheduled items return 404.
 * @author Ravi Patel
 */
export const getAnnouncement = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    const item = await Announcement.findOne({
      _id: req.params.id,
      $or: [
        { ...visibleNowFilter(now) },
        { isDeleted: false, status: PublishStatus.ARCHIVED },
      ],
    }).lean();
    if (!item) return notFound(res);
    return new ApiResponse(ResponseCodes.OK, 'Announcement fetched successfully', {
      announcement: toPublicAnnouncement(item, true, req.lang),
    }).send(res);
  } catch (err) {
    return next(err);
  }
};
