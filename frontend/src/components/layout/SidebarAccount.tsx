import { Link } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { Avatar } from '../ui/Avatar';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { logout } from '../../store/slices/authSlice';
import { roleLabel } from '../../lib/labels';

/** Bottom of the sidebar: a sign-in invitation for visitors, the account card for signed-in users. */
export function SidebarAccount() {
  const dispatch = useAppDispatch();
  const { user, bootstrapped } = useAppSelector((s) => s.auth);
  const registrationOpen = useAppSelector((s) => s.site.settings?.registrationOpen) !== false;

  if (!bootstrapped) return null;

  if (!user) {
    return (
      <div className="rounded-xl border border-border bg-bg p-3.5">
        <p className="text-sm font-semibold text-text">Member workspace</p>
        <p className="mb-2.5 mt-0.5 text-[13px] text-text-muted">RSVPs, your profile and admin tools.</p>
        <Link
          to="/login"
          className="block rounded-md bg-primary py-2 text-center text-sm font-medium text-primary-foreground hover:bg-primary-hover"
        >
          Log in
        </Link>
        {registrationOpen && (
          <Link to="/register" className="mt-1 block py-1.5 text-center text-[13px] text-text-secondary hover:text-text">
            Create account
          </Link>
        )}
      </div>
    );
  }

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
        aria-label="Sign out"
        title="Sign out"
        className="rounded-md p-1.5 text-text-muted hover:bg-surface-muted hover:text-text"
      >
        <LogOut aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  );
}
