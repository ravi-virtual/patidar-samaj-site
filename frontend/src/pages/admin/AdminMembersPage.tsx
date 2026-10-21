import { useState } from 'react';
import { Download, Plus } from 'lucide-react';
import { anonymizeMemberApi, downloadCsv, listStaffMembersApi, type StaffMember } from '../../api/adminApi';
import { getErrorMessage } from '../../api/axiosInstance';
import { ActionMenu } from '../../components/admin/ActionMenu';
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

const PAGE_SIZE = 20;

const visibilityLabel = { hidden: 'Office only', members: 'Members', public: 'Everyone' } as const;

export default function AdminMembersPage() {
  const dispatch = useAppDispatch();
  const can = useCan();
  const [search, setSearch] = useState('');
  const [membershipStatus, setMembershipStatus] = useState('');
  const [visibility, setVisibility] = useState('');
  const [hasAccount, setHasAccount] = useState('');
  const [page, setPage] = useState(1);
  const term = useDebounced(search.trim(), 300);
  const filters = { search: term, membershipStatus, visibility, hasAccount };

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
      dispatch(showToast(getErrorMessage(err, 'Could not export'), 'error'));
    }
  };

  const showPhone = can('members.read.private');
  const columns: Column<StaffMember>[] = [
    {
      header: 'Member',
      cell: (m) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={m.name} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium text-text">{m.name}</p>
            <p className="text-xs text-text-muted">{m.hasAccount ? 'Has an account' : 'Directory entry only'}</p>
          </div>
        </div>
      ),
    },
    { header: 'Village', cell: (m) => m.village ?? '—' },
    { header: 'Location', cell: (m) => place(m.city, m.country) || '—' },
    ...(showPhone ? [{ header: 'Phone', className: 'whitespace-nowrap font-mono text-[13px]', cell: (m: StaffMember) => m.phone ?? '—' }] : []),
    { header: 'Membership', cell: (m) => <StatusBadge status={m.membershipStatus} /> },
    { header: 'Visible to', cell: (m) => <Badge>{visibilityLabel[m.visibility]}</Badge> },
    {
      header: 'Actions',
      srOnlyHeader: true,
      className: 'text-right',
      cell: (m) => (
        <ActionMenu
          label={`Actions for ${m.name}`}
          actions={[
            { label: 'Edit', show: can('members.update') && !m.anonymizedAt, onSelect: () => setEditing(m) },
            { label: 'Anonymise…', danger: true, show: can('members.anonymize') && !m.anonymizedAt, onSelect: () => setAnonymizing(m) },
          ]}
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Members" description="The community directory. Account approvals and roles are under Users & roles." />
      <Toolbar
        search={search}
        onSearch={reset(setSearch)}
        searchLabel="Search members"
        actions={
          <>
            {can('members.export') && (
              <Button variant="secondary" onClick={() => void exportCsv()}>
                <Download aria-hidden="true" className="h-4 w-4" />
                Export CSV
              </Button>
            )}
            {can('members.create') && (
              <Button onClick={() => setEditing('new')}>
                <Plus aria-hidden="true" className="h-4 w-4" />
                Add member
              </Button>
            )}
          </>
        }
      >
        <FilterSelect label="Membership" value={membershipStatus} onChange={reset(setMembershipStatus)} options={[{ value: '', label: 'Any membership' }, { value: 'active', label: 'Active' }, { value: 'pending', label: 'Pending' }, { value: 'inactive', label: 'Inactive' }]} />
        <FilterSelect label="Visibility" value={visibility} onChange={reset(setVisibility)} options={[{ value: '', label: 'Any visibility' }, { value: 'hidden', label: 'Office only' }, { value: 'members', label: 'Members' }, { value: 'public', label: 'Everyone' }]} />
        <FilterSelect label="Account" value={hasAccount} onChange={reset(setHasAccount)} options={[{ value: '', label: 'With or without account' }, { value: 'true', label: 'Has an account' }, { value: 'false', label: 'No account' }]} />
      </Toolbar>

      <DataTable
        caption="Members"
        columns={columns}
        rows={list.data?.members}
        rowKey={(m) => m.id}
        loading={list.loading}
        error={list.error}
        onRetry={list.retry}
        empty={<EmptyState title="No members found" description="Try different filters, or add a directory entry." />}
      />
      {list.data && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={list.data.totalCount} onChange={setPage} />}

      <MemberFormDrawer open={editing !== null} member={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={list.retry} />
      <ConfirmDialog
        open={anonymizing !== null}
        title="Anonymise this member?"
        confirmLabel="Anonymise"
        tone="danger"
        busy={busy}
        onConfirm={() => {
          if (anonymizing) void run(() => anonymizeMemberApi(anonymizing.id), 'Member anonymised.').then((ok) => ok && setAnonymizing(null));
        }}
        onCancel={() => setAnonymizing(null)}
      >
        {anonymizing
          ? `${anonymizing.name}'s name and personal details are removed for good, their account (if any) is closed and they are signed out. This cannot be undone.`
          : ''}
      </ConfirmDialog>
    </>
  );
}
