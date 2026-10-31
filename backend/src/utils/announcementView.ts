import { PublishStatus } from '../config/constants';
import type { IAnnouncement } from '../models/Announcement';
import type { Language } from '../i18n/translate';
import { localizeFields } from './localize';

/** Announcement text that has a Gujarati twin (`titleGu`...). */
export const ANNOUNCEMENT_TEXT_FIELDS = ['title', 'summary', 'body'] as const;

/** Matches announcements a visitor may see right now: published, and not scheduled for later. */
export const visibleNowFilter = (now = new Date()) => ({
  isDeleted: false,
  status: PublishStatus.PUBLISHED,
  $or: [{ publishAt: { $exists: false } }, { publishAt: null }, { publishAt: { $lte: now } }],
});

const excerpt = (text: string, max = 200) => (text.length > max ? `${text.slice(0, max).trimEnd()}…` : text);

/** The public view in both languages (the `*Gu` twins included). Without a written summary, the body excerpt stands in. */
const bilingualAnnouncement = (a: IAnnouncement, withBody: boolean) => ({
  id: a._id,
  title: a.title,
  titleGu: a.titleGu ?? null,
  summary: a.summary ?? excerpt(a.body),
  summaryGu: a.summaryGu || (a.bodyGu ? excerpt(a.bodyGu) : null),
  category: a.category,
  pinned: a.pinned,
  featured: a.featured,
  archived: a.status === PublishStatus.ARCHIVED,
  publishedAt: a.publishAt ?? a.publishedAt ?? a.createdAt,
  ...(withBody ? { body: a.body, bodyGu: a.bodyGu ?? null } : {}),
});

/** What visitors see, in their language: the Gujarati text when there is some, English otherwise. Never has `*Gu` keys. */
export const toPublicAnnouncement = (a: IAnnouncement, withBody: boolean, lang: Language = 'en') =>
  localizeFields(bilingualAnnouncement(a, withBody), ANNOUNCEMENT_TEXT_FIELDS, lang);

export const toAdminAnnouncement = (a: IAnnouncement) => ({
  id: a._id,
  title: a.title,
  titleGu: a.titleGu ?? null,
  summary: a.summary ?? null,
  summaryGu: a.summaryGu ?? null,
  body: a.body,
  bodyGu: a.bodyGu ?? null,
  category: a.category,
  status: a.status,
  pinned: a.pinned,
  order: a.order,
  featured: a.featured,
  publishAt: a.publishAt ?? null,
  publishedAt: a.publishedAt ?? null,
  scheduled: a.status === PublishStatus.PUBLISHED && Boolean(a.publishAt && a.publishAt.getTime() > Date.now()),
  createdBy: a.createdBy ?? null,
  updatedBy: a.updatedBy ?? null,
  createdAt: a.createdAt,
  updatedAt: a.updatedAt,
});
