import { api } from './axiosInstance';
import type { Role, AccountStatus } from './authApi';
import type { RegistrationState } from './types';

type Envelope<T> = { data: T };
type Params = Record<string, string | number | boolean | undefined>;

/** Query parameters that are empty are left out, so filters read naturally in the calling code. */
const clean = (params?: Params): Params | undefined =>
  params && Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''));

// ─── Dashboard, audit, settings ──────────────────────────────────────────────

export interface DashboardStats {
  totalMembers?: number;
  pendingRegistrations?: number;
  upcomingEvents?: number;
  eventRsvps?: number;
  publishedAnnouncements?: number;
  unreadContactMessages?: number;
  recentActivity?: { action: string; actor: string; at: string }[];
}

export const getDashboardApi = async (): Promise<DashboardStats> => {
  const { data } = await api.get<Envelope<{ stats: DashboardStats }>>('/admin/dashboard');
  return data.data.stats;
};

export interface AuditEntry {
  id: string;
  action: string;
  outcome: 'success' | 'failure';
  actor: { id: string; name: string; role: string | null } | null;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

export const listAuditApi = async (params: Params) => {
  const { data } = await api.get<Envelope<{ entries: AuditEntry[]; totalCount: number }>>('/admin/audit', {
    params: clean(params),
  });
  return data.data;
};

export interface AdminSettings {
  name: string;
  shortName: string;
  invocation: string;
  tagline: string;
  logoUrl?: string | null;
  contact: { email: string; phone: string; address: string; officeHours: string };
  socialLinks: { label: string; url: string }[];
  footerNote: string;
  registrationOpen: boolean;
  directoryPublic: boolean;
  themeDefault: 'system' | 'light' | 'dark';
}

export const getAdminSettingsApi = async (): Promise<AdminSettings> => {
  const { data } = await api.get<Envelope<{ settings: AdminSettings }>>('/admin/settings');
  return data.data.settings;
};

export const updateAdminSettingsApi = async (body: Partial<AdminSettings>): Promise<AdminSettings> => {
  const { data } = await api.patch<Envelope<{ settings: AdminSettings }>>('/admin/settings', body);
  return data.data.settings;
};

// ─── Events ──────────────────────────────────────────────────────────────────

export type EventStatus = 'draft' | 'published' | 'cancelled' | 'archived';

export interface AdminEvent {
  id: string;
  title: string;
  category: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  venue: string;
  status: EventStatus;
  capacity: number;
  registeredCount: number;
  spotsLeft: number | null;
  registrationOpensAt: string | null;
  registrationClosesAt: string;
  registrationState: RegistrationState;
  featured: boolean;
  imageMediaId: string | null;
  cancellationReason: string | null;
  publishedAt: string | null;
  updatedAt: string;
}

export interface EventInput {
  title?: string;
  category?: string;
  description?: string;
  venue?: string;
  startsAt?: string;
  endsAt?: string | null;
  registrationOpensAt?: string | null;
  registrationClosesAt?: string | null;
  capacity?: number;
  featured?: boolean;
  imageMediaId?: string | null;
}

export const listAdminEventsApi = async (params: Params) => {
  const { data } = await api.get<Envelope<{ events: AdminEvent[]; totalCount: number }>>('/admin/events', {
    params: clean(params),
  });
  return data.data;
};

export const createEventApi = async (body: EventInput): Promise<AdminEvent> => {
  const { data } = await api.post<Envelope<{ event: AdminEvent }>>('/admin/events', body);
  return data.data.event;
};

export const updateEventApi = async (id: string, body: EventInput): Promise<AdminEvent> => {
  const { data } = await api.patch<Envelope<{ event: AdminEvent }>>(`/admin/events/${id}`, body);
  return data.data.event;
};

export const eventActionApi = async (
  id: string,
  action: 'publish' | 'unpublish' | 'archive' | 'cancel',
  body?: { reason?: string },
): Promise<AdminEvent> => {
  const { data } = await api.post<Envelope<{ event: AdminEvent }>>(`/admin/events/${id}/${action}`, body ?? {});
  return data.data.event;
};

export const deleteEventApi = async (id: string): Promise<void> => {
  await api.delete(`/admin/events/${id}`);
};

export interface AdminRegistration {
  id: string;
  userId: string;
  name: string;
  email: string | null;
  attendees: number;
  status: 'confirmed' | 'cancelled';
  registeredAt: string;
  cancelledAt: string | null;
}

export const listRegistrationsApi = async (eventId: string, params: Params) => {
  const { data } = await api.get<Envelope<{ registrations: AdminRegistration[]; totalCount: number }>>(
    `/admin/events/${eventId}/registrations`,
    { params: clean(params) },
  );
  return data.data;
};

export const removeRegistrationApi = async (eventId: string, registrationId: string): Promise<void> => {
  await api.delete(`/admin/events/${eventId}/registrations/${registrationId}`);
};

/** Downloads a CSV through the authenticated API and hands it to the browser as a file. */
export const downloadCsv = async (path: string, params: Params | undefined, filename: string): Promise<void> => {
  const { data } = await api.get<Blob>(path, { params: clean(params), responseType: 'blob' });
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

// ─── Announcements ───────────────────────────────────────────────────────────

export type PublishStatus = 'draft' | 'published' | 'archived';

export interface AdminAnnouncement {
  id: string;
  title: string;
  summary: string | null;
  body: string;
  category: string;
  status: PublishStatus;
  pinned: boolean;
  order: number;
  featured: boolean;
  publishAt: string | null;
  publishedAt: string | null;
  scheduled: boolean;
  updatedAt: string;
}

export interface AnnouncementInput {
  title?: string;
  summary?: string;
  body?: string;
  category?: string;
  featured?: boolean;
  publishAt?: string | null;
}

export const listAdminAnnouncementsApi = async (params: Params) => {
  const { data } = await api.get<Envelope<{ announcements: AdminAnnouncement[]; totalCount: number }>>(
    '/admin/announcements',
    { params: clean(params) },
  );
  return data.data;
};

export const createAnnouncementApi = async (body: AnnouncementInput): Promise<AdminAnnouncement> => {
  const { data } = await api.post<Envelope<{ announcement: AdminAnnouncement }>>('/admin/announcements', body);
  return data.data.announcement;
};

export const updateAnnouncementApi = async (id: string, body: AnnouncementInput): Promise<AdminAnnouncement> => {
  const { data } = await api.patch<Envelope<{ announcement: AdminAnnouncement }>>(`/admin/announcements/${id}`, body);
  return data.data.announcement;
};

export const announcementActionApi = async (
  id: string,
  action: 'publish' | 'unpublish' | 'archive' | 'pin' | 'unpin',
): Promise<AdminAnnouncement> => {
  const { data } = await api.post<Envelope<{ announcement: AdminAnnouncement }>>(`/admin/announcements/${id}/${action}`, {});
  return data.data.announcement;
};

export const deleteAnnouncementApi = async (id: string): Promise<void> => {
  await api.delete(`/admin/announcements/${id}`);
};

// ─── Users and roles ─────────────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: Role;
  status: AccountStatus;
  extraPermissions: string[];
  createdAt?: string;
  lastLoginAt: string | null;
  approvedAt: string | null;
  suspendedAt: string | null;
}

export const listUsersApi = async (params: Params) => {
  const { data } = await api.get<Envelope<{ users: AdminUser[]; totalCount: number }>>('/users', { params: clean(params) });
  return data.data;
};

export const createStaffApi = async (body: {
  name: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
}): Promise<{ user: AdminUser; setup: { url: string; expiresAt: string } }> => {
  const { data } = await api.post<Envelope<{ user: AdminUser; setup: { url: string; expiresAt: string } }>>('/users', body);
  return data.data;
};

export const userActionApi = async (
  id: string,
  action: 'approve' | 'reject' | 'suspend' | 'reactivate' | 'revoke-sessions',
  body?: { reason?: string },
): Promise<void> => {
  await api.post(`/users/${id}/${action}`, body ?? {});
};

export const changeRoleApi = async (id: string, body: { role: Role; extraPermissions: string[] }): Promise<AdminUser> => {
  const { data } = await api.patch<Envelope<{ user: AdminUser }>>(`/users/${id}/role`, body);
  return data.data.user;
};

export const issueResetLinkApi = async (id: string): Promise<{ url: string; expiresAt: string }> => {
  const { data } = await api.post<Envelope<{ reset: { url: string; expiresAt: string } }>>(`/users/${id}/password-reset`, {});
  return data.data.reset;
};

// ─── Directory (admin view) ──────────────────────────────────────────────────

export interface StaffMember {
  id: string;
  name: string;
  village: string | null;
  city: string | null;
  country: string | null;
  occupation: string | null;
  bio: string | null;
  joinedYear: number | null;
  highlighted: boolean;
  userId: string | null;
  hasAccount: boolean;
  accountStatus: string | null;
  membershipStatus: 'pending' | 'active' | 'inactive';
  visibility: 'hidden' | 'members' | 'public';
  anonymizedAt: string | null;
  phone?: string | null;
  familySize?: number | null;
  kul?: string | null;
}

export interface MemberInput {
  displayName?: string;
  village?: string;
  city?: string;
  country?: string;
  occupation?: string;
  kul?: string;
  bio?: string;
  familySize?: number | null;
  phone?: string;
  joinedYear?: number | null;
  membershipStatus?: 'active' | 'inactive';
  visibility?: 'hidden' | 'members' | 'public';
  highlighted?: boolean;
}

export const listStaffMembersApi = async (params: Params) => {
  const { data } = await api.get<Envelope<{ members: StaffMember[]; totalCount: number }>>('/admin/members', {
    params: clean(params),
  });
  return data.data;
};

export const createMemberApi = async (body: MemberInput): Promise<StaffMember> => {
  const { data } = await api.post<Envelope<{ member: StaffMember }>>('/admin/members', body);
  return data.data.member;
};

export const updateMemberApi = async (id: string, body: MemberInput): Promise<StaffMember> => {
  const { data } = await api.patch<Envelope<{ member: StaffMember }>>(`/admin/members/${id}`, body);
  return data.data.member;
};

export const anonymizeMemberApi = async (id: string): Promise<void> => {
  await api.post(`/admin/members/${id}/anonymize`, {});
};

// ─── Contact inbox ───────────────────────────────────────────────────────────

export type ContactStatus = 'new' | 'in_progress' | 'resolved';

export interface ContactMessage {
  id: string;
  reference: string;
  name: string;
  email: string;
  topic: string;
  status: ContactStatus;
  assignedTo: string | null;
  resolvedAt: string | null;
  createdAt: string;
  preview: string;
  message?: string;
  notes?: { authorId: string; text: string; createdAt: string }[];
}

export const listContactsApi = async (params: Params) => {
  const { data } = await api.get<
    Envelope<{ messages: ContactMessage[]; totalCount: number; counts: Partial<Record<ContactStatus, number>> }>
  >('/admin/contacts', { params: clean(params) });
  return data.data;
};

export const getContactApi = async (id: string): Promise<ContactMessage> => {
  const { data } = await api.get<Envelope<{ message: ContactMessage }>>(`/admin/contacts/${id}`);
  return data.data.message;
};

export const updateContactApi = async (
  id: string,
  body: { status?: ContactStatus; assignedTo?: string | null },
): Promise<ContactMessage> => {
  const { data } = await api.patch<Envelope<{ message: ContactMessage }>>(`/admin/contacts/${id}`, body);
  return data.data.message;
};

export const addContactNoteApi = async (id: string, text: string): Promise<ContactMessage> => {
  const { data } = await api.post<Envelope<{ message: ContactMessage }>>(`/admin/contacts/${id}/notes`, { text });
  return data.data.message;
};

// ─── Content ─────────────────────────────────────────────────────────────────

export type ContentResource = 'faqs' | 'links' | 'milestones' | 'committee-terms' | 'committee-members';

/** One shape for every managed content type; the fields that apply depend on the resource. */
export interface ContentRow {
  id: string;
  status: PublishStatus;
  order: number;
  updatedAt: string;
  // faqs
  question?: string | null;
  answer?: string | null;
  // links
  label?: string | null;
  description?: string | null;
  url?: string | null;
  fileMediaId?: string | null;
  category?: string | null;
  // milestones
  periodLabel?: string | null;
  title?: string | null;
  text?: string | null;
  imageMediaId?: string | null;
  sourceRef?: string | null;
  // committee terms
  startYear?: number | null;
  endYear?: number | null;
  isCurrent?: boolean | null;
  // committee members
  termId?: string | null;
  name?: string | null;
  position?: string | null;
  bio?: string | null;
}

export const listContentApi = async (resource: ContentResource, params?: Params) => {
  const { data } = await api.get<Envelope<{ items: ContentRow[]; totalCount: number }>>(`/admin/content/${resource}`, {
    params: clean(params),
  });
  return data.data;
};

export const saveContentApi = async (
  resource: ContentResource,
  id: string | null,
  body: Record<string, unknown>,
): Promise<ContentRow> => {
  const { data } = id
    ? await api.patch<Envelope<{ item: ContentRow }>>(`/admin/content/${resource}/${id}`, body)
    : await api.post<Envelope<{ item: ContentRow }>>(`/admin/content/${resource}`, body);
  return data.data.item;
};

export const contentActionApi = async (
  resource: ContentResource,
  id: string,
  action: 'publish' | 'unpublish' | 'archive',
): Promise<ContentRow> => {
  const { data } = await api.post<Envelope<{ item: ContentRow }>>(`/admin/content/${resource}/${id}/${action}`, {});
  return data.data.item;
};

export const deleteContentApi = async (resource: ContentResource, id: string): Promise<void> => {
  await api.delete(`/admin/content/${resource}/${id}`);
};

export interface AdminBlock {
  key: string;
  status: PublishStatus | 'empty';
  title?: string | null;
  body?: string | null;
  items?: { title: string | null; text: string | null; value: string | null; label: string | null; imageMediaId: string | null }[];
  updatedAt?: string;
}

export const listBlocksAdminApi = async (): Promise<AdminBlock[]> => {
  const { data } = await api.get<Envelope<{ blocks: AdminBlock[] }>>('/admin/content/blocks');
  return data.data.blocks;
};

export const saveBlockApi = async (
  key: string,
  body: { title?: string; body?: string; items?: Record<string, string>[] },
): Promise<AdminBlock> => {
  const { data } = await api.put<Envelope<{ block: AdminBlock }>>(`/admin/content/blocks/${key}`, body);
  return data.data.block;
};

export const blockActionApi = async (key: string, action: 'publish' | 'unpublish'): Promise<AdminBlock> => {
  const { data } = await api.post<Envelope<{ block: AdminBlock }>>(`/admin/content/blocks/${key}/${action}`, {});
  return data.data.block;
};

// ─── Media ───────────────────────────────────────────────────────────────────

export interface MediaItem {
  id: string;
  url: string;
  name: string;
  mimeType: string;
  size: number;
  kind: 'image' | 'document';
  altText: string | null;
  visibility: 'public' | 'private';
  createdAt: string;
}

export const listMediaApi = async (params: Params) => {
  const { data } = await api.get<Envelope<{ media: MediaItem[]; totalCount: number }>>('/admin/media', {
    params: clean(params),
  });
  return data.data;
};

export const uploadMediaApi = async (file: File, altText?: string): Promise<MediaItem> => {
  const form = new FormData();
  form.append('file', file);
  if (altText) form.append('altText', altText);
  // Let the browser set the multipart boundary.
  const { data } = await api.post<Envelope<{ media: MediaItem }>>('/admin/media', form, {
    headers: { 'Content-Type': undefined },
    timeout: 60_000,
  });
  return data.data.media;
};

export const updateMediaApi = async (
  id: string,
  body: { altText?: string | null; visibility?: 'public' | 'private' },
): Promise<MediaItem> => {
  const { data } = await api.patch<Envelope<{ media: MediaItem }>>(`/admin/media/${id}`, body);
  return data.data.media;
};

export const deleteMediaApi = async (id: string): Promise<void> => {
  await api.delete(`/admin/media/${id}`);
};

// ─── Roles ───────────────────────────────────────────────────────────────────

export interface RoleMatrix {
  roles: { role: Role; permissions: string[] }[];
  permissions: string[];
  grantable: string[];
}

export const getRolesApi = async (): Promise<RoleMatrix> => {
  const { data } = await api.get<Envelope<RoleMatrix>>('/admin/roles');
  return data.data;
};

export const reorderContentApi = async (resource: ContentResource, ids: string[]): Promise<void> => {
  await api.patch(`/admin/content/${resource}/reorder`, { ids });
};
