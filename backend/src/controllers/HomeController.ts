import type { NextFunction, Request, Response } from 'express';
import { matchedData } from 'express-validator';
import Announcement from '../models/Announcement';
import ContentBlock from '../models/ContentBlock';
import Event from '../models/Event';
import Faq from '../models/Faq';
import HistoryMilestone from '../models/HistoryMilestone';
import ImportantLink from '../models/ImportantLink';
import MemberProfile from '../models/MemberProfile';
import { EventStatus, MemberVisibility, MembershipStatus, PublishStatus, ResponseCodes } from '../config/constants';
import { ApiResponse } from '../utils/apiResponse';
import { escapeRegex } from '../utils/escapeRegex';
import { getSettings } from '../utils/settings';
import { toPublicEvent } from '../utils/eventView';
import { toPublicAnnouncement, visibleNowFilter } from '../utils/announcementView';
import { toDirectoryEntry } from '../utils/memberView';
import { blockView, pick } from './ContentController';
import { toPublicSettings } from './SettingsController';
import { ContentResources } from '../config/contentResources';

const memberLevels = (req: Request) =>
  req.user ? [MemberVisibility.PUBLIC, MemberVisibility.MEMBERS] : [MemberVisibility.PUBLIC];

/**
 * @name getHome
 * @file HomeController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Everything the home page needs in one request: organisation details, the welcome
 * and statistics blocks, the featured and upcoming events, recent announcements (pinned first),
 * highlighted members and important links. Only published, publicly authorised content.
 * @author Ravi Patel
 */
export const getHome = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    const upcoming = { isDeleted: false, status: EventStatus.PUBLISHED, startsAt: { $gte: now } };

    const [settings, blocks, featured, events, announcements, highlights, links] = await Promise.all([
      getSettings(),
      ContentBlock.find({ isDeleted: false, status: PublishStatus.PUBLISHED, key: { $in: ['home.welcome', 'home.stats', 'about.intro'] } }).lean(),
      Event.findOne({ ...upcoming, featured: true }).sort({ startsAt: 1 }).lean(),
      Event.find(upcoming).sort({ startsAt: 1 }).limit(4).lean(),
      Announcement.find(visibleNowFilter(now)).sort({ pinned: -1, order: 1, publishAt: -1 }).limit(4).lean(),
      MemberProfile.find({
        isDeleted: false,
        highlighted: true,
        membershipStatus: MembershipStatus.ACTIVE,
        visibility: { $in: memberLevels(req) },
        anonymizedAt: { $exists: false },
      })
        .sort({ displayName: 1 })
        .limit(6)
        .lean(),
      ImportantLink.find({ isDeleted: false, status: PublishStatus.PUBLISHED }).sort({ order: 1, createdAt: 1 }).limit(6).lean(),
    ]);

    const linkFields = ContentResources.links!.publicFields;
    return new ApiResponse(ResponseCodes.OK, 'Home fetched successfully', {
      settings: toPublicSettings(settings!),
      blocks: Object.fromEntries(blocks.map((b) => [b.key, blockView(b)])),
      featuredEvent: featured ? toPublicEvent(featured, undefined, now) : null,
      upcomingEvents: events.map((e) => toPublicEvent(e, undefined, now)),
      announcements: announcements.map((a) => toPublicAnnouncement(a, false)),
      memberHighlights: highlights.map(toDirectoryEntry),
      links: links.map((l) => pick(l as never, linkFields)),
    }).send(res);
  } catch (err) {
    return next(err);
  }
};

/**
 * @name search
 * @file HomeController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Site-wide search across published events, announcements, FAQs, history and links,
 * plus the member directory entries the visitor is allowed to see. Drafts, scheduled items and
 * hidden or staff-only members never appear. Text is matched literally, not as a pattern.
 * @author Ravi Patel
 */
export const search = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { q } = matchedData<{ q: string }>(req, { locations: ['query'] });
    const rx = new RegExp(escapeRegex(q), 'i');
    const now = new Date();
    const settings = await getSettings();
    const directoryOpen = Boolean(req.user) || settings?.directoryPublic !== false;

    const [events, announcements, faqs, milestones, links, members] = await Promise.all([
      Event.find({ isDeleted: false, status: { $in: [EventStatus.PUBLISHED, EventStatus.CANCELLED] }, $or: [{ title: rx }, { description: rx }, { venue: rx }] })
        .sort({ startsAt: -1 })
        .limit(5)
        .lean(),
      Announcement.find({ ...visibleNowFilter(now), $and: [{ $or: [{ title: rx }, { summary: rx }, { body: rx }] }] })
        .sort({ publishAt: -1 })
        .limit(5)
        .lean(),
      Faq.find({ isDeleted: false, status: PublishStatus.PUBLISHED, $or: [{ question: rx }, { answer: rx }] }).limit(5).lean(),
      HistoryMilestone.find({ isDeleted: false, status: PublishStatus.PUBLISHED, $or: [{ title: rx }, { text: rx }, { periodLabel: rx }] }).limit(5).lean(),
      ImportantLink.find({ isDeleted: false, status: PublishStatus.PUBLISHED, $or: [{ label: rx }, { description: rx }] }).limit(5).lean(),
      directoryOpen
        ? MemberProfile.find({
            isDeleted: false,
            membershipStatus: MembershipStatus.ACTIVE,
            visibility: { $in: memberLevels(req) },
            anonymizedAt: { $exists: false },
            $or: [{ displayName: rx }, { village: rx }, { city: rx }],
          })
            .sort({ displayName: 1 })
            .limit(5)
            .lean()
        : Promise.resolve([]),
    ]);

    const results = {
      events: events.map((e) => ({ id: e._id, title: e.title, snippet: e.venue, date: e.startsAt })),
      announcements: announcements.map((a) => ({ id: a._id, title: a.title, snippet: a.summary ?? a.body.slice(0, 140) })),
      faqs: faqs.map((f) => ({ id: f._id, title: f.question, snippet: f.answer.slice(0, 140) })),
      history: milestones.map((m) => ({ id: m._id, title: m.title, snippet: m.periodLabel })),
      links: links.map((l) => ({ id: l._id, title: l.label, snippet: l.description ?? null })),
      members: members.map((m) => ({ id: m._id, title: m.displayName, snippet: [m.village, m.city].filter(Boolean).join(', ') })),
    };
    const totalCount = Object.values(results).reduce((n, list) => n + list.length, 0);
    return new ApiResponse(ResponseCodes.OK, 'Search complete', { results, totalCount }).send(res);
  } catch (err) {
    return next(err);
  }
};
