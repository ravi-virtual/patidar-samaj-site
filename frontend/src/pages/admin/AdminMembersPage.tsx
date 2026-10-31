import { useState } from 'react';
import { Download, Plus, UserX } from 'lucide-react';
import { anonymizeMemberApi, downloadCsv, listStaffMembersApi, type StaffMember } from '../../api/adminApi';
import { getErrorMessage } from '../../api/axiosInstance';
import { RowMenu } from '../../components/admin/RowActions';
import { DataTable, type Column } from '../../components/admin/DataTable';
import { MemberFormDrawer } from '../../components/admin/MemberFormDrawer';
import { StatusBadge } from '../../components/admin/StatusBadge';
import { FilterSelect, Toolbar } from '../../components/admin/Toolbar';
import { useCan } from '../../components/admin/usePermissions';
import { useRunner } from '../../components/admin/useRunner';
import { ConfirmDialog } from '../../components/overlays/ConfirmDialog';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { Pagination } from '../../components/ui/Pagination';
import { place } from '../../lib/format';
import { useDebounced } from '../../lib/useDebounced';
import { useFetch } from '../../lib/useFetch';
import { useAppDispatch } from '../../store/hooks';
import { showToast } from '../../store/slices/toastSlice';
import { t } from '../../i18n';

const PAGE_SIZE = 20;

const visibilityLabel = { hidden: 'Office only', public: 'Everyone' } as const;

/** The community directory: plain entries added and kept up to date by the office. No accounts. */
export default function AdminMembersPage() {
  const dispatch = useAppDispatch();
  const can = useCan();
  const [search, setSearch] = useState('');
  const [membershipStatus, setMembershipStatus] = useState('');
  const [visibility, setVisibility] = useState('');
  const [page, setPage] = useState(1);
  const term = useDebounced(search.trim(), 300);
  const filters = { search: term, membershipStatus, visibility };

  const list = useFetch(`admin-members:${JSON.stringify(filters)}:${page}`, () =>
    listStaffMembersApi({ ...filters, page, limit: PAGE_SIZE }),
  );
  const { busy, run } = useRunner(list.retry);
  const [editing, setEditing] = useState<StaffMember | null | 'new'>(null);
  const [anonymizing, setAnonymizing] = useState<StaffMember | null>(null);

  const reset = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setPage(1);
  };

  const exportCsv = async () => {
    try {
      await downloadCsv('/admin/members/export', filters, 'members.csv');
    } catch (err) {
      dispatch(showToast(getErrorMessage(err, t('Could not export')), 'error'));
    }
  };

  const showPhone = can('members.read.private');
  const columns: Column<StaffMember>[] = [
    {
      header: t('Member'),
      cell: (m) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={m.name} size="sm" />
          <p className="truncate font-medium text-text">{m.name}</p>
        </div>
      ),
    },
    { header: t('Village'), cell: (m) => m.village ?? '—' },
    { header: t('Location'), cell: (m) => place(m.city, m.country) || '—' },
    ...(showPhone ? [{ header: t('Phone'), className: 'whitespace-nowrap font-mono text-[13px]', cell: (m: StaffMember) => m.phone ?? '—' }] : []),
    { header: t('Membership'), cell: (m) => <StatusBadge status={m.membershipStatus} /> },
    { header: t('Visible to'), cell: (m) => <Badge>{t(visibilityLabel[m.visibility] ?? visibilityLabel.hidden)}</Badge> },
    {
      header: t('Actions'),
      srOnlyHeader: true,
      className: 'text-right',
      cell: (m) => (
        <RowMenu
          name={m.name}
          actions={[
            { label: t('Edit'), kind: 'edit', show: can('members.update') && !m.anonymizedAt, onSelect: () => setEditing(m) },
            { label: t('Anonymise…'), icon: UserX, danger: true, show: can('members.anonymize') && !m.anonymizedAt, onSelect: () => setAnonymizing(m) },
          ]}
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader title={t('Members')} description={t('The community directory. Entries are added and kept up to date by the office; members do not sign in.')} />
      <Toolbar
        search={search}
        onSearch={reset(setSearch)}
        searchLabel={t('Search members')}
        actions={
          <>
            {can('members.export') && (
              <Button variant="secondary" onClick={() => void exportCsv()}>
                <Download aria-hidden="true" className="h-4 w-4" />
                {t('Export CSV')}
              </Button>
            )}
            {can('members.create') && (
              <Button onClick={() => setEditing('new')}>
                <Plus aria-hidden="true" className="h-4 w-4" />
                {t('Add member')}
              </Button>
            )}
          </>
        }
      >
        <FilterSelect label={t('Membership')} value={membershipStatus} onChange={reset(setMembershipStatus)} options={[{ value: '', label: t('Any membership') }, { value: 'active', label: t('Active') }, { value: 'inactive', label: t('Inactive') }]} />
        <FilterSelect label={t('Visibility')} value={visibility} onChange={reset(setVisibility)} options={[{ value: '', label: t('Any visibility') }, { value: 'hidden', label: t('Office only') }, { value: 'public', label: t('Everyone') }]} />
      </Toolbar>

      <DataTable
        caption={t('Members')}
        columns={columns}
        rows={list.data?.members}
        rowKey={(m) => m.id}
        loading={list.loading}
        error={list.error}
        onRetry={list.retry}
        empty={<EmptyState title={t('No members found')} description={t('Try different filters, or add a directory entry.')} />}
      />
      {list.data && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={list.data.totalCount} onChange={setPage} />}

      <MemberFormDrawer open={editing !== null} member={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={list.retry} />
      <ConfirmDialog
        open={anonymizing !== null}
        title={t('Anonymise this member?')}
        confirmLabel={t('Anonymise')}
        tone="danger"
        busy={busy}
        onConfirm={() => {
          if (anonymizing) void run(() => anonymizeMemberApi(anonymizing.id), t('Member anonymised.')).then((ok) => ok && setAnonymizing(null));
        }}
        onCancel={() => setAnonymizing(null)}
      >
        {anonymizing ? t("{name}'s name and personal details are removed for good. This cannot be undone.", { name: anonymizing.name }) : ''}
      </ConfirmDialog>
    </>
  );
}
