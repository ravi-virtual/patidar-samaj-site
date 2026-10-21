import { api } from './axiosInstance';
import { setCsrfToken } from './csrf';
import type { EventItem } from './types';

type Envelope<T> = { data: T };

export interface OwnProfile {
  id: string;
  name: string;
  village: string | null;
  city: string | null;
  country: string | null;
  occupation: string | null;
  bio: string | null;
  joinedYear: number | null;
  highlighted: boolean;
  familySize: number | null;
  kul: string | null;
  phone: string | null;
  visibility: 'hidden' | 'members' | 'public';
  membershipStatus: 'pending' | 'active' | 'inactive';
}

export interface ProfileInput {
  village?: string;
  city?: string;
  country?: string;
  occupation?: string;
  kul?: string;
  bio?: string;
  familySize?: number | null;
  phone?: string;
  visibility?: OwnProfile['visibility'];
}

export interface MyRegistration {
  id: string;
  attendees: number;
  registeredAt: string;
  upcoming: boolean;
  event: EventItem;
}

export interface MySession {
  id: string;
  userAgent: string | null;
  lastSeenAt: string;
  createdAt: string;
  current: boolean;
}

export const getMyProfileApi = async (): Promise<OwnProfile | null> => {
  const { data } = await api.get<Envelope<{ profile: OwnProfile | null }>>('/members/me');
  return data.data.profile;
};

export const updateMyProfileApi = async (body: ProfileInput): Promise<OwnProfile> => {
  const { data } = await api.patch<Envelope<{ profile: OwnProfile }>>('/members/me', body);
  return data.data.profile;
};

export const listMyRegistrationsApi = async (): Promise<MyRegistration[]> => {
  const { data } = await api.get<Envelope<{ registrations: MyRegistration[] }>>('/members/me/registrations');
  return data.data.registrations;
};

export const listMySessionsApi = async (): Promise<MySession[]> => {
  const { data } = await api.get<Envelope<{ sessions: MySession[] }>>('/auth/sessions');
  return data.data.sessions;
};

export const revokeMySessionApi = async (id: string): Promise<void> => {
  await api.delete(`/auth/sessions/${id}`);
};

export const changePasswordApi = async (body: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<string> => {
  const { data } = await api.post<{ message: string; data: { csrfToken: string } }>('/auth/change-password', body);
  // The server starts a fresh session on password change, so the CSRF token changes with it.
  setCsrfToken(data.data.csrfToken);
  return data.message;
};
