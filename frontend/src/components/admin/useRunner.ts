import { useState } from 'react';
import { getErrorMessage } from '../../api/axiosInstance';
import { useAppDispatch } from '../../store/hooks';
import { showToast } from '../../store/slices/toastSlice';
import { t } from '../../i18n';

/**
 * Runs one admin action (publish, delete, …) with a busy flag and consistent feedback: a success
 * toast, or the server's own error message. Resolves to true when the action succeeded.
 */
export function useRunner(onSuccess?: () => void) {
  const dispatch = useAppDispatch();
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<unknown>, successMessage: string): Promise<boolean> => {
    setBusy(true);
    try {
      await action();
      dispatch(showToast(successMessage));
      onSuccess?.();
      return true;
    } catch (err) {
      dispatch(showToast(getErrorMessage(err, t('That did not work. Please try again.')), 'error'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return { busy, run };
}
