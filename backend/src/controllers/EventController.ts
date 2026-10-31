import type { NextFunction, Request, Response } from 'express';
import { matchedData } from 'express-validator';
import Event from '../models/Event';
import { ErrorCodes, EventStatus, ResponseCodes } from '../config/constants';
import { ApiResponse, sendError } from '../utils/apiResponse';
import { escapeRegex } from '../utils/escapeRegex';
import { pageParams } from '../utils/pagination';
import { toPublicEvent } from '../utils/eventView';
import { searchFieldsFor } from '../utils/localize';

const VISIBLE = [EventStatus.PUBLISHED, EventStatus.CANCELLED];

const notFound = (res: Response) =>
  sendError(res, { statusCode: ResponseCodes.NOT_FOUND, message: 'Event not found', code: ErrorCodes.NOT_FOUND });

/**
 * @name listEvents
 * @file EventController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Published and cancelled events (never drafts), upcoming by default.
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
      filter.$or = searchFieldsFor(['title', 'description', 'venue'], req.lang).map((f) => ({ [f]: rx }));
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

    return new ApiResponse(ResponseCodes.OK, 'Events fetched successfully', {
      events: events.map((e) => toPublicEvent(e, req.lang)),
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
 * @description One published or cancelled event with its details.
 * @author Ravi Patel
 */
export const getEvent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const event = await Event.findOne({ _id: req.params.id, isDeleted: false, status: { $in: VISIBLE } }).lean();
    if (!event) return notFound(res);
    return new ApiResponse(ResponseCodes.OK, 'Event fetched successfully', {
      event: toPublicEvent(event, req.lang),
    }).send(res);
  } catch (err) {
    return next(err);
  }
};
