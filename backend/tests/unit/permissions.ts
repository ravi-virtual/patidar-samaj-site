import { describe, it, expect } from 'vitest';
import { Roles, StaffRoles } from '../../src/config/constants';
import {
  ALL_PERMISSIONS,
  GRANTABLE_PERMISSIONS,
  Permissions,
  RolePermissions,
  hasPermissionFor,
  isPermission,
  permissionsFor,
} from '../../src/config/permissions';

describe('permission catalogue', () => {
  it('has unique permission strings that all follow the resource.action shape', () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
    for (const p of ALL_PERMISSIONS) expect(p).toMatch(/^[a-z]+(\.[a-z_]+)+$/);
  });

  it('defines a permission list for every role, using only known permissions', () => {
    for (const role of Object.values(Roles)) {
      expect(RolePermissions[role]).toBeDefined();
      for (const p of RolePermissions[role]) expect(isPermission(p)).toBe(true);
    }
  });

  it('only allows grants of permissions that exist', () => {
    for (const p of GRANTABLE_PERMISSIONS) expect(ALL_PERMISSIONS).toContain(p);
  });

  it('never lets a grantable permission be one that manages accounts, roles or security', () => {
    const dangerous: string[] = [
      Permissions.USERS_MANAGE,
      Permissions.ROLES_MANAGE,
      Permissions.SESSIONS_REVOKE,
      Permissions.SETTINGS_SECURITY,
      Permissions.AUDIT_READ,
    ];
    for (const p of GRANTABLE_PERMISSIONS) expect(dangerous).not.toContain(p);
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

describe('role defaults', () => {
  it('gives Super Admin every permission', () => {
    expect(new Set(permissionsFor({ role: Roles.SUPER_ADMIN }))).toEqual(new Set(ALL_PERMISSIONS));
  });

  it('gives Member only directory and event access, and no dashboard', () => {
    expect(permissionsFor({ role: Roles.MEMBER }).sort()).toEqual(
      [Permissions.MEMBERS_READ, Permissions.EVENTS_READ, Permissions.EVENTS_RSVP].sort(),
    );
  });

  it('keeps every staff role able to see the dashboard', () => {
    for (const role of StaffRoles) expect(hasPermissionFor({ role }, Permissions.DASHBOARD_VIEW)).toBe(true);
  });

  it('keeps private member data and exports away from default roles other than Super Admin', () => {
    for (const role of [Roles.ADMIN, Roles.EDITOR, Roles.VIEWER, Roles.MEMBER]) {
      expect(hasPermissionFor({ role }, Permissions.MEMBERS_READ_PRIVATE)).toBe(false);
      expect(hasPermissionFor({ role }, Permissions.MEMBERS_EXPORT)).toBe(false);
      expect(hasPermissionFor({ role }, Permissions.MEMBERS_ANONYMIZE)).toBe(false);
    }
  });

  it('keeps Admin away from the audit log, roles and settings security', () => {
    expect(hasPermissionFor({ role: Roles.ADMIN }, Permissions.AUDIT_READ)).toBe(false);
    expect(hasPermissionFor({ role: Roles.ADMIN }, Permissions.ROLES_MANAGE)).toBe(false);
    expect(hasPermissionFor({ role: Roles.ADMIN }, Permissions.SETTINGS_SECURITY)).toBe(false);
  });

  it('keeps Editors to drafts: create/update but not publish or delete', () => {
    const editor = permissionsFor({ role: Roles.EDITOR });
    expect(editor).toContain(Permissions.EVENTS_UPDATE);
    expect(editor).toContain(Permissions.CONTENT_MANAGE);
    for (const p of [Permissions.EVENTS_PUBLISH, Permissions.EVENTS_DELETE, Permissions.ANNOUNCEMENTS_PUBLISH, Permissions.CONTENT_PUBLISH]) {
      expect(editor).not.toContain(p);
    }
  });

  it('gives Viewer only read and view permissions', () => {
    for (const p of permissionsFor({ role: Roles.VIEWER })) expect(p).toMatch(/\.(read|view)$/);
  });
});

describe('permissionsFor with individual grants', () => {
  it('adds grantable extras without duplicating permissions the role already has', () => {
    const list = permissionsFor({ role: Roles.ADMIN, extraPermissions: [Permissions.EVENTS_PUBLISH, Permissions.MEMBERS_EXPORT] });
    expect(list.filter((p) => p === Permissions.EVENTS_PUBLISH)).toHaveLength(1);
    expect(list).toContain(Permissions.MEMBERS_EXPORT);
  });

  it('ignores unknown, non-string and non-grantable extras', () => {
    const base = permissionsFor({ role: Roles.VIEWER });
    const list = permissionsFor({
      role: Roles.VIEWER,
      extraPermissions: ['nope', Permissions.USERS_MANAGE, Permissions.AUDIT_READ, 5 as never],
    });
    expect(list.sort()).toEqual(base.sort());
  });

  it('tolerates a missing extras list and an unknown role', () => {
    expect(permissionsFor({ role: Roles.MEMBER, extraPermissions: undefined })).toHaveLength(3);
    expect(permissionsFor({ role: 'ghost' as never })).toEqual([]);
  });

  it('does not mutate the shared role table', () => {
    const before = [...RolePermissions[Roles.EDITOR]];
    permissionsFor({ role: Roles.EDITOR, extraPermissions: [Permissions.EVENTS_PUBLISH] });
    expect([...RolePermissions[Roles.EDITOR]]).toEqual(before);
  });
});

describe('hasPermissionFor', () => {
  it('reflects role plus grants', () => {
    expect(hasPermissionFor({ role: Roles.EDITOR }, Permissions.CONTENT_PUBLISH)).toBe(false);
    expect(hasPermissionFor({ role: Roles.EDITOR, extraPermissions: [Permissions.CONTENT_PUBLISH] }, Permissions.CONTENT_PUBLISH)).toBe(true);
  });
});
