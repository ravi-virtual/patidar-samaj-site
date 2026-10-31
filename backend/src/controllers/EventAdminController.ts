import type { NextFunction, Request, Response } from 'express';
import { matchedData } from 'express-validator';
import Event, { type IEvent } from '../models/Event';
import { ErrorCodes, EventStatus, ResponseCodes } from '../config/constants';
import { Permissions } from '../config/permissions';
import { ApiResponse, sendError } from '../utils/apiResponse';
import { escapeRegex } from '../utils/escapeRegex';
import { pageParams } from '../utils/pagination';
import { timingError, toAdminEvent } from '../utils/eventView';
import { mayEditItem } from '../utils/publishPolicy';
import { writeAudit } from '../utils/audit';

const notFound = (res: Response, what = 'Event') =>
  sendError(res, { statusCode: ResponseCodes.NOT_FOUND, message: `${what} not found`, code: ErrorCodes.NOT_FOUND });

const conflict = (res: Response, message: string, code: (typeof ErrorCodes)[keyof typeof ErrorCodes] = ErrorCodes.DUPLICATE) =>
  sendError(res, { statusCode: ResponseCodes.CONFLICT, message, code });

const forbidden = (res: Response, message: string) =>
  sendError(res, { statusCode: ResponseCodes.FORBIDDEN, message, code: ErrorCodes.FORBIDDEN });

const badRequest = (res: Response, field: string, message: string) =>
  sendError(res, {
    statusCode: ResponseCodes.BAD_REQUEST,
    message: 'Validation failed',
    code: ErrorCodes.VALIDATION_ERROR,
    details: [{ field, message }],
  });

type EventInput = {
  title?: string;
  description?: string | null;
  venue?: string;
  /** Gujarati twins of the text above (empty or missing means "show the English text"). */
  titleGu?: string | null;
  descriptionGu?: string | null;
  venueGu?: string | null;
  cancellationReasonGu?: string | null;
  category?: string;
  startsAt?: Date;
  endsAt?: Date | null;
  featured?: boolean;
  imageMediaId?: string | null;
};

/**
 * @name listAdminEvents
 * @file EventAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @description All events for staff, including drafts and archived.
 * @author Ravi Patel
 */
