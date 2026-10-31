import { t } from '../../i18n';

/**
 * Human text and grouping for the permissions the Super Admin can tick for an admin. An admin has no
 * default permissions: exactly the ticked list applies. Keep this in step with
 * SELECTABLE_PERMISSIONS in backend/src/config/permissions.ts (the server rejects anything else).
 * Account, role, session and security management are Super-Admin-only and never listed here.
 */
export interface PermissionInfo {
  label: string;
  description: string;
}

export const permissionInfo: Record<string, PermissionInfo> = {
  'dashboard.view': { label: 'View dashboard', description: 'See the admin overview and counts.' },

  'members.read': { label: 'View members', description: 'See directory entries (public fields).' },
  'members.read.private': { label: 'View private details', description: 'See and edit phone, family size and kul.' },
  'members.create': { label: 'Add members', description: 'Add directory entries.' },
  'members.update': { label: 'Edit members', description: 'Change directory entries.' },
  'members.export': { label: 'Export member data', description: 'Download the member list as CSV.' },
  'members.anonymize': { label: 'Anonymise members', description: 'Erase personal details from a directory entry.' },

  'events.read': { label: 'View events', description: 'See events, including drafts.' },
  'events.create': { label: 'Create events', description: 'Add new events as drafts.' },
  'events.update': { label: 'Edit events', description: 'Change event details.' },
  'events.publish': { label: 'Publish events', description: 'Make events public, unpublish or archive them.' },
  'events.delete': { label: 'Delete events', description: 'Remove events.' },

  'announcements.read': { label: 'View announcements', description: 'See announcements, including drafts.' },
  'announcements.create': { label: 'Create announcements', description: 'Write new announcements as drafts.' },
  'announcements.update': { label: 'Edit announcements', description: 'Change announcement text.' },
  'announcements.publish': { label: 'Publish announcements', description: 'Make announcements public or withdraw them.' },
  'announcements.delete': { label: 'Delete announcements', description: 'Remove announcements.' },

  'content.read': { label: 'View site content', description: 'See pages and drafts in the admin panel.' },
  'content.manage': { label: 'Edit site content', description: 'About, history, committee, FAQ, links and footer.' },
  'content.publish': { label: 'Publish site content', description: 'Make content public, reorder or remove it.' },
  'media.upload': { label: 'Upload media', description: 'Add photos and documents to the library.' },

  'contacts.read': { label: 'View contact messages', description: 'Read messages sent through the contact form.' },
  'contacts.assign': { label: 'Assign contact messages', description: 'Take a message or give it to someone.' },
  'contacts.resolve': { label: 'Resolve contact messages', description: 'Mark messages as handled.' },

  'settings.manage': { label: 'Manage site settings', description: 'Organization details and public site options.' },
  'audit.read': { label: 'View audit log', description: 'See who changed what, and when.' },

  'users.reset_password': { label: 'Reset admin passwords', description: 'Set a new password for another admin and email it to them.' },
};

/** Every permission the picker offers, in display order. */
export const SELECTABLE_PERMISSION_KEYS = Object.keys(permissionInfo);

export const permissionLabel = (key: string): string => t(permissionInfo[key]?.label ?? key);

const groups: { id: string; label: string; match: (key: string) => boolean }[] = [
  { id: 'general', label: 'General', match: (k) => k.startsWith('dashboard.') },
  { id: 'members', label: 'Members', match: (k) => k.startsWith('members.') },
  { id: 'events', label: 'Events', match: (k) => k.startsWith('events.') },
  { id: 'announcements', label: 'Announcements', match: (k) => k.startsWith('announcements.') },
  { id: 'content', label: 'Content & media', match: (k) => k.startsWith('content.') || k.startsWith('media.') },
  { id: 'contacts', label: 'Contacts', match: (k) => k.startsWith('contacts.') },
  { id: 'settings', label: 'Settings & audit', match: (k) => /^(settings|audit)\./.test(k) },
  { id: 'users', label: 'Admin accounts', match: (k) => k.startsWith('users.') },
];

export interface PermissionGroup {
  id: string;
  label: string;
  permissions: string[];
}

/** The selectable permissions grouped by area, in a fixed order. */
export function groupPermissions(keys: string[] = SELECTABLE_PERMISSION_KEYS): PermissionGroup[] {
  return groups
    .map((g) => ({ id: g.id, label: g.label, permissions: keys.filter((k) => g.match(k)) }))
    .filter((g) => g.permissions.length > 0);
}
