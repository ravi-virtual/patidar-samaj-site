import type { FormEventHandler, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { t } from '../../i18n';
import { Button } from '../ui/Button';
import { PageHeader } from '../ui/PageHeader';

interface FormPageProps {
  title: string;
  description?: string;
  /** Where Back, Cancel and a successful save lead. */
  backTo: string;
  backLabel: string;
  onSubmit: FormEventHandler<HTMLFormElement>;
  submitLabel: string;
  submitting?: boolean;
  /** Disable Save until something changed. */
  pristine?: boolean;
  /** Extra controls shown at the top right, next to Back. */
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * Full-page create/edit form, laid out like "Add admin": a header with a Back link, the fields in a
 * card, and Cancel / Save underneath. Replaces the old side panel.
 */
export function FormPage({ title, description, backTo, backLabel, onSubmit, submitLabel, submitting, pristine, actions, children }: FormPageProps) {
  const navigate = useNavigate();
  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={
          <>
            {actions}
            <Link
              to={backTo}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-border-strong px-3.5 text-sm font-medium text-text hover:bg-surface-muted"
            >
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              {backLabel}
            </Link>
          </>
        }
      />
      <form noValidate onSubmit={onSubmit} className="space-y-6">
        <section className="grid gap-4 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2 sm:p-5">{children}</section>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={() => navigate(backTo)} disabled={submitting}>
            {t('Cancel')}
          </Button>
          <Button type="submit" loading={submitting} disabled={pristine}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </>
  );
}

/** A form control that spans both columns of the form grid. */
export function FullWidth({ children }: { children: ReactNode }) {
  return <div className="sm:col-span-2">{children}</div>;
}
