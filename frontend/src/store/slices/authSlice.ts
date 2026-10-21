import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import {
  loginApi,
  logoutApi,
  meApi,
  type SessionUser,
} from '../../api/authApi';
import { getErrorCode, getErrorMessage } from '../../api/axiosInstance';
import { setCsrfToken } from '../../api/csrf';

interface AuthState {
  user: SessionUser | null;
  /** False until the first GET /auth/me has answered, so guards do not flash a redirect. */
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
  try {
    const { user, csrfToken } = await meApi();
    setCsrfToken(csrfToken);
    return user;
  } catch {
    setCsrfToken(null);
    return null;
  }
});

export const login = createAsyncThunk<
  SessionUser,
  { email: string; password: string },
  { rejectValue: { message: string; code?: string } }
>('auth/login', async (credentials, { rejectWithValue }) => {
  try {
    const { user, csrfToken } = await loginApi(credentials);
    setCsrfToken(csrfToken);
    return user;
  } catch (err) {
    return rejectWithValue({
      message: getErrorMessage(err, 'Could not sign in'),
      code: getErrorCode(err),
    });
  }
});

export const logout = createAsyncThunk<void>('auth/logout', async () => {
  try {
    await logoutApi();
  } catch {
    /* even if the request fails, the user is signed out locally below */
  } finally {
    setCsrfToken(null);
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
      .addCase(login.pending, (state) => {
        state.loginStatus = 'loading';
        state.loginError = null;
        state.loginErrorCode = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.user = action.payload;
        state.loginStatus = 'idle';
        state.bootstrapped = true;
      })
      .addCase(login.rejected, (state, action) => {
        state.loginStatus = 'failed';
        state.loginError = action.payload?.message ?? 'Could not sign in';
        state.loginErrorCode = action.payload?.code ?? null;
      })
      .addCase(logout.fulfilled, (state) => {
        state.user = null;
      });
  },
});

export const { sessionLost, clearLoginError } = authSlice.actions;
export default authSlice.reducer;
