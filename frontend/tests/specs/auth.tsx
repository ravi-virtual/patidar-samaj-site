import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useRoutes } from 'react-router-dom';
import { Provider } from 'react-redux';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { createStore } from '../../src/store';
import { routes } from '../../src/routes';
import { RequireAuth, RequirePermission } from '../../src/routes/guards';
import { bootstrapAuth, login } from '../../src/store/slices/authSlice';
import { changeTheme } from '../../src/store/slices/themeSlice';
import { HeaderActions } from '../../src/components/layout/HeaderActions';
import * as authApi from '../../src/api/authApi';
import { api } from '../../src/api/axiosInstance';
import { getCsrfToken, setCsrfToken } from '../../src/api/csrf';
import type { SessionUser } from '../../src/api/authApi';

vi.mock('../../src/api/authApi', () => ({
  meApi: vi.fn(),
  loginApi: vi.fn(),
  registerApi: vi.fn(),
  logoutApi: vi.fn(),
  updateThemeApi: vi.fn(),
  forgotPasswordApi: vi.fn(),
  resetPasswordApi: vi.fn(),
}));

const mocked = vi.mocked(authApi);

const member: SessionUser = {
  id: 'u1',
  name: 'Asha Patel',
  email: 'asha@example.test',
  phone: null,
  role: 'member',
  status: 'active',
  themePreference: 'system',
  permissions: ['members.read', 'events.rsvp'],
  lastLoginAt: null,
};

const apiError = (status: number, message: string, code: string, details: { field?: string; message: string }[] = []) => {
  const error = new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    statusText: '',
    headers: {},
    config: { headers: {} } as InternalAxiosRequestConfig,
    data: { success: false, message, error: { code, details } },
  });
  return error;
};

function TestApp() {
  return useRoutes(routes);
}

// Mirrors App: the session check has finished before guarded pages decide what to show.
const renderApp = async (path: string, store = createStore()) => {
  await store.dispatch(bootstrapAuth());
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[path]}>
        <TestApp />
      </MemoryRouter>
    </Provider>,
  );
  return store;
};

beforeEach(() => {
  vi.resetAllMocks();
  setCsrfToken(null);
  mocked.meApi.mockRejectedValue(apiError(401, 'Not authenticated', 'UNAUTHORIZED'));
});

describe('login page', () => {
  it('shows field errors without calling the API when the form is empty', async () => {
    const user = userEvent.setup();
    await renderApp('/login');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(mocked.loginApi).not.toHaveBeenCalled();
  });

  it('labels every field and marks required ones', async () => {
    await renderApp('/login');
    expect(screen.getByLabelText(/email/i)).toBeRequired();
    expect(screen.getByLabelText(/^password/i)).toBeRequired();
  });

  it('signs in, stores the CSRF token in memory only, and leaves the login page', async () => {
    mocked.loginApi.mockResolvedValue({ user: member, csrfToken: 'csrf-123' });
    const user = userEvent.setup();
    const store = createStore();
    await renderApp('/login', store);

    await user.type(screen.getByLabelText(/email/i), 'asha@example.test');
    await user.type(screen.getByLabelText(/^password/i), 'Correct-Horse-9');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(store.getState().auth.user?.id).toBe('u1'));
    expect(getCsrfToken()).toBe('csrf-123');
    expect(window.localStorage.getItem('csrf')).toBeNull();
    expect(JSON.stringify(window.localStorage)).not.toMatch(/csrf-123|token|session/i);
    await waitFor(() => expect(screen.queryByRole('heading', { name: /sign in to patidar samaj/i })).not.toBeInTheDocument());
  });

  it('shows the server’s generic error for bad credentials', async () => {
    mocked.loginApi.mockRejectedValue(apiError(401, 'Invalid email or password', 'UNAUTHORIZED'));
    const user = userEvent.setup();
    await renderApp('/login');
    await user.type(screen.getByLabelText(/email/i), 'asha@example.test');
    await user.type(screen.getByLabelText(/^password/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
  });

  it('explains a pending account instead of calling it a wrong password', async () => {
    mocked.loginApi.mockRejectedValue(
      apiError(403, 'Your registration is awaiting approval by the Samaj office.', 'ACCOUNT_NOT_ACTIVE'),
    );
    const user = userEvent.setup();
    await renderApp('/login');
    await user.type(screen.getByLabelText(/email/i), 'asha@example.test');
    await user.type(screen.getByLabelText(/^password/i), 'Correct-Horse-9');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText(/awaiting approval/i)).toBeInTheDocument();
  });

  it('toggles password visibility with an accessible button', async () => {
    const user = userEvent.setup();
    await renderApp('/login');
    const input = screen.getByLabelText(/^password/i);
    expect(input).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: /show password/i }));
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: /hide password/i })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('registration page', () => {
  const fill = async (user: ReturnType<typeof userEvent.setup>, over: Partial<Record<string, string>> = {}) => {
    await user.type(screen.getByLabelText(/full name/i), over.name ?? 'Asha Patel');
    await user.type(screen.getByLabelText(/^email/i), over.email ?? 'asha@example.test');
    await user.type(screen.getByLabelText(/^password/i), over.password ?? 'Correct-Horse-9');
    await user.type(screen.getByLabelText(/confirm password/i), over.confirm ?? 'Correct-Horse-9');
  };

  it('validates password strength, confirmation and acknowledgement before submitting', async () => {
    const user = userEvent.setup();
    await renderApp('/register');
    await fill(user, { password: 'short', confirm: 'different' });
    await user.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByText(/at least 10 characters/i)).toBeInTheDocument();
    expect(screen.getByText('You must confirm to continue')).toBeInTheDocument();
    expect(mocked.registerApi).not.toHaveBeenCalled();
  });

  it('shows a pending-approval confirmation after a successful registration', async () => {
    mocked.registerApi.mockResolvedValue('Registration received. The Samaj office will review it.');
    const user = userEvent.setup();
    await renderApp('/register');
    await fill(user);
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByRole('heading', { name: /registration received/i })).toBeInTheDocument();
    expect(screen.getByText(/pending approval/i)).toBeInTheDocument();
    // The request carries no role or status — only what the form collects.
    const sent = mocked.registerApi.mock.calls[0]![0];
    expect(Object.keys(sent).sort()).toEqual(['acknowledge', 'confirmPassword', 'email', 'name', 'password', 'phone'].filter((k) => k in sent).sort());
    expect(sent).not.toHaveProperty('role');
  });

  it('puts server-side field errors next to the field', async () => {
    mocked.registerApi.mockRejectedValue(
      apiError(409, 'An account with this email already exists. Try signing in instead.', 'DUPLICATE_ERROR'),
    );
    const user = userEvent.setup();
    await renderApp('/register');
    await fill(user);
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/already exists/i);
  });
});

