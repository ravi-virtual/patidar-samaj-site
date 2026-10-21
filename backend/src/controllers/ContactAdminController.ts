import type { NextFunction, Request, Response } from 'express';
import { matchedData } from 'express-validator';
import ContactMessage, { type IContactMessage } from '../models/ContactMessage';
import User from '../models/User';
import { AccountStatus, ContactStatus, ErrorCodes, ResponseCodes, StaffRoles } from '../config/constants';
import { Permissions } from '../config/permissions';
import { ApiResponse, sendError } from '../utils/apiResponse';
import { escapeRegex } from '../utils/escapeRegex';
import { pageParams } from '../utils/pagination';
import { writeAudit } from '../utils/audit';

const notFound = (res: Response) =>
  sendError(res, { statusCode: ResponseCodes.NOT_FOUND, message: 'Message not found', code: ErrorCodes.NOT_FOUND });

const forbidden = (res: Response, message: string) =>
  sendError(res, { statusCode: ResponseCodes.FORBIDDEN, message, code: ErrorCodes.FORBIDDEN });

/** Sender details are personal data: this view is only ever built for holders of contacts.read. */
const toView = (m: IContactMessage, detail: boolean) => ({
  id: m._id,
  reference: m._id.slice(0, 8).toUpperCase(),
  name: m.name,
  email: m.email,
  topic: m.topic,
  status: m.status,
  assignedTo: m.assignedTo ?? null,
  resolvedAt: m.resolvedAt ?? null,
  createdAt: m.createdAt,
  preview: m.message.length > 140 ? `${m.message.slice(0, 140).trimEnd()}…` : m.message,
  ...(detail ? { message: m.message, notes: m.notes } : {}),
});

/**
 * @name listContacts
 * @file ContactAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @description The inbox: filter by status, assignee or text. Also returns how many messages are in
 * each status, so the sidebar can show an unread count.
 * @author Ravi Patel
 */
export const listContacts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = matchedData<{
      page?: number;
      limit?: number;
      status?: string;
      assignedTo?: string;
      mine?: boolean;
      search?: string;
    }>(req, { locations: ['query'] });

    const filter: Record<string, unknown> = { isDeleted: false };
    if (q.status) filter.status = q.status;
    if (q.mine) filter.assignedTo = req.user!.id;
    else if (q.assignedTo) filter.assignedTo = q.assignedTo;
    if (q.search) {
      const rx = new RegExp(escapeRegex(q.search), 'i');
      filter.$or = [{ name: rx }, { email: rx }, { message: rx }];
    }

    const { limit, skip } = pageParams(q, 20);
    const [items, totalCount, grouped] = await Promise.all([
      ContactMessage.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      ContactMessage.countDocuments(filter),
      ContactMessage.aggregate<{ _id: string; n: number }>([
        { $match: { isDeleted: false } },
        { $group: { _id: '$status', n: { $sum: 1 } } },
      ]),
    ]);
    const counts = { new: 0, in_progress: 0, resolved: 0 } as Record<string, number>;
    for (const g of grouped) counts[g._id] = g.n;

    return new ApiResponse(ResponseCodes.OK, 'Messages fetched successfully', {
      messages: items.map((m) => toView(m, false)),
      totalCount,
      counts,
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name getContact
 * @file ContactAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @description One message in full. Opening it is itself recorded in the audit log, because it
 * exposes a visitor's personal details.
 * @author Ravi Patel
 */
export const getContact = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const message = await ContactMessage.findOne({ _id: req.params.id, isDeleted: false }).lean();
    if (!message) return notFound(res);
    await writeAudit(req, { action: 'contact.viewed', targetType: 'contact', targetId: message._id });
    return new ApiResponse(ResponseCodes.OK, 'Message fetched successfully', { message: toView(message, true) }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name updateContact
 * @file ContactAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Changes the status (needs contacts.resolve) and/or the assignee (needs
 * contacts.assign). The assignee must be an active staff account. Both changes are audited.
 * @author Ravi Patel
 */
export const updateContact = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = matchedData<{ status?: string; assignedTo?: string | null }>(req, {
      locations: ['body'],
      includeOptionals: true,
    });
    const perms = req.user!.permissions;
    const wantsStatus = data.status !== undefined;
    const wantsAssign = 'assignedTo' in (req.body as object);
    if (wantsStatus && !perms.includes(Permissions.CONTACTS_RESOLVE)) {
      return forbidden(res, 'You cannot change the status of messages');
    }
    if (wantsAssign && !perms.includes(Permissions.CONTACTS_ASSIGN)) {
      return forbidden(res, 'You cannot assign messages');
    }

    const message = await ContactMessage.findOne({ _id: req.params.id, isDeleted: false });
    if (!message) return notFound(res);

    const changes: Record<string, unknown> = {};
    if (wantsAssign) {
      if (data.assignedTo) {
        const assignee = await User.findOne({
          _id: data.assignedTo,
          isDeleted: false,
          status: AccountStatus.ACTIVE,
          role: { $in: StaffRoles },
        })
          .select('_id')
          .lean();
        if (!assignee) {
          return sendError(res, {
            statusCode: ResponseCodes.BAD_REQUEST,
            message: 'Validation failed',
            code: ErrorCodes.VALIDATION_ERROR,
            details: [{ field: 'assignedTo', message: 'Choose an active staff member' }],
          });
        }
      }
      message.assignedTo = data.assignedTo ?? null;
      changes.assignedTo = message.assignedTo;
      // Taking a new message into work moves it along automatically.
      if (message.assignedTo && message.status === ContactStatus.NEW && !wantsStatus) {
        message.status = ContactStatus.IN_PROGRESS;
        changes.status = message.status;
      }
    }
    if (wantsStatus) {
      message.status = data.status as typeof message.status;
      message.resolvedAt = message.status === ContactStatus.RESOLVED ? new Date() : undefined;
      changes.status = message.status;
    }
    await message.save();

    await writeAudit(req, { action: 'contact.updated', targetType: 'contact', targetId: message._id, metadata: changes });
    return new ApiResponse(ResponseCodes.OK, 'Message updated', { message: toView(message.toObject(), true) }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name addContactNote
 * @file ContactAdminController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Adds an internal note (never shown to the sender) to a message.
 * @author Ravi Patel
 */
export const addContactNote = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { text } = matchedData<{ text: string }>(req, { locations: ['body'] });
    const message = await ContactMessage.findOne({ _id: req.params.id, isDeleted: false });
    if (!message) return notFound(res);
    if (message.notes.length >= 100) {
      return sendError(res, {
        statusCode: ResponseCodes.CONFLICT,
        message: 'This message already has the maximum number of notes.',
        code: ErrorCodes.HAS_DEPENDENCIES,
      });
    }
    message.notes.push({ authorId: req.user!.id, text, createdAt: new Date() });
    await message.save();
    await writeAudit(req, { action: 'contact.note_added', targetType: 'contact', targetId: message._id });
    return new ApiResponse(ResponseCodes.CREATED, 'Note added', { message: toView(message.toObject(), true) }).send(res);
  } catch (err) {
    return next(err);
  }
};
