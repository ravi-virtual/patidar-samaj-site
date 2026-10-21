import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import {
  issueResetLinkApi,
  listUsersApi,
  userActionApi,
  type AdminUser,
} from '../../api/adminApi';
import { getErrorMessage } from '../../api/axiosInstance';
import { ActionMenu } from '../../components/admin/ActionMenu';
import { DataTable, type Column } from '../../components/admin/DataTable';
import { OneTimeLinkDialog } from '../../components/admin/OneTimeLinkDialog';
import { RoleDialog } from '../../components/admin/RoleDialog';
import { RoleMatrix } from '../../components/admin/RoleMatrix';
import { StaffCreateDrawer } from '../../components/admin/StaffCreateDrawer';
import { StatusBadge } from '../../components/admin/StatusBadge';
import { FilterSelect, Toolbar } from '../../components/admin/Toolbar';
import { useCan, useCanAny } from '../../components/admin/usePermissions';
import { useRunner } from '../../components/admin/useRunner';
import { ConfirmDialog } from '../../components/overlays/ConfirmDialog';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Segmented } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { TextAreaField } from '../../components/ui/FormFields';
import { PageHeader } from '../../components/ui/PageHeader';
import { Pagination } from '../../components/ui/Pagination';
import { formatDateTime } from '../../lib/format';
import { roleLabel } from '../../lib/labels';
import { useDebounced } from '../../lib/useDebounced';
import { useFetch } from '../../lib/useFetch';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { showToast } from '../../store/slices/toastSlice';

const PAGE_SIZE = 20;

type Pending = { kind: 'reject' | 'suspend' | 'reactivate' | 'revoke'; user: AdminUser };
type Link = { url: string; expiresAt: string; for: string };

