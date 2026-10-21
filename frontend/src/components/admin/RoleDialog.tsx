import { useState } from 'react';
import { changeRoleApi, getRolesApi, type AdminUser } from '../../api/adminApi';
import type { Role } from '../../api/authApi';
import { getErrorMessage } from '../../api/axiosInstance';
import { roleLabel } from '../../lib/labels';
import { useFetch } from '../../lib/useFetch';
import { useAppDispatch } from '../../store/hooks';
import { showToast } from '../../store/slices/toastSlice';
import { Modal } from '../overlays/Modal';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { SelectField } from '../ui/FormFields';

const permissionLabels: Record<string, string> = {
  'events.publish': 'Publish events',
  'announcements.publish': 'Publish announcements',
  'content.publish': 'Publish site content',
  'members.export': 'Export member data',
};

function Body({ user, onClose, onSaved }: { user: AdminUser; onClose: () => void; onSaved: () => void }) {
  const dispatch = useAppDispatch();
  const matrix = useFetch('role-matrix', getRolesApi);
  const [role, setRole] = useState<Role>(user.role);
  const [extra, setExtra] = useState<string[]>(user.extraPermissions);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A role that already includes a permission needs no separate grant.
  const included = new Set(matrix.data?.roles.find((r) => r.role === role)?.permissions ?? []);
  const grantable = matrix.data?.grantable ?? [];

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await changeRoleApi(user.id, { role, extraPermissions: extra.filter((p) => !included.has(p)) });
      dispatch(showToast(`${user.name} is now ${roleLabel(role)}. They were signed out so the change applies at once.`));
      onSaved();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not change the role'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="space-y-4 px-5 py-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <SelectField label="Role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {matrix.data?.roles.map((r) => (
            <option key={r.role} value={r.role}>
              {roleLabel(r.role)}
            </option>
          )) ?? <option value={user.role}>{roleLabel(user.role)}</option>}
        </SelectField>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-[13px] font-medium">Extra permissions</legend>
          <p className="text-xs text-text-muted">Granted to this person only, on top of the role.</p>
          {grantable.map((p) => (
            <label key={p} className="flex items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--accent)]"
                disabled={included.has(p)}
                checked={included.has(p) || extra.includes(p)}
                onChange={(e) => setExtra((cur) => (e.target.checked ? [...cur, p] : cur.filter((x) => x !== p)))}
              />
              {permissionLabels[p] ?? p}
              {included.has(p) && <span className="text-xs text-text-muted">(included in the role)</span>}
            </label>
          ))}
        </fieldset>
      </div>
      <div className="flex justify-end gap-2 border-t border-border px-5 py-3.5">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={() => void save()} loading={busy} disabled={!matrix.data}>
          Save role
        </Button>
      </div>
    </>
  );
}

/** Change one person's role and individually granted permissions (Super Admin only). */
export function RoleDialog({ user, onClose, onSaved }: { user: AdminUser | null; onClose: () => void; onSaved: () => void }) {
  return (
    <Modal open={user !== null} onClose={onClose} title={user ? `Role · ${user.name}` : 'Role'}>
      {user && <Body key={user.id} user={user} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  );
}
