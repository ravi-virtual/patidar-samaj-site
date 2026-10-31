import { useEffect } from 'react';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { dismissToast, type Toast } from '../../store/slices/toastSlice';
import { t } from '../../i18n';

const icon = { success: CircleCheck, error: CircleAlert, info: Info } as const;
const tone = {
  success: 'text-success',
  error: 'text-danger',
  info: 'text-accent',
} as const;

function ToastItem({ toast }: { toast: Toast }) {
  const dispatch = useAppDispatch();
  const Icon = icon[toast.tone];

  // Errors stay a little longer so they can be read.
  useEffect(() => {
    const id = setTimeout(() => dispatch(dismissToast(toast.id)), toast.tone === 'error' ? 8000 : 4500);
    return () => clearTimeout(id);
  }, [dispatch, toast.id, toast.tone]);

  return (
    <div className="pointer-events-auto flex items-start gap-2.5 rounded-lg border border-border bg-surface px-3.5 py-3 shadow-pop">
      <Icon aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${tone[toast.tone]}`} />
      <p className="flex-1 text-sm text-text">{toast.message}</p>
      <button
        type="button"
        aria-label={t('Dismiss message')}
        onClick={() => dispatch(dismissToast(toast.id))}
        className="rounded p-0.5 text-text-muted hover:text-text"
      >
        <X aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Corner notifications. The region is polite, so screen readers announce each message once. */
export function Toaster() {
  const toasts = useAppSelector((s) => s.toast);
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-[70] flex flex-col items-end gap-2 sm:left-auto sm:w-96"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
