import { useState } from 'react';
import { Pin, Plus } from 'lucide-react';
import {
  announcementActionApi,
  deleteAnnouncementApi,
  listAdminAnnouncementsApi,
  type AdminAnnouncement,
} from '../../api/adminApi';
import { ANNOUNCEMENT_CATEGORIES } from '../../api/types';
import { RowMenu } from '../../components/admin/RowActions';
import { AnnouncementFormDrawer } from '../../components/admin/AnnouncementFormDrawer';
import { DataTable, type Column } from '../../components/admin/DataTable';
import { StatusBadge } from '../../components/admin/StatusBadge';
import { FilterSelect, Toolbar } from '../../components/admin/Toolbar';
import { useCan } from '../../components/admin/usePermissions';
import { useRunner } from '../../components/admin/useRunner';
import { ConfirmDialog } from '../../components/overlays/ConfirmDialog';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { Pagination } from '../../components/ui/Pagination';
import { formatDateTime } from '../../lib/format';
import { useDebounced } from '../../lib/useDebounced';
import { useFetch } from '../../lib/useFetch';
import { t } from '../../i18n';

const PAGE_SIZE = 20;

export default function AdminAnnouncementsPage() {
  const can = useCan();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const term = useDebounced(search.trim(), 300);

  const list = useFetch(`admin-news:${term}:${status}:${category}:${page}`, () =>
    listAdminAnnouncementsApi({ search: term, status, category, page, limit: PAGE_SIZE }),
  );
  const { busy, run } = useRunner(list.retry);
  const [editing, setEditing] = useState<AdminAnnouncement | null | 'new'>(null);
  const [deleting, setDeleting] = useState<AdminAnnouncement | null>(null);

  const reset = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setPage(1);
  };
  const act = (a: AdminAnnouncement, action: Parameters<typeof announcementActionApi>[1], message: string) =>
    void run(() => announcementActionApi(a.id, action), message);

  // Admins without publish rights may only edit drafts; the server enforces the same rule.
  const canEdit = (a: AdminAnnouncement) => can('announcements.update') && (a.status === 'draft' || can('announcements.publish'));
  const publisher = can('announcements.publish');

  const columns: Column<AdminAnnouncement>[] = [
    {
      header: t('Announcement'),
      cell: (a) => (
        <div className="max-w-sm">
          <p className="flex items-center gap-1.5 truncate font-medium text-text">
            {a.pinned && <Pin aria-label={t('Pinned')} className="h-3.5 w-3.5 shrink-0 text-accent" />}
            <span className="truncate">{a.title}</span>
          </p>
          <p className="truncate text-xs text-text-muted">{a.summary ?? a.body}</p>
        </div>
      ),
    },
    { header: t('Category'), cell: (a) => <Badge>{t(a.category)}</Badge> },
    {
      header: t('Shown from'),
      className: 'whitespace-nowrap font-mono text-[13px]',
      cell: (a) => (a.publishAt ?? a.publishedAt ? formatDateTime((a.publishAt ?? a.publishedAt)!) : '—'),
    },
    {
      header: t('Status'),
      cell: (a) => (
        <span className="inline-flex items-center gap-1.5">
          <StatusBadge status={a.status} />
          {a.scheduled && <Badge tone="accent">{t('Scheduled')}</Badge>}
        </span>
      ),
    },
    {
      header: t('Actions'),
      srOnlyHeader: true,
      className: 'text-right',
      cell: (a) => (
        <RowMenu
          name={a.title}
          actions={[
            { label: t('Edit'), kind: 'edit', show: canEdit(a), onSelect: () => setEditing(a) },
            { label: t('Publish'), show: publisher && a.status !== 'published', onSelect: () => act(a, 'publish', t('Announcement published.')) },
            { label: t('Unpublish'), show: publisher && a.status === 'published', onSelect: () => act(a, 'unpublish', t('Announcement moved back to draft.')) },
            { label: a.pinned ? t('Unpin') : t('Pin to top'), show: publisher && a.status === 'published', onSelect: () => act(a, a.pinned ? 'unpin' : 'pin', a.pinned ? t('Unpinned.') : t('Pinned to the top.')) },
            { label: t('Archive'), show: publisher && a.status !== 'archived', onSelect: () => act(a, 'archive', t('Announcement archived.')) },
            { label: t('Delete'), kind: 'delete', danger: true, show: can('announcements.delete'), onSelect: () => setDeleting(a) },
          ]}
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader title={t('Announcements')} description={t('News and notices. New items start as drafts and go live when published.')} />
      <Toolbar
        search={search}
        onSearch={reset(setSearch)}
        searchLabel={t('Search announcements')}
        actions={
          can('announcements.create') && (
            <Button onClick={() => setEditing('new')}>
              <Plus aria-hidden="true" className="h-4 w-4" />
              {t('New announcement')}
            </Button>
          )
        }
      >
        <FilterSelect label={t('Status')} value={status} onChange={reset(setStatus)} options={[{ value: '', label: t('All statuses') }, { value: 'draft', label: t('Draft') }, { value: 'published', label: t('Published') }, { value: 'archived', label: t('Archived') }]} />
        <FilterSelect label={t('Category')} value={category} onChange={reset(setCategory)} options={[{ value: '', label: t('All categories') }, ...ANNOUNCEMENT_CATEGORIES.map((c) => ({ value: c, label: t(c) }))]} />
      </Toolbar>

      <DataTable
        caption={t('Announcements')}
        columns={columns}
        rows={list.data?.announcements}
        rowKey={(a) => a.id}
        loading={list.loading}
        error={list.error}
        onRetry={list.retry}
        empty={<EmptyState title={t('No announcements found')} description={t('Try different filters, or write the first one.')} />}
      />
      {list.data && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={list.data.totalCount} onChange={setPage} />}

      <AnnouncementFormDrawer
        open={editing !== null}
        item={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={list.retry}
      />
      <ConfirmDialog
        open={deleting !== null}
        title={t('Delete this announcement?')}
        confirmLabel={t('Delete')}
        tone="danger"
        busy={busy}
        onConfirm={() => {
          if (deleting) void run(() => deleteAnnouncementApi(deleting.id), t('Announcement deleted.')).then((ok) => ok && setDeleting(null));
        }}
        onCancel={() => setDeleting(null)}
      >
        {deleting ? t('“{title}” will be removed from the site.', { title: deleting.title }) : ''}
      </ConfirmDialog>
    </>
  );
}
