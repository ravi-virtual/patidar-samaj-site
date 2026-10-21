import type { NextFunction, Request, Response } from 'express';
import { matchedData } from 'express-validator';
import Announcement, { type IAnnouncement } from '../models/Announcement';
import { ErrorCodes, PublishStatus, ResponseCodes } from '../config/constants';
import { Permissions } from '../config/permissions';
import { ApiResponse, sendError } from '../utils/apiResponse';
import { escapeRegex } from '../utils/escapeRegex';
import { pageParams } from '../utils/pagination';
import { toAdminAnnouncement } from '../utils/announcementView';
import { mayEditItem } from '../utils/publishPolicy';
import { writeAudit } from '../utils/audit';

const notFound = (res: Response) =>
  sendError(res, { statusCode: ResponseCodes.NOT_FOUND, message: 'Announcement not found', code: ErrorCodes.NOT_FOUND });

const forbidden = (res: Response, message: string) =>
  sendError(res, { statusCode: ResponseCodes.FORBIDDEN, message, code: ErrorCodes.FORBIDDEN });

const conflict = (res: Response, message: string) =>
  sendError(res, { statusCode: ResponseCodes.CONFLICT, message, code: ErrorCodes.DUPLICATE });

type AnnouncementInput = {
  title?: string;
  summary?: string | null;
  body?: string;
  category?: string;
  publishAt?: Date | null;
  featured?: boolean;
};

/**
 * @name listAdminAnnouncements
 * @file AnnouncementAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @description All announcements for staff: drafts, scheduled, published and archived.
 * @author Ravi Patel
 */
