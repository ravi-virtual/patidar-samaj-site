import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { getAdminApi, updateAdminApi, type AdminUser } from '../../api/adminApi';
import { getErrorMessage } from '../../api/axiosInstance';
import { PermissionPicker } from '../../components/admin/PermissionPicker';
import { useCan } from '../../components/admin/usePermissions';
import { Alert } from '../../components/ui/Alert';
import { Async } from '../../components/ui/Async';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/PageHeader';
import { TextField } from '../../components/ui/TextField';
import { useFetch } from '../../lib/useFetch';
import { useAppDispatch } from '../../store/hooks';
import { showToast } from '../../store/slices/toastSlice';

function EditForm({ user }: { user: AdminUser }) {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [name, setName] = useState(user.name);
  const [permissions, setPermissions] = useState<string[]>(user.permissions);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameProblem = name.trim().length < 2 ? 'Name must be at least 2 characters' : /[<>]/.test(name) ? 'Contains invalid characters' : undefined;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await updateAdminApi(user.id, { name: name.trim(), permissions });
      dispatch(showToast(`${name.trim()} updated. Changes apply on their next request.`));
      navigate('/admin/users');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save the changes'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!nameProblem) void save();
      }}
      className="space-y-6"
    >
      {error && <Alert tone="danger">{error}</Alert>}
      <section aria-labelledby="account-heading" className="space-y-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
        <h2 id="account-heading" className="text-base font-semibold text-text">
          Account
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <TextField label="Full name" required value={name} onChange={(e) => setName(e.target.value)} error={nameProblem} />
          <TextField label="Email" value={user.email} readOnly disabled hint="The email address cannot be changed." />
        </div>
      </section>
      <section aria-labelledby="perm-heading" className="rounded-lg border border-border bg-surface p-4 sm:p-5">
        <h2 id="perm-heading" className="sr-only">
          Permissions
        </h2>
        <PermissionPicker layout="page" value={permissions} onChange={setPermissions} />
      </section>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={() => navigate('/admin/users')} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" loading={busy} disabled={Boolean(nameProblem)}>
          Save changes
        </Button>
      </div>
    </form>
  );
}

/** Full-page "Edit admin" (Super Admin only): name and permissions. */
export default function AdminUserEditPage() {
  const can = useCan();
  const { id = '' } = useParams();
  const query = useFetch(`admin-user:${id}`, () => getAdminApi(id));

  if (!can('users.manage')) return <Navigate to="/admin" replace />;

  return (
    <>
      <PageHeader
        title="Edit admin"
        description="Change the name and exactly what this admin can do."
        actions={
          <Link
            to="/admin/users"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-border-strong px-3.5 text-sm font-medium text-text hover:bg-surface-muted"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            Back to admins
          </Link>
        }
      />
      <Async data={query.data} loading={query.loading} error={query.error} onRetry={query.retry}>
        {(user) => <EditForm key={user.id} user={user} />}
      </Async>
    </>
  );
}
