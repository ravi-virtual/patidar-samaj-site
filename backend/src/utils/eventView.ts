import { EventStatus } from '../config/constants';
import type { IEvent } from '../models/Event';

export type RegistrationState =
  | 'open'
  | 'not_yet_open'
  | 'closed'
  | 'full'
  | 'past'
  | 'cancelled'
  | 'unavailable';

type Timing = Pick<
  IEvent,
  'status' | 'startsAt' | 'capacity' | 'registeredCount' | 'registrationOpensAt' | 'registrationClosesAt'
>;

/**
 * Whether a person could register for this event right now. One function decides it for the API
 * response and for the RSVP check, so what the page shows is what the server enforces.
 * Registration closes at the closing date if one is set, otherwise when the event starts.
 */
export const registrationState = (event: Timing, now = new Date()): RegistrationState => {
  if (event.status === EventStatus.CANCELLED) return 'cancelled';
  if (event.status !== EventStatus.PUBLISHED) return 'unavailable';
  if (event.startsAt.getTime() <= now.getTime()) return 'past';
  if (event.registrationOpensAt && event.registrationOpensAt.getTime() > now.getTime()) return 'not_yet_open';
  if (event.registrationClosesAt && event.registrationClosesAt.getTime() <= now.getTime()) return 'closed';
  if (event.capacity > 0 && event.registeredCount >= event.capacity) return 'full';
  return 'open';
};

export const remainingCapacity = (event: Pick<IEvent, 'capacity' | 'registeredCount'>): number | null =>
  event.capacity > 0 ? Math.max(0, event.capacity - event.registeredCount) : null;

interface MyRegistration {
  status: string;
  attendees: number;
}

/** What visitors and members see. Internal counters and authorship are not included. */
export const toPublicEvent = (event: IEvent, mine?: MyRegistration | null, now = new Date()) => ({
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
  capacity: event.capacity,
  spotsLeft: remainingCapacity(event),
  registrationOpensAt: event.registrationOpensAt ?? null,
  registrationClosesAt: event.registrationClosesAt ?? event.startsAt,
  registrationState: registrationState(event, now),
  ...(mine !== undefined
    ? { myRegistration: mine && mine.status === 'confirmed' ? { attendees: mine.attendees } : null }
    : {}),
});

/** Staff view: everything in the public view plus status, counters and audit fields. */
export const toAdminEvent = (event: IEvent, now = new Date()) => ({
  ...toPublicEvent(event, undefined, now),
  status: event.status,
  registeredCount: event.registeredCount,
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
  registrationOpensAt?: Date | null;
  registrationClosesAt?: Date | null;
}

/** Cross-field check on the final (merged) values, so partial updates cannot create a bad schedule. */
export const timingError = (t: TimingFields): string | null => {
  if (t.startsAt && t.endsAt && t.endsAt < t.startsAt) return 'The end time must be after the start time';
  if (t.registrationOpensAt && t.registrationClosesAt && t.registrationClosesAt <= t.registrationOpensAt) {
    return 'Registration must close after it opens';
  }
  if (t.startsAt && t.registrationClosesAt && t.registrationClosesAt > t.startsAt) {
    return 'Registration must close before the event starts';
  }
  return null;
};
