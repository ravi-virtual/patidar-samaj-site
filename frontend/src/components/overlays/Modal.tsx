import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { t } from '../../i18n';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Visually hide the title (it is still the dialog's accessible name). */
  hideTitle?: boolean;
  /** "drawer" slides in from the right (forms); "dialog" is centred; "top" sits near the top (search). */
  variant?: 'dialog' | 'drawer' | 'top';
  children: ReactNode;
  footer?: ReactNode;
  role?: 'dialog' | 'alertdialog';
}

const panel: Record<NonNullable<ModalProps['variant']>, string> = {
  dialog: 'm-auto w-[calc(100%-2rem)] max-w-md rounded-xl',
  drawer: 'my-0 ml-auto mr-0 h-full max-h-none w-full max-w-lg rounded-none',
  top: 'mx-auto mt-[12vh] mb-auto w-[calc(100%-2rem)] max-w-xl rounded-xl',
};

/**
 * Accessible dialog built on the native <dialog> element: the browser provides the focus trap,
 * Escape to close, inert background and focus return. Clicking the dimmed backdrop also closes it.
 */
export function Modal({ open, onClose, title, hideTitle, variant = 'dialog', children, footer, role }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      role={role}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        // A click on the dialog element itself (not its content) is a click on the backdrop.
        if (e.target === ref.current) onClose();
      }}
      className={`${panel[variant]} flex max-h-[85vh] flex-col overflow-hidden border border-border bg-surface p-0 text-text shadow-pop backdrop:bg-[var(--overlay)] ${open ? '' : 'hidden'}`}
    >
      {open && (
        <>
          <div className={`flex items-center justify-between gap-3 px-5 py-4 ${hideTitle ? 'sr-only' : 'border-b border-border'}`}>
            <h2 id={titleId} className="text-[17px] font-semibold">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('Close')}
              className="rounded-md p-1 text-text-muted hover:bg-surface-muted hover:text-text"
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-border px-5 py-3.5">{footer}</div>}
        </>
      )}
    </dialog>
  );
}
