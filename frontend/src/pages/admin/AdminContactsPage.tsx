import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { listContactsApi, type ContactMessage } from '../../api/adminApi';
import { ContactDrawer } from '../../components/admin/ContactDrawer';
import { DataTable, type Column } from '../../components/admin/DataTable';
import { StatusBadge } from '../../components/admin/StatusBadge';
import { Toolbar } from '../../components/admin/Toolbar';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { Pagination } from '../../components/ui/Pagination';
import { formatDateTime } from '../../lib/format';
import { useDebounced } from '../../lib/useDebounced';
import { useFetch } from '../../lib/useFetch';
import { t } from '../../i18n';

const PAGE_SIZE = 20;
const statuses = [
  { value: '', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
];

export default function AdminContactsPage() {
  const [params] = useSearchParams();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const term = useDebounced(search.trim(), 300);

  const list = useFetch(`admin-contacts:${term}:${status}:${mine}:${page}`, () =>
    listContactsApi({ search: term, status, mine: mine || undefined, page, limit: PAGE_SIZE }),
  );

  const columns: Column<ContactMessage>[] = [
    {
      header: t('From'),
      cell: (m) => (
        <div className="max-w-[14rem]">
          <p className="truncate font-medium text-text">{m.name}</p>
          <p className="truncate text-xs text-text-muted">{m.email}</p>
        </div>
      ),
    },
    {
      header: t('Message'),
      cell: (m) => (
        <div className="max-w-md">
          <p className="truncate text-xs text-accent">{m.topic}</p>
          <p className="truncate">{m.preview}</p>
        </div>
      ),
    },
    { header: t('Received'), className: 'whitespace-nowrap font-mono text-[13px]', cell: (m) => formatDateTime(m.createdAt) },
    { header: t('Status'), cell: (m) => <StatusBadge status={m.status} /> },
    {
      header: t('Open'),
      srOnlyHeader: true,
      className: 'text-right',
      cell: (m) => (
        <Button variant="secondary" size="sm" onClick={() => setOpenId(m.id)} aria-label={t('Open message from {name}', { name: m.name })}>
          {t('Open')}
        </Button>
      ),
    },
  ];

  const counts = list.data?.counts ?? {};

  return (
    <>
      <PageHeader title={t('Contact inbox')} description={t('Messages sent through the contact form.')} />
      <Toolbar search={search} onSearch={(v) => (setSearch(v), setPage(1))} searchLabel={t('Search messages')}>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('Status')}>
          {statuses.map((s) => (
            <Chip key={s.value} active={status === s.value} onClick={() => (setStatus(s.value), setPage(1))}>
              {t(s.label)}
              {s.value && counts[s.value as keyof typeof counts] !== undefined ? ` · ${counts[s.value as keyof typeof counts]}` : ''}
            </Chip>
          ))}
          <Chip active={mine} onClick={() => (setMine((v) => !v), setPage(1))}>
            {t('Assigned to me')}
          </Chip>
        </div>
      </Toolbar>
      <DataTable
        caption={t('Contact messages')}
        columns={columns}
        rows={list.data?.messages}
        rowKey={(m) => m.id}
        loading={list.loading}
        error={list.error}
        onRetry={list.retry}
        empty={<EmptyState title={t('No messages')} description={t('Nothing matches these filters.')} />}
      />
      {list.data && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={list.data.totalCount} onChange={setPage} />}
      <ContactDrawer id={openId} onClose={() => setOpenId(null)} onChanged={list.retry} />
    </>
  );
}
