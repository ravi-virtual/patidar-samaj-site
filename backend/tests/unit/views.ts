import { describe, it, expect } from 'vitest';
import { ApiResponse } from '../../src/utils/apiResponse';
import { toPublicAnnouncement, toAdminAnnouncement, visibleNowFilter } from '../../src/utils/announcementView';
import {
  registrationState,
  remainingCapacity,
  timingError,
  toAdminEvent,
  toPublicEvent,
} from '../../src/utils/eventView';
import { toDirectoryEntry, toOwnerProfile, toStaffMember } from '../../src/utils/memberView';
import { toAdminUser, toSessionUser } from '../../src/utils/userView';
import { ResponseCodes } from '../../src/config/constants';

const DAY = 86_400_000;
const NOW = new Date('2026-06-01T12:00:00Z');
const at = (days: number) => new Date(NOW.getTime() + days * DAY);

describe('ApiResponse', () => {
  it('defaults data to an empty object and treats 399 as success, 400 as failure', () => {
    expect(new ApiResponse(ResponseCodes.OK, 'ok').data).toEqual({});
    expect(new ApiResponse(399, 'x').success).toBe(true);
    expect(new ApiResponse(400, 'x').success).toBe(false);
  });

  it('sends status and the success/message/data envelope', () => {
    const sent: { status?: number; body?: unknown } = {};
    const res = {
      status(c: number) {
        sent.status = c;
        return res;
      },
      json(b: unknown) {
        sent.body = b;
        return res;
      },
    };
    new ApiResponse(201, 'Created', { id: 1 }).send(res as never);
    expect(sent).toEqual({ status: 201, body: { success: true, message: 'Created', data: { id: 1 } } });
  });
});

describe('announcementView', () => {
  const base = {
    _id: 'a1',
    title: 'Title',
    body: 'Body text',
    category: 'Notice',
    status: 'published',
    pinned: false,
    featured: false,
    order: 0,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
  } as never;
  const withFields = (over: Record<string, unknown>) => ({ ...(base as object), ...over }) as never;

  it('builds a filter for published, non-deleted items that are not scheduled for later', () => {
    const f = visibleNowFilter(NOW);
    expect(f).toMatchObject({ isDeleted: false, status: 'published' });
    expect(f.$or).toContainEqual({ publishAt: { $lte: NOW } });
    expect(f.$or).toContainEqual({ publishAt: null });
  });

  it('uses the summary, or an excerpt of the body when there is none', () => {
    expect(toPublicAnnouncement(withFields({ summary: 'Short' }), false).summary).toBe('Short');
    expect(toPublicAnnouncement(base, false).summary).toBe('Body text');
    const long = 'x'.repeat(300);
    const excerpt = toPublicAnnouncement(withFields({ body: long }), false).summary;
    expect(excerpt).toBe(`${'x'.repeat(200)}…`);
  });

  it('includes the body only when asked and never leaks staff fields publicly', () => {
    expect(toPublicAnnouncement(base, false)).not.toHaveProperty('body');
    expect(toPublicAnnouncement(base, true).body).toBe('Body text');
    const pub = toPublicAnnouncement(withFields({ createdBy: 'u1', updatedBy: 'u2', status: 'archived' }), true);
    expect(pub).not.toHaveProperty('createdBy');
    expect(pub).not.toHaveProperty('status');
    expect(pub.archived).toBe(true);
  });

  it('picks the publish date from publishAt, then publishedAt, then createdAt', () => {
    expect(toPublicAnnouncement(withFields({ publishAt: at(1), publishedAt: at(2) }), false).publishedAt).toEqual(at(1));
    expect(toPublicAnnouncement(withFields({ publishedAt: at(2) }), false).publishedAt).toEqual(at(2));
    expect(toPublicAnnouncement(base, false).publishedAt).toEqual(new Date('2026-01-01'));
  });

  it('marks a published item with a future publishAt as scheduled in the admin view', () => {
    expect(toAdminAnnouncement(withFields({ publishAt: new Date(Date.now() + DAY) })).scheduled).toBe(true);
    expect(toAdminAnnouncement(withFields({ publishAt: new Date(Date.now() - DAY) })).scheduled).toBe(false);
    expect(toAdminAnnouncement(withFields({ publishAt: new Date(Date.now() + DAY), status: 'draft' })).scheduled).toBe(false);
    expect(toAdminAnnouncement(base)).toMatchObject({ summary: null, publishAt: null, createdBy: null });
  });
});