describe('route guards (convenience only — the API enforces access)', () => {
  const Secret = () => <p>secret content</p>;
  const guarded = (el: React.ReactNode) => (
    <Routes>
      <Route path="/login" element={<p>login screen</p>} />
      <Route path="/private" element={el} />
    </Routes>
  );

  it('sends visitors to the login page', async () => {
    const store = createStore();
    await store.dispatch(bootstrapAuth());
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/private']}>{guarded(<RequireAuth><Secret /></RequireAuth>)}</MemoryRouter>
      </Provider>,
    );
    expect(screen.getByText('login screen')).toBeInTheDocument();
    expect(screen.queryByText('secret content')).not.toBeInTheDocument();
  });

  it('shows a skeleton, not a redirect flash, until the session check finishes', () => {
    render(
      <Provider store={createStore()}>
        <MemoryRouter initialEntries={['/private']}>{guarded(<RequireAuth><Secret /></RequireAuth>)}</MemoryRouter>
      </Provider>,
    );
    expect(screen.queryByText('login screen')).not.toBeInTheDocument();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('lets a signed-in user through and blocks missing permissions', async () => {
    mocked.meApi.mockResolvedValue({ user: member, csrfToken: 'c' });
    const store = createStore();
    await store.dispatch(bootstrapAuth());
    const { unmount } = render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/private']}>
          {guarded(<RequirePermission permissions={['events.rsvp']}><Secret /></RequirePermission>)}
        </MemoryRouter>
      </Provider>,
    );
    expect(screen.getByText('secret content')).toBeInTheDocument();
    unmount();

    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/private']}>
          {guarded(<RequirePermission permissions={['users.manage']}><Secret /></RequirePermission>)}
        </MemoryRouter>
      </Provider>,
    );
    expect(screen.queryByText('secret content')).not.toBeInTheDocument();
    expect(screen.getByText(/don’t have access/i)).toBeInTheDocument();
  });
});

