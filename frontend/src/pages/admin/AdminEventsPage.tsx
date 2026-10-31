import { useState } from 'react';
import { Plus } from 'lucide-react';
import {
  deleteEventApi,
  eventActionApi,
  listAdminEventsApi,
  type AdminEvent,
} from '../../api/adminApi';
import { EVENT_CATEGORIES } from '../../api/types';
import { RowMenu } from '../../components/admin/RowActions';
import { DataTable, type Column } from '../../components/admin/DataTable';
import { EventFormDrawer } from '../../components/admin/EventFormDrawer';
import { StatusBadge } from '../../components/admin/StatusBadge';
import { FilterSelect, Toolbar } from '../../components/admin/Toolbar';
import { useCan } from '../../components/admin/usePermissions';
import { useRunner } from '../../components/admin/useRunner';
import { ConfirmDialog } from '../../components/overlays/ConfirmDialog';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { TextAreaField } from '../../components/ui/FormFields';
import { PageHeader } from '../../components/ui/PageHeader';
import { Pagination } from '../../components/ui/Pagination';
import { formatDateTime } from '../../lib/format';
import { useDebounced } from '../../lib/useDebounced';
import { useFetch } from '../../lib/useFetch';
import { t } from '../../i18n';

const PAGE_SIZE = 20;

type Pending =
  | { kind: 'delete'; event: AdminEvent }
  | { kind: 'cancel'; event: AdminEvent }
  | { kind: 'archive'; event: AdminEvent };

export default function AdminEventsPage() {
  const can = useCan();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [when, setWhen] = useState('all');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const term = useDebounced(search.trim(), 300);

  const list = useFetch(`admin-events:${term}:${status}:${when}:${category}:${page}`, () =>
    listAdminEventsApi({ search: term, status, when, category, page, limit: PAGE_SIZE }),
  );
  const { busy, run } = useRunner(list.retry);

  const [editing, setEditing] = useState<AdminEvent | null | 'new'>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState('');
  const [reasonGu, setReasonGu] = useState('');

  const reset = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setPage(1);
  };

  // Admins without publish rights may only touch drafts; the server enforces the same rule.
  const canEdit = (e: AdminEvent) => can('events.update') && (e.status === 'draft' || can('events.publish'));

  const columns: Column<AdminEvent>[] = [
    {
      header: t('Event'),
      cell: (e) => (
        <div className="max-w-xs">
          <p className="truncate font-medium text-text">{e.title}</p>
          <p className="truncate text-xs text-text-muted">
            {t(e.category)} · {e.venue}
          </p>
        </div>
      ),
    },
    { header: t('Starts'), className: 'whitespace-nowrap font-mono text-[13px]', cell: (e) => formatDateTime(e.startsAt) },
    { header: t('Status'), cell: (e) => <StatusBadge status={e.status} /> },
    {
      header: t('Actions'),
      srOnlyHeader: true,
      className: 'text-right',
      cell: (e) => (
        <RowMenu
          name={e.title}
          actions={[
            { label: t('Edit'), kind: 'edit', show: canEdit(e), onSelect: () => setEditing(e) },
            { label: t('Publish'), show: can('events.publish') && (e.status === 'draft' || e.status === 'archived'), onSelect: () => void run(() => eventActionApi(e.id, 'publish'), t('Event published.')) },
            { label: t('Unpublish'), show: can('events.publish') && e.status === 'published', onSelect: () => void run(() => eventActionApi(e.id, 'unpublish'), t('Event moved back to draft.')) },
            { label: t('Cancel event'), show: can('events.publish') && e.status === 'published', onSelect: () => (setReason(''), setReasonGu(''), setPending({ kind: 'cancel', event: e })) },
            { label: t('Archive'), show: can('events.publish') && e.status !== 'archived', onSelect: () => setPending({ kind: 'archive', event: e }) },
            { label: t('Delete'), kind: 'delete', danger: true, show: can('events.delete'), onSelect: () => setPending({ kind: 'delete', event: e }) },
          ]}
        />
      ),
    },
  ];

  const confirm = async () => {
    if (!pending) return;
    const { kind, event } = pending;
    const ok = await run(
      () =>
        kind === 'delete'
          ? deleteEventApi(event.id)
          : kind === 'archive'
            ? eventActionApi(event.id, 'archive')
            : eventActionApi(event.id, 'cancel', { reason: reason.trim() || undefined, reasonGu: reasonGu.trim() || undefined }),
      kind === 'delete' ? t('Event deleted.') : kind === 'archive' ? t('Event archived.') : t('Event cancelled.'),
    );
    if (ok) setPending(null);
  };

  return (
    <>
      <PageHeader title={t('Events')} description={t('Create and publish events with their date, time and venue.')} />
      <Toolbar
        search={search}
        onSearch={reset(setSearch)}
        searchLabel={t('Search events')}
        actions={
          can('events.create') && (
            <Button onClick={() => setEditing('new')}>
              <Plus aria-hidden="true" className="h-4 w-4" />
              {t('New event')}
            </Button>
          )
        }
      >
        <FilterSelect label={t('Status')} value={status} onChange={reset(setStatus)} options={[{ value: '', label: t('All statuses') }, ...['draft', 'published', 'cancelled', 'archived'].map((s) => ({ value: s, label: t(s[0]!.toUpperCase() + s.slice(1)) }))]} />
        <FilterSelect label={t('When')} value={when} onChange={reset(setWhen)} options={[{ value: 'all', label: t('Any date') }, { value: 'upcoming', label: t('Upcoming') }, { value: 'past', label: t('Past') }]} />
        <FilterSelect label={t('Category')} value={category} onChange={reset(setCategory)} options={[{ value: '', label: t('All categories') }, ...EVENT_CATEGORIES.map((c) => ({ value: c, label: t(c) }))]} />
      </Toolbar>

      <DataTable
        caption={t('Events')}
        columns={columns}
        rows={list.data?.events}
        rowKey={(e) => e.id}
        loading={list.loading}
        error={list.error}
        onRetry={list.retry}
        empty={<EmptyState title={t('No events found')} description={t('Try different filters, or create the first event.')} />}
      />
      {list.data && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={list.data.totalCount} onChange={setPage} />}

      <EventFormDrawer
        open={editing !== null}
        event={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={list.retry}
      />

      <ConfirmDialog
        open={pending !== null}
        title={pending?.kind === 'delete' ? t('Delete this event?') : pending?.kind === 'cancel' ? t('Cancel this event?') : t('Archive this event?')}
        confirmLabel={pending?.kind === 'delete' ? t('Delete') : pending?.kind === 'cancel' ? t('Cancel event') : t('Archive')}
        tone={pending?.kind === 'archive' ? 'primary' : 'danger'}
        busy={busy}
        onConfirm={() => void confirm()}
        onCancel={() => setPending(null)}
      >
        {pending?.kind === 'delete' && t('“{title}” will be removed.', { title: pending.event.title })}
        {pending?.kind === 'archive' && t('“{title}” will no longer appear on the public site.', { title: pending.event.title })}
        {pending?.kind === 'cancel' && (
          <div className="space-y-3">
            <p>{t('Visitors will see that “{title}” was cancelled.', { title: pending.event.title })}</p>
            <TextAreaField label={t('Reason (shown on the event page)')} rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
            <TextAreaField label={t('Reason in Gujarati (optional)')} lang="gu" rows={3} maxLength={500} value={reasonGu} onChange={(e) => setReasonGu(e.target.value)} />
          </div>
        )}
      </ConfirmDialog>
    </>
  );
}
