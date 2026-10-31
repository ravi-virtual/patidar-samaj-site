import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import {
  deleteAdminApi,
  listUsersApi,
  userActionApi,
  type AdminUser,
} from '../../api/adminApi';
import { DataTable, type Column } from '../../components/admin/DataTable';
import { permissionLabel } from '../../components/admin/permissionCatalog';
import { RowMenu } from '../../components/admin/RowActions';
import { ResetPasswordDialog } from '../../components/admin/ResetPasswordDialog';
import { StatusBadge } from '../../components/admin/StatusBadge';
import { FilterSelect, Toolbar } from '../../components/admin/Toolbar';
import { useCan } from '../../components/admin/usePermissions';
import { useRunner } from '../../components/admin/useRunner';
import { ConfirmDialog } from '../../components/overlays/ConfirmDialog';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
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

type Pending = { kind: 'suspend' | 'reactivate' | 'revoke' | 'delete'; user: AdminUser };

/**
 * Admin accounts. The Super Admin manages them; an admin holding `users.reset_password` sees the
 * list and can reset passwords only. The server enforces this on every call; the Super Admin is
 * never listed.
 */
export default function AdminUsersPage() {
  const navigate = useNavigate();
  const can = useCan();
  const canManage = can('users.manage');
  const canReset = can('users.reset_password');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const term = useDebounced(search.trim(), 300);

  const list = useFetch(`admin-users:${term}:${status}:${page}`, () =>
    listUsersApi({ search: term, status, page, limit: PAGE_SIZE }),
  );
  const { busy, run } = useRunner(list.retry);

  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState('');
  const [resetting, setResetting] = useState<AdminUser | null>(null);

  const reset = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setPage(1);
  };

  const confirm = async () => {
    if (!pending) return;
    const { kind, user } = pending;
    const ok = await run(
      () =>
        kind === 'delete'
          ? deleteAdminApi(user.id)
          : kind === 'revoke'
            ? userActionApi(user.id, 'revoke-sessions')
            : userActionApi(user.id, kind, kind === 'reactivate' ? undefined : { reason: reason.trim() || undefined }),
      kind === 'suspend'
        ? t('Account marked inactive.')
        : kind === 'reactivate'
          ? t('Account marked active.')
          : kind === 'delete'
            ? t('Admin deleted.')
            : t('Signed out everywhere.'),
    );
    if (ok) setPending(null);
  };

  const columns: Column<AdminUser>[] = [
    {
      header: t('Admin'),
      cell: (u) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={u.name} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium text-text">{u.name}</p>
            <p className="truncate text-xs text-text-muted">{u.email}</p>
          </div>
        </div>
      ),
    },
    {
      header: t('Permissions'),
      cell: (u) =>
        u.permissions.length === 0 ? (
          <span className="text-text-muted">{t('None')}</span>
        ) : (
          <span title={u.permissions.map(permissionLabel).join(', ')}>
            <Badge>{t('{count} selected', { count: u.permissions.length })}</Badge>
          </span>
        ),
    },
    { header: t('Status'), cell: (u) => <StatusBadge status={u.status} /> },
    { header: t('Last sign-in'), className: 'whitespace-nowrap font-mono text-[13px]', cell: (u) => (u.lastLoginAt ? formatDateTime(u.lastLoginAt) : t('Never')) },
    {
      header: t('Actions'),
      srOnlyHeader: true,
      className: 'text-right',
      cell: (u) => (
        <RowMenu
          name={u.name}
          actions={[
            { label: t('Edit'), kind: 'edit', show: canManage, onSelect: () => navigate(`/admin/users/${u.id}/edit`) },
            { label: t('Mark inactive…'), danger: true, show: canManage && u.status === 'active', onSelect: () => (setReason(''), setPending({ kind: 'suspend', user: u })) },
            { label: t('Mark active'), show: canManage && u.status === 'suspended', onSelect: () => setPending({ kind: 'reactivate', user: u }) },
            { label: t('Reset password…'), show: canReset && u.status === 'active', onSelect: () => setResetting(u) },
            { label: t('Sign out everywhere'), show: canManage, onSelect: () => setPending({ kind: 'revoke', user: u }) },
            { label: t('Delete'), kind: 'delete', show: canManage, onSelect: () => setPending({ kind: 'delete', user: u }) },
          ]}
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t('Admins')}
        description={canManage ? t('Create admins and choose exactly what each one can do.') : t('Reset an admin’s password. Only the Super Admin can create or change admin accounts.')}
      />
      <Toolbar
        search={search}
        onSearch={reset(setSearch)}
        searchLabel={t('Search admins')}
        actions={
          canManage ? (
            <Button onClick={() => navigate('/admin/users/new')}>
              <Plus aria-hidden="true" className="h-4 w-4" />
              {t('Add admin')}
            </Button>
          ) : undefined
        }
      >
        <FilterSelect label={t('Status')} value={status} onChange={reset(setStatus)} options={[{ value: '', label: t('All statuses') }, { value: 'active', label: t('Active') }, { value: 'suspended', label: t('Inactive') }]} />
      </Toolbar>
      <DataTable
        caption={t('Admin accounts')}
        columns={columns}
        rows={list.data?.users}
        rowKey={(u) => u.id}
        loading={list.loading}
        error={list.error}
        onRetry={list.retry}
        empty={<EmptyState title={t('No admins found')} description={t('Add an admin, or try different filters.')} />}
      />
      {list.data && <Pagination page={page} pageSize={PAGE_SIZE} totalCount={list.data.totalCount} onChange={setPage} />}

      <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} />
      <ConfirmDialog
        open={pending !== null}
        title={
          pending?.kind === 'suspend' ? t('Mark this admin inactive?')
            : pending?.kind === 'reactivate' ? t('Mark this admin active?')
            : pending?.kind === 'delete' ? t('Delete this admin?')
            : t('Sign this admin out everywhere?')
        }
        confirmLabel={pending?.kind === 'suspend' ? t('Mark inactive') : pending?.kind === 'reactivate' ? t('Mark active') : pending?.kind === 'delete' ? t('Delete') : t('Sign out')}
        tone={pending?.kind === 'reactivate' ? 'primary' : 'danger'}
        busy={busy}
        onConfirm={() => void confirm()}
        onCancel={() => setPending(null)}
      >
        {pending?.kind === 'revoke' && t('{name} will have to sign in again on every device.', { name: pending.user.name })}
        {pending?.kind === 'reactivate' && t('{name} will be able to sign in again.', { name: pending.user.name })}
        {pending?.kind === 'delete' &&
          t('{name} is signed out immediately and removed from this list. Their email address stays reserved, so it cannot be used for a new account.', { name: pending.user.name })}
        {pending?.kind === 'suspend' && (
          <div className="space-y-3">
            <p>
              {t('{name} is signed out immediately and cannot sign in until marked active again.', { name: pending.user.name })}
            </p>
            <TextAreaField label={t('Reason (kept on record)')} rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        )}
      </ConfirmDialog>
    </>
  );
}
