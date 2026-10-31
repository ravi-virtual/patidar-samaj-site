import axios, { AxiosError } from 'axios';
import { getCsrfToken } from './csrf';
import { getLanguage, t } from '../i18n';

/**
 * Single Axios instance for the whole app (mern-stack-project skill: all API calls live in src/api).
 * Auth uses HTTP-only session cookies, so credentials are sent but no token is ever stored in JS.
 * State-changing requests carry the per-session CSRF token from memory.
 */
export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

const UNSAFE = new Set(['post', 'put', 'patch', 'delete']);

api.interceptors.request.use((config) => {
  config.headers.set('Accept-Language', getLanguage());
  const token = getCsrfToken();
  if (token && UNSAFE.has((config.method ?? 'get').toLowerCase())) {
    config.headers.set('X-CSRF-Token', token);
  }
  return config;
});

// When a signed-in session dies mid-use (expired, revoked, suspended) the app is told once,
// so it can return the visitor to a signed-out state instead of failing every call.
type UnauthorizedHandler = () => void;
let onSessionLost: UnauthorizedHandler | null = null;
export const setSessionLostHandler = (handler: UnauthorizedHandler | null): void => {
  onSessionLost = handler;
};

const SESSION_CODES = new Set(['SESSION_EXPIRED', 'INVALID_SESSION', 'ACCOUNT_NOT_ACTIVE']);
const PUBLIC_AUTH_PATHS = ['/auth/admin-login', '/auth/forgot-password', '/auth/reset-password'];
// GET /auth/:id is the session bootstrap, so a dead session there just means "signed out".
const isBootstrapUrl = (url: string): boolean => /^\/auth\/[0-9a-f-]{36}$/i.test(url);

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError<ApiErrorBody>(error)) {
      const code = error.response?.data?.error?.code;
      const url = error.config?.url ?? '';
      if (code && SESSION_CODES.has(code) && !PUBLIC_AUTH_PATHS.some((p) => url.startsWith(p)) && !isBootstrapUrl(url)) {
        onSessionLost?.();
      }
    }
    return Promise.reject(error);
  },
);

export interface FieldError {
  field?: string;
  message: string;
}

export interface ApiErrorBody {
  message?: string;
  error?: { code?: string; details?: FieldError[] };
}

/** Turns any failed request into a short, user-safe message. */
export const getErrorMessage = (err: unknown, fallback = 'Something went wrong'): string => {
  if (axios.isAxiosError<ApiErrorBody>(err)) {
    const e = err as AxiosError<ApiErrorBody>;
    if (!e.response) return t('Cannot reach the server. Check your connection and try again.');
    return e.response.data?.message ?? t(fallback);
  }
  return t(fallback);
};

export const getErrorCode = (err: unknown): string | undefined =>
  axios.isAxiosError<ApiErrorBody>(err) ? err.response?.data?.error?.code : undefined;

export const getFieldErrors = (err: unknown): FieldError[] =>
  axios.isAxiosError<ApiErrorBody>(err) ? (err.response?.data?.error?.details ?? []) : [];