describe('header actions per authentication state', () => {
  it('offers Join and Log in to visitors', async () => {
    const store = createStore();
    await store.dispatch(bootstrapAuth());
    render(
      <Provider store={store}>
        <MemoryRouter>
          <HeaderActions />
        </MemoryRouter>
      </Provider>,
    );
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Join' })).toHaveAttribute('href', '/register');
    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument();
  });

  it('shows the name and a working Sign out to signed-in users', async () => {
    mocked.meApi.mockResolvedValue({ user: member, csrfToken: 'c' });
    mocked.logoutApi.mockResolvedValue();
    const user = userEvent.setup();
    const store = createStore();
    await store.dispatch(bootstrapAuth());
    render(
      <Provider store={store}>
        <MemoryRouter>
          <HeaderActions />
        </MemoryRouter>
      </Provider>,
    );
    expect(screen.getByText('Asha Patel')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /sign out/i }));
    await waitFor(() => expect(store.getState().auth.user).toBeNull());
    expect(mocked.logoutApi).toHaveBeenCalled();
    expect(getCsrfToken()).toBeNull();
  });
});

describe('theme and account', () => {
  it('uses the saved account preference instead of the device preference after login', async () => {
    window.localStorage.setItem('samaj.theme', 'light'); // this device was on Light
    mocked.loginApi.mockResolvedValue({ user: { ...member, themePreference: 'dark' }, csrfToken: 'c' });
    const store = createStore();
    await store.dispatch(login({ email: 'asha@example.test', password: 'x' }));
    expect(store.getState().theme.preference).toBe('dark');
    expect(window.localStorage.getItem('samaj.theme')).toBe('dark');
  });

  it('falls back to following the system when the account has no explicit choice', async () => {
    window.__prefersDark = true;
    mocked.meApi.mockResolvedValue({ user: { ...member, themePreference: 'system' }, csrfToken: 'c' });
    const store = createStore();
    await store.dispatch(bootstrapAuth());
    expect(store.getState().theme.preference).toBe('system');
    expect(store.getState().theme.resolved).toBe('dark');
  });

  it('saves the choice to the account only when signed in', async () => {
    mocked.updateThemeApi.mockResolvedValue();
    const visitor = createStore();
    await visitor.dispatch(changeTheme('dark'));
    expect(mocked.updateThemeApi).not.toHaveBeenCalled();
    expect(visitor.getState().theme.preference).toBe('dark');

    mocked.meApi.mockResolvedValue({ user: member, csrfToken: 'c' });
    const signedIn = createStore();
    await signedIn.dispatch(bootstrapAuth());
    await signedIn.dispatch(changeTheme('light'));
    expect(mocked.updateThemeApi).toHaveBeenCalledWith('light');
  });

  it('keeps the local choice when saving to the account fails', async () => {
    mocked.meApi.mockResolvedValue({ user: member, csrfToken: 'c' });
    mocked.updateThemeApi.mockRejectedValue(new Error('offline'));
    const store = createStore();
    await store.dispatch(bootstrapAuth());
    await store.dispatch(changeTheme('dark'));
    expect(store.getState().theme.preference).toBe('dark');
  });
});

describe('CSRF header', () => {
  const capture = async (method: 'get' | 'post' | 'patch' | 'delete') => {
    let seen: InternalAxiosRequestConfig | undefined;
    const original = api.defaults.adapter;
    api.defaults.adapter = async (config) => {
      seen = config;
      return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
    };
    await api[method]('/anything');
    api.defaults.adapter = original;
    return seen!;
  };

  it('is sent on state-changing requests but not on reads', async () => {
    setCsrfToken('token-abc');
    expect((await capture('post')).headers.get('X-CSRF-Token')).toBe('token-abc');
    expect((await capture('patch')).headers.get('X-CSRF-Token')).toBe('token-abc');
    expect((await capture('delete')).headers.get('X-CSRF-Token')).toBe('token-abc');
    expect((await capture('get')).headers.get('X-CSRF-Token')).toBeFalsy();
  });

  it('is omitted while signed out', async () => {
    setCsrfToken(null);
    expect((await capture('post')).headers.get('X-CSRF-Token')).toBeFalsy();
  });
});

describe('password reset page', () => {
  it('asks for a link when opened without a token', async () => {
    await renderApp('/reset-password');
    expect(screen.getByRole('heading', { name: /reset link needed/i })).toBeInTheDocument();
  });

  it('shows the form for a link with a token and submits it once', async () => {
    mocked.resetPasswordApi.mockResolvedValue('Password updated. You can now sign in.');
    const user = userEvent.setup();
    await renderApp('/reset-password?token=abcdefghijklmnopqrstuvwxyz0123456789');
    await user.type(screen.getByLabelText(/^new password/i), 'Fresh-Start-2026');
    await user.type(screen.getByLabelText(/confirm new password/i), 'Fresh-Start-2026');
    await user.click(screen.getByRole('button', { name: /update password/i }));
    expect(await screen.findByRole('heading', { name: /password updated/i })).toBeInTheDocument();
    expect(mocked.resetPasswordApi).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'abcdefghijklmnopqrstuvwxyz0123456789' }),
    );
  });
});
