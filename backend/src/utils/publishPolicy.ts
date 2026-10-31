import type { Permission } from '../config/permissions';

/**
 * Publishing rule shared by events, announcements and site content: anyone with the edit
 * permission may work on drafts, but once something is live (or cancelled/archived) changing it
 * needs the matching publish permission. An admin without it therefore cannot alter public content
 * that another admin has published, unless the Super Admin ticks the publish permission for them.
 */
export const mayEditItem = (
  user: Express.AuthUser | undefined,
  currentStatus: string,
  publishPermission: Permission,
): boolean => {
  if (!user) return false;
  return currentStatus === 'draft' || user.permissions.includes(publishPermission);
};
