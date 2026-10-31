// Single source of truth for authorization. Mirrors docs/permissions.md — update both together.
//
// There are only two roles. The Super Admin always has every permission. An Admin has NO default
// permissions: exactly the list the Super Admin ticked for that account (stored on the user as
// `permissions`) applies.
import { Roles, type Role } from './constants';

export const Permissions = {
  DASHBOARD_VIEW: 'dashboard.view',

  MEMBERS_READ: 'members.read',
  MEMBERS_READ_PRIVATE: 'members.read.private',
  MEMBERS_CREATE: 'members.create',
  MEMBERS_UPDATE: 'members.update',
  MEMBERS_EXPORT: 'members.export',
  MEMBERS_ANONYMIZE: 'members.anonymize',

  EVENTS_READ: 'events.read',
  EVENTS_CREATE: 'events.create',
  EVENTS_UPDATE: 'events.update',
  EVENTS_PUBLISH: 'events.publish',
  EVENTS_DELETE: 'events.delete',

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

  SETTINGS_MANAGE: 'settings.manage',
  AUDIT_READ: 'audit.read',

  // Managing admin accounts and security. All except USERS_RESET_PASSWORD are Super-Admin-only and
  // never selectable; users.reset_password can be ticked for an admin so they can set another
  // admin's password directly.
  USERS_READ: 'users.read',
  USERS_MANAGE: 'users.manage',
  USERS_RESET_PASSWORD: 'users.reset_password',
  ROLES_MANAGE: 'roles.manage',
  SESSIONS_REVOKE: 'sessions.revoke',
  SETTINGS_SECURITY: 'settings.security',
} as const;

export type Permission = (typeof Permissions)[keyof typeof Permissions];

const P = Permissions;

/** Held by the Super Admin only; cannot be given to an admin. */
export const SUPERADMIN_ONLY_PERMISSIONS: readonly Permission[] = [
  P.USERS_READ,
  P.USERS_MANAGE,
  P.ROLES_MANAGE,
  P.SESSIONS_REVOKE,
  P.SETTINGS_SECURITY,
];

export const ALL_PERMISSIONS = Object.values(Permissions) as Permission[];

/** The catalog the Super Admin picks from when creating or editing an admin. */
export const SELECTABLE_PERMISSIONS: readonly Permission[] = ALL_PERMISSIONS.filter(
  (p) => !SUPERADMIN_ONLY_PERMISSIONS.includes(p),
);

export const isPermission = (value: unknown): value is Permission =>
  typeof value === 'string' && (ALL_PERMISSIONS as string[]).includes(value);

export const isSelectablePermission = (value: unknown): value is Permission =>
  typeof value === 'string' && (SELECTABLE_PERMISSIONS as readonly string[]).includes(value);

interface PermissionSubject {
  role: Role;
  permissions?: readonly string[];
}

/**
 * Effective permissions. Super Admin: everything. Admin: only the selected permissions; unknown
 * values and Super-Admin-only values are ignored, so a tampered record cannot gain them.
 */
export const permissionsFor = (subject: PermissionSubject): Permission[] => {
  if (subject.role === Roles.SUPER_ADMIN) return [...ALL_PERMISSIONS];
  if (subject.role !== Roles.ADMIN) return [];
  return [...new Set((subject.permissions ?? []).filter(isSelectablePermission))];
};

export const hasPermissionFor = (subject: PermissionSubject, permission: Permission): boolean =>
  permissionsFor(subject).includes(permission);