export default function AdminUsersPage() {
  const dispatch = useAppDispatch();
  const can = useCan();
  const canAny = useCanAny();
  const me = useAppSelector((s) => s.auth.user)!;
  const [params] = useSearchParams();

  const [tab, setTab] = useState<'accounts' | 'matrix'>('accounts');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [page, setPage] = useState(1);
  const term = useDebounced(search.trim(), 300);

  const list = useFetch(`admin-users:${term}:${role}:${status}:${page}`, () =>
    listUsersApi({ search: term, role, status, page, limit: PAGE_SIZE }),
  );
  const { busy, run } = useRunner(list.retry);

  const [creating, setCreating] = useState(false);
  const [roleFor, setRoleFor] = useState<AdminUser | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState('');
  const [link, setLink] = useState<(Link & { title: string }) | null>(null);

  const reset = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setPage(1);
  };

  const issueLink = async (u: AdminUser) => {
    try {
      const r = await issueResetLinkApi(u.id);
      setLink({ ...r, for: u.name, title: `Password reset link · ${u.name}` });
    } catch (err) {
      dispatch(showToast(getErrorMessage(err, 'Could not create the link'), 'error'));
    }
  };

  const confirm = async () => {
    if (!pending) return;
    const { kind, user } = pending;
    const ok = await run(
      () =>
        kind === 'revoke'
          ? userActionApi(user.id, 'revoke-sessions')
          : userActionApi(user.id, kind, kind === 'reactivate' ? undefined : { reason: reason.trim() || undefined }),
      kind === 'reject' ? 'Registration rejected.' : kind === 'suspend' ? 'Account suspended.' : kind === 'reactivate' ? 'Account reactivated.' : 'Signed out everywhere.',
    );
    if (ok) setPending(null);
  };

  const columns: Column<AdminUser>[] = [
    {
      header: 'User',
      cell: (u) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={u.name} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium text-text">
              {u.name} {u.id === me.id && <span className="text-xs text-accent">· you</span>}
            </p>
            <p className="truncate text-xs text-text-muted">{u.email}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Role',
      cell: (u) => (
        <span className="inline-flex flex-wrap items-center gap-1">
          <Badge tone={u.role === 'member' ? 'neutral' : 'accent'}>{roleLabel(u.role)}</Badge>
          {u.extraPermissions.length > 0 && <Badge>+{u.extraPermissions.length} extra</Badge>}
        </span>
      ),
    },
    { header: 'Status', cell: (u) => <StatusBadge status={u.status} /> },
    { header: 'Last sign-in', className: 'whitespace-nowrap font-mono text-[13px]', cell: (u) => (u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Never') },
    {
      header: 'Actions',
      srOnlyHeader: true,
      className: 'text-right',
      cell: (u) => {
        const self = u.id === me.id;
        return (
          <ActionMenu
            label={`Actions for ${u.name}`}
            actions={[
              { label: 'Approve', show: can('members.approve') && u.status === 'pending', onSelect: () => void run(() => userActionApi(u.id, 'approve'), 'Member approved.') },
              { label: 'Reject…', danger: true, show: can('members.approve') && u.status === 'pending', onSelect: () => (setReason(''), setPending({ kind: 'reject', user: u })) },
              { label: 'Change role…', show: can('roles.manage') && !self, onSelect: () => setRoleFor(u) },
              { label: 'Suspend…', danger: true, show: canAny('members.suspend', 'users.manage') && u.status === 'active' && !self, onSelect: () => (setReason(''), setPending({ kind: 'suspend', user: u })) },
              { label: 'Reactivate', show: canAny('members.suspend', 'users.manage') && (u.status === 'suspended' || u.status === 'rejected'), onSelect: () => setPending({ kind: 'reactivate', user: u }) },
              { label: 'Create password reset link', show: can('users.reset_password') && !self, onSelect: () => void issueLink(u) },
              { label: 'Sign out everywhere', show: can('sessions.revoke') && !self, onSelect: () => setPending({ kind: 'revoke', user: u }) },
            ]}
          />
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Users & roles"
        description="Approve new members, manage staff accounts and see what each role can do."
        actions={
          can('roles.manage') && (
            <Segmented
              label="View"
              value={tab}
              options={[{ value: 'accounts', label: 'Accounts' }, { value: 'matrix', label: 'Permission matrix' }]}
              onChange={setTab}
            />
          )
        }
      />
      {tab === 'matrix' ? (
        <RoleMatrix />
      ) : (
        <>
          <Toolbar
            search={search}
            onSearch={reset(setSearch)}
            searchLabel="Search users"
            actions={
              can('users.manage') && (
                <Button onClick={() => setCreating(true)}>
                  <Plus aria-hidden="true" className="h-4 w-4" />
                  Add staff
                </Button>
              )
            }
          >
            <FilterSelect label="Role" value={role} onChange={reset(setRole)} options={[{ value: '', label: 'All roles' }, ...['member', 'viewer', 'editor', 'admin', 'superadmin'].map((r) => ({ value: r, label: roleLabel(r) }))]} />
            <FilterSelect label="Status" value={status} onChange={reset(setStatus)} options={[{ value: '', label: 'All statuses' }, ...['pending', 'active', 'rejected', 'suspended'].map((s) => ({ value: s, label: s[0]!.toUpperCase() + s.slice(1) }))]} />
          </Toolbar>
          <DataTable
            caption="User accounts"
            columns={columns}
            rows={list.data?.users}
            rowKey={(u) => u.id}
            loading={list.loading}
            error={list.error}
            onRetry={list.retry}
            empty={<EmptyState title="No users found" description="Try different filters." />}
          />
          {list.data && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={list.data.totalCount} onChange={setPage} />}
        </>
      )}

      <StaffCreateDrawer
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(r) => {
          list.retry();
          setLink({ url: r.url, expiresAt: r.expiresAt, for: r.name, title: `Setup link · ${r.name}` });
        }}
      />
      <RoleDialog user={roleFor} onClose={() => setRoleFor(null)} onSaved={list.retry} />
      <OneTimeLinkDialog link={link} title={link?.title ?? 'One-time link'} onClose={() => setLink(null)} />
      <ConfirmDialog
        open={pending !== null}
        title={
          pending?.kind === 'reject' ? 'Reject this registration?'
            : pending?.kind === 'suspend' ? 'Suspend this account?'
            : pending?.kind === 'reactivate' ? 'Reactivate this account?'
            : 'Sign this user out everywhere?'
        }
        confirmLabel={pending?.kind === 'reject' ? 'Reject' : pending?.kind === 'suspend' ? 'Suspend' : pending?.kind === 'reactivate' ? 'Reactivate' : 'Sign out'}
        tone={pending?.kind === 'reactivate' ? 'primary' : 'danger'}
        busy={busy}
        onConfirm={() => void confirm()}
        onCancel={() => setPending(null)}
      >
        {pending?.kind === 'revoke' && `${pending.user.name} will have to sign in again on every device.`}
        {pending?.kind === 'reactivate' && `${pending.user.name} will be able to sign in again.`}
        {(pending?.kind === 'reject' || pending?.kind === 'suspend') && (
          <div className="space-y-3">
            <p>
              {pending.kind === 'suspend'
                ? `${pending.user.name} is signed out immediately and cannot sign in until reactivated.`
                : `${pending.user.name}'s registration will be declined.`}
            </p>
            <TextAreaField label="Reason (kept on record)" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        )}
      </ConfirmDialog>
    </>
  );
}
