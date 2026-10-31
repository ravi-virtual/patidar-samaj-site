import { useState } from 'react';
import { listAuditApi, type AuditEntry } from '../../api/adminApi';
import { DataTable, type Column } from '../../components/admin/DataTable';
import { StatusBadge } from '../../components/admin/StatusBadge';
import { FilterSelect, Toolbar } from '../../components/admin/Toolbar';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { Pagination } from '../../components/ui/Pagination';
import { describeAction, formatDateTime } from '../../lib/format';
import { roleLabel } from '../../lib/labels';
import { useDebounced } from '../../lib/useDebounced';
import { useFetch } from '../../lib/useFetch';
import { t } from '../../i18n';

const PAGE_SIZE = 50;

const areas = [
  { value: '', label: 'All activity' },
  { value: 'auth.*', label: 'Sign-in and passwords' },
  { value: 'user.*', label: 'Users and roles' },
  { value: 'member*', label: 'Members' },
  { value: 'event.*', label: 'Events' },
  { value: 'announcement.*', label: 'Announcements' },
  { value: 'content.*', label: 'Site content' },
  { value: 'contact.*', label: 'Contact messages' },
  { value: 'media.*', label: 'Media' },
  { value: 'settings.*', label: 'Settings' },
];

/** Metadata is shown as plain text so nothing in it is ever interpreted as markup. */
const summarise = (m: Record<string, unknown> | null): string =>
  m
    ? Object.entries(m)
        .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
        .join(' · ')
    : '';

export default function AdminAuditPage() {
  const [action, setAction] = useState('');
  const [outcome, setOutcome] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const term = useDebounced(search.trim(), 300);

  // The server matches `action` exactly (or with a trailing *), so free text becomes a prefix search.
  const safeTerm = term.replace(/[^a-zA-Z0-9._-]/g, '');
  const actionFilter = safeTerm ? `${safeTerm}*` : action;
  const list = useFetch(`audit:${actionFilter}:${outcome}:${page}`, () => listAuditApi({ action: actionFilter, outcome, page, limit: PAGE_SIZE }));

  const columns: Column<AuditEntry>[] = [
    { header: t('When'), className: 'whitespace-nowrap font-mono text-[13px]', cell: (e) => formatDateTime(e.createdAt) },
    {
      header: t('Who'),
      cell: (e) =>
        e.actor ? (
          <div>
            <p className="font-medium text-text">{e.actor.name}</p>
            <p className="text-xs text-text-muted">{e.actor.role ? roleLabel(e.actor.role) : ''}</p>
          </div>
        ) : (
          <span className="text-text-muted">{t('Not signed in')}</span>
        ),
    },
    {
      header: t('What'),
      cell: (e) => (
        <div className="max-w-md">
          <p className="font-medium text-text">{describeAction(e.action)}</p>
          <p className="break-words font-mono text-xs text-text-muted">
            {e.action}
            {e.metadata ? ` — ${summarise(e.metadata)}` : ''}
          </p>
        </div>
      ),
    },
    { header: t('Result'), cell: (e) => <StatusBadge status={e.outcome} /> },
    { header: 'IP', className: 'whitespace-nowrap font-mono text-xs', cell: (e) => e.ip ?? '—' },
  ];

  return (
    <>
      <PageHeader title={t('Audit log')} description={t('Who did what, and when. Entries cannot be edited or deleted; they expire after the retention period.')} />
      <Toolbar search={search} onSearch={(v) => (setSearch(v), setPage(1))} searchLabel={t('Action starts with, e.g. auth.login')}>
        <FilterSelect label={t('Area')} value={action} onChange={(v) => (setAction(v), setPage(1))} options={areas.map((a) => ({ ...a, label: t(a.label) }))} />
        <FilterSelect label={t('Result')} value={outcome} onChange={(v) => (setOutcome(v), setPage(1))} options={[{ value: '', label: t('Success or failure') }, { value: 'success', label: t('Success') }, { value: 'failure', label: t('Failure') }]} />
      </Toolbar>
      <DataTable
        caption={t('Audit log')}
        columns={columns}
        rows={list.data?.entries}
        rowKey={(e) => e.id}
        loading={list.loading}
        error={list.error}
        onRetry={list.retry}
        minWidth={760}
        empty={<EmptyState title={t('No entries')} description={t('Nothing matches these filters.')} />}
      />
      {list.data && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={list.data.totalCount} onChange={setPage} />}
    </>
  );
}
