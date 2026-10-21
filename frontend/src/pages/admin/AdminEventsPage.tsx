import { useState } from 'react';
import { Plus } from 'lucide-react';
import {
  deleteEventApi,
  eventActionApi,
  listAdminEventsApi,
  type AdminEvent,
} from '../../api/adminApi';
import { EVENT_CATEGORIES } from '../../api/types';
import { ActionMenu } from '../../components/admin/ActionMenu';
import { DataTable, type Column } from '../../components/admin/DataTable';
import { EventFormDrawer } from '../../components/admin/EventFormDrawer';
import { RegistrationsDrawer } from '../../components/admin/RegistrationsDrawer';
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
  const [viewing, setViewing] = useState<AdminEvent | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState('');

  const reset = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setPage(1);
  };

  // Editors without publish rights may only touch drafts; the server enforces the same rule.
  const canEdit = (e: AdminEvent) => can('events.update') && (e.status === 'draft' || can('events.publish'));

  const columns: Column<AdminEvent>[] = [
    {
      header: 'Event',
      cell: (e) => (
        <div className="max-w-xs">
          <p className="truncate font-medium text-text">{e.title}</p>
          <p className="truncate text-xs text-text-muted">
            {e.category} · {e.venue}
          </p>
        </div>
      ),
    },
    { header: 'Starts', className: 'whitespace-nowrap font-mono text-[13px]', cell: (e) => formatDateTime(e.startsAt) },
    {
      header: 'Registered',
      className: 'whitespace-nowrap font-mono text-[13px]',
      cell: (e) => (e.capacity > 0 ? `${e.registeredCount}/${e.capacity}` : `${e.registeredCount}`),
    },
    { header: 'Status', cell: (e) => <StatusBadge status={e.status} /> },
    {
      header: 'Actions',
      srOnlyHeader: true,
      className: 'text-right',
      cell: (e) => (
        <ActionMenu
          label={`Actions for ${e.title}`}
          actions={[
            { label: 'Edit', show: canEdit(e), onSelect: () => setEditing(e) },
            { label: 'Registrations', show: can('registrations.read'), onSelect: () => setViewing(e) },
            { label: 'Publish', show: can('events.publish') && (e.status === 'draft' || e.status === 'archived'), onSelect: () => void run(() => eventActionApi(e.id, 'publish'), 'Event published.') },
            { label: 'Unpublish', show: can('events.publish') && e.status === 'published', onSelect: () => void run(() => eventActionApi(e.id, 'unpublish'), 'Event moved back to draft.') },
            { label: 'Cancel event', show: can('events.publish') && e.status === 'published', onSelect: () => (setReason(''), setPending({ kind: 'cancel', event: e })) },
            { label: 'Archive', show: can('events.publish') && e.status !== 'archived', onSelect: () => setPending({ kind: 'archive', event: e }) },
            { label: 'Delete', danger: true, show: can('events.delete'), onSelect: () => setPending({ kind: 'delete', event: e }) },
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
            : eventActionApi(event.id, 'cancel', { reason: reason.trim() || undefined }),
      kind === 'delete' ? 'Event deleted.' : kind === 'archive' ? 'Event archived.' : 'Event cancelled.',
    );
    if (ok) setPending(null);
  };

  return (
    <>
      <PageHeader title="Events" description="Create events, open registration and see who is coming." />
      <Toolbar
        search={search}
        onSearch={reset(setSearch)}
        searchLabel="Search events"
        actions={
          can('events.create') && (
            <Button onClick={() => setEditing('new')}>
              <Plus aria-hidden="true" className="h-4 w-4" />
              New event
            </Button>
          )
        }
      >
        <FilterSelect label="Status" value={status} onChange={reset(setStatus)} options={[{ value: '', label: 'All statuses' }, ...['draft', 'published', 'cancelled', 'archived'].map((s) => ({ value: s, label: s[0]!.toUpperCase() + s.slice(1) }))]} />
        <FilterSelect label="When" value={when} onChange={reset(setWhen)} options={[{ value: 'all', label: 'Any date' }, { value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past' }]} />
        <FilterSelect label="Category" value={category} onChange={reset(setCategory)} options={[{ value: '', label: 'All categories' }, ...EVENT_CATEGORIES.map((c) => ({ value: c, label: c }))]} />
      </Toolbar>

      <DataTable
        caption="Events"
        columns={columns}
        rows={list.data?.events}
        rowKey={(e) => e.id}
        loading={list.loading}
        error={list.error}
        onRetry={list.retry}
        empty={<EmptyState title="No events found" description="Try different filters, or create the first event." />}
      />
      {list.data && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={list.data.totalCount} onChange={setPage} />}

      <EventFormDrawer
        open={editing !== null}
        event={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={list.retry}
      />
      <RegistrationsDrawer event={viewing} onClose={() => setViewing(null)} onChanged={list.retry} />

      <ConfirmDialog
        open={pending !== null}
        title={pending?.kind === 'delete' ? 'Delete this event?' : pending?.kind === 'cancel' ? 'Cancel this event?' : 'Archive this event?'}
        confirmLabel={pending?.kind === 'delete' ? 'Delete' : pending?.kind === 'cancel' ? 'Cancel event' : 'Archive'}
        tone={pending?.kind === 'archive' ? 'primary' : 'danger'}
        busy={busy}
        onConfirm={() => void confirm()}
        onCancel={() => setPending(null)}
      >
        {pending?.kind === 'delete' && `“${pending.event.title}” will be removed. This is blocked while people are registered.`}
        {pending?.kind === 'archive' && `“${pending.event.title}” will no longer appear on the public site.`}
        {pending?.kind === 'cancel' && (
          <div className="space-y-3">
            <p>Registered members will see that “{pending.event.title}” was cancelled.</p>
            <TextAreaField label="Reason (shown to members)" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        )}
      </ConfirmDialog>
    </>
  );
}
