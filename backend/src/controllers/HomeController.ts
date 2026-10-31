import type { NextFunction, Request, Response } from 'express';
import { matchedData } from 'express-validator';
import Announcement from '../models/Announcement';
import ContentBlock from '../models/ContentBlock';
import Event from '../models/Event';
import Faq from '../models/Faq';
import ImportantLink from '../models/ImportantLink';
import MemberProfile from '../models/MemberProfile';
import { EventStatus, MemberVisibility, MembershipStatus, PublishStatus, ResponseCodes } from '../config/constants';
import { ApiResponse } from '../utils/apiResponse';
import { escapeRegex } from '../utils/escapeRegex';
import { resolvePublicTabs } from '../config/publicTabs';
import { getSettings } from '../utils/settings';
import { toPublicEvent } from '../utils/eventView';
import { toPublicAnnouncement, visibleNowFilter } from '../utils/announcementView';
import { toDirectoryEntry } from '../utils/memberView';
import { publicBlockView, pick } from './ContentController';
import { toPublicSettings } from './SettingsController';
import { ContentResources } from '../config/contentResources';
import { localizeFields, searchFieldsFor } from '../utils/localize';

// Only entries marked public are shown on the public site (there is no member sign-in).
const memberLevels = (_req: Request) => [MemberVisibility.PUBLIC];

/**
 * @name getHome
 * @file HomeController.ts
 * @param {Request} req
 * @param {Response} res
 * @description Everything the home page needs in one request: organisation details, the welcome
 * and statistics blocks, the featured and upcoming events, recent announcements (pinned first),
 * highlighted members and important links. Only published, publicly authorised content. Sections
 * belonging to a public tab that is switched off are left out (empty).
 * @author Ravi Patel
 */
export const getHome = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    const upcoming = { isDeleted: false, status: EventStatus.PUBLISHED, startsAt: { $gte: now } };

    const settings = await getSettings();
    const tabs = resolvePublicTabs(settings?.publicTabs);

    const [blocks, featured, events, announcements, highlights, links] = await Promise.all([
      ContentBlock.find({
        isDeleted: false,
        status: PublishStatus.PUBLISHED,
        key: { $in: tabs.about ? ['home.welcome', 'home.stats', 'about.intro'] : ['home.welcome', 'home.stats'] },
      }).lean(),
      tabs.events ? Event.findOne({ ...upcoming, featured: true }).sort({ startsAt: 1 }).lean() : null,
      tabs.events ? Event.find(upcoming).sort({ startsAt: 1 }).limit(4).lean() : [],
      tabs.news ? Announcement.find(visibleNowFilter(now)).sort({ pinned: -1, order: 1, publishAt: -1 }).limit(4).lean() : [],
      tabs.directory
        ? MemberProfile.find({
            isDeleted: false,
            highlighted: true,
            membershipStatus: MembershipStatus.ACTIVE,
            visibility: { $in: memberLevels(req) },
            anonymizedAt: { $exists: false },
          })
            .sort({ displayName: 1 })
            .limit(6)
            .lean()
        : [],
      tabs.links ? ImportantLink.find({ isDeleted: false, status: PublishStatus.PUBLISHED }).sort({ order: 1, createdAt: 1 }).limit(6).lean() : [],
    ]);

    const linkFields = ContentResources.links!.publicFields;
    return new ApiResponse(ResponseCodes.OK, 'Home fetched successfully', {
      settings: toPublicSettings(settings!, req.lang),
      blocks: Object.fromEntries(blocks.map((b) => [b.key, publicBlockView(b, req.lang)])),
      featuredEvent: featured ? toPublicEvent(featured, req.lang) : null,
      upcomingEvents: events.map((e) => toPublicEvent(e, req.lang)),
      announcements: announcements.map((a) => toPublicAnnouncement(a, false, req.lang)),
      memberHighlights: highlights.map(toDirectoryEntry),
      links: links.map((l) => pick(l as never, linkFields, req.lang)),
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
 * hidden or staff-only members never appear, and nothing from a switched-off public tab is searched. Text is matched literally, not as a pattern.
 * @author Ravi Patel
 */
export const search = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { q } = matchedData<{ q: string }>(req, { locations: ['query'] });
    const rx = new RegExp(escapeRegex(q), 'i');
    // Gujarati visitors also match the Gujarati text; English visitors only the English text.
    const anyOf = (fields: string[]) => ({ $or: searchFieldsFor(fields, req.lang).map((f) => ({ [f]: rx })) });
    const now = new Date();
    const tabs = resolvePublicTabs((await getSettings())?.publicTabs);

    const [events, announcements, faqs, links, members] = await Promise.all([
      tabs.events
        ? Event.find({ isDeleted: false, status: { $in: [EventStatus.PUBLISHED, EventStatus.CANCELLED] }, ...anyOf(['title', 'description', 'venue']) })
            .sort({ startsAt: -1 })
            .limit(5)
            .lean()
        : [],
      tabs.news
        ? Announcement.find({ ...visibleNowFilter(now), $and: [anyOf(['title', 'summary', 'body'])] })
            .sort({ publishAt: -1 })
            .limit(5)
            .lean()
        : [],
      tabs.faq ? Faq.find({ isDeleted: false, status: PublishStatus.PUBLISHED, ...anyOf(['question', 'answer']) }).limit(5).lean() : [],
      tabs.links ? ImportantLink.find({ isDeleted: false, status: PublishStatus.PUBLISHED, ...anyOf(['label', 'description']) }).limit(5).lean() : [],
      tabs.directory
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
        : [],
    ]);

    const results = {
      events: events.map((raw) => {
        const e = localizeFields(raw, ['title', 'venue'], req.lang);
        return { id: e._id, title: e.title, snippet: e.venue, date: e.startsAt };
      }),
      announcements: announcements.map((raw) => {
        const a = localizeFields(raw, ['title', 'summary', 'body'], req.lang);
        return { id: a._id, title: a.title, snippet: a.summary ?? a.body.slice(0, 140) };
      }),
      faqs: faqs.map((raw) => {
        const f = localizeFields(raw, ['question', 'answer'], req.lang);
        return { id: f._id, title: f.question, snippet: f.answer.slice(0, 140) };
      }),
      links: links.map((raw) => {
        const l = localizeFields(raw, ['label', 'description'], req.lang);
        return { id: l._id, title: l.label, snippet: l.description ?? null };
      }),
      members: members.map((m) => ({ id: m._id, title: m.displayName, snippet: [m.village, m.city].filter(Boolean).join(', ') })),
    };
    const totalCount = Object.values(results).reduce((n, list) => n + list.length, 0);
    return new ApiResponse(ResponseCodes.OK, 'Search complete', { results, totalCount }).send(res);
  } catch (err) {
    return next(err);
  }
};
