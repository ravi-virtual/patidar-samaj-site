import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { getSettingsApi } from '../../api/siteApi';
import { getErrorMessage } from '../../api/axiosInstance';
import type { PublicSettings } from '../../api/types';
import { t } from '../../i18n';

interface SiteState {
  settings: PublicSettings | null;
  status: 'idle' | 'loading' | 'ready' | 'failed';
  error: string | null;
}

const initialState: SiteState = { settings: null, status: 'idle', error: null };

/** Organisation name, contact details and switches shown in the header, footer and contact page. */
export const fetchSiteSettings = createAsyncThunk<PublicSettings, void, { rejectValue: string }>(
  'site/fetchSettings',
  async (_arg, { rejectWithValue }) => {
    try {
      return await getSettingsApi();
    } catch (err) {
      return rejectWithValue(getErrorMessage(err, t('Could not load site details')));
    }
  },
);

const siteSlice = createSlice({
  name: 'site',
  initialState,
  reducers: {
    /** Used after an administrator saves the settings, so the open page updates immediately. */
    settingsReplaced(state, action: { payload: PublicSettings }) {
      state.settings = action.payload;
      state.status = 'ready';
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSiteSettings.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchSiteSettings.fulfilled, (state, action) => {
        state.settings = action.payload;
        state.status = 'ready';
      })
      .addCase(fetchSiteSettings.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload ?? t('Could not load site details');
      });
  },
});

export const { settingsReplaced } = siteSlice.actions;
export default siteSlice.reducer;
