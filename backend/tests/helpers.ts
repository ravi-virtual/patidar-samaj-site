import mongoose from 'mongoose';
import request from 'supertest';
import app from '../src/app';
import User from '../src/models/User';
import MemberProfile from '../src/models/MemberProfile';
import {
  AccountStatus,
  MembershipStatus,
  MemberVisibility,
  Roles,
  config,
  type AccountStatusValue,
  type MemberVisibilityValue,
  type MembershipStatusValue,
  type Role,
} from '../src/config/constants';
import { Permissions, SELECTABLE_PERMISSIONS } from '../src/config/permissions';
import { hashPassword } from '../src/utils/password';

export const ORIGIN = 'http://localhost:5173';

// Permission lists to give test admins. An admin has exactly the permissions it is given.
const P = Permissions;
/** Everything selectable. */
export const ALL_ADMIN_PERMISSIONS: string[] = [...SELECTABLE_PERMISSIONS];
/** Day-to-day operations: everything selectable except private member data, export, anonymise and the audit log. */
export const OPS_ADMIN_PERMISSIONS: string[] = SELECTABLE_PERMISSIONS.filter(
  (p) => ![P.MEMBERS_READ_PRIVATE, P.MEMBERS_EXPORT, P.MEMBERS_ANONYMIZE, P.AUDIT_READ].includes(p as never),
);
/** Write drafts only: no publish, delete, anonymise or export. */
export const DRAFT_ADMIN_PERMISSIONS: string[] = [
  P.DASHBOARD_VIEW,
  P.EVENTS_READ,
  P.EVENTS_CREATE,
  P.EVENTS_UPDATE,
  P.ANNOUNCEMENTS_READ,
  P.ANNOUNCEMENTS_CREATE,
  P.ANNOUNCEMENTS_UPDATE,
  P.CONTENT_READ,
  P.CONTENT_MANAGE,
  P.MEDIA_UPLOAD,
];
/** Look but never change. */
export const READ_ONLY_ADMIN_PERMISSIONS: string[] = [
  P.DASHBOARD_VIEW,
  P.MEMBERS_READ,
  P.EVENTS_READ,
  P.ANNOUNCEMENTS_READ,
  P.CONTENT_READ,
];
export const PASSWORD = 'Correct-Horse-9';

export const connectTestDb = async () => {
  if (!/_test$/.test(new URL(config.mongo.uri).pathname)) {
    throw new Error('Refusing to run integration tests against a non-test database');
  }
  await mongoose.connect(config.mongo.uri, { serverSelectionTimeoutMS: 5000 });
  // Build every index (unique constraints included) before the first test runs.
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
};

export const disconnectTestDb = () => mongoose.disconnect();

/** Empties every collection. Indexes stay, so unique constraints keep being enforced. */
export const resetDb = async () => {
  await Promise.all(Object.values(mongoose.models).map((m) => m.deleteMany({})));
};

let counter = 0;
export const makeUser = async (
  over: Partial<{
    name: string;
    email: string;
    role: Role;
    status: AccountStatusValue;
    password: string | null;
    /** An admin has exactly these permissions; the Super Admin always has all of them. */
    permissions: string[];
  }> = {},
) => {
  counter += 1;
  const role = over.role ?? Roles.ADMIN;
  return User.create({
    name: over.name ?? `Test ${role} ${counter}`,
    email: over.email ?? `${role}${counter}@example.test`,
    role,
    status: over.status ?? AccountStatus.ACTIVE,
    permissions: over.permissions ?? [],
    passwordHash: over.password === null ? null : await hashPassword(over.password ?? PASSWORD),
  });
};

export interface Client {
  agent: ReturnType<typeof request.agent>;
  csrf: string;
  userId: string;
  cookie: string;
  get: (url: string) => request.Test;
  post: (url: string) => request.Test;
  patch: (url: string) => request.Test;
  put: (url: string) => request.Test;
  del: (url: string) => request.Test;
}

