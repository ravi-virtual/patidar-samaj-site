import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { t } from '../../i18n';

export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

let nextId = 1;

const toastSlice = createSlice({
  name: 'toast',
  initialState: [] as Toast[],
  reducers: {
    showToast: {
      reducer: (state, action: PayloadAction<Toast>) => {
        state.push(action.payload);
        // Keep the screen calm: at most three messages at once.
        if (state.length > 3) state.shift();
      },
      prepare: (message: string, tone: ToastTone = 'success') => ({ payload: { id: nextId++, tone, message: t(message) } }),
    },
    dismissToast: (state, action: PayloadAction<number>) => state.filter((t) => t.id !== action.payload),
  },
});

export const { showToast, dismissToast } = toastSlice.actions;
export default toastSlice.reducer;
