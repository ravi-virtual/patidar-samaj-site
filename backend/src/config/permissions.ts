// Single source of truth for authorization. Mirrors docs/permissions.md — update both together.
import { Roles, type Role } from './constants';

export const Permissions = {
  DASHBOARD_VIEW: 'dashboard.view',

  MEMBERS_READ: 'members.read',
  MEMBERS_READ_PRIVATE: 'members.read.private',
  MEMBERS_CREATE: 'members.create',
  MEMBERS_UPDATE: 'members.update',
  MEMBERS_APPROVE: 'members.approve',
  MEMBERS_SUSPEND: 'members.suspend',
  MEMBERS_EXPORT: 'members.export',
  MEMBERS_ANONYMIZE: 'members.anonymize',

  EVENTS_READ: 'events.read',
  EVENTS_CREATE: 'events.create',
  EVENTS_UPDATE: 'events.update',
  EVENTS_PUBLISH: 'events.publish',
  EVENTS_DELETE: 'events.delete',
  EVENTS_RSVP: 'events.rsvp',
  REGISTRATIONS_READ: 'registrations.read',
  REGISTRATIONS_MANAGE: 'registrations.manage',
  REGISTRATIONS_EXPORT: 'registrations.export',

  ANNOUNCEMENTS_READ: 'announcements.read',
  ANNOUNCEMENTS_CREATE: 'announcements.create',
  ANNOUNCEMENTS_UPDATE: 'announcements.update',
  ANNOUNCEMENTS_PUBLISH: 'announcements.publish',
  ANNOUNCEMENTS_DELETE: 'announcements.delete',

  CONTENT_READ: 'content.read',
  CONTENT_MANAGE: 'content.manage',
  CONTENT_PUBLISH: 'content.publish',
  MEDIA_UPLOAD: 'media.upload',

  CONTACTS_READ: 'contacts.read',
  CONTACTS_ASSIGN: 'contacts.assign',
  CONTACTS_RESOLVE: 'contacts.resolve',

  USERS_READ: 'users.read',
  USERS_MANAGE: 'users.manage',
  USERS_RESET_PASSWORD: 'users.reset_password',
  ROLES_MANAGE: 'roles.manage',
  SESSIONS_REVOKE: 'sessions.revoke',

  SETTINGS_MANAGE: 'settings.manage',
  SETTINGS_SECURITY: 'settings.security',
  AUDIT_READ: 'audit.read',
} as const;

export type Permission = (typeof Permissions)[keyof typeof Permissions];

export const ALL_PERMISSIONS = Object.values(Permissions) as Permission[];

const P = Permissions;

/** Default permissions per role. "grant only" items in the matrix are absent here on purpose. */
export const RolePermissions: Record<Role, readonly Permission[]> = {
  [Roles.VIEWER]: [
    P.DASHBOARD_VIEW,
    P.MEMBERS_READ,
    P.EVENTS_READ,
    P.ANNOUNCEMENTS_READ,
    P.CONTENT_READ,
  ],

  [Roles.MEMBER]: [P.MEMBERS_READ, P.EVENTS_READ, P.EVENTS_RSVP],

  [Roles.EDITOR]: [
    P.DASHBOARD_VIEW,
    P.EVENTS_READ,
    P.EVENTS_CREATE,
    P.EVENTS_UPDATE,
    P.EVENTS_RSVP,
    P.ANNOUNCEMENTS_READ,
    P.ANNOUNCEMENTS_CREATE,
    P.ANNOUNCEMENTS_UPDATE,
    P.CONTENT_READ,
    P.CONTENT_MANAGE, // drafts only; publishing needs CONTENT_PUBLISH (grant)
    P.MEDIA_UPLOAD,
  ],

  [Roles.ADMIN]: [
    P.DASHBOARD_VIEW,
    P.MEMBERS_READ,
    P.MEMBERS_CREATE,
    P.MEMBERS_UPDATE,
    P.MEMBERS_APPROVE,
    P.MEMBERS_SUSPEND,
    P.EVENTS_READ,
    P.EVENTS_CREATE,
    P.EVENTS_UPDATE,
    P.EVENTS_PUBLISH,
    P.EVENTS_DELETE,
    P.EVENTS_RSVP,
    P.REGISTRATIONS_READ,
    P.REGISTRATIONS_MANAGE,
    P.REGISTRATIONS_EXPORT,
    P.ANNOUNCEMENTS_READ,
    P.ANNOUNCEMENTS_CREATE,
    P.ANNOUNCEMENTS_UPDATE,
    P.ANNOUNCEMENTS_PUBLISH,
    P.ANNOUNCEMENTS_DELETE,
    P.CONTENT_READ,
    P.CONTENT_MANAGE,
    P.CONTENT_PUBLISH,
    P.MEDIA_UPLOAD,
    P.CONTACTS_READ,
    P.CONTACTS_ASSIGN,
    P.CONTACTS_RESOLVE,
    P.USERS_READ,
    P.USERS_RESET_PASSWORD,
    P.SETTINGS_MANAGE,
  ],

  [Roles.SUPER_ADMIN]: ALL_PERMISSIONS,
};

/** Permissions a Super Admin may grant individually on top of a role. */
export const GRANTABLE_PERMISSIONS: readonly Permission[] = [
  P.EVENTS_PUBLISH,
  P.ANNOUNCEMENTS_PUBLISH,
  P.CONTENT_PUBLISH,
  P.MEMBERS_EXPORT,
];

export const isPermission = (value: unknown): value is Permission =>
  typeof value === 'string' && (ALL_PERMISSIONS as string[]).includes(value);

interface PermissionSubject {
  role: Role;
  extraPermissions?: readonly string[];
}

/** Role defaults plus individually granted permissions. Unknown values are ignored. */
export const permissionsFor = (subject: PermissionSubject): Permission[] => {
  const set = new Set<Permission>(RolePermissions[subject.role] ?? []);
  for (const extra of subject.extraPermissions ?? []) {
    if (isPermission(extra) && GRANTABLE_PERMISSIONS.includes(extra)) set.add(extra);
  }
  return [...set];
};

export const hasPermissionFor = (subject: PermissionSubject, permission: Permission): boolean =>
  permissionsFor(subject).includes(permission);
