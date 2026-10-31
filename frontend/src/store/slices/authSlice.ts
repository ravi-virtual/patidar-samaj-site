import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { adminLoginApi, getUserByIdApi, logoutApi, type SessionUser } from '../../api/authApi';
import { getErrorCode, getErrorMessage } from '../../api/axiosInstance';
import { setCsrfToken } from '../../api/csrf';
import { getStoredUserId, setStoredUserId } from '../../api/currentUser';
import { t } from '../../i18n';

interface AuthState {
  user: SessionUser | null;
  /** False until the first GET /auth/:id has answered, so guards do not flash a redirect. */
  bootstrapped: boolean;
  loginStatus: 'idle' | 'loading' | 'failed';
  loginError: string | null;
  loginErrorCode: string | null;
}

const initialState: AuthState = {
  user: null,
  bootstrapped: false,
  loginStatus: 'idle',
  loginError: null,
  loginErrorCode: null,
};

/** Restores the signed-in state on page load. A 401 simply means "not signed in". */
export const bootstrapAuth = createAsyncThunk<SessionUser | null>('auth/bootstrap', async () => {
  const storedId = getStoredUserId();
  if (!storedId) return null;
  try {
    const { user, csrfToken } = await getUserByIdApi(storedId);
    setCsrfToken(csrfToken);
    return user;
  } catch {
    setCsrfToken(null);
    setStoredUserId(null);
    return null;
  }
});

type LoginArg = { email: string; password: string };
type LoginReject = { rejectValue: { message: string; code?: string } };

/** The only sign-in: admins (and the Super Admin) sign in to the admin panel. */
export const adminLogin = createAsyncThunk<SessionUser, LoginArg, LoginReject>(
  'auth/adminLogin',
  async (credentials, { rejectWithValue }) => {
    try {
      const { user, csrfToken } = await adminLoginApi(credentials);
      setCsrfToken(csrfToken);
      setStoredUserId(user.id);
      return user;
    } catch (err) {
      return rejectWithValue({
        message: getErrorMessage(err, t('Could not sign in')),
        code: getErrorCode(err),
      });
    }
  },
);

export const logout = createAsyncThunk<void>('auth/logout', async () => {
  try {
    await logoutApi();
  } catch {
    /* even if the request fails, the user is signed out locally below */
  } finally {
    setCsrfToken(null);
    setStoredUserId(null);
  }
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    /** The server ended the session (expired, revoked or suspended). */
    sessionLost(state) {
      state.user = null;
      setCsrfToken(null);
      setStoredUserId(null);
    },
    clearLoginError(state) {
      state.loginStatus = 'idle';
      state.loginError = null;
      state.loginErrorCode = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(bootstrapAuth.fulfilled, (state, action) => {
        state.user = action.payload;
        state.bootstrapped = true;
      })
      .addCase(logout.fulfilled, (state) => {
        state.user = null;
      })
      .addCase(adminLogin.pending, (state) => {
        state.loginStatus = 'loading';
        state.loginError = null;
        state.loginErrorCode = null;
      })
      .addCase(adminLogin.fulfilled, (state, action) => {
        state.user = action.payload;
        state.loginStatus = 'idle';
        state.bootstrapped = true;
      })
      .addCase(adminLogin.rejected, (state, action) => {
        state.loginStatus = 'failed';
        state.loginError = action.payload?.message ?? t('Could not sign in');
        state.loginErrorCode = action.payload?.code ?? null;
      });
  },
});

export const { sessionLost, clearLoginError } = authSlice.actions;
export default authSlice.reducer;
