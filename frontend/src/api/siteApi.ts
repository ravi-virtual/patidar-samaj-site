import { api } from './axiosInstance';
import type {
  AnnouncementItem,
  CommitteeMember,
  CommitteeTerm,
  ContentBlock,
  DirectoryEntry,
  EventItem,
  Faq,
  HomeData,
  ImportantLink,
  PublicSettings,
  SearchResults,
} from './types';

type Envelope<T> = { data: T };

/** Where a stored image or document is served from (the API checks visibility on every request). */
export const mediaUrl = (id: string | null | undefined): string | null => (id ? `/api/media/${id}` : null);

export const getSettingsApi = async (): Promise<PublicSettings> => {
  const { data } = await api.get<Envelope<{ settings: PublicSettings }>>('/public/settings');
  return data.data.settings;
};

export const getHomeApi = async (): Promise<HomeData> => {
  const { data } = await api.get<Envelope<HomeData>>('/public/home');
  return data.data;
};

export const getBlocksApi = async (): Promise<Record<string, ContentBlock>> => {
  const { data } = await api.get<Envelope<{ blocks: Record<string, ContentBlock> }>>('/content/blocks');
  return data.data.blocks;
};

export const getFaqsApi = async (): Promise<Faq[]> => {
  const { data } = await api.get<Envelope<{ items: Faq[] }>>('/content/faqs');
  return data.data.items;
};

export const getLinksApi = async (): Promise<ImportantLink[]> => {
  const { data } = await api.get<Envelope<{ items: ImportantLink[] }>>('/content/links');
  return data.data.items;
};

export interface CommitteeData {
  terms: CommitteeTerm[];
  term: CommitteeTerm | null;
  members: CommitteeMember[];
}

export const getCommitteeApi = async (termId?: string): Promise<CommitteeData> => {
  const { data } = await api.get<Envelope<CommitteeData>>('/content/committee', {
    params: termId ? { termId } : undefined,
  });
  return data.data;
};

export const listEventsApi = async (params: {
  when: 'upcoming' | 'past';
  category?: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<{ events: EventItem[]; totalCount: number }> => {
  const { data } = await api.get<Envelope<{ events: EventItem[]; totalCount: number }>>('/events', { params });
  return data.data;
};

export const getEventApi = async (id: string): Promise<EventItem> => {
  const { data } = await api.get<Envelope<{ event: EventItem }>>(`/events/${id}`);
  return data.data.event;
};

export const listAnnouncementsApi = async (params: {
  category?: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<{ announcements: AnnouncementItem[]; totalCount: number }> => {
  const { data } = await api.get<Envelope<{ announcements: AnnouncementItem[]; totalCount: number }>>(
    '/announcements',
    { params },
  );
  return data.data;
};

export const getAnnouncementApi = async (id: string): Promise<AnnouncementItem> => {
  const { data } = await api.get<Envelope<{ announcement: AnnouncementItem }>>(`/announcements/${id}`);
  return data.data.announcement;
};

export const listMembersApi = async (params: {
  search?: string;
  village?: string;
  city?: string;
  sort?: string;
  page?: number;
  limit?: number;
}): Promise<{ members: DirectoryEntry[]; totalCount: number }> => {
  const { data } = await api.get<Envelope<{ members: DirectoryEntry[]; totalCount: number }>>('/members', { params });
  return data.data;
};

export const getMemberFiltersApi = async (): Promise<{ villages: string[]; cities: string[] }> => {
  const { data } = await api.get<Envelope<{ villages: string[]; cities: string[] }>>('/members/filters');
  return data.data;
};

export const getMemberApi = async (id: string): Promise<DirectoryEntry> => {
  const { data } = await api.get<Envelope<{ member: DirectoryEntry }>>(`/members/${id}`);
  return data.data.member;
};

export const searchApi = async (q: string): Promise<{ results: SearchResults; totalCount: number }> => {
  const { data } = await api.get<Envelope<{ results: SearchResults; totalCount: number }>>('/search', {
    params: { q },
  });
  return data.data;
};

export interface ContactInput {
  name: string;
  email: string;
  topic: string;
  message: string;
  /** Honeypot: real visitors never see or fill this. */
  website?: string;
}

export const submitContactApi = async (body: ContactInput): Promise<string> => {
  const { data } = await api.post<{ message: string }>('/contact', body);
  return data.message;
};
