import { describe, it, expect } from 'vitest';
import { Roles } from '../../src/config/constants';
import {
  ALL_PERMISSIONS,
  Permissions,
  SELECTABLE_PERMISSIONS,
  SUPERADMIN_ONLY_PERMISSIONS,
  hasPermissionFor,
  isPermission,
  isSelectablePermission,
  permissionsFor,
} from '../../src/config/permissions';

describe('roles', () => {
  it('has only admin and superadmin', () => {
    expect(Object.values(Roles).sort()).toEqual(['admin', 'superadmin']);
  });
});

describe('permission catalogue', () => {
  it('has unique permission strings that all follow the resource.action shape', () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
    for (const p of ALL_PERMISSIONS) expect(p).toMatch(/^[a-z]+(\.[a-z_]+)+$/);
  });

  it('no longer contains approval, suspension, account or registration permissions', () => {
    const removed = [
      'members.approve',
      'members.suspend',
      'members.create_account',
      'events.register',
      'events.rsvp',
      'registrations.read',
      'registrations.manage',
      'registrations.export',
    ];
    for (const p of removed) expect(isPermission(p)).toBe(false);
  });

  it('offers admins everything meaningful for them to use', () => {
    expect([...SELECTABLE_PERMISSIONS].sort()).toEqual(
      [
        'dashboard.view',
        'members.read',
        'members.read.private',
        'members.create',
        'members.update',
        'members.export',
        'members.anonymize',
        'events.read',
        'events.create',
        'events.update',
        'events.publish',
        'events.delete',
        'announcements.read',
        'announcements.create',
        'announcements.update',
        'announcements.publish',
        'announcements.delete',
        'content.read',
        'content.manage',
        'content.publish',
        'media.upload',
        'contacts.read',
        'contacts.assign',
        'contacts.resolve',
        'settings.manage',
        'audit.read',
        'users.reset_password',
      ].sort(),
    );
  });

  it('keeps account, role, session and security management out of the selectable catalog', () => {
    expect([...SUPERADMIN_ONLY_PERMISSIONS].sort()).toEqual(
      [
        Permissions.USERS_READ,
        Permissions.USERS_MANAGE,
        Permissions.ROLES_MANAGE,
        Permissions.SESSIONS_REVOKE,
        Permissions.SETTINGS_SECURITY,
      ].sort(),
    );
    for (const p of SUPERADMIN_ONLY_PERMISSIONS) expect(isSelectablePermission(p)).toBe(false);
    expect(SELECTABLE_PERMISSIONS.length + SUPERADMIN_ONLY_PERMISSIONS.length).toBe(ALL_PERMISSIONS.length);
  });
});

describe('isPermission', () => {
  it('accepts known permissions only', () => {
    expect(isPermission('events.read')).toBe(true);
    expect(isPermission('events.fly')).toBe(false);
    expect(isPermission('')).toBe(false);
    expect(isPermission(undefined)).toBe(false);
    expect(isPermission(42)).toBe(false);
    expect(isPermission(null)).toBe(false);
  });
});

describe('permissionsFor', () => {
  it('gives the Super Admin every permission, whatever is stored', () => {
    expect(new Set(permissionsFor({ role: Roles.SUPER_ADMIN }))).toEqual(new Set(ALL_PERMISSIONS));
    expect(new Set(permissionsFor({ role: Roles.SUPER_ADMIN, permissions: [] }))).toEqual(new Set(ALL_PERMISSIONS));
  });

  it('gives an admin no default permissions', () => {
    expect(permissionsFor({ role: Roles.ADMIN })).toEqual([]);
    expect(permissionsFor({ role: Roles.ADMIN, permissions: [] })).toEqual([]);
  });

  it('gives an admin exactly the selected permissions, without duplicates', () => {
    const list = permissionsFor({
      role: Roles.ADMIN,
      permissions: [Permissions.EVENTS_READ, Permissions.EVENTS_PUBLISH, Permissions.EVENTS_READ],
    });
    expect(list.sort()).toEqual([Permissions.EVENTS_PUBLISH, Permissions.EVENTS_READ].sort());
  });

  it('ignores unknown, non-string and Super-Admin-only values on an admin record', () => {
    const list = permissionsFor({
      role: Roles.ADMIN,
      permissions: ['nope', Permissions.USERS_MANAGE, Permissions.SESSIONS_REVOKE, 5 as never, Permissions.MEMBERS_READ],
    });
    expect(list).toEqual([Permissions.MEMBERS_READ]);
  });

  it('returns nothing for an unknown role', () => {
    expect(permissionsFor({ role: 'ghost' as never, permissions: [Permissions.EVENTS_READ] })).toEqual([]);
    expect(permissionsFor({ role: 'member' as never })).toEqual([]);
  });
});

describe('hasPermissionFor', () => {
  it('reflects the selected list for an admin and everything for the Super Admin', () => {
    const admin = { role: Roles.ADMIN, permissions: [Permissions.CONTENT_PUBLISH] };
    expect(hasPermissionFor(admin, Permissions.CONTENT_PUBLISH)).toBe(true);
    expect(hasPermissionFor(admin, Permissions.CONTENT_MANAGE)).toBe(false);
    expect(hasPermissionFor(admin, Permissions.USERS_MANAGE)).toBe(false);
    expect(hasPermissionFor({ role: Roles.SUPER_ADMIN }, Permissions.USERS_MANAGE)).toBe(true);
  });
});
