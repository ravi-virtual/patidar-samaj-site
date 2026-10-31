import type { NextFunction, Request, Response } from 'express';
import { matchedData } from 'express-validator';
import Announcement from '../models/Announcement';
import AuditLog from '../models/AuditLog';
import ContactMessage from '../models/ContactMessage';
import Event from '../models/Event';
import MemberProfile from '../models/MemberProfile';
import User from '../models/User';
import { ContactStatus, EventStatus, MembershipStatus, ResponseCodes } from '../config/constants';
import { Permissions } from '../config/permissions';
import { ApiResponse } from '../utils/apiResponse';
import { pageParams } from '../utils/pagination';
import { visibleNowFilter } from '../utils/announcementView';

/**
 * @name getDashboard
 * @file DashboardController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Operational numbers for the admin home. Each figure is included only for staff who
 * hold the permission behind it, so an admin never receives data beyond their own access. Recent
 * activity (who did what) needs audit.read and carries no addresses or request details.
 * @author Ravi Patel
 */
export const getDashboard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const can = (p: string) => req.user!.permissions.includes(p as never);
    const now = new Date();
    const out: Record<string, unknown> = {};
    const jobs: Promise<void>[] = [];

    if (can(Permissions.MEMBERS_READ)) {
      jobs.push(
        MemberProfile.countDocuments({ isDeleted: false, membershipStatus: MembershipStatus.ACTIVE }).then((n) => {
          out.totalMembers = n;
        }),
      );
    }
    if (can(Permissions.EVENTS_READ)) {
      jobs.push(
        Event.countDocuments({ isDeleted: false, status: EventStatus.PUBLISHED, startsAt: { $gte: now } }).then((n) => {
          out.upcomingEvents = n;
        }),
      );
    }
    if (can(Permissions.ANNOUNCEMENTS_READ)) {
      jobs.push(
        Announcement.countDocuments(visibleNowFilter(now)).then((n) => {
          out.publishedAnnouncements = n;
        }),
      );
    }
    if (can(Permissions.CONTACTS_READ)) {
      jobs.push(
        ContactMessage.countDocuments({ isDeleted: false, status: ContactStatus.NEW }).then((n) => {
          out.unreadContactMessages = n;
        }),
      );
    }
    if (can(Permissions.AUDIT_READ)) {
      jobs.push(
        AuditLog.find({ action: { $not: /^auth\.login_failed$/ } })
          .sort({ createdAt: -1 })
          .limit(10)
          .lean()
          .then(async (entries) => {
            const ids = [...new Set(entries.map((e) => e.actorId).filter((id): id is string => Boolean(id)))];
            const actors = ids.length ? await User.find({ _id: { $in: ids } }).select('name').lean() : [];
            const names = new Map(actors.map((a) => [a._id, a.name]));
            out.recentActivity = entries.map((e) => ({
              action: e.action,
              actor: e.actorId ? (names.get(e.actorId) ?? 'Former admin') : 'System',
              at: e.createdAt,
            }));
          }),
      );
    }

    await Promise.all(jobs);
    return new ApiResponse(ResponseCodes.OK, 'Dashboard fetched successfully', {
      stats: out,
      role: req.user!.role,
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name listAudit
 * @file DashboardController.ts
 * @param {Request} req
 * @param {Response} res
 * @description The audit log, newest first, with filters. Read-only by design: there is no way to
 * edit or delete an entry through the API. Requires audit.read.
 * @author Ravi Patel
 */
export const listAudit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = matchedData<{
      page?: number;
      limit?: number;
      action?: string;
      actorId?: string;
      outcome?: string;
      targetType?: string;
      from?: Date;
      to?: Date;
    }>(req, { locations: ['query'] });

    const filter: Record<string, unknown> = {};
    if (q.action) filter.action = q.action.includes('*') ? new RegExp(`^${q.action.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`) : q.action;
    if (q.actorId) filter.actorId = q.actorId;
    if (q.outcome) filter.outcome = q.outcome;
    if (q.targetType) filter.targetType = q.targetType;
    if (q.from || q.to) {
      filter.createdAt = { ...(q.from ? { $gte: q.from } : {}), ...(q.to ? { $lte: q.to } : {}) };
    }

    const { limit, skip } = pageParams(q, 50);
    const [entries, totalCount] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      AuditLog.countDocuments(filter),
    ]);
    const ids = [...new Set(entries.map((e) => e.actorId).filter((id): id is string => Boolean(id)))];
    const actors = ids.length ? await User.find({ _id: { $in: ids } }).select('name').lean() : [];
    const names = new Map(actors.map((a) => [a._id, a.name]));

    return new ApiResponse(ResponseCodes.OK, 'Audit log fetched successfully', {
      entries: entries.map((e) => ({
        id: e._id,
        action: e.action,
        outcome: e.outcome,
        actor: e.actorId ? { id: e.actorId, name: names.get(e.actorId) ?? 'Former admin', role: e.actorRole ?? null } : null,
        targetType: e.targetType ?? null,
        targetId: e.targetId ?? null,
        metadata: e.metadata ?? null,
        ip: e.ip ?? null,
        userAgent: e.userAgent ?? null,
        createdAt: e.createdAt,
      })),
      totalCount,
    }).send(res);
  } catch (err) {
    return next(err);
  }
};
