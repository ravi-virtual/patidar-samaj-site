import { permissionsFor, type Permission } from '../config/permissions';
import type { Role, AccountStatusValue, ThemePreference } from '../config/constants';

interface UserLike {
  _id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: Role;
  status: AccountStatusValue;
  extraPermissions?: string[] | null;
  themePreference?: ThemePreference | null;
  createdAt?: Date;
  lastLoginAt?: Date | null;
}

export interface SessionUserView {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  status: AccountStatusValue;
  themePreference: ThemePreference;
  permissions: Permission[];
  createdAt?: Date;
  lastLoginAt: Date | null;
}

export interface AdminUserView {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: Role;
  status: AccountStatusValue;
  extraPermissions: string[];
  createdAt?: Date;
  lastLoginAt: Date | null;
  approvedAt: Date | null;
  suspendedAt: Date | null;
}

/**
 * What staff see in account lists. The email is the account identifier, so anyone allowed to
 * manage accounts sees it; the phone number is private and only included when `includePhone`.
 */
export const toAdminUser = (
  user: UserLike & { approvedAt?: Date | null; suspendedAt?: Date | null },
  includePhone: boolean,
): AdminUserView => ({
  id: user._id,
  name: user.name,
  email: user.email,
  ...(includePhone ? { phone: user.phone ?? null } : {}),
  role: user.role,
  status: user.status,
  extraPermissions: [...(user.extraPermissions ?? [])],
  createdAt: user.createdAt,
  lastLoginAt: user.lastLoginAt ?? null,
  approvedAt: user.approvedAt ?? null,
  suspendedAt: user.suspendedAt ?? null,
});

/** The signed-in user's own view of their account. Allowlist only; never spread a document. */
export const toSessionUser = (user: UserLike): SessionUserView => ({
  id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone ?? null,
  role: user.role,
  status: user.status,
  themePreference: user.themePreference ?? 'system',
  permissions: permissionsFor({ role: user.role, extraPermissions: user.extraPermissions ?? [] }),
  createdAt: user.createdAt,
  lastLoginAt: user.lastLoginAt ?? null,
});
