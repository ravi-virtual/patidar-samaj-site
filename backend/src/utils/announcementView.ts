import { PublishStatus } from '../config/constants';
import type { IAnnouncement } from '../models/Announcement';

/** Matches announcements a visitor may see right now: published, and not scheduled for later. */
export const visibleNowFilter = (now = new Date()) => ({
  isDeleted: false,
  status: PublishStatus.PUBLISHED,
  $or: [{ publishAt: { $exists: false } }, { publishAt: null }, { publishAt: { $lte: now } }],
});

const excerpt = (text: string, max = 200) => (text.length > max ? `${text.slice(0, max).trimEnd()}…` : text);

export const toPublicAnnouncement = (a: IAnnouncement, withBody: boolean) => ({
  id: a._id,
  title: a.title,
  summary: a.summary ?? excerpt(a.body),
  category: a.category,
  pinned: a.pinned,
  featured: a.featured,
  archived: a.status === PublishStatus.ARCHIVED,
  publishedAt: a.publishAt ?? a.publishedAt ?? a.createdAt,
  ...(withBody ? { body: a.body } : {}),
});

export const toAdminAnnouncement = (a: IAnnouncement) => ({
  id: a._id,
  title: a.title,
  summary: a.summary ?? null,
  body: a.body,
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
