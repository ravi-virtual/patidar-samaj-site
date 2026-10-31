import { api } from './axiosInstance';
import type { ThemePreference } from '../utils/theme';

export type Role = 'superadmin' | 'admin';
export type AccountStatus = 'active' | 'suspended';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: AccountStatus;
  themePreference: ThemePreference;
  permissions: string[];
  createdAt?: string;
  lastLoginAt: string | null;
}

interface SessionPayload {
  user: SessionUser;
  csrfToken: string;
}

export const meApi = async (): Promise<SessionPayload> => {
  const { data } = await api.get<{ data: SessionPayload }>('/auth/me');
  return data.data;
};

export const adminLoginApi = async (body: { email: string; password: string }): Promise<SessionPayload> => {
  const { data } = await api.post<{ data: SessionPayload }>('/auth/admin-login', body);
  return data.data;
};

export const logoutApi = async (): Promise<void> => {
  await api.post('/auth/logout');
};

export const updateThemeApi = async (themePreference: ThemePreference): Promise<void> => {
  await api.patch('/auth/me/theme', { themePreference });
};

export const forgotPasswordApi = async (email: string): Promise<string> => {
  const { data } = await api.post<{ message: string }>('/auth/forgot-password', { email });
  return data.message;
};

export const resetPasswordApi = async (body: {
  token: string;
  password: string;
  confirmPassword: string;
}): Promise<string> => {
  const { data } = await api.post<{ message: string }>('/auth/reset-password', body);
  return data.message;
};
