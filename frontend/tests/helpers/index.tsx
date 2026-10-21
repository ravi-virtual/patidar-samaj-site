import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { createStore } from '../../src/store';
import { login } from '../../src/store/slices/authSlice';
import * as authApi from '../../src/api/authApi';
import type { SessionUser } from '../../src/api/authApi';
import type { EventItem } from '../../src/api/types';

export const memberUser: SessionUser = {
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

/** An Axios error shaped like the API's error envelope. */
export const apiError = (
  status: number,
  message: string,
  code = 'ERROR',
  details: { field?: string; message: string }[] = [],
) =>
  new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    statusText: '',
    headers: {},
    config: { headers: {} } as InternalAxiosRequestConfig,
    data: { success: false, message, error: { code, details } },
  });

/**
 * Store with a signed-in user (or none), built through the real login thunk.
 * The spec must mock '../../src/api/authApi' (loginApi) with vi.mock for this to work.
 */
export const makeStore = async (user: SessionUser | null = null) => {
  const store = createStore();
  if (user) {
    vi.mocked(authApi.loginApi).mockResolvedValueOnce({ user, csrfToken: 'csrf' });
    await store.dispatch(login({ email: user.email, password: 'x' }));
  }
  return store;
};

export const renderWithApp = (
  ui: ReactElement,
  { store = createStore(), path = '/' }: { store?: ReturnType<typeof createStore>; path?: string } = {},
) => {
  const utils = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </Provider>,
  );
  return { store, ...utils };
};

export const makeEvent = (over: Partial<EventItem> = {}): EventItem => ({
  id: 'e1',
  title: 'Navratri Garba Night',
  category: 'Festival',
  description: null,
  startsAt: '2030-10-01T13:00:00.000Z',
  endsAt: null,
  venue: 'Samaj Bhavan',
  status: 'published',
  cancellationReason: null,
  featured: false,
  imageMediaId: null,
  capacity: 100,
  spotsLeft: 40,
  registrationOpensAt: null,
  registrationClosesAt: '2030-09-30T13:00:00.000Z',
  registrationState: 'open',
  myRegistration: null,
  ...over,
});
