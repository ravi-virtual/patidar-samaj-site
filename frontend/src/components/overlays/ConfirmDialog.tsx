import type { ReactNode } from 'react';
import { Button } from '../ui/Button';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  /** "danger" for destructive actions such as delete. */
  tone?: 'primary' | 'danger';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Asks before anything destructive or hard to undo. The cancel button is first so it is the safe default. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  tone = 'primary',
  busy,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      role="alertdialog"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="px-5 py-4 text-sm text-text-secondary">{children}</div>
    </Modal>
  );
}