describe('eventView', () => {
  const event = (over: Record<string, unknown> = {}) =>
    ({
      _id: 'e1',
      title: 'Garba Night',
      category: 'Festival',
      venue: 'Hall',
      status: 'published',
      startsAt: at(7),
      capacity: 0,
      registeredCount: 0,
      featured: false,
      createdAt: NOW,
      updatedAt: NOW,
      ...over,
    }) as never;

  describe('registrationState', () => {
    it('is open for a future published event with no limits', () => {
      expect(registrationState(event(), NOW)).toBe('open');
    });

    it('reports cancelled and unavailable (draft/archived) before anything else', () => {
      expect(registrationState(event({ status: 'cancelled', startsAt: at(-1) }), NOW)).toBe('cancelled');
      expect(registrationState(event({ status: 'draft' }), NOW)).toBe('unavailable');
    });

    it('reports past once the event has started (inclusive)', () => {
      expect(registrationState(event({ startsAt: at(-1) }), NOW)).toBe('past');
      expect(registrationState(event({ startsAt: NOW }), NOW)).toBe('past');
    });

    it('honours the opening and closing times', () => {
      expect(registrationState(event({ registrationOpensAt: at(1) }), NOW)).toBe('not_yet_open');
      expect(registrationState(event({ registrationOpensAt: NOW }), NOW)).toBe('open');
      expect(registrationState(event({ registrationClosesAt: at(-1) }), NOW)).toBe('closed');
      expect(registrationState(event({ registrationClosesAt: NOW }), NOW)).toBe('closed');
      expect(registrationState(event({ registrationClosesAt: at(1) }), NOW)).toBe('open');
    });

    it('reports full only when a capacity is set and reached', () => {
      expect(registrationState(event({ capacity: 5, registeredCount: 4 }), NOW)).toBe('open');
      expect(registrationState(event({ capacity: 5, registeredCount: 5 }), NOW)).toBe('full');
      expect(registrationState(event({ capacity: 0, registeredCount: 500 }), NOW)).toBe('open');
    });
  });

  it('computes remaining capacity, null for unlimited, never negative', () => {
    expect(remainingCapacity({ capacity: 0, registeredCount: 9 })).toBeNull();
    expect(remainingCapacity({ capacity: 10, registeredCount: 3 })).toBe(7);
    expect(remainingCapacity({ capacity: 10, registeredCount: 12 })).toBe(0);
  });

  it('builds the public view without internal counters, and closes registration at the start by default', () => {
    const pub = toPublicEvent(event({ capacity: 10, registeredCount: 4, createdBy: 'u1' }), undefined, NOW);
    expect(pub).toMatchObject({ id: 'e1', spotsLeft: 6, registrationState: 'open', status: 'published', description: null });
    expect(pub.registrationClosesAt).toEqual(at(7));
    expect(pub).not.toHaveProperty('registeredCount');
    expect(pub).not.toHaveProperty('createdBy');
    expect(pub).not.toHaveProperty('myRegistration');
  });

  it('shows the cancellation reason only on cancelled events', () => {
    expect(toPublicEvent(event({ cancellationReason: 'Rain' }), undefined, NOW).cancellationReason).toBeNull();
    const cancelled = toPublicEvent(event({ status: 'cancelled', cancellationReason: 'Rain' }), undefined, NOW);
    expect(cancelled).toMatchObject({ status: 'cancelled', cancellationReason: 'Rain' });
  });

  it('reports the visitor’s own confirmed registration only', () => {
    expect(toPublicEvent(event(), { status: 'confirmed', attendees: 3 }, NOW).myRegistration).toEqual({ attendees: 3 });
    expect(toPublicEvent(event(), { status: 'cancelled', attendees: 3 }, NOW).myRegistration).toBeNull();
    expect(toPublicEvent(event(), null, NOW).myRegistration).toBeNull();
  });

  it('shows staff the real status and counters', () => {
    const admin = toAdminEvent(event({ status: 'draft', registeredCount: 4, createdBy: 'u1' }), NOW);
    expect(admin).toMatchObject({ status: 'draft', registeredCount: 4, createdBy: 'u1', cancelledAt: null });
  });

  describe('timingError', () => {
    it('accepts a coherent schedule and partial input', () => {
      expect(timingError({})).toBeNull();
      expect(timingError({ startsAt: at(5), endsAt: at(5), registrationOpensAt: at(1), registrationClosesAt: at(4) })).toBeNull();
    });

    it('rejects an end before the start', () => {
      expect(timingError({ startsAt: at(5), endsAt: at(4) })).toMatch(/end time/);
    });

    it('rejects registration closing at or before it opens', () => {
      expect(timingError({ registrationOpensAt: at(2), registrationClosesAt: at(2) })).toMatch(/close after it opens/);
    });

    it('rejects registration closing after the event starts', () => {
      expect(timingError({ startsAt: at(5), registrationClosesAt: at(6) })).toMatch(/before the event starts/);
    });
  });
});

