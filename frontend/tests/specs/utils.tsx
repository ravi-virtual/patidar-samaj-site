import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  avatarColor,
  describeAction,
  formatDateTime,
  formatDay,
  formatMonth,
  formatTimeRange,
  fromDateTimeInput,
  initials,
  place,
  toDateTimeInput,
} from '../../src/lib/format';
import { roleLabel } from '../../src/lib/labels';
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
} from '../../src/utils/validation';
import { createStore } from '../../src/store';
import { dismissToast, showToast } from '../../src/store/slices/toastSlice';
import { fetchSiteSettings, settingsReplaced } from '../../src/store/slices/siteSlice';
import { adminLogin, bootstrapAuth, clearLoginError, logout, sessionLost } from '../../src/store/slices/authSlice';
import { getCsrfToken, setCsrfToken } from '../../src/api/csrf';
import { setStoredUserId } from '../../src/api/currentUser';
import * as authApi from '../../src/api/authApi';
import * as siteApi from '../../src/api/siteApi';
import type { PublicSettings } from '../../src/api/types';
import { adminUser, apiError } from '../helpers';

vi.mock('../../src/api/authApi', () => ({
  getUserByIdApi: vi.fn(),
  adminLoginApi: vi.fn(),
  logoutApi: vi.fn(),
  updateUserThemeByIdApi: vi.fn(),
}));
vi.mock('../../src/api/siteApi', () => ({ getSettingsApi: vi.fn() }));

const auth = vi.mocked(authApi);
const site = vi.mocked(siteApi);

beforeEach(() => {
  vi.resetAllMocks();
  setCsrfToken(null);
});

describe('format helpers', () => {
  it('shows times in India Standard Time whatever the device zone', () => {
    // 13:00 UTC is 18:30 IST
    expect(formatDateTime('2030-10-01T13:00:00.000Z')).toMatch(/^1 Oct 2030, 6:30 pm IST$/i);
    expect(formatTimeRange('2030-10-01T13:00:00.000Z', null)).toMatch(/^6:30 pm IST$/i);
    expect(formatTimeRange('2030-10-01T13:00:00.000Z', '2030-10-01T15:30:00.000Z')).toMatch(/^6:30 pm – 9:00 pm IST$/i);
  });

  it('uses the IST calendar day, which can differ from the UTC day', () => {
    // 20:00 UTC on 31 Dec is already 1 Jan in India
    expect(formatDay('2030-12-31T20:00:00.000Z')).toBe('1');
    expect(formatMonth('2030-12-31T20:00:00.000Z')).toBe('JAN');
  });

  it('converts datetime-local input as IST and back without drifting', () => {
    expect(fromDateTimeInput('2030-10-01T18:30')).toBe('2030-10-01T13:00:00.000Z');
    expect(toDateTimeInput('2030-10-01T13:00:00.000Z')).toBe('2030-10-01T18:30');
    expect(toDateTimeInput(fromDateTimeInput('2031-03-05T00:05'))).toBe('2031-03-05T00:05');
  });

  it('treats empty dates as empty', () => {
    expect(fromDateTimeInput('')).toBeNull();
    expect(toDateTimeInput(null)).toBe('');
    expect(toDateTimeInput(undefined)).toBe('');
  });

  it('builds initials from the first two words only', () => {
    expect(initials('asha patel')).toBe('AP');
    expect(initials('  Ravi  Kumar  Patel ')).toBe('RK');
    expect(initials('Madonna')).toBe('M');
    expect(initials('')).toBe('');
  });

  it('gives the same avatar colour to the same name', () => {
    expect(avatarColor('Asha Patel')).toBe(avatarColor('Asha Patel'));
    expect(avatarColor('Asha Patel')).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('joins only the place parts that exist', () => {
    expect(place('Mehsana', null, 'India')).toBe('Mehsana, India');
    expect(place(undefined, '')).toBe('');
  });
});

describe('labels', () => {
  it('describes known audit actions in plain language', () => {
    expect(describeAction('auth.admin_login')).toBe('Signed in');
    expect(describeAction('user.admin_updated')).toBe('Edited an admin');
    expect(describeAction('user.deleted')).toBe('Deleted an admin');
  });

  it('turns unknown action codes into readable text', () => {
    expect(describeAction('foo.bar_baz')).toBe('Foo bar baz');
    expect(describeAction('content.faq.created')).toBe('Created faq');
  });

  it('labels roles and falls back to the raw role', () => {
    expect(roleLabel('superadmin')).toBe('Super Admin');
    expect(roleLabel('custom')).toBe('custom');
  });
});

describe('validation schemas', () => {
  const messages = (r: { error?: { issues: { message: string }[] } }) => r.error?.issues.map((i) => i.message) ?? [];

  it('only requires something in the login fields (the server decides the rest)', () => {
    expect(loginSchema.safeParse({ email: 'x', password: 'y' }).success).toBe(true);
    expect(messages(loginSchema.safeParse({ email: ' ', password: '' }))).toEqual(['Email is required', 'Password is required']);
  });

  it('validates forgot and reset password forms', () => {
    expect(forgotPasswordSchema.safeParse({ email: ' asha@example.test ' }).data?.email).toBe('asha@example.test');
    expect(forgotPasswordSchema.safeParse({ email: 'nope' }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ password: 'Fresh-Start-2026', confirmPassword: 'Fresh-Start-2026' }).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ password: 'Fresh-Start-2026', confirmPassword: 'x' }).success).toBe(false);
  });
});

