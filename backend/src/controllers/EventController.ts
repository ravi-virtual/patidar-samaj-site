import type { NextFunction, Request, Response } from 'express';
import { matchedData } from 'express-validator';
import Event from '../models/Event';
import EventRegistration from '../models/EventRegistration';
import {
  ErrorCodes,
  EventStatus,
  RegistrationStatus,
  ResponseCodes,
} from '../config/constants';
import { ApiResponse, sendError } from '../utils/apiResponse';
import { escapeRegex } from '../utils/escapeRegex';
import { pageParams } from '../utils/pagination';
import { registrationState, toPublicEvent } from '../utils/eventView';
import { writeAudit } from '../utils/audit';

const VISIBLE = [EventStatus.PUBLISHED, EventStatus.CANCELLED];

const notFound = (res: Response) =>
  sendError(res, { statusCode: ResponseCodes.NOT_FOUND, message: 'Event not found', code: ErrorCodes.NOT_FOUND });

const isDuplicateKey = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;

/**
 * @name listEvents
 * @file EventController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Published and cancelled events (never drafts), upcoming by default. Adds the
 * signed-in user's own RSVP to each event.
 * @author Ravi Patel
 */
export const listEvents = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = matchedData<{
      page?: number;
      limit?: number;
      when?: 'upcoming' | 'past';
      category?: string;
      search?: string;
    }>(req, { locations: ['query'] });
    const now = new Date();
    const when = q.when ?? 'upcoming';

    const filter: Record<string, unknown> = {
      isDeleted: false,
      status: { $in: VISIBLE },
      startsAt: when === 'upcoming' ? { $gte: now } : { $lt: now },
    };
    if (q.category) filter.category = q.category;
    if (q.search) {
      const rx = new RegExp(escapeRegex(q.search), 'i');
      filter.$or = [{ title: rx }, { description: rx }, { venue: rx }];
    }

    const { limit, skip } = pageParams(q, 12);
    const [events, totalCount] = await Promise.all([
      Event.find(filter)
        .sort({ startsAt: when === 'upcoming' ? 1 : -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Event.countDocuments(filter),
    ]);

    let mine = new Map<string, { status: string; attendees: number }>();
    if (req.user && events.length) {
      const regs = await EventRegistration.find({ userId: req.user.id, eventId: { $in: events.map((e) => e._id) } }).lean();
      mine = new Map(regs.map((r) => [r.eventId, { status: r.status, attendees: r.attendees }]));
    }

    return new ApiResponse(ResponseCodes.OK, 'Events fetched successfully', {
      events: events.map((e) => toPublicEvent(e, req.user ? (mine.get(e._id) ?? null) : undefined, now)),
      totalCount,
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name getEvent
 * @file EventController.ts
 * @param {Request} req
 * @param {Response} res
 * @description One published or cancelled event with its remaining capacity and registration state.
 * @author Ravi Patel
 */
export const getEvent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const event = await Event.findOne({ _id: req.params.id, isDeleted: false, status: { $in: VISIBLE } }).lean();
    if (!event) return notFound(res);
    const mine = req.user
      ? ((await EventRegistration.findOne({ eventId: event._id, userId: req.user.id }).lean()) ?? null)
      : undefined;
    return new ApiResponse(ResponseCodes.OK, 'Event fetched successfully', {
      event: toPublicEvent(event, mine),
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name rsvp
 * @file EventController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Registers the signed-in member for an event. Capacity is reserved with one atomic
 * conditional update, so concurrent requests can never overbook; the unique (event, user) index
 * stops duplicates. If anything fails after the reservation it is released again.
 * @author Ravi Patel
 */
export const rsvp = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { attendees = 1 } = matchedData<{ attendees?: number }>(req, { locations: ['body'] });
    const userId = req.user!.id;
    const eventId = String(req.params.id);

    const event = await Event.findOne({ _id: eventId, isDeleted: false, status: { $in: VISIBLE } }).lean();
    if (!event) return notFound(res);

    const state = registrationState(event);
    if (state !== 'open' && state !== 'full') {
      const closed: Record<string, string> = {
        cancelled: 'This event has been cancelled.',
        past: 'This event has already started.',
        not_yet_open: 'Registration has not opened yet.',
        closed: 'Registration for this event has closed.',
        unavailable: 'This event is not open for registration.',
      };
      return sendError(res, {
        statusCode: ResponseCodes.CONFLICT,
        message: closed[state] ?? 'Registration is not available.',
        code: ErrorCodes.REGISTRATION_CLOSED,
      });
    }

    const existing = await EventRegistration.findOne({ eventId, userId }).lean();
    if (existing?.status === RegistrationStatus.CONFIRMED) {
      return sendError(res, {
        statusCode: ResponseCodes.CONFLICT,
        message: 'You are already registered for this event.',
        code: ErrorCodes.ALREADY_REGISTERED,
      });
    }

    // 1) Reserve the seats atomically. The capacity test and the increment are one operation.
    const reserved = await Event.findOneAndUpdate(
      {
        _id: eventId,
        isDeleted: false,
        status: EventStatus.PUBLISHED,
        $expr: {
          $or: [
            { $eq: ['$capacity', 0] },
            { $lte: [{ $add: ['$registeredCount', attendees] }, '$capacity'] },
          ],
        },
      },
      { $inc: { registeredCount: attendees } },
      { returnDocument: 'after' },
    ).lean();

    if (!reserved) {
      return sendError(res, {
        statusCode: ResponseCodes.CONFLICT,
        message: 'Sorry, there are not enough places left for this event.',
        code: ErrorCodes.EVENT_FULL,
      });
    }

    const release = () => Event.updateOne({ _id: eventId }, { $inc: { registeredCount: -attendees } });

    // 2) Record the registration; roll the reservation back if that does not happen.
    try {
      if (existing) {
        // A cancelled registration is revived. Claiming it is conditional, so a concurrent
        // duplicate request cannot also succeed.
        const claimed = await EventRegistration.updateOne(
          { _id: existing._id, status: RegistrationStatus.CANCELLED },
          {
            $set: { status: RegistrationStatus.CONFIRMED, attendees },
            $unset: { cancelledAt: '', cancelledBy: '' },
          },
        );
        if (claimed.modifiedCount === 0) throw Object.assign(new Error('duplicate'), { code: 11000 });
      } else {
        await EventRegistration.create({ eventId, userId, attendees, status: RegistrationStatus.CONFIRMED });
      }
    } catch (err) {
      await release();
      if (isDuplicateKey(err)) {
        return sendError(res, {
          statusCode: ResponseCodes.CONFLICT,
          message: 'You are already registered for this event.',
          code: ErrorCodes.ALREADY_REGISTERED,
        });
      }
      throw err;
    }

    return new ApiResponse(ResponseCodes.CREATED, 'You are registered. See you there!', {
      event: toPublicEvent(reserved, { status: RegistrationStatus.CONFIRMED, attendees }),
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name cancelRsvp
 * @file EventController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Cancels the signed-in member's own registration and frees their places. The status
 * change is claimed atomically, so places are released exactly once even if clicked twice.
 * @author Ravi Patel
 */
export const cancelRsvp = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const eventId = String(req.params.id);
    const event = await Event.findOne({ _id: eventId, isDeleted: false, status: { $in: VISIBLE } }).lean();
    if (!event) return notFound(res);
    if (event.startsAt.getTime() <= Date.now()) {
      return sendError(res, {
        statusCode: ResponseCodes.CONFLICT,
        message: 'This event has already started, so the registration can no longer be changed.',
        code: ErrorCodes.REGISTRATION_CLOSED,
      });
    }

    const claimed = await EventRegistration.findOneAndUpdate(
      { eventId, userId: req.user!.id, status: RegistrationStatus.CONFIRMED },
      { $set: { status: RegistrationStatus.CANCELLED, cancelledAt: new Date(), cancelledBy: req.user!.id } },
      { returnDocument: 'before' },
    ).lean();

    if (!claimed) {
      return sendError(res, {
        statusCode: ResponseCodes.NOT_FOUND,
        message: 'You are not registered for this event.',
        code: ErrorCodes.NOT_FOUND,
      });
    }

    const updated = await Event.findOneAndUpdate(
      { _id: eventId },
      { $inc: { registeredCount: -claimed.attendees } },
      { returnDocument: 'after' },
    ).lean();

    await writeAudit(req, { action: 'event.rsvp_cancelled', targetType: 'event', targetId: eventId });
    return new ApiResponse(ResponseCodes.OK, 'Your registration has been cancelled.', {
      event: toPublicEvent(updated ?? event, { status: RegistrationStatus.CANCELLED, attendees: claimed.attendees }),
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name listMyRegistrations
 * @file EventController.ts
 * @param {Request} req
 * @param {Response} res
 * @description The signed-in member's own registrations, soonest first. Only their own — the user
 * id comes from the session, never from the request.
 * @author Ravi Patel
 */
export const listMyRegistrations = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const regs = await EventRegistration.find({ userId: req.user!.id, status: RegistrationStatus.CONFIRMED }).lean();
    const events = regs.length
      ? await Event.find({ _id: { $in: regs.map((r) => r.eventId) }, isDeleted: false }).lean()
      : [];
    const byId = new Map(events.map((e) => [e._id, e]));
    const now = new Date();

    const registrations = regs
      .map((r) => ({ reg: r, event: byId.get(r.eventId) }))
      .filter((x): x is { reg: (typeof regs)[number]; event: (typeof events)[number] } => Boolean(x.event))
      .sort((a, b) => a.event.startsAt.getTime() - b.event.startsAt.getTime())
      .map(({ reg, event }) => ({
        id: reg._id,
        attendees: reg.attendees,
        registeredAt: reg.createdAt,
        upcoming: event.startsAt.getTime() >= now.getTime(),
        event: toPublicEvent(event, { status: reg.status, attendees: reg.attendees }, now),
      }));

    return new ApiResponse(ResponseCodes.OK, 'Registrations fetched successfully', {
      registrations,
      totalCount: registrations.length,
    }).send(res);
  } catch (err) {
    return next(err);
  }
};
