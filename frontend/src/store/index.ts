import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import themeReducer from './slices/themeSlice';
import siteReducer from './slices/siteSlice';
import toastReducer from './slices/toastSlice';

// Factory so tests can build an isolated store; the app uses the singleton below.
export const createStore = () =>
  configureStore({
    reducer: {
      auth: authReducer,
      theme: themeReducer,
      site: siteReducer,
      toast: toastReducer,
    },
  });

export const store = createStore();

export type AppStore = ReturnType<typeof createStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
