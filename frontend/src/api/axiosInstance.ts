import axios, { AxiosError } from 'axios';
import { getCsrfToken } from './csrf';

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
const PUBLIC_AUTH_PATHS = ['/auth/login', '/auth/register', '/auth/me', '/auth/forgot-password', '/auth/reset-password'];

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError<ApiErrorBody>(error)) {
      const code = error.response?.data?.error?.code;
      const url = error.config?.url ?? '';
      if (code && SESSION_CODES.has(code) && !PUBLIC_AUTH_PATHS.some((p) => url.startsWith(p))) {
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
    if (!e.response) return 'Cannot reach the server. Check your connection and try again.';
    return e.response.data?.message ?? fallback;
  }
  return fallback;
};

export const getErrorCode = (err: unknown): string | undefined =>
  axios.isAxiosError<ApiErrorBody>(err) ? err.response?.data?.error?.code : undefined;

export const getFieldErrors = (err: unknown): FieldError[] =>
  axios.isAxiosError<ApiErrorBody>(err) ? (err.response?.data?.error?.details ?? []) : [];