export const listAdminAnnouncements = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = matchedData<{ page?: number; limit?: number; status?: string; category?: string; search?: string }>(req, {
      locations: ['query'],
    });
    const filter: Record<string, unknown> = { isDeleted: false };
    if (q.status) filter.status = q.status;
    if (q.category) filter.category = q.category;
    if (q.search) {
      const rx = new RegExp(escapeRegex(q.search), 'i');
      filter.$or = [{ title: rx }, { summary: rx }];
    }
    const { limit, skip } = pageParams(q, 20);
    const [items, totalCount] = await Promise.all([
      Announcement.find(filter).sort({ pinned: -1, order: 1, createdAt: -1 }).skip(skip).limit(limit).lean(),
      Announcement.countDocuments(filter),
    ]);
    return new ApiResponse(ResponseCodes.OK, 'Announcements fetched successfully', {
      announcements: items.map(toAdminAnnouncement),
      totalCount,
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name getAdminAnnouncement
 * @file AnnouncementAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @description One announcement of any status, for the staff editor.
 * @author Ravi Patel
 */
export const getAdminAnnouncement = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await Announcement.findOne({ _id: req.params.id, isDeleted: false }).lean();
    if (!item) return notFound(res);
    return new ApiResponse(ResponseCodes.OK, 'Announcement fetched successfully', {
      announcement: toAdminAnnouncement(item),
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name createAnnouncement
 * @file AnnouncementAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Creates a draft announcement. Publishing, pinning and featuring are separate actions
 * that need announcements.publish. Status and ordering are never read from the request.
 * @author Ravi Patel
 */
export const createAnnouncement = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = matchedData<AnnouncementInput>(req, { locations: ['body'], includeOptionals: false });
    if (data.featured && !req.user!.permissions.includes(Permissions.ANNOUNCEMENTS_PUBLISH)) {
      return forbidden(res, 'Only staff who can publish announcements may feature them');
    }
    const item = await Announcement.create({
      ...(data as Partial<IAnnouncement>),
      status: PublishStatus.DRAFT,
      pinned: false,
      createdBy: req.user!.id,
      updatedBy: req.user!.id,
    });
    await writeAudit(req, { action: 'announcement.created', targetType: 'announcement', targetId: item._id });
    return new ApiResponse(ResponseCodes.CREATED, 'Announcement saved as a draft', {
      announcement: toAdminAnnouncement(item.toObject()),
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name updateAnnouncement
 * @file AnnouncementAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Edits an announcement. Without announcements.publish only drafts can be edited.
 * @author Ravi Patel
 */
export const updateAnnouncement = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = matchedData<AnnouncementInput>(req, { locations: ['body'], includeOptionals: false });
    const item = await Announcement.findOne({ _id: req.params.id, isDeleted: false });
    if (!item) return notFound(res);
    if (!mayEditItem(req.user, item.status, Permissions.ANNOUNCEMENTS_PUBLISH)) {
      return forbidden(res, 'Only staff who can publish announcements may change one that is already published');
    }
    if (data.featured !== undefined && !req.user!.permissions.includes(Permissions.ANNOUNCEMENTS_PUBLISH)) {
      return forbidden(res, 'Only staff who can publish announcements may feature them');
    }
    item.set({ ...data, updatedBy: req.user!.id });
    await item.save();
    await writeAudit(req, {
      action: 'announcement.updated',
      targetType: 'announcement',
      targetId: item._id,
      metadata: { fields: Object.keys(data) },
    });
    return new ApiResponse(ResponseCodes.OK, 'Announcement updated', {
      announcement: toAdminAnnouncement(item.toObject()),
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

const change = async (
  req: Request,
  res: Response,
  next: NextFunction,
  opts: {
    from?: string[];
    action: string;
    message: string;
    apply: (item: InstanceType<typeof Announcement>, body: { publishAt?: Date | null }) => void;
  },
) => {
  try {
    const body = matchedData<{ publishAt?: Date | null }>(req, { locations: ['body'], includeOptionals: false });
    const item = await Announcement.findOne({ _id: req.params.id, isDeleted: false });
    if (!item) return notFound(res);
    if (opts.from && !opts.from.includes(item.status)) {
      return conflict(res, `An announcement that is ${item.status} cannot be changed this way.`);
    }
    opts.apply(item, body);
    item.updatedBy = req.user!.id;
    await item.save();
    await writeAudit(req, { action: opts.action, targetType: 'announcement', targetId: item._id });
    return new ApiResponse(ResponseCodes.OK, opts.message, { announcement: toAdminAnnouncement(item.toObject()) }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name publishAnnouncement
 * @file AnnouncementAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @param {NextFunction} next
 * @description Publishes a draft now, or at the optional future `publishAt` time (scheduling).
 * @author Ravi Patel
 */
export const publishAnnouncement = (req: Request, res: Response, next: NextFunction) =>
  change(req, res, next, {
    from: [PublishStatus.DRAFT],
    action: 'announcement.published',
    message: 'Announcement published',
    apply: (item, body) => {
      item.status = PublishStatus.PUBLISHED;
      item.publishedAt = new Date();
      item.publishAt = body.publishAt ?? item.publishAt ?? new Date();
    },
  });

/**
 * @name unpublishAnnouncement
 * @file AnnouncementAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @param {NextFunction} next
 * @description Returns a published or archived announcement to draft so it disappears from the site.
 * @author Ravi Patel
 */
export const unpublishAnnouncement = (req: Request, res: Response, next: NextFunction) =>
  change(req, res, next, {
    from: [PublishStatus.PUBLISHED, PublishStatus.ARCHIVED],
    action: 'announcement.unpublished',
    message: 'Announcement unpublished',
    apply: (item) => {
      item.status = PublishStatus.DRAFT;
      item.pinned = false;
    },
  });

/**
 * @name archiveAnnouncement
 * @file AnnouncementAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @param {NextFunction} next
 * @description Moves a published announcement to the public archive (it is no longer pinned).
 * @author Ravi Patel
 */
export const archiveAnnouncement = (req: Request, res: Response, next: NextFunction) =>
  change(req, res, next, {
    from: [PublishStatus.PUBLISHED],
    action: 'announcement.archived',
    message: 'Announcement archived',
    apply: (item) => {
      item.status = PublishStatus.ARCHIVED;
      item.pinned = false;
    },
  });

/**
 * @name pinAnnouncement
 * @file AnnouncementAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @param {NextFunction} next
 * @description Pins a published announcement to the top of the list.
 * @author Ravi Patel
 */
export const pinAnnouncement = (req: Request, res: Response, next: NextFunction) =>
  change(req, res, next, {
    from: [PublishStatus.PUBLISHED],
    action: 'announcement.pinned',
    message: 'Announcement pinned',
    apply: (item) => {
      item.pinned = true;
    },
  });

/**
 * @name unpinAnnouncement
 * @file AnnouncementAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @param {NextFunction} next
 * @description Removes the pin.
 * @author Ravi Patel
 */
export const unpinAnnouncement = (req: Request, res: Response, next: NextFunction) =>
  change(req, res, next, {
    action: 'announcement.unpinned',
    message: 'Announcement unpinned',
    apply: (item) => {
      item.pinned = false;
    },
  });

/**
 * @name reorderAnnouncements
 * @file AnnouncementAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Sets the display order of announcements to the order of the given ids (lower first).
 * Order matters among pinned announcements.
 * @author Ravi Patel
 */
export const reorderAnnouncements = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ids } = matchedData<{ ids: string[] }>(req, { locations: ['body'] });
    const result = await Announcement.bulkWrite(
      ids.map((id, index) => ({ updateOne: { filter: { _id: id, isDeleted: false }, update: { $set: { order: index } } } })),
    );
    await writeAudit(req, {
      action: 'announcement.reordered',
      metadata: { count: ids.length, matched: result.matchedCount },
    });
    return new ApiResponse(ResponseCodes.OK, 'Order saved', { updated: result.modifiedCount }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name deleteAnnouncement
 * @file AnnouncementAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Soft-deletes an announcement (announcements.delete).
 * @author Ravi Patel
 */
export const deleteAnnouncement = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await Announcement.findOne({ _id: req.params.id, isDeleted: false });
    if (!item) return notFound(res);
    item.isDeleted = true;
    item.pinned = false;
    await item.save();
    await writeAudit(req, { action: 'announcement.deleted', targetType: 'announcement', targetId: item._id });
    return new ApiResponse(ResponseCodes.OK, 'Announcement deleted').send(res);
  } catch (err) {
    return next(err);
  }
};
