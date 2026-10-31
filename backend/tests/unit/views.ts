import { describe, it, expect } from 'vitest';
import { ApiResponse } from '../../src/utils/apiResponse';
import { toPublicAnnouncement, toAdminAnnouncement, visibleNowFilter } from '../../src/utils/announcementView';
import {
  timingError,
  toAdminEvent,
  toPublicEvent,
} from '../../src/utils/eventView';
import { toDirectoryEntry, toStaffMember } from '../../src/utils/memberView';
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
      featured: false,
      createdAt: NOW,
      updatedAt: NOW,
      ...over,
    }) as never;

  it('builds the public view with timing and details only', () => {
    const pub = toPublicEvent(event({ createdBy: 'u1' }));
    expect(pub).toMatchObject({ id: 'e1', title: 'Garba Night', venue: 'Hall', status: 'published', description: null });
    expect(pub).not.toHaveProperty('createdBy');
    for (const key of ['capacity', 'registeredCount', 'spotsLeft', 'registrationState', 'registrationClosesAt', 'myRegistration']) {
      expect(pub).not.toHaveProperty(key);
    }
  });

  it('shows the cancellation reason only on cancelled events', () => {
    expect(toPublicEvent(event({ cancellationReason: 'Rain' })).cancellationReason).toBeNull();
    const cancelled = toPublicEvent(event({ status: 'cancelled', cancellationReason: 'Rain' }));
    expect(cancelled).toMatchObject({ status: 'cancelled', cancellationReason: 'Rain' });
  });

  it('shows staff the real status and audit fields', () => {
    const admin = toAdminEvent(event({ status: 'draft', createdBy: 'u1' }));
    expect(admin).toMatchObject({ status: 'draft', createdBy: 'u1', cancelledAt: null });
  });

  describe('timingError', () => {
    it('accepts a coherent schedule and partial input', () => {
      expect(timingError({})).toBeNull();
      expect(timingError({ startsAt: at(5), endsAt: at(5) })).toBeNull();
    });

    it('rejects an end before the start', () => {
      expect(timingError({ startsAt: at(5), endsAt: at(4) })).toMatch(/end time/);
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

  it('gives staff private fields only with the private permission', () => {
    const without = toStaffMember(profile, { includePrivate: false });
    for (const key of ['phone', 'familySize', 'kul', 'userId', 'hasAccount', 'accountStatus', 'internalNote']) expect(without).not.toHaveProperty(key);
    expect(without).toMatchObject({ visibility: 'public', anonymizedAt: null });
    const withPrivate = toStaffMember(profile, { includePrivate: true });
    expect(withPrivate).toMatchObject({ phone: '+911234567890', familySize: 4, kul: 'Kadva' });
    expect(withPrivate).not.toHaveProperty('internalNote');
  });

  it('treats any visibility other than public (including legacy "members") as hidden', () => {
    for (const visibility of ['hidden', 'members', undefined]) {
      expect(toStaffMember({ ...(profile as object), visibility } as never, { includePrivate: false }).visibility).toBe('hidden');
    }
  });
});

describe('userView', () => {
  const user = {
    _id: 'u1',
    name: 'Ravi',
    email: 'ravi@example.com',
    role: 'admin',
    status: 'active',
    permissions: ['events.publish', 'bogus', 'users.manage'],
    passwordHash: 'SECRET',
    failedLoginCount: 3,
    createdAt: NOW,
  } as never;

  it('builds the session user with the selected permissions, a default theme and no secrets', () => {
    const view = toSessionUser(user);
    expect(view.themePreference).toBe('system');
    expect(view.permissions).toEqual(['events.publish']);
    expect(view.lastLoginAt).toBeNull();
    expect(view).not.toHaveProperty('phone');
    expect(JSON.stringify(view)).not.toMatch(/SECRET|passwordHash|failedLoginCount/);
  });

  it('gives the Super Admin every permission and keeps an explicit theme', () => {
    const view = toSessionUser({ ...(user as object), role: 'superadmin', permissions: [], themePreference: 'dark' } as never);
    expect(view.themePreference).toBe('dark');
    expect(view.permissions).toContain('users.manage');
    expect(view.permissions).toContain('events.publish');
  });

  it('builds the admin list view from an allowlist, copying the selected permissions', () => {
    const view = toAdminUser(user);
    expect(view).toMatchObject({ id: 'u1', role: 'admin', permissions: ['events.publish'], suspendedAt: null });
    expect(view).not.toHaveProperty('phone');
    expect(view).not.toHaveProperty('approvedAt');
    expect(JSON.stringify(view)).not.toMatch(/SECRET|passwordHash|failedLoginCount/);
    const u = user as unknown as { permissions: string[] };
    expect(view.permissions).not.toBe(u.permissions);
  });
});