describe('toastSlice', () => {
  it('adds toasts with unique ids and a default success tone', () => {
    const store = createStore();
    store.dispatch(showToast('Saved'));
    store.dispatch(showToast('Oops', 'error'));
    const [a, b] = store.getState().toast;
    expect(a).toMatchObject({ message: 'Saved', tone: 'success' });
    expect(b).toMatchObject({ message: 'Oops', tone: 'error' });
    expect(a!.id).not.toBe(b!.id);
  });

  it('keeps at most three toasts, dropping the oldest', () => {
    const store = createStore();
    for (const m of ['one', 'two', 'three', 'four']) store.dispatch(showToast(m));
    expect(store.getState().toast.map((t) => t.message)).toEqual(['two', 'three', 'four']);
  });

  it('dismisses one toast by id', () => {
    const store = createStore();
    store.dispatch(showToast('one'));
    store.dispatch(showToast('two'));
    store.dispatch(dismissToast(store.getState().toast[0]!.id));
    expect(store.getState().toast.map((t) => t.message)).toEqual(['two']);
  });
});

describe('siteSlice', () => {
  const settings = { name: 'Samaj', shortName: 'S' } as PublicSettings;

  it('starts idle and moves loading -> ready with the settings', async () => {
    site.getSettingsApi.mockResolvedValue(settings);
    const store = createStore();
    expect(store.getState().site.status).toBe('idle');
    const pending = store.dispatch(fetchSiteSettings());
    expect(store.getState().site.status).toBe('loading');
    await pending;
    expect(store.getState().site).toMatchObject({ status: 'ready', settings, error: null });
  });

  it('records a user-safe error when loading fails', async () => {
    site.getSettingsApi.mockRejectedValue(apiError(500, 'Server exploded'));
    const store = createStore();
    await store.dispatch(fetchSiteSettings());
    expect(store.getState().site).toMatchObject({ status: 'failed', settings: null, error: 'Server exploded' });
  });

  it('lets an admin save replace the settings immediately', () => {
    const store = createStore();
    store.dispatch(settingsReplaced(settings));
    expect(store.getState().site).toMatchObject({ status: 'ready', settings });
  });
});

describe('authSlice', () => {
  it('bootstraps to signed-out (not an error) when the session lookup answers 401', async () => {
    setStoredUserId('u1');
    auth.getUserByIdApi.mockRejectedValue(apiError(401, 'Not authenticated', 'UNAUTHORIZED'));
    const store = createStore();
    expect(store.getState().auth.bootstrapped).toBe(false);
    await store.dispatch(bootstrapAuth());
    expect(store.getState().auth).toMatchObject({ user: null, bootstrapped: true });
  });

  it('stays signed out without calling the API when no user id is remembered', async () => {
    const store = createStore();
    await store.dispatch(bootstrapAuth());
    expect(auth.getUserByIdApi).not.toHaveBeenCalled();
    expect(store.getState().auth).toMatchObject({ user: null, bootstrapped: true });
  });

  it('restores the user and CSRF token on bootstrap', async () => {
    setStoredUserId('u1');
    auth.getUserByIdApi.mockResolvedValue({ user: adminUser, csrfToken: 'abc' });
    const store = createStore();
    await store.dispatch(bootstrapAuth());
    expect(store.getState().auth.user?.id).toBe('u1');
    expect(getCsrfToken()).toBe('abc');
  });

  it('keeps the server error message and code when sign-in fails, and clears them', async () => {
    auth.adminLoginApi.mockRejectedValue(apiError(403, 'This account has been suspended.', 'ACCOUNT_NOT_ACTIVE'));
    const store = createStore();
    await store.dispatch(adminLogin({ email: 'a@b.test', password: 'x' }));
    expect(store.getState().auth).toMatchObject({
      user: null,
      loginStatus: 'failed',
      loginError: 'This account has been suspended.',
      loginErrorCode: 'ACCOUNT_NOT_ACTIVE',
    });
    store.dispatch(clearLoginError());
    expect(store.getState().auth).toMatchObject({ loginStatus: 'idle', loginError: null, loginErrorCode: null });
  });

  it('signs out locally even when the logout request fails', async () => {
    auth.adminLoginApi.mockResolvedValue({ user: adminUser, csrfToken: 'abc' });
    auth.logoutApi.mockRejectedValue(new Error('offline'));
    const store = createStore();
    await store.dispatch(adminLogin({ email: 'a@b.test', password: 'x' }));
    await store.dispatch(logout());
    expect(store.getState().auth.user).toBeNull();
    expect(getCsrfToken()).toBeNull();
  });

  it('drops the user and CSRF token when the server ends the session', async () => {
    auth.adminLoginApi.mockResolvedValue({ user: adminUser, csrfToken: 'abc' });
    const store = createStore();
    await store.dispatch(adminLogin({ email: 'a@b.test', password: 'x' }));
    store.dispatch(sessionLost());
    expect(store.getState().auth.user).toBeNull();
    expect(getCsrfToken()).toBeNull();
  });
});
