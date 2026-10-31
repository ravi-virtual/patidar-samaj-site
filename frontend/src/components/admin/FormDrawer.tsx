import { useId, type FormEventHandler, type ReactNode } from 'react';
import { Modal } from '../overlays/Modal';
import { Button } from '../ui/Button';
import { t } from '../../i18n';

interface FormDrawerProps {
  open: boolean;
  title: string;
  onClose: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  submitLabel: string;
  submitting?: boolean;
  /** Disable Save until something changed. */
  pristine?: boolean;
  children: ReactNode;
}

/**
 * Side panel for create/edit forms. The Save button sits in the footer but is tied to the form with
 * the `form` attribute, so Enter inside a field submits and the footer stays visible while scrolling.
 */
export function FormDrawer({ open, title, onClose, onSubmit, submitLabel, submitting, pristine, children }: FormDrawerProps) {
  const formId = useId();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      variant="drawer"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            {t('Cancel')}
          </Button>
          <Button type="submit" form={formId} loading={submitting} disabled={pristine}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={onSubmit} className="grid gap-4 p-5 sm:grid-cols-2">
        {children}
      </form>
    </Modal>
  );
}

/** A form control that spans both columns of the drawer grid. */
export function FullWidth({ children }: { children: ReactNode }) {
  return <div className="sm:col-span-2">{children}</div>;
}
