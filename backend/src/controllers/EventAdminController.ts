import type { NextFunction, Request, Response } from 'express';
import { matchedData } from 'express-validator';
import Event, { type IEvent } from '../models/Event';
import EventRegistration from '../models/EventRegistration';
import User from '../models/User';
import { ErrorCodes, EventStatus, RegistrationStatus, ResponseCodes } from '../config/constants';
import { Permissions } from '../config/permissions';
import { ApiResponse, sendError } from '../utils/apiResponse';
import { escapeRegex } from '../utils/escapeRegex';
import { pageParams } from '../utils/pagination';
import { timingError, toAdminEvent } from '../utils/eventView';
import { mayEditItem } from '../utils/publishPolicy';
import { writeAudit } from '../utils/audit';
import { sendCsv, toCsv } from '../utils/csv';

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
  category?: string;
  startsAt?: Date;
  endsAt?: Date | null;
  registrationOpensAt?: Date | null;
  registrationClosesAt?: Date | null;
  capacity?: number;
  featured?: boolean;
  imageMediaId?: string | null;
};

/**
 * @name listAdminEvents
 * @file EventAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @description All events for staff, including drafts and archived, with registration counts.
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
      filter.$or = [{ title: rx }, { venue: rx }];
    }

    const { limit, skip } = pageParams(q, 20);
    const [events, totalCount] = await Promise.all([
      Event.find(filter).sort({ startsAt: -1 }).skip(skip).limit(limit).lean(),
      Event.countDocuments(filter),
    ]);
    return new ApiResponse(ResponseCodes.OK, 'Events fetched successfully', {
      events: events.map((e) => toAdminEvent(e, now)),
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
      registeredCount: 0,
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
 * @description Edits an event. Without events.publish only drafts can be edited. Capacity cannot
 * drop below the number of places already taken. The status and the counters are never accepted
 * from the request.
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
    if (data.capacity !== undefined && data.capacity > 0 && data.capacity < event.registeredCount) {
      return conflict(
        res,
        `${event.registeredCount} places are already taken, so capacity cannot be lower than that.`,
        ErrorCodes.HAS_DEPENDENCIES,
      );
    }

    const merged = {
      startsAt: data.startsAt ?? event.startsAt,
      endsAt: data.endsAt === undefined ? event.endsAt : data.endsAt,
      registrationOpensAt: data.registrationOpensAt === undefined ? event.registrationOpensAt : data.registrationOpensAt,
      registrationClosesAt:
        data.registrationClosesAt === undefined ? event.registrationClosesAt : data.registrationClosesAt,
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
    guard?: (event: { registeredCount: number }) => string | null;
  },
) => {
  try {
    const event = await Event.findOne({ _id: req.params.id, isDeleted: false });
    if (!event) return notFound(res);
    if (!opts.from.includes(event.status)) {
      return conflict(res, `An event that is ${event.status} cannot be changed this way.`);
    }
    const blocked = opts.guard?.(event);
    if (blocked) return conflict(res, blocked, ErrorCodes.HAS_DEPENDENCIES);

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
 * @description Returns a published event to draft. Refused once people have registered — cancel it
 * instead, so they can see what happened.
 * @author Ravi Patel
 */
export const unpublishEvent = (req: Request, res: Response, next: NextFunction) =>
  transition(req, res, next, {
    from: [EventStatus.PUBLISHED],
    to: EventStatus.DRAFT,
    action: 'event.unpublished',
    message: 'Event unpublished',
    guard: (e) => (e.registeredCount > 0 ? 'People have registered for this event. Cancel it instead of unpublishing.' : null),
  });

/**
 * @name cancelEvent
 * @file EventAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @param {NextFunction} next
 * @description Cancels a published event. It stays visible marked as cancelled and registrations
 * are kept. No email is sent: the response says so, so nobody assumes attendees were notified.
 * @author Ravi Patel
 */
