import { LogOut } from 'lucide-react';
import { Avatar } from '../ui/Avatar';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { logout } from '../../store/slices/authSlice';
import { roleLabel } from '../../lib/labels';
import { t } from '../../i18n';

/** Bottom of the admin sidebar: the signed-in account and a sign-out button. */
export function SidebarAccount() {
  const dispatch = useAppDispatch();
  const { user, bootstrapped } = useAppSelector((s) => s.auth);

  if (!bootstrapped || !user) return null;

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border p-2">
      <Avatar name={user.name} />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-[13px] font-semibold text-text">{user.name}</p>
        <p className="text-xs text-text-muted">{roleLabel(user.role)}</p>
      </div>
      <button
        type="button"
        onClick={() => void dispatch(logout())}
        aria-label={t('Sign out')}
        title={t('Sign out')}
        className="rounded-md p-1.5 text-text-muted hover:bg-surface-muted hover:text-text"
      >
        <LogOut aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  );
}
