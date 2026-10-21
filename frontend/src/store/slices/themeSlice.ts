import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { updateThemeApi } from '../../api/authApi';
import { bootstrapAuth, login } from './authSlice';
import {
  readStoredTheme,
  resolveTheme,
  writeStoredTheme,
  type ResolvedTheme,
  type ThemePreference,
} from '../../utils/theme';

interface ThemeState {
  preference: ThemePreference;
  resolved: ResolvedTheme;
}

const initialPreference = readStoredTheme();

const initialState: ThemeState = {
  preference: initialPreference,
  resolved: resolveTheme(initialPreference),
};

const themeSlice = createSlice({
  name: 'theme',
  initialState,
  reducers: {
    /** Sets the preference on this device. Anonymous visitors keep it in localStorage only. */
    setThemePreference(state, action: PayloadAction<ThemePreference>) {
      state.preference = action.payload;
      state.resolved = resolveTheme(action.payload);
      writeStoredTheme(action.payload);
    },
    /** Re-resolves "system" when the operating-system colour scheme changes. */
    systemThemeChanged(state) {
      state.resolved = resolveTheme(state.preference);
    },
  },
  extraReducers: (builder) => {
    // The account's saved preference wins over whatever this device had cached. A new account
    // starts on "system", which simply follows the device.
    const adoptAccountTheme = (
      state: ThemeState,
      action: { payload: { themePreference: ThemePreference } | null },
    ) => {
      if (!action.payload) return;
      state.preference = action.payload.themePreference;
      state.resolved = resolveTheme(state.preference);
      writeStoredTheme(state.preference);
    };
    builder.addCase(bootstrapAuth.fulfilled, adoptAccountTheme);
    builder.addCase(login.fulfilled, adoptAccountTheme);
  },
});

export const { setThemePreference, systemThemeChanged } = themeSlice.actions;

/**
 * User picks a theme: apply it immediately, and if they are signed in also save it to their
 * account so it follows them to other devices. A failed save keeps the local choice.
 */
export const changeTheme = createAsyncThunk<void, ThemePreference>(
  'theme/change',
  async (preference, { dispatch, getState }) => {
    dispatch(setThemePreference(preference));
    const signedIn = Boolean((getState() as { auth: { user: unknown } }).auth.user);
    if (!signedIn) return;
    try {
      await updateThemeApi(preference);
    } catch {
      /* offline or session ended: the choice still applies on this device */
    }
  },
);

export default themeSlice.reducer;