describe('memberView', () => {
  const profile = {
    _id: 'm1',
    userId: 'u1',
    displayName: 'Asha Patel',
    village: 'Unjha',
    phone: '+911234567890',
    familySize: 4,
    kul: 'Kadva',
    visibility: 'public',
    membershipStatus: 'active',
    highlighted: true,
    internalNote: 'secret',
    createdAt: NOW,
  } as never;

  it('exposes only allowlisted directory fields', () => {
    const entry = toDirectoryEntry(profile);
    expect(entry).toMatchObject({ id: 'm1', name: 'Asha Patel', village: 'Unjha', city: null, highlighted: true });
    for (const key of ['phone', 'familySize', 'kul', 'userId', 'internalNote', 'visibility']) expect(entry).not.toHaveProperty(key);
  });

  it('gives owners their private details, preferring the account phone', () => {
    expect(toOwnerProfile(profile)).toMatchObject({ phone: '+911234567890', familySize: 4, kul: 'Kadva', visibility: 'public' });
    expect(toOwnerProfile(profile, '+910000000000').phone).toBe('+910000000000');
    expect(toOwnerProfile(profile)).not.toHaveProperty('internalNote');
  });

  it('gives staff private fields only with the private permission', () => {
    const without = toStaffMember(profile, { includePrivate: false, accountPhone: '+9100', accountStatus: 'active' });
    for (const key of ['phone', 'familySize', 'kul']) expect(without).not.toHaveProperty(key);
    expect(without).toMatchObject({ hasAccount: true, accountStatus: 'active', anonymizedAt: null });
    const withPrivate = toStaffMember(profile, { includePrivate: true, accountPhone: '+9100' });
    expect(withPrivate).toMatchObject({ phone: '+9100', familySize: 4, kul: 'Kadva', accountStatus: null });
    expect(withPrivate).not.toHaveProperty('internalNote');
  });

  it('reports hasAccount false for an office-created entry', () => {
    const entry = toStaffMember({ ...(profile as object), userId: undefined } as never, { includePrivate: false });
    expect(entry).toMatchObject({ hasAccount: false, userId: null });
  });
});

describe('userView', () => {
  const user = {
    _id: 'u1',
    name: 'Ravi',
    email: 'ravi@example.com',
    phone: '+910000000000',
    role: 'editor',
    status: 'active',
    extraPermissions: ['events.publish', 'bogus'],
    passwordHash: 'SECRET',
    failedLoginCount: 3,
    createdAt: NOW,
  } as never;

  it('builds the session user with effective permissions, a default theme and no secrets', () => {
    const view = toSessionUser(user);
    expect(view.themePreference).toBe('system');
    expect(view.permissions).toContain('events.publish');
    expect(view.permissions).toContain('events.create');
    expect(view.permissions).not.toContain('bogus');
    expect(view.lastLoginAt).toBeNull();
    expect(JSON.stringify(view)).not.toMatch(/SECRET|passwordHash|failedLoginCount/);
  });

  it('keeps an explicit theme and null phone', () => {
    const view = toSessionUser({ ...(user as object), themePreference: 'dark', phone: undefined } as never);
    expect(view).toMatchObject({ themePreference: 'dark', phone: null });
  });

  it('includes the phone in the admin view only when allowed, and copies the extra permissions', () => {
    const hidden = toAdminUser(user, false);
    expect(hidden).not.toHaveProperty('phone');
    expect(toAdminUser(user, true).phone).toBe('+910000000000');
    expect(hidden.approvedAt).toBeNull();
    expect(hidden.suspendedAt).toBeNull();
    expect(JSON.stringify(hidden)).not.toMatch(/SECRET|passwordHash|failedLoginCount/);
    const u = user as unknown as { extraPermissions: string[] };
    expect(hidden.extraPermissions).not.toBe(u.extraPermissions);
  });
});