export const listAdminEvents = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = matchedData<{
      page?: number;
      limit?: number;
      when?: 'upcoming' | 'past' | 'all';
      status?: string;
      category?: string;
      search?: string;
    }>(req, { locations: ['query'] });

    const now = new Date();
    const filter: Record<string, unknown> = { isDeleted: false };
    if (q.status) filter.status = q.status;
    if (q.category) filter.category = q.category;
    if (q.when === 'upcoming') filter.startsAt = { $gte: now };
    if (q.when === 'past') filter.startsAt = { $lt: now };
    if (q.search) {
      const rx = new RegExp(escapeRegex(q.search), 'i');
      filter.$or = [{ title: rx }, { venue: rx }, { titleGu: rx }, { venueGu: rx }];
    }

    const { limit, skip } = pageParams(q, 20);
    const [events, totalCount] = await Promise.all([
      Event.find(filter).sort({ startsAt: -1 }).skip(skip).limit(limit).lean(),
      Event.countDocuments(filter),
    ]);
    return new ApiResponse(ResponseCodes.OK, 'Events fetched successfully', {
      events: events.map(toAdminEvent),
      totalCount,
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name getAdminEvent
 * @file EventAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @description One event of any status, for the staff editor.
 * @author Ravi Patel
 */
export const getAdminEvent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const event = await Event.findOne({ _id: req.params.id, isDeleted: false }).lean();
    if (!event) return notFound(res);
    return new ApiResponse(ResponseCodes.OK, 'Event fetched successfully', { event: toAdminEvent(event) }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name createEvent
 * @file EventAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Creates an event. It always starts as a draft; publishing is a separate action
 * that needs events.publish. Featuring an event needs that permission too.
 * @author Ravi Patel
 */
export const createEvent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = matchedData<EventInput>(req, { locations: ['body'], includeOptionals: false });
    const problem = timingError(data);
    if (problem) return badRequest(res, 'startsAt', problem);
    if (data.featured && !req.user!.permissions.includes(Permissions.EVENTS_PUBLISH)) {
      return forbidden(res, 'Only staff who can publish events may feature them');
    }

    const event = await Event.create({
      ...(data as Partial<IEvent>),
      status: EventStatus.DRAFT,
      createdBy: req.user!.id,
      updatedBy: req.user!.id,
    });
    await writeAudit(req, { action: 'event.created', targetType: 'event', targetId: event._id });
    return new ApiResponse(ResponseCodes.CREATED, 'Event created as a draft', {
      event: toAdminEvent(event.toObject()),
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name updateEvent
 * @file EventAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Edits an event. Without events.publish only drafts can be edited. The status is never
 * accepted from the request.
 * @author Ravi Patel
 */
export const updateEvent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = matchedData<EventInput>(req, { locations: ['body'], includeOptionals: false });
    const event = await Event.findOne({ _id: req.params.id, isDeleted: false });
    if (!event) return notFound(res);

    if (!mayEditItem(req.user, event.status, Permissions.EVENTS_PUBLISH)) {
      return forbidden(res, 'Only staff who can publish events may change an event that is already published');
    }
    if (data.featured !== undefined && !req.user!.permissions.includes(Permissions.EVENTS_PUBLISH)) {
      return forbidden(res, 'Only staff who can publish events may feature them');
    }

    const merged = {
      startsAt: data.startsAt ?? event.startsAt,
      endsAt: data.endsAt === undefined ? event.endsAt : data.endsAt,
    };
    const problem = timingError(merged);
    if (problem) return badRequest(res, 'startsAt', problem);

    event.set({ ...data, updatedBy: req.user!.id });
    await event.save();
    await writeAudit(req, {
      action: 'event.updated',
      targetType: 'event',
      targetId: event._id,
      metadata: { fields: Object.keys(data) },
    });
    return new ApiResponse(ResponseCodes.OK, 'Event updated', { event: toAdminEvent(event.toObject()) }).send(res);
  } catch (err) {
    return next(err);
  }
};

const transition = async (
  req: Request,
  res: Response,
  next: NextFunction,
  opts: {
    from: string[];
    to: string;
    action: string;
    message: string;
    extra?: Record<string, unknown>;
  },
) => {
  try {
    const event = await Event.findOne({ _id: req.params.id, isDeleted: false });
    if (!event) return notFound(res);
    if (!opts.from.includes(event.status)) {
      return conflict(res, `An event that is ${event.status} cannot be changed this way.`);
    }

    event.status = opts.to as typeof event.status;
    event.set({ ...opts.extra, updatedBy: req.user!.id });
    await event.save();
    await writeAudit(req, { action: opts.action, targetType: 'event', targetId: event._id });
    return new ApiResponse(ResponseCodes.OK, opts.message, { event: toAdminEvent(event.toObject()) }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name publishEvent
 * @file EventAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @param {NextFunction} next
 * @description Makes a draft event visible on the public site.
 * @author Ravi Patel
 */
export const publishEvent = (req: Request, res: Response, next: NextFunction) =>
  transition(req, res, next, {
    from: [EventStatus.DRAFT],
    to: EventStatus.PUBLISHED,
    action: 'event.published',
    message: 'Event published',
    extra: { publishedAt: new Date() },
  });

/**
 * @name unpublishEvent
 * @file EventAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @param {NextFunction} next
 * @description Returns a published event to draft.
 * @author Ravi Patel
 */
export const unpublishEvent = (req: Request, res: Response, next: NextFunction) =>
  transition(req, res, next, {
    from: [EventStatus.PUBLISHED],
    to: EventStatus.DRAFT,
    action: 'event.unpublished',
    message: 'Event unpublished',
  });

/**
 * @name cancelEvent
 * @file EventAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @param {NextFunction} next
 * @description Cancels a published event. It stays visible marked as cancelled
 * with the reason (`reason`, and its Gujarati twin `reasonGu`), if one was given.
 * @author Ravi Patel
 */
export const cancelEvent = async (req: Request, res: Response, next: NextFunction) => {
  const { reason, reasonGu } = matchedData<{ reason?: string; reasonGu?: string }>(req, { locations: ['body'] });
  return transition(req, res, next, {
    from: [EventStatus.PUBLISHED],
    to: EventStatus.CANCELLED,
    action: 'event.cancelled',
    message: 'Event cancelled',
    extra: { cancelledAt: new Date(), cancellationReason: reason, cancellationReasonGu: reasonGu },
  });
};

/**
 * @name archiveEvent
 * @file EventAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @param {NextFunction} next
 * @description Moves a finished or cancelled event out of the public lists.
 * @author Ravi Patel
 */
export const archiveEvent = (req: Request, res: Response, next: NextFunction) =>
  transition(req, res, next, {
    from: [EventStatus.PUBLISHED, EventStatus.CANCELLED, EventStatus.DRAFT],
    to: EventStatus.ARCHIVED,
    action: 'event.archived',
    message: 'Event archived',
  });

/**
 * @name deleteEvent
 * @file EventAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Soft-deletes an event.
 * @author Ravi Patel
 */
export const deleteEvent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const event = await Event.findOne({ _id: req.params.id, isDeleted: false });
    if (!event) return notFound(res);
    event.isDeleted = true;
    await event.save();
    await writeAudit(req, { action: 'event.deleted', targetType: 'event', targetId: event._id });
    return new ApiResponse(ResponseCodes.OK, 'Event deleted').send(res);
  } catch (err) {
    return next(err);
  }
};