/** Signs a user in and returns a client that sends the Origin and CSRF headers like the real app. */
export const signIn = async (email: string, password = PASSWORD): Promise<Client> => {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/admin-login').set('Origin', ORIGIN).send({ email, password });
  if (res.status !== 200) throw new Error(`Sign-in failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  const csrf = res.body.data.csrfToken as string;
  const cookie = (res.headers['set-cookie'] as unknown as string[])
    .find((c) => c.startsWith(`${config.session.cookieName}=`))!
    .split(';')[0]!;
  const headers = (r: request.Test) => r.set('Origin', ORIGIN).set('X-CSRF-Token', csrf);
  return {
    agent,
    csrf,
    cookie,
    userId: res.body.data.user.id as string,
    get: (url) => agent.get(url),
    post: (url) => headers(agent.post(url)),
    patch: (url) => headers(agent.patch(url)),
    put: (url) => headers(agent.put(url)),
    del: (url) => headers(agent.delete(url)),
  };
};

export const signInAs = async (role: Role, extra: Parameters<typeof makeUser>[0] = {}) => {
  const user = await makeUser({ role, ...extra });
  const client = await signIn(user.email);
  return { user, client };
};

export const anon = () => request(app);

/** A well-formed user id for requests that must be refused before any account is looked up. */
export const ANON_ID = '00000000-0000-4000-8000-000000000000';

let profileCounter = 0;
/** A directory entry (a plain record; there are no member accounts). */
export const makeProfile = async (
  over: Partial<{
    displayName: string;
    village: string;
    city: string;
    country: string;
    occupation: string;
    bio: string;
    familySize: number;
    kul: string;
    phone: string;
    visibility: MemberVisibilityValue;
    membershipStatus: MembershipStatusValue;
    highlighted: boolean;
    joinedYear: number;
  }> = {},
) => {
  profileCounter += 1;
  return MemberProfile.create({
    displayName: `Member ${profileCounter}`,
    village: 'Unjha',
    city: 'Mehsana',
    country: 'India',
    visibility: MemberVisibility.PUBLIC,
    membershipStatus: MembershipStatus.ACTIVE,
    ...over,
  });
};

import Event from '../src/models/Event';
import { EventStatus, type EventStatusValue } from '../src/config/constants';

export const DAY = 86_400_000;
let eventCounter = 0;
/** An event directly in the database. Published and one week away unless overridden. */
export const makeEvent = async (
  over: Partial<{
    title: string;
    category: string;
    startsAt: Date;
    endsAt: Date;
    venue: string;
    status: EventStatusValue;
    featured: boolean;
    description: string;
  }> = {},
) => {
  eventCounter += 1;
  return Event.create({
    title: `Test Event ${eventCounter}`,
    category: 'Festival',
    venue: 'Samaj Bhavan',
    startsAt: new Date(Date.now() + 7 * DAY),
    status: EventStatus.PUBLISHED,
    ...over,
  });
};

import Announcement from '../src/models/Announcement';
import { PublishStatus, type PublishStatusValue } from '../src/config/constants';

let announcementCounter = 0;
/** An announcement directly in the database. Published and visible now unless overridden. */
export const makeAnnouncement = async (
  over: Partial<{
    title: string;
    summary: string;
    body: string;
    category: string;
    status: PublishStatusValue;
    pinned: boolean;
    order: number;
    featured: boolean;
    publishAt: Date;
  }> = {},
) => {
  announcementCounter += 1;
  return Announcement.create({
    title: `Announcement ${announcementCounter}`,
    body: 'Body text for the announcement.',
    category: 'Notice',
    status: PublishStatus.PUBLISHED,
    publishAt: new Date(Date.now() - 1000),
    ...over,
  });
};

/** Everything selectable except the right to reset other admins' passwords, which opens part of /api/users. */
export const ADMIN_PERMISSIONS_WITHOUT_USER_RESET: string[] = SELECTABLE_PERMISSIONS.filter((p) => p !== P.USERS_RESET_PASSWORD);
