import { EventStatus } from '../config/constants';
import type { IEvent } from '../models/Event';

/** What visitors see: timing and details only. Authorship and internal fields are not included. */
export const toPublicEvent = (event: IEvent) => ({
  id: event._id,
  title: event.title,
  category: event.category,
  description: event.description ?? null,
  startsAt: event.startsAt,
  endsAt: event.endsAt ?? null,
  venue: event.venue,
  status: event.status === EventStatus.CANCELLED ? 'cancelled' : 'published',
  cancellationReason: event.status === EventStatus.CANCELLED ? (event.cancellationReason ?? null) : null,
  featured: event.featured,
  imageMediaId: event.imageMediaId ?? null,
});

/** Staff view: everything in the public view plus the real status and audit fields. */
export const toAdminEvent = (event: IEvent) => ({
  ...toPublicEvent(event),
  status: event.status,
  publishedAt: event.publishedAt ?? null,
  cancelledAt: event.cancelledAt ?? null,
  createdBy: event.createdBy ?? null,
  updatedBy: event.updatedBy ?? null,
  createdAt: event.createdAt,
  updatedAt: event.updatedAt,
});

interface TimingFields {
  startsAt?: Date;
  endsAt?: Date | null;
}

/** Cross-field check on the final (merged) values, so partial updates cannot create a bad schedule. */
export const timingError = (t: TimingFields): string | null => {
  if (t.startsAt && t.endsAt && t.endsAt < t.startsAt) return 'The end time must be after the start time';
  return null;
};
