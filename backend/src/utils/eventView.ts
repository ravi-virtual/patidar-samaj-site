import { EventStatus } from '../config/constants';
import type { IEvent } from '../models/Event';
import type { Language } from '../i18n/translate';
import { localizeFields } from './localize';

/** Event text that has a Gujarati twin (`titleGu`...). */
export const EVENT_TEXT_FIELDS = ['title', 'description', 'venue', 'cancellationReason'] as const;

/** Timing and details in both languages (the `*Gu` twins included). Authorship and internal fields are not included. */
const bilingualEvent = (event: IEvent) => ({
  id: event._id,
  title: event.title,
  titleGu: event.titleGu ?? null,
  category: event.category,
  description: event.description ?? null,
  descriptionGu: event.descriptionGu ?? null,
  startsAt: event.startsAt,
  endsAt: event.endsAt ?? null,
  venue: event.venue,
  venueGu: event.venueGu ?? null,
  status: event.status === EventStatus.CANCELLED ? 'cancelled' : 'published',
  cancellationReason: event.status === EventStatus.CANCELLED ? (event.cancellationReason ?? null) : null,
  cancellationReasonGu: event.status === EventStatus.CANCELLED ? (event.cancellationReasonGu ?? null) : null,
  featured: event.featured,
  imageMediaId: event.imageMediaId ?? null,
});

/** What visitors see, in their language: the Gujarati text when there is some, English otherwise. Never has `*Gu` keys. */
export const toPublicEvent = (event: IEvent, lang: Language = 'en') =>
  localizeFields(bilingualEvent(event), EVENT_TEXT_FIELDS, lang);

/** Staff view: both languages side by side (never localized) plus the real status and audit fields. */
export const toAdminEvent = (event: IEvent) => ({
  ...bilingualEvent(event),
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