export const cancelEvent = async (req: Request, res: Response, next: NextFunction) => {
  const { reason } = matchedData<{ reason?: string }>(req, { locations: ['body'] });
  return transition(req, res, next, {
    from: [EventStatus.PUBLISHED],
    to: EventStatus.CANCELLED,
    action: 'event.cancelled',
    message: 'Event cancelled. Registered members have not been emailed; contact them separately.',
    extra: { cancelledAt: new Date(), cancellationReason: reason },
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
 * @description Soft-deletes an event. Refused if anyone ever registered, so registration history
 * is never lost by accident; archive the event instead.
 * @author Ravi Patel
 */
export const deleteEvent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const event = await Event.findOne({ _id: req.params.id, isDeleted: false });
    if (!event) return notFound(res);
    const registrations = await EventRegistration.countDocuments({ eventId: event._id });
    if (registrations > 0) {
      return conflict(res, 'This event has registrations and cannot be deleted. Archive it instead.', ErrorCodes.HAS_DEPENDENCIES);
    }
    event.isDeleted = true;
    await event.save();
    await writeAudit(req, { action: 'event.deleted', targetType: 'event', targetId: event._id });
    return new ApiResponse(ResponseCodes.OK, 'Event deleted').send(res);
  } catch (err) {
    return next(err);
  }
};

const registrationRows = async (eventId: string, status?: string, search?: string, skip = 0, limit = 0) => {
  const filter: Record<string, unknown> = { eventId };
  if (status) filter.status = status;
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    const users = await User.find({ $or: [{ name: rx }, { email: rx }] }).select('_id').limit(1000).lean();
    filter.userId = { $in: users.map((u) => u._id) };
  }
  const query = EventRegistration.find(filter).sort({ createdAt: 1 }).skip(skip);
  if (limit) query.limit(limit);
  const [regs, totalCount] = await Promise.all([query.lean(), EventRegistration.countDocuments(filter)]);
  const users = regs.length
    ? await User.find({ _id: { $in: regs.map((r) => r.userId) } }).select('name email').lean()
    : [];
  const byId = new Map(users.map((u) => [u._id, u]));
  return { regs, totalCount, byId };
};

/**
 * @name listRegistrations
 * @file EventAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Registration list for one event: member name, email, number attending, status.
 * @author Ravi Patel
 */
export const listRegistrations = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const event = await Event.findOne({ _id: req.params.id, isDeleted: false }).lean();
    if (!event) return notFound(res);
    const q = matchedData<{ page?: number; limit?: number; status?: string; search?: string }>(req, {
      locations: ['query'],
    });
    const { limit, skip } = pageParams(q, 50);
    const { regs, totalCount, byId } = await registrationRows(event._id, q.status, q.search, skip, limit);

    return new ApiResponse(ResponseCodes.OK, 'Registrations fetched successfully', {
      registrations: regs.map((r) => ({
        id: r._id,
        userId: r.userId,
        name: byId.get(r.userId)?.name ?? 'Former member',
        email: byId.get(r.userId)?.email ?? null,
        attendees: r.attendees,
        status: r.status,
        registeredAt: r.createdAt,
        cancelledAt: r.cancelledAt ?? null,
      })),
      totalCount,
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name removeRegistration
 * @file EventAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Staff cancel someone's registration (for example at their request) and free their
 * places. The record is kept as cancelled for the history.
 * @author Ravi Patel
 */
export const removeRegistration = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const claimed = await EventRegistration.findOneAndUpdate(
      { _id: req.params.registrationId, eventId: req.params.id, status: RegistrationStatus.CONFIRMED },
      { $set: { status: RegistrationStatus.CANCELLED, cancelledAt: new Date(), cancelledBy: req.user!.id } },
      { returnDocument: 'before' },
    ).lean();
    if (!claimed) return notFound(res, 'Registration');

    await Event.updateOne({ _id: claimed.eventId }, { $inc: { registeredCount: -claimed.attendees } });
    await writeAudit(req, {
      action: 'event.registration_removed',
      targetType: 'event',
      targetId: claimed.eventId,
      metadata: { registrationId: claimed._id },
    });
    return new ApiResponse(ResponseCodes.OK, 'Registration cancelled').send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name exportRegistrations
 * @file EventAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @description CSV of an event's registrations. Requires registrations.export and is audited.
 * @author Ravi Patel
 */
export const exportRegistrations = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const event = await Event.findOne({ _id: req.params.id, isDeleted: false }).lean();
    if (!event) return notFound(res);
    const { regs, byId } = await registrationRows(event._id, undefined, undefined, 0, 20_000);

    const rows = regs.map((r) => [
      byId.get(r.userId)?.name ?? 'Former member',
      byId.get(r.userId)?.email ?? '',
      r.attendees,
      r.status,
      r.createdAt.toISOString(),
    ]);
    await writeAudit(req, {
      action: 'event.registrations_exported',
      targetType: 'event',
      targetId: event._id,
      metadata: { count: rows.length },
    });
    return sendCsv(
      res,
      `registrations-${event.title.slice(0, 40)}-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(['Name', 'Email', 'Attendees', 'Status', 'Registered at'], rows),
    );
  } catch (err) {
    return next(err);
  }
};
