import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import {
  addContactNoteApi,
  getContactApi,
  updateContactApi,
  type ContactMessage,
  type ContactStatus,
} from '../../api/adminApi';
import { StatusBadge } from '../../components/admin/StatusBadge';
import { useCan } from '../../components/admin/usePermissions';
import { useRunner } from '../../components/admin/useRunner';
import { Button } from '../../components/ui/Button';
import { ErrorState } from '../../components/ui/ErrorState';
import { SelectField, TextAreaField } from '../../components/ui/FormFields';
import { PageHeader } from '../../components/ui/PageHeader';
import { Skeleton } from '../../components/ui/Skeleton';
import { formatDateTime } from '../../lib/format';
import { useFetch } from '../../lib/useFetch';
import { useAppSelector } from '../../store/hooks';
import { t } from '../../i18n';

/** Full-page view of one inbox message with its status, assignment and internal notes. */
export default function AdminContactDetailPage() {
  const can = useCan();
  const { id = '' } = useParams();
  const me = useAppSelector((s) => s.auth.user)!;
  const { data, error, retry } = useFetch(`contact:${id}`, () => getContactApi(id));
  const [note, setNote] = useState('');
  const { busy, run } = useRunner(retry);

  const header = (
    <PageHeader
      title={t('Message')}
      actions={
        <Link
          to="/admin/contacts"
          className="inline-flex h-10 items-center gap-2 rounded-md border border-border-strong px-3.5 text-sm font-medium text-text hover:bg-surface-muted"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          {t('Back to contact inbox')}
        </Link>
      }
    />
  );

  if (error && !data)
    return (
      <>
        {header}
        <ErrorState message={error} onRetry={retry} />
      </>
    );
  if (!data)
    return (
      <>
        {header}
        <Skeleton className="h-60" />
      </>
    );

  const m: ContactMessage = data;
  const mine = m.assignedTo === me.id;

  return (
    <>
      {header}
      <div className="space-y-5 rounded-lg border border-border bg-surface p-4 sm:p-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={m.status} />
            <span className="font-mono text-xs text-text-muted">#{m.reference}</span>
          </div>
          <h3 className="mt-2 font-semibold">{m.topic}</h3>
          <p className="text-[13px] text-text-muted">
            {m.name} ·{' '}
            <a href={`mailto:${m.email}`} className="text-text-muted underline">
              {m.email}
            </a>{' '}
            · {formatDateTime(m.createdAt)}
          </p>
          {/* Plain text only: the message is untrusted input and is never rendered as markup. */}
          <p className="mt-3 whitespace-pre-wrap rounded-lg border border-border bg-bg p-3.5 text-sm text-text">
            {m.message}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {can('contacts.resolve') && (
            <SelectField
              label={t('Status')}
              value={m.status}
              disabled={busy}
              onChange={(e) =>
                void run(
                  () => updateContactApi(m.id, { status: e.target.value as ContactStatus }),
                  t('Status updated.'),
                )
              }
            >
              <option value="new">{t('New')}</option>
              <option value="in_progress">{t('In progress')}</option>
              <option value="resolved">{t('Resolved')}</option>
            </SelectField>
          )}
          {can('contacts.assign') && (
            <div className="space-y-1.5">
              <p className="text-[13px] font-medium">{t('Assigned to')}</p>
              <p className="text-sm text-text-secondary">
                {mine ? t('You') : m.assignedTo ? t('Another staff member') : t('Nobody')}
              </p>
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => updateContactApi(m.id, { assignedTo: mine ? null : me.id }),
                    mine ? t('Unassigned.') : t('Assigned to you.'),
                  )
                }
              >
                {mine ? t('Unassign') : t('Assign to me')}
              </Button>
            </div>
          )}
        </div>

        <section aria-labelledby="notes-h">
          <h3 id="notes-h" className="mb-2 text-[13px] font-semibold">
            {t('Internal notes')}
          </h3>
          <p className="mb-2 text-xs text-text-muted">
            {t('Notes are never shown to the sender.')}
          </p>
          {m.notes && m.notes.length > 0 ? (
            <ul className="m-0 mb-3 list-none space-y-2 p-0">
              {m.notes.map((n, i) => (
                <li key={i} className="rounded-lg bg-surface-muted p-3 text-sm">
                  <p className="whitespace-pre-wrap">{n.text}</p>
                  <p className="mt-1 text-xs text-text-muted">
                    {n.authorId === me.id ? t('You') : t('Staff member')} ·{' '}
                    {formatDateTime(n.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-3 text-sm text-text-muted">{t('No notes yet.')}</p>
          )}
          {can('contacts.resolve') && (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!note.trim()) return;
                void run(() => addContactNoteApi(m.id, note.trim()), t('Note added.')).then(
                  (ok) => ok && setNote(''),
                );
              }}
            >
              <TextAreaField
                label={t('Add a note')}
                rows={3}
                maxLength={1000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <Button type="submit" size="sm" loading={busy} disabled={!note.trim()}>
                {t('Add note')}
              </Button>
            </form>
          )}
        </section>
      </div>
    </>
  );
}
