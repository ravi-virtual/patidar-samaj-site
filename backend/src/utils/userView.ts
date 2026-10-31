import { permissionsFor, type Permission } from '../config/permissions';
import type { Role, AccountStatusValue, ThemePreference } from '../config/constants';

interface UserLike {
  _id: string;
  name: string;
  email: string;
  role: Role;
  status: AccountStatusValue;
  permissions?: string[] | null;
  themePreference?: ThemePreference | null;
  createdAt?: Date;
  lastLoginAt?: Date | null;
  suspendedAt?: Date | null;
}

export interface SessionUserView {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: AccountStatusValue;
  themePreference: ThemePreference;
  /** Effective permissions: everything for the Super Admin, the selected list for an admin. */
  permissions: Permission[];
  createdAt?: Date;
  lastLoginAt: Date | null;
}

export interface AdminUserView {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: AccountStatusValue;
  /** The permissions the Super Admin selected for this admin. */
  permissions: string[];
  createdAt?: Date;
  lastLoginAt: Date | null;
  suspendedAt: Date | null;
}

/** What the Super Admin sees in the admin list. Allowlist only; never spread a document. */
export const toAdminUser = (user: UserLike): AdminUserView => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  status: user.status,
  permissions: permissionsFor({ role: user.role, permissions: user.permissions ?? [] }),
  createdAt: user.createdAt,
  lastLoginAt: user.lastLoginAt ?? null,
  suspendedAt: user.suspendedAt ?? null,
});

/** The signed-in user's own view of their account. Allowlist only; never spread a document. */
export const toSessionUser = (user: UserLike): SessionUserView => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  status: user.status,
  themePreference: user.themePreference ?? 'system',
  permissions: permissionsFor({ role: user.role, permissions: user.permissions ?? [] }),
  createdAt: user.createdAt,
  lastLoginAt: user.lastLoginAt ?? null,
});
